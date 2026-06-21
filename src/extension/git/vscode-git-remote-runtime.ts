import * as path from 'path';
import * as vscode from 'vscode';
import type { SemanticGitOperation } from '@application/ports/git-operation';
import { UnsupportedGitOperationError, type GitExecutionContext, type GitRuntime } from '@application/ports/git-runtime';

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

interface VscodeGitRepositoryState {
    readonly HEAD: VscodeGitBranch | undefined;
    readonly remotes: readonly VscodeGitRemote[];
}

interface VscodeGitBranch {
    readonly name?: string;
    readonly remote?: string;
    readonly upstream?: VscodeGitUpstream;
}

interface VscodeGitUpstream {
    readonly remote: string;
    readonly name: string;
}

interface VscodeGitRemote {
    readonly name: string;
    readonly pushUrl?: string;
    readonly fetchUrl?: string;
    readonly isReadOnly?: boolean;
}

interface VscodeFetchOptions {
    readonly remote?: string;
    readonly all?: boolean;
    readonly prune?: boolean;
}

const VscodeForcePushMode = {
    ForceWithLease: 1,
} as const;

type VscodeForcePushMode = typeof VscodeForcePushMode[keyof typeof VscodeForcePushMode];

const VSCODE_REMOTE_OPERATIONS = new Set<SemanticGitOperation>([
    'fetch',
    'fetchAll',
    'pull',
    'push',
    'pushBranch',
    'forcePushWithLease',
]);

export class VscodeGitRemoteRuntime implements GitRuntime {
    constructor(
        private readonly getGitApi: VscodeGitApiProvider = defaultVscodeGitApiProvider,
        private readonly executeCommand: VscodeCommandExecutor = (command, ...rest) => vscode.commands.executeCommand(command, ...rest),
    ) {}

    supports(operation: SemanticGitOperation): boolean {
        return VSCODE_REMOTE_OPERATIONS.has(operation);
    }

    async execute<TInput = unknown, TResult = unknown>(
        operation: SemanticGitOperation,
        context: GitExecutionContext,
        input: TInput,
        signal?: AbortSignal,
    ): Promise<TResult> {
        signal?.throwIfAborted();
        const repository = await this.resolveRepository(operation, context);
        switch (operation) {
            case 'fetch':
                await repository.fetch(fetchOptions(input));
                return runtimeResult(undefined);
            case 'fetchAll':
                await repository.fetch({ all: true, ...fetchOptionsFromOptionsField(input) });
                return runtimeResult(undefined);
            case 'pull':
                if (booleanOption(objectField(input, 'options'), 'rebase')) {
                    throw new UnsupportedGitOperationError(operation, context);
                }
                await repository.pull();
                return runtimeResult(undefined);
            case 'push':
                await this.push(repository, context, input);
                return runtimeResult(undefined);
            case 'pushBranch':
                await this.pushBranch(repository, context, input);
                return runtimeResult(undefined);
            case 'forcePushWithLease':
                await repository.push(
                    requiredStringField(input, 'remote'),
                    requiredStringField(input, 'branch'),
                    false,
                    VscodeForcePushMode.ForceWithLease,
                );
                return runtimeResult(undefined);
            default:
                throw new UnsupportedGitOperationError(operation, context);
        }
    }

    private async resolveRepository(operation: SemanticGitOperation, context: GitExecutionContext): Promise<VscodeGitRepository> {
        const api = await this.getGitApi();
        const repository = api?.getRepository(vscode.Uri.file(context.cwd))
            ?? api?.repositories.find((candidate) => samePath(candidate.rootUri.fsPath, context.cwd));
        if (!repository) {
            throw new UnsupportedGitOperationError(operation, context);
        }
        return repository;
    }

    private async pushBranch(repository: VscodeGitRepository, context: GitExecutionContext, input: unknown): Promise<void> {
        const branch = requiredStringField(input, 'branch');
        const options = objectField(input, 'options');
        const remote = optionalStringField(input, 'remote') ?? remoteForBranch(repository, branch);
        if (!remote) {
            if (!isHeadBranch(repository, branch) || booleanOption(options, 'forceWithLease')) {
                throw new UnsupportedGitOperationError('pushBranch', context);
            }
            await this.executeCommand('git.publish', repository);
            return;
        }
        await repository.push(remote, branch, optionalBooleanField(options, 'setUpstream') ?? !hasUpstream(repository, branch), forceMode(input));
    }

