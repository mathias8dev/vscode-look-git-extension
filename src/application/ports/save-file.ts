export interface SaveFileOptions {
    readonly defaultDirectory: string;
    readonly defaultFileName: string;
    readonly filters?: Readonly<Record<string, readonly string[]>>;
}

export interface SaveFilePort {
    showSaveFile(options: SaveFileOptions): Promise<string | undefined>;
}
