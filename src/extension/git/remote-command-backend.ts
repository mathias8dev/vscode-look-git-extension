import type { GitRepository } from '../../core/git/GitRepository';

export enum VscodeRemoteCommand {
    Fetch = 'fetch',
    FetchAll = 'fetchAll',
    FetchPrune = 'fetchPrune',
    Pull = 'pull',
    PullRebase = 'pullRebase',
    PullFrom = 'pullFrom',
    Push = 'push',
    PushForce = 'pushForce',
    PushTo = 'pushTo',
    PushToForce = 'pushToForce',
    PushTags = 'pushTags',
    Sync = 'sync',
    SyncRebase = 'syncRebase',
    Publish = 'publish',
    DeleteRemoteBranch = 'deleteRemoteBranch',
    DeleteRemoteTag = 'deleteRemoteTag',
}

export enum CliRemoteCommandKind {
    Args = 'args',
    CommandLine = 'commandLine',
}

export interface CliRemoteCommand {
    readonly kind: CliRemoteCommandKind;
    readonly cwd?: string;
    readonly args?: readonly string[];
    readonly commandLine?: string;
    readonly title?: string;
}

export interface VscodeRemoteCommandRunner {
    run(repo: GitRepository, command: VscodeRemoteCommand): Promise<void>;
}

export interface CliRemoteCommandRunner {
    run(repo: GitRepository, command: CliRemoteCommand): Promise<void>;
}

export interface RemoteCommandBackend {
    runVscode(repo: GitRepository, command: VscodeRemoteCommand): Promise<void>;
    runCli(repo: GitRepository, command: CliRemoteCommand): Promise<void>;
}