    private async push(repository: VscodeGitRepository, context: GitExecutionContext, input: unknown): Promise<void> {
        const options = objectField(input, 'options');
        const requestedRemote = optionalStringField(input, 'remote');
        if (requestedRemote || hasCurrentUpstream(repository)) {
            await repository.push(requestedRemote, undefined, false, forceMode(input));
            return;
        }

        const branch = repository.state.HEAD?.name;
        if (!branch || booleanOption(options, 'forceWithLease')) {
            throw new UnsupportedGitOperationError('push', context);
        }
        await this.executeCommand('git.publish', repository);
    }
}

export type VscodeCommandExecutor = <T = unknown>(command: string, ...rest: readonly unknown[]) => PromiseLike<T>;

async function defaultVscodeGitApiProvider(): Promise<VscodeGitApi | undefined> {
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

function fetchOptions(input: unknown): VscodeFetchOptions {
    return definedOptions({
        remote: optionalStringField(input, 'remote'),
        ...fetchOptionsFromOptionsField(input),
    });
}

function fetchOptionsFromOptionsField(input: unknown): VscodeFetchOptions {
    const options = objectField(input, 'options');
    return definedOptions({
        prune: optionalBooleanField(options, 'prune'),
    });
}

function forceMode(input: unknown): VscodeForcePushMode | undefined {
    return booleanOption(objectField(input, 'options'), 'forceWithLease') ? VscodeForcePushMode.ForceWithLease : undefined;
}

function definedOptions(options: VscodeFetchOptions): VscodeFetchOptions {
    return {
        ...(options.remote === undefined ? {} : { remote: options.remote }),
        ...(options.all === undefined ? {} : { all: options.all }),
        ...(options.prune === undefined ? {} : { prune: options.prune }),
    };
}

function objectField(input: unknown, key: string): Readonly<Record<string, unknown>> | undefined {
    if (typeof input !== 'object' || input === null) { return undefined; }
    const value = Object.getOwnPropertyDescriptor(input, key)?.value;
    return isReadonlyRecord(value) ? value : undefined;
}

function isReadonlyRecord(value: unknown): value is Readonly<Record<string, unknown>> {
    return typeof value === 'object' && value !== null;
}

function optionalStringField(input: unknown, key: string): string | undefined {
    if (typeof input !== 'object' || input === null) { return undefined; }
    const value = Object.getOwnPropertyDescriptor(input, key)?.value;
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function requiredStringField(input: unknown, key: string): string {
    const value = optionalStringField(input, key);
    if (!value) { throw new Error(`Expected string field "${key}".`); }
    return value;
}

function optionalBooleanField(input: unknown, key: string): boolean | undefined {
    if (typeof input !== 'object' || input === null) { return undefined; }
    const value = Object.getOwnPropertyDescriptor(input, key)?.value;
    return typeof value === 'boolean' ? value : undefined;
}

function booleanOption(input: unknown, key: string): boolean {
    return optionalBooleanField(input, key) === true;
}

function remoteForBranch(repository: VscodeGitRepository, branch: string): string | undefined {
    const head = repository.state.HEAD;
    if (head?.name === branch && head.upstream) { return head.remote ?? head.upstream.remote; }
    const writableRemotes = repository.state.remotes.filter((remote) => remote.isReadOnly !== true);
    return writableRemotes.length === 1 ? writableRemotes[0]?.name : undefined;
}

function hasUpstream(repository: VscodeGitRepository, branch: string): boolean {
    return repository.state.HEAD?.name === branch && repository.state.HEAD.upstream !== undefined;
}

function hasCurrentUpstream(repository: VscodeGitRepository): boolean {
    return repository.state.HEAD?.upstream !== undefined;
}

function isHeadBranch(repository: VscodeGitRepository, branch: string): boolean {
    return repository.state.HEAD?.name === branch;
}

function samePath(left: string, right: string): boolean {
    return path.normalize(left) === path.normalize(right);
}

function runtimeResult<TResult>(value: unknown): TResult {
    return value as TResult; // GitRuntime.execute is generic at call sites; this runtime returns void for every supported VS Code Git operation.
}
