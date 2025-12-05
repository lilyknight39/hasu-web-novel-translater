export class FileParser {
    /**
     * Reads a text file and returns its content as a string.
     * Supports .txt files for now. Future support for .md, .pdf etc.
     */
    static async readFile(file: File): Promise<string> {
        return new Promise((resolve, reject) => {
            // Basic validation
            if (!file) {
                reject(new Error("No file provided"));
                return;
            }

            // Check file type (loose check for text/* or empty for some systems)
            // We'll retry strict checking if needed, but for now rely on extension or success

            const reader = new FileReader();

            reader.onload = (event) => {
                if (event.target?.result) {
                    resolve(event.target.result as string);
                } else {
                    reject(new Error("Failed to read file"));
                }
            };

            reader.onerror = (error) => {
                reject(error);
            };

            reader.readAsText(file); // Default encoding UTF-8
        });
    }

    // Future: add parseMarkdown, parsePDF, etc.
}
