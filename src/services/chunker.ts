export interface TextChunk {
    id: string; // Unique ID for keying
    index: number; // Order index
    text: string; // The original text content
    context?: string; // Metadata or summarization context (future use)
}

export class TextChunker {
    /**
     * Splits raw text into paragraphs.
     * Filters out empty lines and handles different newline styles.
     */
    static chunkText(rawText: string): TextChunk[] {
        // 1. Split by double newlines or single newlines followed by indentation, etc.
        // For novels, typically paragraphs are separated by blank lines OR indentation.
        // Let's settle on standardized splitting: split by \n, then group non-empty lines if they look like they belong together?
        // KEEP IT SIMPLE: Split by \n, filter empty strings.
        // However, some novels use single \n for line breaks within paragraphs.
        // Heuristic: If there are many empty lines, assume double-\n separates paragraphs.

        // Normalize endings
        const normalized = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

        // Split by double newline (standard markdown/txt paragraph style)
        // If the file is just a wall of text with single \n, this might result in one giant chunk.
        // Let's try to detect if double newlines exist.
        const hasDoubleNewlines = normalized.includes('\n\n');

        let segments: string[];

        if (hasDoubleNewlines) {
            segments = normalized.split('\n\n');
        } else {
            // Fallback: Split by single newline, assuming each line is a paragraph (common in web novels)
            segments = normalized.split('\n');
        }

        return segments
            .map(s => s.trim())
            .filter(s => s.length > 0)
            .map((text, index) => ({
                id: crypto.randomUUID(),
                index,
                text
            }));
    }
}
