import { useState, useCallback, useEffect, useRef } from 'react';
import { FileParser } from '../services/parser';
import { TextChunker, type TextChunk } from '../services/chunker';
import { storage } from '../services/storage';
import { aiService } from '../services/ai';
import { TranslationEngine } from '../services/TranslationEngine';

export interface NovelState {
    id: string;
    title: string;
    chunks: TextChunk[];
    translations: Record<string, string>;
    progress: number;
    status: 'idle' | 'parsing' | 'translating' | 'paused' | 'completed' | 'error';
}

export const useNovel = (apiKey: string, baseUrl?: string, debugMode: boolean = false, model?: string, customSystemPrompt?: string) => {
    const [novel, setNovel] = useState<NovelState | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [logs, setLogs] = useState<string[]>([]);

    // Translation engine instance
    const engineRef = useRef<TranslationEngine | null>(null);

    const addLog = useCallback((message: string) => {
        setLogs(prev => [...prev, `[${new Date().toISOString().split('T')[1].split('.')[0]}] ${message}`]);
    }, []);

    // Initialize AI service when config changes
    useEffect(() => {
        if (apiKey) {
            aiService.initialize({ apiKey, baseUrl, model, customSystemPrompt });
            if (debugMode) addLog(`AI 服务已初始化。模型：${model || '默认'}，BaseURL：${baseUrl || '默认'}`);
        }
    }, [apiKey, baseUrl, model, customSystemPrompt, debugMode, addLog]);

    // Cleanup engine on unmount
    useEffect(() => {
        return () => {
            engineRef.current?.destroy();
        };
    }, []);

    const loadNovel = useCallback(async (novelId: string) => {
        setIsLoading(true);
        addLog(`正在加载小说 ${novelId}...`);
        try {
            const project = await storage.getProject(novelId);
            if (project) {
                setNovel({
                    id: project.novelId,
                    title: "已加载小说",
                    chunks: project.chunks,
                    translations: project.translations,
                    progress: (Object.keys(project.translations).length / project.chunks.length) * 100,
                    status: 'idle'
                });
                addLog(`小说加载完成。进度：${Object.keys(project.translations).length}/${project.chunks.length}`);
            }
        } catch (e) {
            setError("加载小说失败");
            console.error(e);
            addLog(`加载小说出错：${e}`);
        } finally {
            setIsLoading(false);
        }
    }, [addLog]);

    const processFile = useCallback(async (file: File) => {
        setIsLoading(true);
        setError(null);
        setLogs([]);
        addLog(`正在处理文件：${file.name}`);
        try {
            const text = await FileParser.readFile(file);
            const chunks = TextChunker.chunkText(text);
            addLog(`文件解析完成。生成了 ${chunks.length} 个切片。`);

            const newNovel = {
                id: crypto.randomUUID(),
                title: file.name.replace('.txt', ''),
                originalContent: text,
                totalChunks: chunks.length,
                lastReadChunkIndex: 0,
                createdAt: Date.now()
            };

            await storage.saveNovel(newNovel, chunks);

            setNovel({
                id: newNovel.id,
                title: newNovel.title,
                chunks,
                translations: {},
                progress: 0,
                status: 'idle'
            });
            addLog("小说已保存到存储。准备就绪。");
        } catch (e) {
            setError("处理文件失败");
            console.error(e);
            addLog(`处理文件出错：${e}`);
        } finally {
            setIsLoading(false);
        }
    }, [addLog]);

    // Initialize translation engine when novel changes
    useEffect(() => {
        if (!novel || !apiKey) return;

        // Destroy previous engine
        engineRef.current?.destroy();

        // Create new engine
        const engine = new TranslationEngine();
        engineRef.current = engine;

        engine.initialize(
            {
                novelTitle: novel.title,
                visibleObserverScreens: 0.8,
                maxConcurrentRequests: 3,
                maxBatchSize: 4,
                maxBatchChars: 1500,
            },
            {
                onTranslationComplete: (chunkId, translation) => {
                    // Save to storage
                    storage.saveTranslation(novel.id, chunkId, translation);

                    // Update state
                    setNovel(prev => {
                        if (!prev) return null;
                        const newTrans = { ...prev.translations, [chunkId]: translation };
                        const progress = (Object.keys(newTrans).length / prev.chunks.length) * 100;

                        // Check if completed
                        const isCompleted = Object.keys(newTrans).length >= prev.chunks.length;

                        return {
                            ...prev,
                            translations: newTrans,
                            progress,
                            status: isCompleted ? 'completed' : prev.status
                        };
                    });
                },
                onTranslationError: (chunkId, error) => {
                    const chunk = novel.chunks.find(c => c.id === chunkId);
                    const idx = chunk ? chunk.index + 1 : '?';
                    addLog(`翻译切片 ${idx} 失败: ${error.message}`);
                },
                onStatusChange: (status) => {
                    if (status === 'idle') {
                        setNovel(prev => {
                            if (!prev) return null;
                            const isCompleted = Object.keys(prev.translations).length >= prev.chunks.length;
                            return {
                                ...prev,
                                status: isCompleted ? 'completed' : 'idle'
                            };
                        });
                    }
                },
                // Debug logging callbacks
                onLog: (message) => {
                    addLog(message);
                },
                onBatchStart: (startIndex, endIndex, count) => {
                    // Could update UI with batch progress if needed
                    console.debug(`Batch ${startIndex}-${endIndex} (${count} chunks) started`);
                }
            },
            novel.chunks,
            novel.translations
        );

        return () => {
            engine.destroy();
        };
    }, [novel?.id, novel?.title, apiKey, addLog]);

    // Sync translations to engine when they change externally
    useEffect(() => {
        if (novel && engineRef.current) {
            engineRef.current.updateTranslations(novel.translations);
        }
    }, [novel?.translations]);

    const startTranslation = useCallback(() => {
        if (!novel || !apiKey) {
            setError("未加载小说或缺少 API 密钥");
            addLog("启动失败：缺少小说或 API 密钥");
            return;
        }

        setNovel(prev => prev ? { ...prev, status: 'translating' } : null);
        engineRef.current?.start();
        addLog("翻译已开始。");
    }, [novel, apiKey, addLog]);

    const pauseTranslation = useCallback(() => {
        engineRef.current?.pause();
        setNovel(prev => prev ? { ...prev, status: 'paused' } : null);
        addLog("已暂停。");
    }, [addLog]);

    const resumeTranslation = useCallback(() => {
        engineRef.current?.resume();
        setNovel(prev => prev ? { ...prev, status: 'translating' } : null);
        addLog("正在恢复...");
    }, [addLog]);

    const stopTranslation = useCallback(() => {
        engineRef.current?.pause();
        setNovel(prev => prev ? { ...prev, status: 'idle' } : null);
    }, []);

    const exportNovel = useCallback((format: 'txt' | 'md' = 'txt') => {
        if (!novel) return;

        let content = '';
        if (format === 'md') {
            content = `# ${novel.title}\n\n`;
            novel.chunks.forEach(chunk => {
                const translation = novel.translations[chunk.id];
                if (translation) {
                    content += `${translation}\n\n`;
                } else {
                    content += `<!-- Unfinished Translation -->\n${chunk.text}\n\n`;
                }
            });
        } else {
            content = `${novel.title}\n\n`;
            novel.chunks.forEach(chunk => {
                const translation = novel.translations[chunk.id];
                content += translation ? `${translation}\n` : `${chunk.text}\n`;
            });
        }

        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${novel.title}_translated.${format}`;
        a.click();
        URL.revokeObjectURL(url);
        addLog(`已导出小说为 .${format}`);
    }, [novel, addLog]);

    const retrySegment = useCallback((chunkId: string) => {
        if (!novel || !apiKey) return;

        const chunk = novel.chunks.find(c => c.id === chunkId);
        if (!chunk) return;

        addLog(`正在重试翻译切片 ${chunk.index + 1}...`);
        engineRef.current?.retry(chunkId);
    }, [novel, apiKey, addLog]);

    /**
     * Register a paragraph element for observation
     * Call this from ReadingView for each paragraph
     */
    const observeParagraph = useCallback((element: HTMLElement, chunkId: string, chunkIndex: number, text: string) => {
        engineRef.current?.observe(element, chunkId, chunkIndex, text);
    }, []);

    /**
     * Unobserve a paragraph element
     * Call this from ReadingView cleanup
     */
    const unobserveParagraph = useCallback((element: HTMLElement) => {
        engineRef.current?.unobserve(element);
    }, []);

    return {
        novel,
        isLoading,
        error,
        logs,
        processFile,
        loadNovel,
        startTranslation,
        pauseTranslation,
        resumeTranslation,
        stopTranslation,
        exportNovel,
        retrySegment,
        // New: paragraph observation for viewport-aware translation
        observeParagraph,
        unobserveParagraph
    };
};
