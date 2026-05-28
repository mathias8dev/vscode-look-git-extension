export function getRepositoryWebUrl(remoteUrl?: string): string | undefined {
    if (!remoteUrl) {
        return undefined;
    }

    const trimmed = remoteUrl.trim();
    if (!trimmed) {
        return undefined;
    }

    const scpLike = trimmed.match(/^(?:[^@]+@)?([^:]+):(.+)$/);
    if (scpLike && !trimmed.includes('://')) {
        return buildWebUrl(scpLike[1], scpLike[2]);
    }

    try {
        const parsed = new URL(trimmed);
        return buildWebUrl(parsed.host, parsed.pathname.replace(/^\/+/, ''));
    } catch {
        return undefined;
    }
}

export function getCommitWebUrl(repositoryWebUrl: string, commitHash: string): string {
    const normalized = repositoryWebUrl.replace(/\/+$/, '');
    let host = '';
    try {
        host = new URL(normalized).host.toLowerCase();
    } catch {
        return `${normalized}/commit/${commitHash}`;
    }

    if (host.includes('gitlab')) {
        return `${normalized}/-/commit/${commitHash}`;
    }
    if (host.includes('bitbucket')) {
        return `${normalized}/commits/${commitHash}`;
    }
    return `${normalized}/commit/${commitHash}`;
}

function buildWebUrl(host: string, repoPath: string): string | undefined {
    const cleanHost = host.trim();
    const cleanPath = repoPath
        .trim()
        .replace(/^\/+/, '')
        .replace(/\.git$/, '')
        .replace(/\/+$/, '');

    if (!cleanHost || !cleanPath) {
        return undefined;
    }

    return `https://${cleanHost}/${cleanPath}`;
}
