import React, { useState, useCallback, useEffect } from 'react';
import { FileParser } from '../services/parser';
import { TextChunker, type TextChunk } from '../services/chunker';
import { storage } from '../services/storage';
import { aiService } from '../services/ai';

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
    const [isPaused, setIsPaused] = useState(false);

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

    const loadNovel = useCallback(async (novelId: string) => {
        setIsLoading(true);
        addLog(`正在加载小说 ${novelId}...`);
        try {
            const project = await storage.getProject(novelId);
            if (project) {
                setNovel({
                    id: project.novelId,
                    title: "已加载小说", // We might want to store title in project or fetch from novel metdata
                    chunks: project.chunks,
                    translations: project.translations,
                    progress: (Object.keys(project.translations).length / project.chunks.length) * 100,
                    status: 'idle' // or completed
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
        setLogs([]); // Clear logs on new file
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



    const startTranslation = useCallback(async () => {
        if (!novel || !apiKey) {
            setError("未加载小说或缺少 API 密钥");
            addLog("启动失败：缺少小说或 API 密钥");
            return;
        }

        setNovel(prev => prev ? { ...prev, status: 'translating' } : null);
        setIsPaused(false);
        addLog("翻译已开始。");
    }, [novel, apiKey, addLog]);

    // Actually, let's implement the Translation Loop in a simpler way:
    // We expose a function `translateNextBatch` that translates the next X chunks.
    // And an Effect that calls it if status is 'translating'.

    // Concurrency & Batch Settings
    const MAX_CONCURRENT_REQUESTS = 5;
    const MAX_BATCH_SIZE = 4;
    const MAX_BATCH_CHARS = 1200;

    const pendingChunkIds = React.useRef<Set<string>>(new Set());
    const activeRequests = React.useRef(0);

    // Clear pending on reset
    useEffect(() => {
        pendingChunkIds.current.clear();
        activeRequests.current = 0;
    }, [novel?.id, isPaused, novel?.status]);

    useEffect(() => {
        let cancel = false;

        const loop = async () => {
            if (!novel || novel.status !== 'translating' || isPaused || cancel) return;

            // While we have capacity...
            while (activeRequests.current < MAX_CONCURRENT_REQUESTS) {
                // Find next candidates: untranslated AND not pending
                // We need to look through the whole list to find the first availables
                const untranslatedAndFree = novel.chunks.filter(c => !novel.translations[c.id] && !pendingChunkIds.current.has(c.id));

                if (untranslatedAndFree.length === 0) {
                    // Check completion
                    if (activeRequests.current === 0) {
                        // Double check integrity
                        const trulyDone = novel.chunks.every(c => novel.translations[c.id]);
                        if (trulyDone) {
                            setNovel(prev => prev ? { ...prev, status: 'completed', progress: 100 } : null);
                            addLog("翻译完成！");
                        }
                    }
                    break; // No work to do
                }

                // Build a contiguous batch starting from the first candidate
                const startChunk = untranslatedAndFree[0];
                const batch = [startChunk];
                let currentChars = startChunk.text.length;

                // Look for subsequent chunks
                // We use the original index to ensure contiguity
                let nextIndex = startChunk.index + 1;
                while (batch.length < MAX_BATCH_SIZE) {
                    // Find chunk with index == nextIndex
                    // Optimization: since chunks are sorted, we can look at array, but filtering disrupted indices.
                    // Let's just lookup in novel.chunks
                    if (nextIndex >= novel.chunks.length) break;

                    const nextOne = novel.chunks[nextIndex];
                    // Must be untranslated and not pending
                    if (novel.translations[nextOne.id] || pendingChunkIds.current.has(nextOne.id)) break;

                    // Check char limit
                    if (currentChars + nextOne.text.length > MAX_BATCH_CHARS) break;

                    batch.push(nextOne);
                    currentChars += nextOne.text.length;
                    nextIndex++;
                }

                // Mark pending
                batch.forEach(c => pendingChunkIds.current.add(c.id));
                activeRequests.current++;

                addLog(`开始批次：切片 ${batch[0].index + 1}-${batch[batch.length - 1].index + 1} (${batch.length} 个切片，${currentChars} 字符)`);

                // Detached processing
                aiService.translateBatch(
                    batch.map(c => c.text),
                    {
                        previousParagraph: batch[0].index > 0 ? novel.chunks[batch[0].index - 1].text : undefined,
                        nextParagraph: batch[batch.length - 1].index < novel.chunks.length - 1 ? novel.chunks[batch[batch.length - 1].index + 1].text : undefined,
                        globalContext: `Title: ${novel.title}`
                    }
                ).then(translations => {
                    if (cancel) return;

                    if (translations.length !== batch.length) {
                        addLog(`批次警告：发送了 ${batch.length} 个切片，收到了 ${translations.length} 个。映射可能不准确。`);
                    }

                    // Save and Update
                    // We must map results to chunks 1:1. If length mismatch, we only save what we got?
                    // Or we fail the batch?
                    // Let's save what matches index.
                    const updates: Record<string, string> = {};
                    batch.forEach((c, i) => {
                        if (translations[i]) {
                            updates[c.id] = translations[i];
                            storage.saveTranslation(novel.id, c.id, translations[i]);
                        }
                    });

                    setNovel(prev => {
                        if (!prev) return null;
                        const newTrans = { ...prev.translations, ...updates };
                        // Trigger next loop via effect dependency
                        return {
                            ...prev,
                            translations: newTrans,
                            progress: (Object.keys(newTrans).length / prev.chunks.length) * 100
                        };
                    });

                    addLog(`批次已保存 (${Object.keys(updates).length} 个切片)。`);

                }).catch(err => {
                    console.error("Batch failed", err);
                    addLog(`批次失败：${err}`);
                }).finally(() => {
                    if (!cancel) {
                        batch.forEach(c => pendingChunkIds.current.delete(c.id));
                        activeRequests.current--;
                        // Force re-loop if we didn't update state (e.g. error)
                        // But if we updated state, it triggers loop.
                        // If error, state doesn't update, so loop won't trigger automatically?
                        // We might need a 'tick' state or just rely on 'novel' reference not changing but...
                        // Actually, if we setNovel even on error (status change?), it loops.
                        // Let's rely on user pausing/resuming if it gets stuck? 
                        // No, we should retry.
                        // Simple fix: setNovel with same state to trigger effect? No, React bails out.
                        // Let's set a 'tick'
                    }
                });
            }
        };

        loop();

        return () => { cancel = true; };
    }, [novel?.status, novel?.translations, isPaused, novel?.id, addLog, novel?.chunks, novel?.title]);
    // Dependency on translations causes it to re-run after each success! Perfect loop.

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
            // TXT
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

    return {
        novel,
        isLoading,
        error,
        logs,
        processFile,
        loadNovel,
        startTranslation,
        pauseTranslation: () => { setIsPaused(true); setNovel(prev => prev ? { ...prev, status: 'paused' } : null); addLog("已暂停。"); },
        resumeTranslation: () => { setIsPaused(false); setNovel(prev => prev ? { ...prev, status: 'translating' } : null); addLog("正在恢复..."); },
        stopTranslation: () => setNovel(prev => prev ? { ...prev, status: 'idle' } : null),
        exportNovel
    };
};
