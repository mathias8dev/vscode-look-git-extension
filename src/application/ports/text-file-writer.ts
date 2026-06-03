export interface TextFileWriterPort {
    writeTextFile(filePath: string, content: string): Promise<void>;
}
