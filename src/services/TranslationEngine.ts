/**
 * TranslationEngine - Viewport-aware translation orchestration
 * 
 * Inspired by immersive-translate patterns:
 * - IntersectionObserver for viewport detection
 * - Queue-based processing with batching
 * - Priority system for retries
 * - Capacity limiting to prevent overload
 */

import { aiService } from './ai';
import type { TextChunk } from './chunker';

// ============ Types ============

export interface EngineConfig {
    /** Number of screens ahead to preload (default: 0.8) */
    visibleObserverScreens?: number;
    /** Max concurrent translation requests (default: 3) */
    maxConcurrentRequests?: number;
    /** Max paragraphs per batch (default: 4) */
    maxBatchSize?: number;
    /** Max characters per batch (default: 1500) */
    maxBatchChars?: number;
    /** Novel title for context */
    novelTitle?: string;
    /** Auto-translate first N paragraphs on start (default: 10) */
    translateFirstN?: number;
    /** Pre-translate N paragraphs ahead of viewport (default: 10) */
    lookaheadCount?: number;
}

export interface TranslationCallbacks {
    onTranslationComplete: (chunkId: string, translation: string) => void;
    onTranslationError: (chunkId: string, error: Error) => void;
    onStatusChange?: (status: 'idle' | 'translating' | 'paused') => void;
    /** Debug log callback */
    onLog?: (message: string) => void;
    /** Called when a batch starts translating */
    onBatchStart?: (startIndex: number, endIndex: number, count: number) => void;
}

interface QueueItem {
    chunkId: string;
    chunkIndex: number;
    priority: 'high' | 'normal';
    addedAt: number;
}

interface ParagraphInfo {
    chunkId: string;
    chunkIndex: number;
    element: HTMLElement;
    text: string;
}

// ============ TranslationEngine Class ============

export class TranslationEngine {
    private config: Required<EngineConfig>;
    private callbacks: TranslationCallbacks | null = null;

    // Observers
    private paragraphObserver: IntersectionObserver | null = null;

    // State
    private queue: QueueItem[] = [];
    private pendingIds: Set<string> = new Set();
    private completedIds: Set<string> = new Set();
    private activeRequests = 0;
    private isPaused = false;
    private isStarted = false; // Track if user clicked "开始翻译"
    private status: 'idle' | 'translating' | 'paused' = 'idle';

    // Paragraph registry
    private paragraphMap: Map<string, ParagraphInfo> = new Map();
    private elementToChunkId: WeakMap<HTMLElement, string> = new WeakMap();

    // All chunks for context lookup
    private allChunks: TextChunk[] = [];
    private translations: Record<string, string> = {};

    // Queue processor timer
    private processorTimer: number | null = null;

    constructor() {
        this.config = {
            visibleObserverScreens: 0.8,
            maxConcurrentRequests: 3,
            maxBatchSize: 4,
            maxBatchChars: 1500,
            novelTitle: '',
            translateFirstN: 20,
            lookaheadCount: 20,
        };
    }

    // ============ Public API ============

    /**
     * Initialize the engine with config and callbacks
     */
    initialize(
        config: EngineConfig,
        callbacks: TranslationCallbacks,
        chunks: TextChunk[],
        existingTranslations: Record<string, string> = {}
    ): void {
        this.config = { ...this.config, ...config };
        this.callbacks = callbacks;
        this.allChunks = chunks;
        this.translations = { ...existingTranslations };

        // Mark already translated chunks as completed
        Object.keys(existingTranslations).forEach(id => {
            this.completedIds.add(id);
        });

        // Create IntersectionObserver with preload margin
        this.createObserver();

        // Start processor loop
        this.startProcessor();
    }

    /**
     * Register a paragraph element for viewport observation
     */
    observe(element: HTMLElement, chunkId: string, chunkIndex: number, text: string): void {
        // Skip if already completed
        if (this.completedIds.has(chunkId)) return;

        // Store paragraph info
        this.paragraphMap.set(chunkId, { chunkId, chunkIndex, element, text });
        this.elementToChunkId.set(element, chunkId);

        // Start observing
        this.paragraphObserver?.observe(element);
    }

    /**
     * Unobserve a paragraph element
     */
    unobserve(element: HTMLElement): void {
        this.paragraphObserver?.unobserve(element);

        const chunkId = this.elementToChunkId.get(element);
        if (chunkId) {
            this.paragraphMap.delete(chunkId);
        }
    }

    /**
     * Manually enqueue a chunk for translation (e.g., retry)
     */
    enqueue(chunkId: string, priority: 'high' | 'normal' = 'normal'): void {
        // Skip if already pending or completed
        if (this.pendingIds.has(chunkId) || this.completedIds.has(chunkId)) return;

        const info = this.paragraphMap.get(chunkId);
        if (!info) return;

        this.addToQueue(chunkId, info.chunkIndex, priority);
    }

