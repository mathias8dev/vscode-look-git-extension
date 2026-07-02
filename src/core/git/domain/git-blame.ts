export interface GitBlameLine {
    readonly line: number;
    readonly commit: string;
    readonly author: string;
    readonly authorTime: number | undefined;
    readonly summary: string | undefined;
}
