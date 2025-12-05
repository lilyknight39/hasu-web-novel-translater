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

    // Translation Loop Logic
    // STRICT SEQUENTIAL PRIORITY:
    // We only fetch batch N if batch N-1 is done or we are at start.
    // Actually, allowing some concurrency is fine, but we should prioritize lower indices.
    // The current logic picks the FIRST untranslated chunk. This is correct for sequentiality.
    // However, if we have holes (retry), it fills holes.
    // We need to ensure we don't start too many "future" batches if technical limit is hit.

    const MAX_CONCURRENT_REQUESTS = 3; // Reduced for stability
    const MAX_BATCH_SIZE = 4;
    const MAX_BATCH_CHARS = 1500;

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
            // If we are not translating, or paused, stop.
            if (!novel || novel.status !== 'translating' || isPaused || cancel) return;

            // Simple loop to fill slots
            while (activeRequests.current < MAX_CONCURRENT_REQUESTS) {
                // 1. Identify candidates
                // We want the EARLIEST untranslated chunk that is NOT pending.
                const allChunks = novel.chunks;
                let startChunk = null;

                for (const chunk of allChunks) {
                    if (!novel.translations[chunk.id] && !pendingChunkIds.current.has(chunk.id)) {
                        startChunk = chunk;
                        break; // Found the earliest one
                    }
                }

                if (!startChunk) {
                    // No work found. Check if done.
                    if (activeRequests.current === 0) {
                        const trulyDone = novel.chunks.every(c => novel.translations[c.id]);
                        if (trulyDone) {
                            setNovel(prev => prev ? { ...prev, status: 'completed', progress: 100 } : null);
                            addLog("Translation Completed!");
                        }
                    }
                    break;
                }

                // 2. Build Batch
                const batch = [startChunk];
                let currentChars = startChunk.text.length;
                let nextIndex = startChunk.index + 1;

                while (batch.length < MAX_BATCH_SIZE) {
                    if (nextIndex >= novel.chunks.length) break;
                    const nextOne = novel.chunks[nextIndex];

                    // Optimization: Only batch CONTINUOUS segments.
                    // If nextOne is already translated or pending, we stop the batch here.
                    // This ensures we strictly fill gaps.
                    if (novel.translations[nextOne.id] || pendingChunkIds.current.has(nextOne.id)) break;

                    if (currentChars + nextOne.text.length > MAX_BATCH_CHARS) break;

                    batch.push(nextOne);
                    currentChars += nextOne.text.length;
                    nextIndex++;
                }

                // 3. Execute
                batch.forEach(c => pendingChunkIds.current.add(c.id));
                activeRequests.current++;

                addLog(`Translating Batch: Segments ${batch[0].index + 1}-${batch[batch.length - 1].index + 1} (${batch.length} chunks)`);

                aiService.translateBatch(
                    batch.map(c => c.text),
                    {
                        previousParagraph: batch[0].index > 0 ? novel.chunks[batch[0].index - 1].text : undefined,
                        nextParagraph: batch[batch.length - 1].index < novel.chunks.length - 1 ? novel.chunks[batch[batch.length - 1].index + 1].text : undefined,
                        globalContext: `Title: ${novel.title}`
                    }
                ).then(translations => {
                    if (cancel) return;

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
                        return {
                            ...prev,
                            translations: newTrans,
                            progress: (Object.keys(newTrans).length / prev.chunks.length) * 100
                        };
                    });

                }).catch(err => {
                    console.error("Batch failed", err);
                    addLog(`Batch failed: Segments ${batch[0].index + 1}-${batch[batch.length - 1].index + 1}. Error: ${err}`);
                    // We do NOT mark them as done. They remain untranslated.
                    // The loop will pick them up again? 
                    // To prevent infinite fast loops on permanent error, we might want to pause?
                    // For now, let's just let the pending clear and it will retry in next loop tick.
                }).finally(() => {
                    if (!cancel) {
                        batch.forEach(c => pendingChunkIds.current.delete(c.id));
                        activeRequests.current--;
                        // We rely on React state update (setNovel or logs?) to trigger re-render? 
                        // Actually, if we just updated a Ref, it won't re-render.
                        // setNovel triggers re-render.
                        // If we failed, strict catch doesn't setNovel.
                        // BUT, activeRequests changed. 
                        // Check dependencies: is activeRequests.current in dep? No, it's a ref.
                        // We need to trigger the effect again.
                        // Hack: toggle a tick state? Or just setNovel(prev => ({...prev})) even on error?
                        // Let's setNovel to force re-evaluation.
                        setNovel(prev => prev ? { ...prev } : null);
                    }
                });
            }
        };

        const timer = setInterval(loop, 1000); // Polling backup + initial trigger
        loop(); // Immediate trigger

        return () => { cancel = true; clearInterval(timer); };
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

    const retrySegment = useCallback(async (chunkId: string) => {
        if (!novel || !apiKey) return;

        const chunk = novel.chunks.find(c => c.id === chunkId);
        if (!chunk) return;

        addLog(`正在重试翻译切片 ${chunk.index + 1}...`);

        try {
            // Optimistic update or just wait? Let's just fire and forget, 
            // but we might want to show loading state for this specific chunk if we had per-chunk status.
            // For now, the UI just shows "Translating..." if missing.

            const translation = await aiService.translateChunk(chunk.text, {
                previousParagraph: chunk.index > 0 ? novel.chunks[chunk.index - 1].text : undefined,
                nextParagraph: chunk.index < novel.chunks.length - 1 ? novel.chunks[chunk.index + 1].text : undefined,
                globalContext: `Title: ${novel.title}`
            });

            if (translation) {
                storage.saveTranslation(novel.id, chunk.id, translation);
                setNovel(prev => {
                    if (!prev) return null;
                    return {
                        ...prev,
                        translations: {
                            ...prev.translations,
                            [chunk.id]: translation
                        }
                    };
                });
                addLog(`切片 ${chunk.index + 1} 重试成功。`);
            }
        } catch (e) {
            console.error("Retry failed", e);
            addLog(`切片 ${chunk.index + 1} 重试失败：${e}`);
        }
    }, [novel, apiKey, addLog]);

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
        exportNovel,
        retrySegment
    };
};
