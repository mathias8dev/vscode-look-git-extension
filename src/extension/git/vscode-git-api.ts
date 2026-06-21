import * as vscode from 'vscode';

export type VscodeGitApiProvider = () => Promise<VscodeGitApi | undefined>;

interface VscodeGitExtension {
    readonly enabled: boolean;
    getAPI(version: 1): VscodeGitApi;
}

export interface VscodeGitApi {
    readonly repositories: readonly VscodeGitRepository[];
    getRepository(uri: vscode.Uri): VscodeGitRepository | null;
}

export interface VscodeGitRepository {
    readonly rootUri: vscode.Uri;
    readonly state: VscodeGitRepositoryState;
    fetch(options?: VscodeFetchOptions): Promise<void>;
    pull(unshallow?: boolean): Promise<void>;
    push(remoteName?: string, branchName?: string, setUpstream?: boolean, force?: VscodeForcePushMode): Promise<void>;
}

export interface VscodeGitRepositoryState {
    readonly HEAD: VscodeGitBranch | undefined;
    readonly remotes: readonly VscodeGitRemote[];
}

export interface VscodeGitBranch {
    readonly name?: string;
    readonly remote?: string;
    readonly upstream?: VscodeGitUpstream;
}

export interface VscodeGitUpstream {
    readonly remote: string;
    readonly name: string;
}

export interface VscodeGitRemote {
    readonly name: string;
    readonly pushUrl?: string;
    readonly fetchUrl?: string;
    readonly isReadOnly?: boolean;
}

export interface VscodeFetchOptions {
    readonly remote?: string;
    readonly all?: boolean;
    readonly prune?: boolean;
}

export const VscodeForcePushMode = {
    ForceWithLease: 1,
} as const;

export type VscodeForcePushMode = typeof VscodeForcePushMode[keyof typeof VscodeForcePushMode];

export async function defaultVscodeGitApiProvider(): Promise<VscodeGitApi | undefined> {
    try {
        const extension = vscode.extensions.getExtension<VscodeGitExtension>('vscode.git');
        if (!extension) { return undefined; }
        const gitExtension = extension.isActive ? extension.exports : await extension.activate();
        if (!gitExtension.enabled) { return undefined; }
        return gitExtension.getAPI(1);
    } catch {
        return undefined;
    }
}
