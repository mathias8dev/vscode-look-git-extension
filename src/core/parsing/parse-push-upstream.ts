export interface PushUpstream {
    readonly remote: string;
    readonly ref: string;
}

export function parsePushUpstream(output: string): PushUpstream | undefined {
    const value = output.replace(/\r?\n$/, '');
    if (!value || value === '\0') { return undefined; }
    const fields = value.split('\0');
    const [remote, ref] = fields;
    if (fields.length !== 2 || !remote || !ref) { throw new Error('Invalid Git push upstream record.'); }
    return { remote, ref };
}
