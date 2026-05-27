export interface StashIdentity {
    index: number;
    message: string;
}

export class StashFileState<TFile> {
    private expanded = new Set<number>();
    private files = new Map<number, TFile[]>();
    private signature = '';

    public sync(stashes: readonly StashIdentity[]): void {
        const nextSignature = stashes
            .map((stash) => `${stash.index}\u0000${stash.message}`)
            .join('\u0001');

        if (nextSignature === this.signature) {
            return;
        }

        this.signature = nextSignature;
        this.expanded.clear();
        this.files.clear();
    }

    public isExpanded(index: number): boolean {
        return this.expanded.has(index);
    }

    public toggle(index: number): { expanded: boolean; shouldRequestFiles: boolean } {
        if (this.expanded.has(index)) {
            this.expanded.delete(index);
            return { expanded: false, shouldRequestFiles: false };
        }

        this.expanded.add(index);
        return { expanded: true, shouldRequestFiles: !this.files.has(index) };
    }

    public getFiles(index: number): TFile[] | undefined {
        return this.files.get(index);
    }

    public setFiles(index: number, files: TFile[]): void {
        this.files.set(index, files);
    }
}