    /**
     * Force retry a chunk (removes from completed set first)
     */
    retry(chunkId: string): void {
        this.completedIds.delete(chunkId);
        this.pendingIds.delete(chunkId);

        // Find chunk in allChunks - don't rely on paragraphMap
        const chunk = this.allChunks.find(c => c.id === chunkId);
        if (chunk) {
            this.addToQueueDirect(chunkId, chunk.index, chunk.text, 'high');
            this.processQueue();  // Immediately process for retry
        }
    }

    /**
     * Update translations map (for external state sync)
     */
    updateTranslations(translations: Record<string, string>): void {
        this.translations = { ...translations };
        Object.keys(translations).forEach(id => {
            this.completedIds.add(id);
            this.pendingIds.delete(id);
        });
    }

    /**
     * Pause translation
     */
    pause(): void {
        this.isPaused = true;
        this.setStatus('paused');
        this.log(`翻译已暂停。队列中还有 ${this.queue.length} 个段落待翻译。`);
    }

    /**
     * Resume translation
     */
    resume(): void {
        this.isPaused = false;
        if (this.queue.length > 0 || this.activeRequests > 0) {
            this.setStatus('translating');
            this.log('翻译已恢复。');
            this.processQueue();
        }
    }

    /**
     * Start translating (called after user clicks start)
     */
    start(): void {
        this.isPaused = false;
        this.isStarted = true;
        this.setStatus('translating');
        this.log('翻译已开始，等待段落进入视口...');

        // Debug: Log paragraphMap state to help diagnose timing issues
        this.log(`当前已注册段落数：${this.paragraphMap.size}，已完成翻译：${this.completedIds.size}`);

        // Find the first untranslated chunk
        let firstUntranslatedIdx = -1;
        for (let i = 0; i < this.allChunks.length; i++) {
            if (!this.completedIds.has(this.allChunks[i].id)) {
                firstUntranslatedIdx = i;
                break;
            }
        }

        // If all chunks are already translated, nothing to do
        if (firstUntranslatedIdx === -1) {
            this.log('所有段落已翻译完成。');
            this.setStatus('idle');
            return;
        }

        // Log the resume position if resuming from middle
        if (firstUntranslatedIdx > 0) {
            this.log(`从第 ${firstUntranslatedIdx + 1} 段继续翻译`);
        }

        // Auto-enqueue N paragraphs starting from the first untranslated position
        const firstN = this.config.translateFirstN;
        let enqueued = 0;
        for (let i = firstUntranslatedIdx; i < this.allChunks.length && enqueued < firstN; i++) {
            const chunk = this.allChunks[i];
            if (this.completedIds.has(chunk.id)) continue;

            // Directly enqueue using chunk data - don't require paragraphMap lookup
            this.addToQueueDirect(chunk.id, chunk.index, chunk.text, 'normal');
            enqueued++;
        }

        if (enqueued > 0) {
            this.log(`已自动将 ${enqueued} 个段落加入队列`);
        }

        // CRITICAL: Scan DOM directly for paragraph elements and observe them
        // This bypasses React's useEffect timing issue in production
        this.scanAndObserveParagraphs();

        // Immediately trigger queue processing
        this.processQueue();
    }

    /**
     * Scan DOM for paragraph elements and observe them with IntersectionObserver
     * This ensures viewport detection works even if React's observe() hasn't been called
     */
    private scanAndObserveParagraphs(): void {
        if (!this.paragraphObserver) return;

        // Find all paragraph elements in the DOM
        const paragraphs = document.querySelectorAll('[data-chunk-id]');
        this.log(`DOM 扫描发现 ${paragraphs.length} 个段落元素`);

        paragraphs.forEach((element) => {
            const chunkId = element.getAttribute('data-chunk-id');
            if (!chunkId) return;

            // Skip if already completed
            if (this.completedIds.has(chunkId)) return;

            // Observe this element
            this.paragraphObserver?.observe(element);
        });
    }

    /**
     * Destroy the engine and cleanup
     */
    destroy(): void {
        this.paragraphObserver?.disconnect();
        this.paragraphObserver = null;

        if (this.processorTimer) {
            clearInterval(this.processorTimer);
            this.processorTimer = null;
        }

        this.queue = [];
        this.pendingIds.clear();
        this.paragraphMap.clear();
    }

    /**
     * Get current status
     */
    getStatus(): 'idle' | 'translating' | 'paused' {
        return this.status;
    }

    // ============ Private Methods ============

