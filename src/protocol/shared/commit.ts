export interface CommitFileChange {
    readonly status: string;
    readonly filePath: string;
    readonly origPath?: string;
    readonly parentHash?: string;
    readonly isSubmodule?: boolean;
}
