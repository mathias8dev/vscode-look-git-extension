export function parseTrackingStatus(track: string): { ahead: number; behind: number } {
    const ahead = Number(track.match(/\bahead (\d+)\b/)?.[1] ?? 0);
    const behind = Number(track.match(/\bbehind (\d+)\b/)?.[1] ?? 0);
    return { ahead, behind };
}
