export function pushBranchRefspec(branch: string, upstreamRef?: string): string {
    const sourceRef = `refs/heads/${branch}`;
    return upstreamRef && upstreamRef !== sourceRef ? `${sourceRef}:${upstreamRef}` : branch;
}
