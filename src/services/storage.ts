import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { TextChunk } from './chunker';

interface Novel {
    id: string; // generated UUID
    title: string;
    originalContent: string;
    totalChunks: number;
    lastReadChunkIndex: number;
    createdAt: number;
    lastReadAt?: number; // Timestamp of last reading session
}

interface TranslationProject {
    novelId: string;
    chunks: TextChunk[];
    translations: Record<string, string>; // chunkId -> translated text
}

interface NovelDB extends DBSchema {
    novels: {
        key: string;
        value: Novel;
    };
    projects: {
        key: string;
        value: TranslationProject;
    };
}

const DB_NAME = 'ai-novel-translator-db';
const DB_VERSION = 1;

export class StorageService {
    private dbPromise: Promise<IDBPDatabase<NovelDB>>;

    constructor() {
        this.dbPromise = openDB<NovelDB>(DB_NAME, DB_VERSION, {
            upgrade(db) {
                // Store novel metadata
                if (!db.objectStoreNames.contains('novels')) {
                    db.createObjectStore('novels', { keyPath: 'id' });
                }
                // Store the heavy text content and translations separately
                if (!db.objectStoreNames.contains('projects')) {
                    db.createObjectStore('projects', { keyPath: 'novelId' });
                }
            },
        });
    }

    async saveNovel(novel: Novel, chunks: TextChunk[]): Promise<void> {
        const db = await this.dbPromise;
        const project: TranslationProject = {
            novelId: novel.id,
            chunks,
            translations: {}
        };

        const tx = db.transaction(['novels', 'projects'], 'readwrite');
        await Promise.all([
            tx.objectStore('novels').put(novel),
            tx.objectStore('projects').put(project),
            tx.done,
        ]);
    }

    async getNovels(): Promise<Novel[]> {
        const db = await this.dbPromise;
        return db.getAll('novels');
    }

    async getProject(novelId: string): Promise<TranslationProject | undefined> {
        const db = await this.dbPromise;
        return db.get('projects', novelId);
    }

    async saveTranslation(novelId: string, chunkId: string, translation: string): Promise<void> {
        const db = await this.dbPromise;
        const project = await db.get('projects', novelId);
        if (!project) throw new Error('Project not found');

        project.translations[chunkId] = translation;
        await db.put('projects', project);
    }

    async deleteNovel(novelId: string): Promise<void> {
        const db = await this.dbPromise;
        const tx = db.transaction(['novels', 'projects'], 'readwrite');
        await Promise.all([
            tx.objectStore('novels').delete(novelId),
            tx.objectStore('projects').delete(novelId),
            tx.done
        ]);
    }

    async getNovel(novelId: string): Promise<Novel | undefined> {
        const db = await this.dbPromise;
        return db.get('novels', novelId);
    }

    async saveReadingPosition(novelId: string, chunkIndex: number): Promise<void> {
        const db = await this.dbPromise;
        const novel = await db.get('novels', novelId);
        if (!novel) return;

        novel.lastReadChunkIndex = chunkIndex;
        novel.lastReadAt = Date.now();
        await db.put('novels', novel);
    }
}

export const storage = new StorageService();