    private createObserver(): void {
        if (typeof IntersectionObserver === 'undefined') return;

        const rootMargin = this.computeRootMargin();

        this.paragraphObserver = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (entry.isIntersecting) {
                        // Get chunkId from DOM attribute - more reliable than WeakMap
                        // WeakMap may not be populated if observe() wasn't called
                        const chunkId = (entry.target as HTMLElement).getAttribute('data-chunk-id');
                        if (chunkId) {
                            this.onParagraphVisible(chunkId);
                        }
                    }
                }
            },
            { root: null, rootMargin }
        );
    }

    private computeRootMargin(): string {
        const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
        const px = Math.round(vh * this.config.visibleObserverScreens);
        return `${px}px 0px ${px}px 0px`;
    }

    private onParagraphVisible(chunkId: string): void {
        // Skip if not started yet
        if (!this.isStarted) return;

        // Skip if already handled
        if (this.pendingIds.has(chunkId) || this.completedIds.has(chunkId)) return;

        // Find chunk in allChunks - don't rely on paragraphMap being populated
        const chunk = this.allChunks.find(c => c.id === chunkId);
        if (!chunk) return;

        // Queue the visible paragraph using direct method
        this.addToQueueDirect(chunkId, chunk.index, chunk.text, 'normal');

        // Pre-translate N paragraphs ahead (lookahead)
        const lookahead = this.config.lookaheadCount;
        const startIdx = chunk.index + 1;
        const endIdx = Math.min(startIdx + lookahead, this.allChunks.length);

        for (let i = startIdx; i < endIdx; i++) {
            const nextChunk = this.allChunks[i];
            if (!nextChunk) continue;
            if (this.completedIds.has(nextChunk.id)) continue;
            if (this.pendingIds.has(nextChunk.id)) continue;

            // Use addToQueueDirect to ensure we can queue without DOM element
            this.addToQueueDirect(nextChunk.id, nextChunk.index, nextChunk.text, 'normal');
        }
    }

    private addToQueue(chunkId: string, chunkIndex: number, priority: 'high' | 'normal'): void {
        // Skip duplicates
        if (this.queue.some(item => item.chunkId === chunkId)) return;
        if (this.pendingIds.has(chunkId)) return;

        const item: QueueItem = {
            chunkId,
            chunkIndex,
            priority,
            addedAt: Date.now(),
        };

        if (priority === 'high') {
            // Insert at front for high priority
            this.queue.unshift(item);
        } else {
            // Sort by index for sequential reading experience
            const insertIdx = this.queue.findIndex(
                q => q.priority === 'normal' && q.chunkIndex > chunkIndex
            );
            if (insertIdx === -1) {
                this.queue.push(item);
            } else {
                this.queue.splice(insertIdx, 0, item);
            }
        }

        if (!this.isPaused && this.status !== 'translating') {
            this.setStatus('translating');
        }
    }

    /**
     * Add chunk to queue directly using chunk data - doesn't require paragraphMap lookup.
     * This fixes timing issues where start() is called before React finishes rendering.
     */
    private addToQueueDirect(
        chunkId: string,
        chunkIndex: number,
        text: string,
        priority: 'high' | 'normal'
    ): void {
        // Skip duplicates
        if (this.queue.some(item => item.chunkId === chunkId)) return;
        if (this.pendingIds.has(chunkId)) return;

        // Ensure paragraphMap has the chunk info (for translateBatch lookup)
        if (!this.paragraphMap.has(chunkId)) {
            // Create synthetic entry - element may not exist yet
            this.paragraphMap.set(chunkId, {
                chunkId,
                chunkIndex,
                element: null as unknown as HTMLElement,
                text,
            });
        }

        const item: QueueItem = {
            chunkId,
            chunkIndex,
            priority,
            addedAt: Date.now(),
        };

        if (priority === 'high') {
            this.queue.unshift(item);
        } else {
            const insertIdx = this.queue.findIndex(
                q => q.priority === 'normal' && q.chunkIndex > chunkIndex
            );
            if (insertIdx === -1) {
                this.queue.push(item);
            } else {
                this.queue.splice(insertIdx, 0, item);
            }
        }

        if (!this.isPaused && this.status !== 'translating') {
            this.setStatus('translating');
        }
    }

    private startProcessor(): void {
        // Process queue periodically
        this.processorTimer = window.setInterval(() => {
            this.processQueue();
        }, 200);

        // Initial trigger
        this.processQueue();
    }

    private async processQueue(): Promise<void> {
        if (this.isPaused) return;
        if (this.activeRequests >= this.config.maxConcurrentRequests) return;
        if (this.queue.length === 0) {
            if (this.activeRequests === 0 && this.status === 'translating') {
                // Check if ALL chunks are done - not just observed paragraphs
                // This prevents premature idle when only first N chunks were auto-queued
                const allDone = this.allChunks.every(
                    chunk => this.completedIds.has(chunk.id)
                );
                if (allDone && this.allChunks.length > 0) {
                    this.setStatus('idle');
                }
                // If not all done, status stays 'translating' - waiting for viewport to trigger more
            }
            return;
        }


        // Build a batch from queue
        const batch = this.buildBatch();
        if (batch.length === 0) return;

        // Mark as pending
        batch.forEach(item => {
            this.pendingIds.add(item.chunkId);
        });

        // Remove from queue
        const batchIds = new Set(batch.map(b => b.chunkId));
        this.queue = this.queue.filter(q => !batchIds.has(q.chunkId));

        // Execute translation
        this.activeRequests++;

        // Log batch start
        const firstIndex = batch[0].chunkIndex;
        const lastIndex = batch[batch.length - 1].chunkIndex;
        this.callbacks?.onBatchStart?.(firstIndex + 1, lastIndex + 1, batch.length);
        this.log(`正在翻译批次：段落 ${firstIndex + 1}-${lastIndex + 1} (${batch.length} 个切片)`);

        try {
            await this.translateBatch(batch);
            this.log(`批次完成：段落 ${firstIndex + 1}-${lastIndex + 1}`);
        } catch (error) {
            console.error('Batch translation failed:', error);
            this.log(`批次失败：段落 ${firstIndex + 1}-${lastIndex + 1}。错误：${error}`);
            // Remove from pending, they'll be retried on next visibility
            batch.forEach(item => {
                this.pendingIds.delete(item.chunkId);
                this.callbacks?.onTranslationError(item.chunkId, error as Error);
            });
        } finally {
            this.activeRequests--;
        }
    }

    private buildBatch(): QueueItem[] {
        if (this.queue.length === 0) return [];

        const batch: QueueItem[] = [];
        let totalChars = 0;

        // Start with first item (could be high priority)
        const first = this.queue[0];
        // Use allChunks lookup instead of paragraphMap - more reliable in production
        const firstChunk = this.allChunks.find(c => c.id === first.chunkId);
        if (!firstChunk) return [];

        batch.push(first);
        totalChars += firstChunk.text.length;

        // Try to add consecutive items
        let nextIndex = first.chunkIndex + 1;

        for (let i = 1; i < this.queue.length && batch.length < this.config.maxBatchSize; i++) {
            const item = this.queue[i];

            // Only batch consecutive paragraphs for context coherence
            if (item.chunkIndex !== nextIndex) break;

            // Use allChunks lookup instead of paragraphMap
            const chunk = this.allChunks.find(c => c.id === item.chunkId);
            if (!chunk) break;

            if (totalChars + chunk.text.length > this.config.maxBatchChars) break;

            batch.push(item);
            totalChars += chunk.text.length;
            nextIndex++;
        }

        return batch;
    }

    private async translateBatch(batch: QueueItem[]): Promise<void> {
        // Use allChunks lookup instead of paragraphMap - more reliable in production
        const texts = batch.map(item => {
            const chunk = this.allChunks.find(c => c.id === item.chunkId);
            return chunk?.text || '';
        }).filter(t => t.length > 0);

        if (texts.length === 0) return;

        // Get context from surrounding paragraphs
        const firstIndex = batch[0].chunkIndex;
        const lastIndex = batch[batch.length - 1].chunkIndex;

        const context = {
            previousParagraph: firstIndex > 0
                ? this.allChunks[firstIndex - 1]?.text
                : undefined,
            nextParagraph: lastIndex < this.allChunks.length - 1
                ? this.allChunks[lastIndex + 1]?.text
                : undefined,
            globalContext: `Title: ${this.config.novelTitle}`,
        };

        const translations = await aiService.translateBatch(texts, context);

        // Map results back to chunks
        batch.forEach((item, idx) => {
            const translation = translations[idx];
            if (translation) {
                this.completedIds.add(item.chunkId);
                this.pendingIds.delete(item.chunkId);
                this.translations[item.chunkId] = translation;
                this.callbacks?.onTranslationComplete(item.chunkId, translation);
            } else {
                // No translation returned - mark as error
                this.pendingIds.delete(item.chunkId);
                this.callbacks?.onTranslationError(
                    item.chunkId,
                    new Error('Empty translation returned')
                );
            }
        });
    }

    private setStatus(newStatus: 'idle' | 'translating' | 'paused'): void {
        if (this.status !== newStatus) {
            this.status = newStatus;
            this.callbacks?.onStatusChange?.(newStatus);

            if (newStatus === 'idle') {
                const completed = this.completedIds.size;
                const total = this.paragraphMap.size;
                if (completed >= total && total > 0) {
                    this.log(`翻译完成！共翻译 ${completed} 个段落。`);
                }
            }
        }
    }

    private log(message: string): void {
        this.callbacks?.onLog?.(message);
    }
}

// Singleton instance
export const translationEngine = new TranslationEngine();
