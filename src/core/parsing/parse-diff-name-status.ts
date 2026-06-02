export interface DiffNameStatusEntry {
    readonly status: string;
    readonly filePath: string;
    readonly origPath?: string;
}

export function parseDiffNameStatus(output: string): readonly DiffNameStatusEntry[] {
    const entries: DiffNameStatusEntry[] = [];
    if (!output) { return entries; }

    const tokens = output.split('\0');
    for (let i = 0; i < tokens.length;) {
        const rawStatus = tokens[i++];
        if (!rawStatus) { continue; }

        const status = rawStatus.charAt(0);
        if (status === 'R' || status === 'C') {
            const origPath = tokens[i++];
            const filePath = tokens[i++];
            if (origPath && filePath) { entries.push({ status, filePath, origPath }); }
            continue;
        }

        const filePath = tokens[i++];
        if (filePath) { entries.push({ status, filePath }); }
    }

    return entries;
}
