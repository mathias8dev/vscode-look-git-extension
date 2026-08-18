export function parseNullTerminatedGitConfigValues(output: string): string[] {
    if (!output) { return []; }
    const values: string[] = [];
    for (const record of output.split('\0')) {
        if (!record) { continue; }
        const separator = record.indexOf('\n');
        if (separator < 0) { continue; }
        const value = record.slice(separator + 1);
        if (value) { values.push(value); }
    }
    return values;
}
