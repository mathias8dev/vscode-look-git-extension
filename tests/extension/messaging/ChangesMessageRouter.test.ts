import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChangesMessageRouter } from '../../../src/extension/messaging/ChangesMessageRouter';
import type { ChangesExtensionToWebviewMessage } from '../../../src/protocol/changes/messages';
import { makeRepositoryAccessor, makeRepositoryMock } from '../../helpers/repositoryMock';
import { getCommandCalls, resetMockVscode, setInputBoxValue, setInputBoxValues, setQuickPickValue, setWarningChoice, workspace as mockWorkspace } from '../../mocks/vscode';
import { RepositoryRegistry } from '../../../src/extension/repositories/RepositoryRegistry';
import { RepoKind, type RepoContext } from '../../../src/core/git/domain/RepoContext';
import type { ActiveRepositoryAccessor } from '../../../src/extension/repositories/ActiveRepositoryRegistry';
import type { GitRepository as RuntimeRepository, Worktree } from '../../../src/application/ports/git-topology';
import type { GitRuntime } from '../../../src/application/ports/git-runtime';
import { CommitMode, ConflictState } from '../../../src/protocol/changes/types';
import { stableRepoContextId } from '../../../src/extension/repositories/repo-context-id';

describe('ChangesMessageRouter', () => {
    beforeEach(resetMockVscode);

    it('uses runtime worktree capabilities for staging paths when a context is registered', async () => {
        const legacyStageFile = vi.fn(async () => { throw new Error('legacy stageFile should not run'); });
        const repo = makeRepositoryMock({ stageFile: legacyStageFile });
        const context = repoContext();
        const runtimeRegistry = new RepositoryRegistry();
        const runtimeWorktree = worktreeModel({
            stage: vi.fn(async () => {}),
        });
        runtimeRegistry.registerWorktree(runtimeWorktree);
        const refresh = vi.fn(async () => {});
        const router = new ChangesMessageRouter(
            makeAccessor(repo, context),
            () => {},
            refresh,
            async () => {},
            undefined,
            runtimeRegistry,
        );

        await router.handle({ type: 'changes/stageFiles', filePaths: ['a.ts', 'b.ts'] });

        expect(runtimeWorktree.stage).toHaveBeenCalledWith(['a.ts', 'b.ts']);
        expect(legacyStageFile).not.toHaveBeenCalled();
        expect(refresh).toHaveBeenCalled();
    });

    it('uses runtime worktree capabilities for mark resolved operations', async () => {
        const legacyStageFile = vi.fn(async () => { throw new Error('legacy stageFile should not run'); });
        const repo = makeRepositoryMock({ stageFile: legacyStageFile });
        const context = repoContext();
        const runtimeRegistry = new RepositoryRegistry();
        const runtimeWorktree = worktreeModel({
            markResolved: vi.fn(async () => {}),
        });
        runtimeRegistry.registerWorktree(runtimeWorktree);
        const router = new ChangesMessageRouter(
            makeAccessor(repo, context),
            () => {},
            vi.fn(async () => {}),
            async () => {},
            undefined,
            runtimeRegistry,
        );

        await router.handle({ type: 'changes/markResolvedFiles', filePaths: ['conflict-a.ts', 'conflict-b.ts'] });

        expect(runtimeWorktree.markResolved).toHaveBeenCalledWith(['conflict-a.ts', 'conflict-b.ts']);
        expect(legacyStageFile).not.toHaveBeenCalled();
    });

    it('uses runtime worktree capabilities for conflict side resolution', async () => {
        const legacyAcceptTheirs = vi.fn(async () => { throw new Error('legacy acceptTheirs should not run'); });
        const repo = makeRepositoryMock({ acceptTheirs: legacyAcceptTheirs });
        const context = repoContext();
        const runtimeRegistry = new RepositoryRegistry();
        const runtimeWorktree = worktreeModel({
            acceptTheirs: vi.fn(async () => {}),
        });
        runtimeRegistry.registerWorktree(runtimeWorktree);
        const router = new ChangesMessageRouter(
            makeAccessor(repo, context),
            () => {},
            vi.fn(async () => {}),
            async () => {},
            undefined,
            runtimeRegistry,
        );

        await router.handle({ type: 'changes/acceptTheirsFiles', filePaths: ['conflict-a.ts', 'conflict-b.ts'] });

        expect(runtimeWorktree.acceptTheirs).toHaveBeenCalledWith(['conflict-a.ts', 'conflict-b.ts']);
        expect(legacyAcceptTheirs).not.toHaveBeenCalled();
    });

    it('uses runtime worktree status for accept all theirs path discovery', async () => {
        setWarningChoice('Accept All Theirs');
        const legacyGetStatus = vi.fn(async () => { throw new Error('legacy getStatus should not run'); });
        const repo = makeRepositoryMock({ getStatus: legacyGetStatus });
        const context = repoContext();
        const runtimeRegistry = new RepositoryRegistry();
        const runtimeWorktree = worktreeModel({
            getStatus: vi.fn(async () => ({
                staged: [],
                unstaged: [],
                conflicts: [
                    { indexStatus: 'U', workTreeStatus: 'U', filePath: 'src/a.ts' },
                    { indexStatus: 'U', workTreeStatus: 'U', filePath: 'src/b.ts' },
                ],
                conflictState: 'merge',
            })),
            acceptTheirs: vi.fn(async () => {}),
        });
        runtimeRegistry.registerWorktree(runtimeWorktree);
        const router = new ChangesMessageRouter(
            makeAccessor(repo, context),
            () => {},
            vi.fn(async () => {}),
            async () => {},
            undefined,
            runtimeRegistry,
        );

        await router.handle({ type: 'changes/acceptAllTheirs' });

        expect(runtimeWorktree.getStatus).toHaveBeenCalled();
        expect(runtimeWorktree.acceptTheirs).toHaveBeenCalledWith(['src/a.ts', 'src/b.ts']);
        expect(legacyGetStatus).not.toHaveBeenCalled();
    });

    it('uses runtime worktree capabilities for confirmed discard operations', async () => {
        setWarningChoice('Discard');
        const legacyDiscardFile = vi.fn(async () => { throw new Error('legacy discardFile should not run'); });
        const repo = makeRepositoryMock({ discardFile: legacyDiscardFile });
        const context = repoContext();
        const runtimeRegistry = new RepositoryRegistry();
        const runtimeWorktree = worktreeModel({
            discard: vi.fn(async () => {}),
        });
        runtimeRegistry.registerWorktree(runtimeWorktree);
        const router = new ChangesMessageRouter(
            makeAccessor(repo, context),
            () => {},
            vi.fn(async () => {}),
            async () => {},
            undefined,
            runtimeRegistry,
        );

        await router.handle({ type: 'changes/discardFiles', filePaths: ['a.ts', 'b.ts'] });

        expect(runtimeWorktree.discard).toHaveBeenCalledWith(['a.ts']);
        expect(runtimeWorktree.discard).toHaveBeenCalledWith(['b.ts']);
        expect(legacyDiscardFile).not.toHaveBeenCalled();
    });

    it('uses runtime worktree capabilities for commits', async () => {
        const legacyCommit = vi.fn(async () => { throw new Error('legacy commit should not run'); });
        const repo = makeRepositoryMock({ commit: legacyCommit });
        const context = repoContext();
        const runtimeRegistry = new RepositoryRegistry();
        const runtimeWorktree = worktreeModel({
            commit: vi.fn(async () => {}),
        });
        runtimeRegistry.registerWorktree(runtimeWorktree);
        const messages: ChangesExtensionToWebviewMessage[] = [];
        const router = new ChangesMessageRouter(
            makeAccessor(repo, context),
            (message) => { messages.push(message); },
            vi.fn(async () => {}),
            async () => {},
            undefined,
            runtimeRegistry,
        );

        await router.handle({ type: 'changes/commit', message: 'Use runtime', mode: CommitMode.Commit });

        expect(runtimeWorktree.commit).toHaveBeenCalledWith('Use runtime', {});
        expect(legacyCommit).not.toHaveBeenCalled();
        expect(messages).toContainEqual({ type: 'changes/commitResult', success: true });
    });

    it('uses runtime worktree capabilities for stash operations', async () => {
        const legacyStashPop = vi.fn(async () => { throw new Error('legacy stashPop should not run'); });
        const repo = makeRepositoryMock({ stashPop: legacyStashPop });
        const context = repoContext();
        const runtimeRegistry = new RepositoryRegistry();
        const runtimeWorktree = worktreeModel({
            popStash: vi.fn(async () => {}),
        });
        runtimeRegistry.registerWorktree(runtimeWorktree);
        const router = new ChangesMessageRouter(
            makeAccessor(repo, context),
            () => {},
            vi.fn(async () => {}),
            async () => {},
            undefined,
            runtimeRegistry,
        );

        await router.handle({ type: 'changes/stashPop', index: 2 });

        expect(runtimeWorktree.popStash).toHaveBeenCalledWith('stash@{2}', {});
        expect(legacyStashPop).not.toHaveBeenCalled();
    });

    it('uses runtime worktree capabilities for stash file listing', async () => {
        const legacyGetStashFiles = vi.fn(async () => { throw new Error('legacy getStashFiles should not run'); });
        const repo = makeRepositoryMock({ getStashFiles: legacyGetStashFiles });
        const context = repoContext();
        const runtimeRegistry = new RepositoryRegistry();
        const runtimeWorktree = worktreeModel({
            getStashFiles: vi.fn(async () => [{ status: 'M', filePath: 'src/app.ts' }]),
        });
        runtimeRegistry.registerWorktree(runtimeWorktree);
        const messages: ChangesExtensionToWebviewMessage[] = [];
        const router = new ChangesMessageRouter(
            makeAccessor(repo, context),
            (message) => { messages.push(message); },
            vi.fn(async () => {}),
            async () => {},
            undefined,
            runtimeRegistry,
        );

        await router.handle({ type: 'changes/getStashFiles', requestId: 'stash-files', index: 2 });

        expect(runtimeWorktree.getStashFiles).toHaveBeenCalledWith('stash@{2}');
        expect(legacyGetStashFiles).not.toHaveBeenCalled();
        expect(messages).toContainEqual({
            type: 'changes/stashFiles',
            requestId: 'stash-files',
            index: 2,
            files: [{ status: 'M', filePath: 'src/app.ts', origPath: undefined }],
        });
    });

    it('uses runtime worktree capabilities for selected file stash operations', async () => {
        const legacyExec = vi.fn(async () => { throw new Error('legacy exec should not run'); });
        const repo = makeRepositoryMock({ exec: legacyExec });
        const context = repoContext();
        const runtimeRegistry = new RepositoryRegistry();
        const runtimeWorktree = worktreeModel({
            stash: vi.fn(async () => {}),
        });
        runtimeRegistry.registerWorktree(runtimeWorktree);
        const router = new ChangesMessageRouter(
            makeAccessor(repo, context),
            () => {},
            vi.fn(async () => {}),
            async () => {},
            undefined,
            runtimeRegistry,
        );

        await router.handle({
            type: 'changes/stashSelectedFiles',
            filePaths: ['src/a.ts', 'src/new.ts'],
            includeUntracked: true,
            message: 'selected files',
        });

        expect(runtimeWorktree.stash).toHaveBeenCalledWith('selected files', {
            includeUntracked: true,
            paths: ['src/a.ts', 'src/new.ts'],
        });
        expect(legacyExec).not.toHaveBeenCalled();
    });

    it('uses runtime worktree capabilities for continuing conflict operations', async () => {
        const legacyMergeContinue = vi.fn(async () => { throw new Error('legacy mergeContinue should not run'); });
        const repo = makeRepositoryMock({ mergeContinue: legacyMergeContinue });
        const context = repoContext();
        const runtimeRegistry = new RepositoryRegistry();
        const runtimeWorktree = worktreeModel({
            continueMerge: vi.fn(async () => {}),
        });
        runtimeRegistry.registerWorktree(runtimeWorktree);
        const router = new ChangesMessageRouter(
            makeAccessor(repo, context),
            () => {},
            vi.fn(async () => {}),
            async () => {},
            undefined,
            runtimeRegistry,
        );

        await router.handle({ type: 'changes/continueOp', conflictState: ConflictState.Merge });

        expect(runtimeWorktree.continueMerge).toHaveBeenCalled();
        expect(legacyMergeContinue).not.toHaveBeenCalled();
    });

    it('uses runtime worktree capabilities for aborting conflict operations', async () => {
        setWarningChoice('Abort');
        const legacyRebaseAbort = vi.fn(async () => { throw new Error('legacy rebaseAbort should not run'); });
        const repo = makeRepositoryMock({ rebaseAbort: legacyRebaseAbort });
        const context = repoContext();
        const runtimeRegistry = new RepositoryRegistry();
        const runtimeWorktree = worktreeModel({
            abortRebase: vi.fn(async () => {}),
        });
        runtimeRegistry.registerWorktree(runtimeWorktree);
        const router = new ChangesMessageRouter(
            makeAccessor(repo, context),
            () => {},
            vi.fn(async () => {}),
            async () => {},
            undefined,
            runtimeRegistry,
        );

        await router.handle({ type: 'changes/abortOp', conflictState: ConflictState.Rebase });

        expect(runtimeWorktree.abortRebase).toHaveBeenCalled();
        expect(legacyRebaseAbort).not.toHaveBeenCalled();
    });

    it('uses runtime repository and worktree content reads for status diffs', async () => {
        const legacyExecRaw = vi.fn(async () => { throw new Error('legacy execRaw should not run'); });
        const repo = makeRepositoryMock({ execRaw: legacyExecRaw });
        const context = repoContext();
        const runtimeRegistry = new RepositoryRegistry();
        const runtimeRepository = repositoryModel({
            getFileAtRevision: vi.fn(async () => 'head content'),
        });
        const runtimeWorktree = worktreeModel({
            getFileFromIndex: vi.fn(async () => 'index content'),
        });
        runtimeRegistry.registerRepository(runtimeRepository);
        runtimeRegistry.registerWorktree(runtimeWorktree);
        const router = new ChangesMessageRouter(
            makeAccessor(repo, context),
            () => {},
            vi.fn(async () => {}),
            async () => {},
            undefined,
            runtimeRegistry,
        );

        await router.handle({
            type: 'changes/openDiff',
            filePath: 'src/app.ts',
            isStaged: true,
            indexStatus: 'M',
            workTreeStatus: ' ',
        });

        expect(runtimeRepository.getFileAtRevision).toHaveBeenCalledWith('src/app.ts', 'HEAD');
        expect(runtimeWorktree.getFileFromIndex).toHaveBeenCalledWith('src/app.ts');
        expect(getCommandCalls().some((call) => call.command === 'vscode.diff')).toBe(true);
        expect(legacyExecRaw).not.toHaveBeenCalled();
    });

    it('uses runtime repository content reads for stash diffs', async () => {
        const legacyExecRaw = vi.fn(async () => { throw new Error('legacy execRaw should not run'); });
        const repo = makeRepositoryMock({ execRaw: legacyExecRaw });
        const context = repoContext();
        const runtimeRegistry = new RepositoryRegistry();
        const runtimeRepository = repositoryModel({
            getFileAtRevision: vi.fn(async () => 'stash content'),
        });
        runtimeRegistry.registerRepository(runtimeRepository);
        const router = new ChangesMessageRouter(
            makeAccessor(repo, context),
            () => {},
            vi.fn(async () => {}),
            async () => {},
            undefined,
            runtimeRegistry,
        );

        await router.handle({
            type: 'changes/openStashDiff',
            filePath: 'src/app.ts',
            index: 3,
            status: 'M',
        });

        expect(runtimeRepository.getFileAtRevision).toHaveBeenCalledWith('src/app.ts', 'stash@{3}^');
        expect(runtimeRepository.getFileAtRevision).toHaveBeenCalledWith('src/app.ts', 'stash@{3}');
        expect(getCommandCalls().some((call) => call.command === 'vscode.diff')).toBe(true);
        expect(legacyExecRaw).not.toHaveBeenCalled();
    });

    it('uses runtime submodule worktree capabilities for submodule staging', async () => {
        const legacyExec = vi.fn(async () => { throw new Error('legacy exec should not run'); });
        const repo = makeRepositoryMock({ exec: legacyExec });
        const runtimeRegistry = new RepositoryRegistry();
        const runtimeWorktree = submoduleWorktreeModel('modules/lib', {
            stage: vi.fn(async () => {}),
        });
        runtimeRegistry.registerWorktree(runtimeWorktree);
        const router = new ChangesMessageRouter(
            makeRepositoryAccessor(repo),
            () => {},
            vi.fn(async () => {}),
            async () => {},
            undefined,
            runtimeRegistry,
        );
        router.setKnownSubmodulePaths(['modules/lib']);

        await router.handle({ type: 'changes/submoduleStageFiles', submodulePath: 'modules/lib', filePaths: ['src/a.ts', 'src/b.ts'] });

        expect(runtimeWorktree.stage).toHaveBeenCalledWith(['src/a.ts', 'src/b.ts']);
        expect(legacyExec).not.toHaveBeenCalled();
    });

    it('uses runtime submodule worktree capabilities for submodule conflict side resolution', async () => {
        const legacyExec = vi.fn(async () => { throw new Error('legacy exec should not run'); });
        const repo = makeRepositoryMock({ exec: legacyExec });
        const runtimeRegistry = new RepositoryRegistry();
        const runtimeWorktree = submoduleWorktreeModel('modules/lib', {
            acceptOurs: vi.fn(async () => {}),
        });
        runtimeRegistry.registerWorktree(runtimeWorktree);
        const router = new ChangesMessageRouter(
            makeRepositoryAccessor(repo),
            () => {},
            vi.fn(async () => {}),
            async () => {},
            undefined,
            runtimeRegistry,
        );
        router.setKnownSubmodulePaths(['modules/lib']);

        await router.handle({ type: 'changes/submoduleAcceptOurs', submodulePath: 'modules/lib', filePath: 'src/conflict.ts' });

        expect(runtimeWorktree.acceptOurs).toHaveBeenCalledWith(['src/conflict.ts']);
        expect(legacyExec).not.toHaveBeenCalled();
    });

    it('uses runtime submodule clean fallback when discarding an untracked file', async () => {
        setWarningChoice('Discard');
        const legacyExec = vi.fn(async () => { throw new Error('legacy exec should not run'); });
        const repo = makeRepositoryMock({ exec: legacyExec });
        const runtimeRegistry = new RepositoryRegistry();
        const runtimeWorktree = submoduleWorktreeModel('modules/lib', {
            discard: vi.fn(async () => { throw new Error('pathspec did not match any files'); }),
            cleanUntracked: vi.fn(async () => {}),
        });
        runtimeRegistry.registerWorktree(runtimeWorktree);
        const router = new ChangesMessageRouter(
            makeRepositoryAccessor(repo),
            () => {},
            vi.fn(async () => {}),
            async () => {},
            undefined,
            runtimeRegistry,
        );
        router.setKnownSubmodulePaths(['modules/lib']);

        await router.handle({ type: 'changes/submoduleDiscardFile', submodulePath: 'modules/lib', filePath: 'new-file.ts' });

        expect(runtimeWorktree.discard).toHaveBeenCalledWith(['new-file.ts']);
        expect(runtimeWorktree.cleanUntracked).toHaveBeenCalledWith(['new-file.ts'], { force: true });
        expect(legacyExec).not.toHaveBeenCalled();
    });

    it('uses runtime submodule worktree capabilities for selected file stash operations', async () => {
        const legacyExec = vi.fn(async () => { throw new Error('legacy exec should not run'); });
        const repo = makeRepositoryMock({ exec: legacyExec });
        const runtimeRegistry = new RepositoryRegistry();
        const runtimeWorktree = submoduleWorktreeModel('modules/lib', {
            stash: vi.fn(async () => {}),
        });
        runtimeRegistry.registerWorktree(runtimeWorktree);
        const router = new ChangesMessageRouter(
            makeRepositoryAccessor(repo),
            () => {},
            vi.fn(async () => {}),
            async () => {},
            undefined,
            runtimeRegistry,
        );
        router.setKnownSubmodulePaths(['modules/lib']);

        await router.handle({
            type: 'changes/submoduleStashSelectedFiles',
            submodulePath: 'modules/lib',
            filePaths: ['src/a.ts', 'src/new.ts'],
            includeUntracked: true,
            message: 'submodule selected files',
        });

        expect(runtimeWorktree.stash).toHaveBeenCalledWith('submodule selected files', {
            includeUntracked: true,
            paths: ['src/a.ts', 'src/new.ts'],
        });
        expect(legacyExec).not.toHaveBeenCalled();
    });

    it('uses runtime submodule repository and worktree content reads for submodule status diffs', async () => {
        const legacyExecRaw = vi.fn(async () => { throw new Error('legacy execRaw should not run'); });
        const repo = makeRepositoryMock({ execRaw: legacyExecRaw });
        const runtimeRegistry = new RepositoryRegistry();
        const runtimeRepository = submoduleRepositoryModel('modules/lib', {
            getFileAtRevision: vi.fn(async () => 'submodule head content'),
        });
        const runtimeWorktree = submoduleWorktreeModel('modules/lib', {
            getFileFromIndex: vi.fn(async () => 'submodule index content'),
        });
        runtimeRegistry.registerRepository(runtimeRepository);
        runtimeRegistry.registerWorktree(runtimeWorktree);
        const router = new ChangesMessageRouter(
            makeRepositoryAccessor(repo),
            () => {},
            vi.fn(async () => {}),
            async () => {},
            undefined,
            runtimeRegistry,
        );
        router.setKnownSubmodulePaths(['modules/lib']);

        await router.handle({
            type: 'changes/openSubmoduleDiff',
            submodulePath: 'modules/lib',
            filePath: 'src/app.ts',
            isStaged: true,
            indexStatus: 'M',
            workTreeStatus: ' ',
        });

        expect(runtimeRepository.getFileAtRevision).toHaveBeenCalledWith('src/app.ts', 'HEAD');
        expect(runtimeWorktree.getFileFromIndex).toHaveBeenCalledWith('src/app.ts');
        expect(getCommandCalls().some((call) => call.command === 'vscode.diff')).toBe(true);
        expect(legacyExecRaw).not.toHaveBeenCalled();
    });

    it('uses runtime submodule repository content reads for submodule stash diffs', async () => {
        const legacyExecRaw = vi.fn(async () => { throw new Error('legacy execRaw should not run'); });
        const repo = makeRepositoryMock({ execRaw: legacyExecRaw });
        const runtimeRegistry = new RepositoryRegistry();
        const runtimeRepository = submoduleRepositoryModel('modules/lib', {
            getFileAtRevision: vi.fn(async () => 'submodule stash content'),
        });
        runtimeRegistry.registerRepository(runtimeRepository);
        const router = new ChangesMessageRouter(
            makeRepositoryAccessor(repo),
            () => {},
            vi.fn(async () => {}),
            async () => {},
            undefined,
            runtimeRegistry,
        );
        router.setKnownSubmodulePaths(['modules/lib']);

        await router.handle({
            type: 'changes/openSubmoduleStashDiff',
            submodulePath: 'modules/lib',
            filePath: 'src/app.ts',
            index: 1,
            status: 'M',
        });

        expect(runtimeRepository.getFileAtRevision).toHaveBeenCalledWith('src/app.ts', 'stash@{1}^');
        expect(runtimeRepository.getFileAtRevision).toHaveBeenCalledWith('src/app.ts', 'stash@{1}');
        expect(getCommandCalls().some((call) => call.command === 'vscode.diff')).toBe(true);
        expect(legacyExecRaw).not.toHaveBeenCalled();
    });

    it('uses runtime submodule worktree capabilities when loading submodule status data', async () => {
        const legacyExec = vi.fn(async (args: readonly string[]) => {
            if (args.includes('rev-parse') && args.includes('--abbrev-ref')) { return 'feature/submodule'; }
            throw new Error(`unexpected legacy exec: ${args.join(' ')}`);
        });
        const legacyExecRaw = vi.fn(async () => { throw new Error('legacy execRaw should not run'); });
        const repo = makeRepositoryMock({ exec: legacyExec, execRaw: legacyExecRaw });
        const runtimeRegistry = new RepositoryRegistry();
        const runtimeWorktree = submoduleWorktreeModel('modules/lib', {
            branch: 'feature/submodule',
            getStatus: vi.fn(async () => ({
                staged: [{ indexStatus: 'M', workTreeStatus: ' ', filePath: 'src/staged.ts' }],
                unstaged: [{ indexStatus: ' ', workTreeStatus: 'M', filePath: 'src/unstaged.ts' }],
                conflicts: [{ indexStatus: 'U', workTreeStatus: 'U', filePath: 'src/conflict.ts' }],
                conflictState: 'merge',
            })),
            listStashes: vi.fn(async () => ({
                items: [{ index: 0, message: 'runtime stash' }],
                hasMore: false,
            })),
        });
        runtimeRegistry.registerWorktree(runtimeWorktree);
        const messages: ChangesExtensionToWebviewMessage[] = [];
        const router = new ChangesMessageRouter(
            makeRepositoryAccessor(repo),
            (message) => { messages.push(message); },
            vi.fn(async () => {}),
            async () => {},
            undefined,
            runtimeRegistry,
        );
        router.setKnownSubmodulePaths(['modules/lib']);

        await router.handle({ type: 'changes/getSubmoduleStatus', requestId: 'sub-runtime', path: 'modules/lib' });

        expect(runtimeWorktree.getStatus).toHaveBeenCalled();
        expect(runtimeWorktree.listStashes).toHaveBeenCalledWith({ limit: Number.MAX_SAFE_INTEGER });
        expect(legacyExecRaw).not.toHaveBeenCalled();
        expect(messages).toContainEqual({
            type: 'changes/submoduleStatusData',
            requestId: 'sub-runtime',
            path: 'modules/lib',
            data: {
                currentBranch: 'feature/submodule',
                staged: [{ indexStatus: 'M', workTreeStatus: ' ', filePath: 'src/staged.ts', origPath: undefined, isSubmodule: undefined }],
                unstaged: [{ indexStatus: ' ', workTreeStatus: 'M', filePath: 'src/unstaged.ts', origPath: undefined, isSubmodule: undefined }],
                conflicts: [{ indexStatus: 'U', workTreeStatus: 'U', filePath: 'src/conflict.ts', origPath: undefined, isSubmodule: undefined }],
                conflictState: ConflictState.Merge,
                stashes: [{ index: 0, message: 'runtime stash' }],
            },
        });
    });

    it('uses runtime submodule status for discard all path discovery', async () => {
        setInputBoxValue('DISCARD ALL');
        const legacyExecRaw = vi.fn(async () => { throw new Error('legacy execRaw should not run'); });
        const repo = makeRepositoryMock({ execRaw: legacyExecRaw });
        const runtimeRegistry = new RepositoryRegistry();
        const runtimeWorktree = submoduleWorktreeModel('modules/lib', {
            getStatus: vi.fn(async () => ({
                staged: [{ indexStatus: 'M', workTreeStatus: ' ', filePath: 'src/staged.ts' }],
                unstaged: [{ indexStatus: ' ', workTreeStatus: 'M', filePath: 'src/unstaged.ts' }],
                conflicts: [],
                conflictState: 'none',
            })),
            unstage: vi.fn(async () => {}),
            discard: vi.fn(async () => {}),
        });
        runtimeRegistry.registerWorktree(runtimeWorktree);
        const router = new ChangesMessageRouter(
            makeRepositoryAccessor(repo),
            () => {},
            vi.fn(async () => {}),
            async () => {},
            undefined,
            runtimeRegistry,
        );
        router.setKnownSubmodulePaths(['modules/lib']);

        await router.handle({ type: 'changes/submoduleDiscardAll', submodulePath: 'modules/lib' });

        expect(runtimeWorktree.getStatus).toHaveBeenCalled();
        expect(runtimeWorktree.unstage).toHaveBeenCalledWith(['src/staged.ts']);
        expect(runtimeWorktree.discard).toHaveBeenCalledWith(['src/unstaged.ts']);
        expect(legacyExecRaw).not.toHaveBeenCalled();
    });

    it('uses runtime submodule status for accept all theirs path discovery', async () => {
        setWarningChoice('Accept All Theirs');
        const legacyExecRaw = vi.fn(async () => { throw new Error('legacy execRaw should not run'); });
        const repo = makeRepositoryMock({ execRaw: legacyExecRaw });
        const runtimeRegistry = new RepositoryRegistry();
        const runtimeWorktree = submoduleWorktreeModel('modules/lib', {
            getStatus: vi.fn(async () => ({
                staged: [],
                unstaged: [],
                conflicts: [
                    { indexStatus: 'U', workTreeStatus: 'U', filePath: 'src/a.ts' },
                    { indexStatus: 'U', workTreeStatus: 'U', filePath: 'src/b.ts' },
                ],
                conflictState: 'merge',
            })),
            acceptTheirs: vi.fn(async () => {}),
        });
        runtimeRegistry.registerWorktree(runtimeWorktree);
        const router = new ChangesMessageRouter(
            makeRepositoryAccessor(repo),
            () => {},
            vi.fn(async () => {}),
            async () => {},
            undefined,
            runtimeRegistry,
        );
        router.setKnownSubmodulePaths(['modules/lib']);

        await router.handle({ type: 'changes/submoduleAcceptAllTheirs', submodulePath: 'modules/lib' });

        expect(runtimeWorktree.getStatus).toHaveBeenCalled();
        expect(runtimeWorktree.acceptTheirs).toHaveBeenCalledWith(['src/a.ts', 'src/b.ts']);
        expect(legacyExecRaw).not.toHaveBeenCalled();
    });

    it('uses runtime submodule worktree capabilities for submodule commits', async () => {
        const legacyExec = vi.fn(async () => { throw new Error('legacy exec should not run'); });
        const repo = makeRepositoryMock({ exec: legacyExec });
        const runtimeRegistry = new RepositoryRegistry();
        const runtimeWorktree = submoduleWorktreeModel('modules/lib', {
            commit: vi.fn(async () => {}),
        });
        runtimeRegistry.registerWorktree(runtimeWorktree);
        const messages: ChangesExtensionToWebviewMessage[] = [];
        const router = new ChangesMessageRouter(
            makeRepositoryAccessor(repo),
            (message) => { messages.push(message); },
            vi.fn(async () => {}),
            async () => {},
            undefined,
            runtimeRegistry,
        );
        router.setKnownSubmodulePaths(['modules/lib']);

        await router.handle({ type: 'changes/submoduleCommit', submodulePath: 'modules/lib', message: 'feat: submodule runtime', mode: CommitMode.Commit });

        expect(runtimeWorktree.commit).toHaveBeenCalledWith('feat: submodule runtime', {});
        expect(legacyExec).not.toHaveBeenCalled();
        expect(messages).toContainEqual({ type: 'changes/submoduleCommitResult', path: 'modules/lib', success: true });
    });

    it('uses runtime submodule worktree capabilities for submodule stash pop', async () => {
        const legacyExec = vi.fn(async () => { throw new Error('legacy exec should not run'); });
        const repo = makeRepositoryMock({ exec: legacyExec });
        const runtimeRegistry = new RepositoryRegistry();
        const runtimeWorktree = submoduleWorktreeModel('modules/lib', {
            popStash: vi.fn(async () => {}),
        });
        runtimeRegistry.registerWorktree(runtimeWorktree);
        const router = new ChangesMessageRouter(
            makeRepositoryAccessor(repo),
            () => {},
            vi.fn(async () => {}),
            async () => {},
            undefined,
            runtimeRegistry,
        );
        router.setKnownSubmodulePaths(['modules/lib']);

        await router.handle({ type: 'changes/submoduleStashPop', submodulePath: 'modules/lib', index: 4 });

        expect(runtimeWorktree.popStash).toHaveBeenCalledWith('stash@{4}', {});
        expect(legacyExec).not.toHaveBeenCalled();
    });

    it('uses runtime worktree capabilities for toolbar worktree mutations', async () => {
        setQuickPickValue('feature/ui');
        const legacyCheckout = vi.fn(async () => { throw new Error('legacy checkout should not run'); });
        const repo = makeRepositoryMock({
            checkout: legacyCheckout,
            getAllBranches: vi.fn(async () => [{ name: 'feature/ui', isRemote: false }]),
        });
        const context = repoContext();
        const runtimeRegistry = new RepositoryRegistry();
        const runtimeWorktree = worktreeModel({
            checkout: vi.fn(async () => {}),
        });
        const runtimeRepository = repositoryModel({
            listBranches: vi.fn(async () => [{ name: 'feature/ui', isCurrent: false, hash: 'abc123', ahead: 0, behind: 0, isRemote: false }]),
        });
        runtimeRegistry.registerRepository(runtimeRepository);
        runtimeRegistry.registerWorktree(runtimeWorktree);
        const refresh = vi.fn(async () => {});
        const router = new ChangesMessageRouter(
            makeAccessor(repo, context),
            () => {},
            refresh,
            async () => {},
            undefined,
            runtimeRegistry,
        );

        await router.handle({ type: 'changes/toolbarCommand', command: 'checkout' });

        expect(runtimeWorktree.checkout).toHaveBeenCalledWith('feature/ui', {});
        expect(legacyCheckout).not.toHaveBeenCalled();
        expect(refresh).toHaveBeenCalled();
    });

    it('uses runtime repository branch listing for toolbar checkout', async () => {
        setQuickPickValue('feature/runtime');
        const legacyGetAllBranches = vi.fn(async () => { throw new Error('legacy getAllBranches should not run'); });
        const repo = makeRepositoryMock({ getAllBranches: legacyGetAllBranches });
        const context = repoContext();
        const runtimeRegistry = new RepositoryRegistry();
        const runtimeRepository = repositoryModel({
            listBranches: vi.fn(async () => [{ name: 'feature/runtime', isCurrent: false, hash: 'abc123', ahead: 0, behind: 0, isRemote: false }]),
        });
        const runtimeWorktree = worktreeModel({
            checkout: vi.fn(async () => {}),
        });
        runtimeRegistry.registerRepository(runtimeRepository);
        runtimeRegistry.registerWorktree(runtimeWorktree);
        const router = new ChangesMessageRouter(
            makeAccessor(repo, context),
            () => {},
            vi.fn(async () => {}),
            async () => {},
            undefined,
            runtimeRegistry,
        );

        await router.handle({ type: 'changes/toolbarCommand', command: 'checkout' });

        expect(runtimeRepository.listBranches).toHaveBeenCalled();
        expect(runtimeWorktree.checkout).toHaveBeenCalledWith('feature/runtime', {});
        expect(legacyGetAllBranches).not.toHaveBeenCalled();
    });

    it('uses runtime repository branch and tag listing for create branch from ref', async () => {
        setInputBoxValue('feature/new');
        setQuickPickValue('v1.0.0');
        const legacyGetAllBranches = vi.fn(async () => { throw new Error('legacy getAllBranches should not run'); });
        const legacyGetAllTags = vi.fn(async () => { throw new Error('legacy getAllTags should not run'); });
        const repo = makeRepositoryMock({
            getAllBranches: legacyGetAllBranches,
            getAllTags: legacyGetAllTags,
        });
        const context = repoContext();
        const runtimeRegistry = new RepositoryRegistry();
        const runtimeRepository = repositoryModel({
            listBranches: vi.fn(async () => [{ name: 'main', isCurrent: true, hash: 'abc123', ahead: 0, behind: 0, isRemote: false }]),
            listTags: vi.fn(async () => [{ name: 'v1.0.0', hash: 'def456' }]),
        });
        const runtimeWorktree = worktreeModel({
            checkoutNewBranch: vi.fn(async () => {}),
        });
        runtimeRegistry.registerRepository(runtimeRepository);
        runtimeRegistry.registerWorktree(runtimeWorktree);
        const router = new ChangesMessageRouter(
            makeAccessor(repo, context),
            () => {},
            vi.fn(async () => {}),
            async () => {},
            undefined,
            runtimeRegistry,
        );

        await router.handle({ type: 'changes/toolbarCommand', command: 'createBranchFrom' });

        expect(runtimeRepository.listBranches).toHaveBeenCalled();
        expect(runtimeRepository.listTags).toHaveBeenCalled();
        expect(runtimeWorktree.checkoutNewBranch).toHaveBeenCalledWith('feature/new', 'v1.0.0');
        expect(legacyGetAllBranches).not.toHaveBeenCalled();
        expect(legacyGetAllTags).not.toHaveBeenCalled();
    });

    it('uses runtime repository branch metadata when renaming the current branch', async () => {
        setQuickPickValue('feature/current');
        setInputBoxValue('feature/renamed');
        const legacyGetCurrentBranch = vi.fn(async () => { throw new Error('legacy getCurrentBranch should not run'); });
        const legacyGetAllBranches = vi.fn(async () => { throw new Error('legacy getAllBranches should not run'); });
        const repo = makeRepositoryMock({
            getCurrentBranch: legacyGetCurrentBranch,
            getAllBranches: legacyGetAllBranches,
        });
        const context = repoContext();
        const runtimeRegistry = new RepositoryRegistry();
        const runtimeRepository = repositoryModel({
            listBranches: vi.fn(async () => [
                { name: 'feature/current', isCurrent: true, hash: 'abc123', ahead: 0, behind: 0, isRemote: false },
                { name: 'feature/other', isCurrent: false, hash: 'def456', ahead: 0, behind: 0, isRemote: false },
            ]),
            renameBranch: vi.fn(async () => {}),
        });
        runtimeRegistry.registerRepository(runtimeRepository);
        runtimeRegistry.registerWorktree(worktreeModel({}));
        const router = new ChangesMessageRouter(
            makeAccessor(repo, context),
            () => {},
            vi.fn(async () => {}),
            async () => {},
            undefined,
            runtimeRegistry,
        );

        await router.handle({ type: 'changes/toolbarCommand', command: 'renameBranch' });

        expect(runtimeRepository.renameBranch).toHaveBeenCalledWith('feature/current', 'feature/renamed');
        expect(runtimeRepository.listBranches).toHaveBeenCalled();
        expect(legacyGetCurrentBranch).not.toHaveBeenCalled();
        expect(legacyGetAllBranches).not.toHaveBeenCalled();
    });

    it('uses runtime repository capabilities for remote management toolbar commands', async () => {
        setInputBoxValues(['upstream', 'git@example.test:org/repo.git']);
        const legacyExec = vi.fn(async () => { throw new Error('legacy exec should not run'); });
        const repo = makeRepositoryMock({
            exec: legacyExec,
            getRemotes: vi.fn(async () => ['upstream']),
        });
        const context = repoContext();
        const runtimeRegistry = new RepositoryRegistry();
        const runtimeRepository = repositoryModel({
            addRemote: vi.fn(async () => {}),
            removeRemote: vi.fn(async () => {}),
            listRemotes: vi.fn(async () => ['upstream']),
        });
        runtimeRegistry.registerRepository(runtimeRepository);
        runtimeRegistry.registerWorktree(worktreeModel({}));
        const router = new ChangesMessageRouter(
            makeAccessor(repo, context),
            () => {},
            vi.fn(async () => {}),
            async () => {},
            undefined,
            runtimeRegistry,
        );

        await router.handle({ type: 'changes/toolbarCommand', command: 'addRemote' });
        setQuickPickValue('upstream');
        setWarningChoice('Remove');
        await router.handle({ type: 'changes/toolbarCommand', command: 'removeRemote' });

        expect(runtimeRepository.addRemote).toHaveBeenCalledWith('upstream', 'git@example.test:org/repo.git');
        expect(runtimeRepository.removeRemote).toHaveBeenCalledWith('upstream');
        expect(runtimeRepository.listRemotes).toHaveBeenCalled();
        expect(legacyExec).not.toHaveBeenCalled();
    });

    it('uses runtime worktree capabilities for toolbar stash options', async () => {
        const legacyExec = vi.fn(async () => { throw new Error('legacy exec should not run'); });
        const repo = makeRepositoryMock({ exec: legacyExec });
        const context = repoContext();
        const runtimeRegistry = new RepositoryRegistry();
        const runtimeWorktree = worktreeModel({
            stash: vi.fn(async () => {}),
        });
        runtimeRegistry.registerWorktree(runtimeWorktree);
        const router = new ChangesMessageRouter(
            makeAccessor(repo, context),
            () => {},
            vi.fn(async () => {}),
            async () => {},
            undefined,
            runtimeRegistry,
        );

        await router.handle({ type: 'changes/toolbarCommand', command: 'stashIncludeUntracked' });

        expect(runtimeWorktree.stash).toHaveBeenCalledWith(undefined, { includeUntracked: true });
        expect(legacyExec).not.toHaveBeenCalled();
    });

    it('uses runtime worktree capabilities for dropping all stashes', async () => {
        setInputBoxValue('DROP ALL STASHES');
        const legacyStashList = vi.fn(async () => { throw new Error('legacy stashList should not run'); });
        const repo = makeRepositoryMock({ stashList: legacyStashList });
        const context = repoContext();
        const runtimeRegistry = new RepositoryRegistry();
        const runtimeWorktree = worktreeModel({
            clearStashes: vi.fn(async () => {}),
        });
        runtimeRegistry.registerWorktree(runtimeWorktree);
        const router = new ChangesMessageRouter(
            makeAccessor(repo, context),
            () => {},
            vi.fn(async () => {}),
            async () => {},
            undefined,
            runtimeRegistry,
        );

        await router.handle({ type: 'changes/toolbarCommand', command: 'dropAllStashes' });

        expect(runtimeWorktree.clearStashes).toHaveBeenCalled();
        expect(legacyStashList).not.toHaveBeenCalled();
    });

    it('uses runtime worktree stash list for picked stash toolbar commands', async () => {
        setQuickPickValue('stash@{3} runtime stash');
        const legacyStashList = vi.fn(async () => { throw new Error('legacy stashList should not run'); });
        const repo = makeRepositoryMock({ stashList: legacyStashList });
        const context = repoContext();
        const runtimeRegistry = new RepositoryRegistry();
        const runtimeWorktree = worktreeModel({
            listStashes: vi.fn(async () => ({
                items: [{ index: 3, message: 'runtime stash' }],
                hasMore: false,
            })),
            applyStash: vi.fn(async () => {}),
        });
        runtimeRegistry.registerWorktree(runtimeWorktree);
        const router = new ChangesMessageRouter(
            makeAccessor(repo, context),
            () => {},
            vi.fn(async () => {}),
            async () => {},
            undefined,
            runtimeRegistry,
        );

        await router.handle({ type: 'changes/toolbarCommand', command: 'applyStash' });

        expect(runtimeWorktree.listStashes).toHaveBeenCalledWith({ limit: Number.MAX_SAFE_INTEGER });
        expect(runtimeWorktree.applyStash).toHaveBeenCalledWith('stash@{3}', {});
        expect(legacyStashList).not.toHaveBeenCalled();
    });

    it('uses runtime worktree stash list and summary for viewing stashes', async () => {
        setQuickPickValue('stash@{2} runtime stash');
        const legacyStashList = vi.fn(async () => { throw new Error('legacy stashList should not run'); });
        const legacyExec = vi.fn(async () => { throw new Error('legacy exec should not run'); });
        const repo = makeRepositoryMock({ stashList: legacyStashList, exec: legacyExec });
        const context = repoContext();
        const runtimeRegistry = new RepositoryRegistry();
        const runtimeWorktree = worktreeModel({
            listStashes: vi.fn(async () => ({
                items: [{ index: 2, message: 'runtime stash' }],
                hasMore: false,
            })),
            getStashSummary: vi.fn(async () => 'src/app.ts | 2 +-\n'),
        });
        runtimeRegistry.registerWorktree(runtimeWorktree);
        const router = new ChangesMessageRouter(
            makeAccessor(repo, context),
            () => {},
            vi.fn(async () => {}),
            async () => {},
            undefined,
            runtimeRegistry,
        );

        await router.handle({ type: 'changes/toolbarCommand', command: 'viewStash' });

        expect(runtimeWorktree.listStashes).toHaveBeenCalledWith({ limit: Number.MAX_SAFE_INTEGER });
        expect(runtimeWorktree.getStashSummary).toHaveBeenCalledWith('stash@{2}');
        expect(mockWorkspace.documents.at(-1)?.content).toBe('src/app.ts | 2 +-\n');
        expect(legacyStashList).not.toHaveBeenCalled();
        expect(legacyExec).not.toHaveBeenCalled();
    });

    it('uses runtime repository capabilities for toolbar tag creation', async () => {
        setInputBoxValue('v1.2.3');
        const legacyExec = vi.fn(async () => { throw new Error('legacy exec should not run'); });
        const repo = makeRepositoryMock({ exec: legacyExec });
        const context = repoContext();
        const runtimeRegistry = new RepositoryRegistry();
        const runtimeRepository = repositoryModel({
            createTag: vi.fn(async () => {}),
        });
        runtimeRegistry.registerRepository(runtimeRepository);
        const router = new ChangesMessageRouter(
            makeAccessor(repo, context),
            () => {},
            vi.fn(async () => {}),
            async () => {},
            undefined,
            runtimeRegistry,
        );

        await router.handle({ type: 'changes/toolbarCommand', command: 'createTag' });

        expect(runtimeRepository.createTag).toHaveBeenCalledWith('v1.2.3', 'HEAD', undefined);
        expect(legacyExec).not.toHaveBeenCalled();
    });

    it('uses runtime repository tag listing for toolbar tag deletion', async () => {
        setQuickPickValue('v1.2.3');
        setWarningChoice('Delete');
        const legacyGetAllTags = vi.fn(async () => { throw new Error('legacy getAllTags should not run'); });
        const repo = makeRepositoryMock({ getAllTags: legacyGetAllTags });
        const context = repoContext();
        const runtimeRegistry = new RepositoryRegistry();
        const runtimeRepository = repositoryModel({
            listTags: vi.fn(async () => [{ name: 'v1.2.3', hash: 'abc123' }]),
            deleteTag: vi.fn(async () => {}),
        });
        runtimeRegistry.registerRepository(runtimeRepository);
        const router = new ChangesMessageRouter(
            makeAccessor(repo, context),
            () => {},
            vi.fn(async () => {}),
            async () => {},
            undefined,
            runtimeRegistry,
        );

        await router.handle({ type: 'changes/toolbarCommand', command: 'deleteTag' });

        expect(runtimeRepository.listTags).toHaveBeenCalled();
        expect(runtimeRepository.deleteTag).toHaveBeenCalledWith('v1.2.3');
        expect(legacyGetAllTags).not.toHaveBeenCalled();
    });

    it('requires a scoped runtime worktree for scoped submodule toolbar commands', async () => {
        const exec = vi.fn(async () => '');
        const repo = makeRepositoryMock({ exec });
        const context = repoContext();
        const runtimeRegistry = new RepositoryRegistry();
        const runtimeWorktree = worktreeModel({
            stash: vi.fn(async () => {}),
        });
        runtimeRegistry.registerWorktree(runtimeWorktree);
        const messages: ChangesExtensionToWebviewMessage[] = [];
        const router = new ChangesMessageRouter(
            makeAccessor(repo, context),
            (message) => { messages.push(message); },
            vi.fn(async () => {}),
            async () => {},
            undefined,
            runtimeRegistry,
        );
        router.setKnownSubmodulePaths(['modules/lib']);

        await router.handle({ type: 'changes/submoduleToolbarCommand', submodulePath: 'modules/lib', command: 'stash' });

        expect(runtimeWorktree.stash).not.toHaveBeenCalled();
        expect(exec).not.toHaveBeenCalled();
        expect(messages).toContainEqual(expect.objectContaining({
            type: 'changes/error',
            message: 'Runtime Worktree is required for this git operation.',
        }));
    });

    it('uses runtime submodule worktree capabilities for submodule toolbar commands', async () => {
        const exec = vi.fn(async () => { throw new Error('legacy exec should not run'); });
        const repo = makeRepositoryMock({ exec });
        const runtimeRegistry = new RepositoryRegistry();
        const runtimeWorktree = submoduleWorktreeModel('modules/lib', {
            stash: vi.fn(async () => {}),
        });
        runtimeRegistry.registerWorktree(runtimeWorktree);
        const router = new ChangesMessageRouter(
            makeRepositoryAccessor(repo),
            () => {},
            vi.fn(async () => {}),
            async () => {},
            undefined,
            runtimeRegistry,
        );
        router.setKnownSubmodulePaths(['modules/lib']);

        await router.handle({ type: 'changes/submoduleToolbarCommand', submodulePath: 'modules/lib', command: 'stash' });

        expect(runtimeWorktree.stash).toHaveBeenCalledWith(undefined, {});
        expect(exec).not.toHaveBeenCalled();
    });

    it('uses runtime submodule worktree capabilities for dropping all submodule stashes', async () => {
        setInputBoxValue('DROP ALL STASHES');
        const legacyStashList = vi.fn(async () => { throw new Error('legacy stashList should not run'); });
        const repo = makeRepositoryMock({ stashList: legacyStashList });
        const runtimeRegistry = new RepositoryRegistry();
        const runtimeWorktree = submoduleWorktreeModel('modules/lib', {
            clearStashes: vi.fn(async () => {}),
        });
        runtimeRegistry.registerWorktree(runtimeWorktree);
        const router = new ChangesMessageRouter(
            makeRepositoryAccessor(repo),
            () => {},
            vi.fn(async () => {}),
            async () => {},
            undefined,
            runtimeRegistry,
        );
        router.setKnownSubmodulePaths(['modules/lib']);

        await router.handle({ type: 'changes/submoduleToolbarCommand', submodulePath: 'modules/lib', command: 'dropAllStashes' });

        expect(runtimeWorktree.clearStashes).toHaveBeenCalled();
        expect(legacyStashList).not.toHaveBeenCalled();
    });

    it('uses runtime submodule worktree stash list for picked submodule stash toolbar commands', async () => {
        setQuickPickValue('stash@{5} runtime submodule stash');
        const legacyStashList = vi.fn(async () => { throw new Error('legacy stashList should not run'); });
        const repo = makeRepositoryMock({ stashList: legacyStashList });
        const runtimeRegistry = new RepositoryRegistry();
        const runtimeWorktree = submoduleWorktreeModel('modules/lib', {
            listStashes: vi.fn(async () => ({
                items: [{ index: 5, message: 'runtime submodule stash' }],
                hasMore: false,
            })),
            popStash: vi.fn(async () => {}),
        });
        runtimeRegistry.registerWorktree(runtimeWorktree);
        const router = new ChangesMessageRouter(
            makeRepositoryAccessor(repo),
            () => {},
            vi.fn(async () => {}),
            async () => {},
            undefined,
            runtimeRegistry,
        );
        router.setKnownSubmodulePaths(['modules/lib']);

        await router.handle({ type: 'changes/submoduleToolbarCommand', submodulePath: 'modules/lib', command: 'popStash' });

        expect(runtimeWorktree.listStashes).toHaveBeenCalledWith({ limit: Number.MAX_SAFE_INTEGER });
        expect(runtimeWorktree.popStash).toHaveBeenCalledWith('stash@{5}', {});
        expect(legacyStashList).not.toHaveBeenCalled();
    });

    it('uses runtime submodule worktree capabilities for submodule stash file listing', async () => {
        const legacyExecRaw = vi.fn(async () => { throw new Error('legacy execRaw should not run'); });
        const repo = makeRepositoryMock({ execRaw: legacyExecRaw });
        const runtimeRegistry = new RepositoryRegistry();
        const runtimeWorktree = submoduleWorktreeModel('modules/lib', {
            getStashFiles: vi.fn(async () => [{ status: 'R', filePath: 'src/new.ts', origPath: 'src/old.ts' }]),
        });
        runtimeRegistry.registerWorktree(runtimeWorktree);
        const messages: ChangesExtensionToWebviewMessage[] = [];
        const router = new ChangesMessageRouter(
            makeRepositoryAccessor(repo),
            (message) => { messages.push(message); },
            vi.fn(async () => {}),
            async () => {},
            undefined,
            runtimeRegistry,
        );
        router.setKnownSubmodulePaths(['modules/lib']);

        await router.handle({ type: 'changes/getSubmoduleStashFiles', requestId: 'sub-stash-files', submodulePath: 'modules/lib', index: 4 });

        expect(runtimeWorktree.getStashFiles).toHaveBeenCalledWith('stash@{4}');
        expect(legacyExecRaw).not.toHaveBeenCalled();
        expect(messages).toContainEqual({
            type: 'changes/submoduleStashFiles',
            requestId: 'sub-stash-files',
            path: 'modules/lib',
            index: 4,
            files: [{ status: 'R', filePath: 'src/new.ts', origPath: 'src/old.ts' }],
        });
    });

    it('uses runtime submodule repository capabilities for submodule toolbar commands', async () => {
        setInputBoxValue('v1.2.3');
        const exec = vi.fn(async () => { throw new Error('legacy exec should not run'); });
        const repo = makeRepositoryMock({ exec });
        const runtimeRegistry = new RepositoryRegistry();
        const runtimeRepository = submoduleRepositoryModel('modules/lib', {
            createTag: vi.fn(async () => {}),
        });
        runtimeRegistry.registerRepository(runtimeRepository);
        const router = new ChangesMessageRouter(
            makeRepositoryAccessor(repo),
            () => {},
            vi.fn(async () => {}),
            async () => {},
            undefined,
            runtimeRegistry,
        );
        router.setKnownSubmodulePaths(['modules/lib']);

        await router.handle({ type: 'changes/submoduleToolbarCommand', submodulePath: 'modules/lib', command: 'createTag' });

        expect(runtimeRepository.createTag).toHaveBeenCalledWith('v1.2.3', 'HEAD', undefined);
        expect(exec).not.toHaveBeenCalled();
    });

    it('uses runtime submodule repository tag listing for submodule toolbar tag deletion', async () => {
        setQuickPickValue('v1.2.3');
        setWarningChoice('Delete');
        const legacyGetAllTags = vi.fn(async () => { throw new Error('legacy getAllTags should not run'); });
        const repo = makeRepositoryMock({ getAllTags: legacyGetAllTags });
        const runtimeRegistry = new RepositoryRegistry();
        const runtimeRepository = submoduleRepositoryModel('modules/lib', {
            listTags: vi.fn(async () => [{ name: 'v1.2.3', hash: 'abc123' }]),
            deleteTag: vi.fn(async () => {}),
        });
        runtimeRegistry.registerRepository(runtimeRepository);
        const router = new ChangesMessageRouter(
            makeRepositoryAccessor(repo),
            () => {},
            vi.fn(async () => {}),
            async () => {},
            undefined,
            runtimeRegistry,
        );
        router.setKnownSubmodulePaths(['modules/lib']);

        await router.handle({ type: 'changes/submoduleToolbarCommand', submodulePath: 'modules/lib', command: 'deleteTag' });

        expect(runtimeRepository.listTags).toHaveBeenCalled();
        expect(runtimeRepository.deleteTag).toHaveBeenCalledWith('v1.2.3');
        expect(legacyGetAllTags).not.toHaveBeenCalled();
    });

    it('uses runtime submodule repository branch listing for submodule branch deletion', async () => {
        setQuickPickValue('feature/submodule');
        setWarningChoice('Delete');
        const legacyGetAllBranches = vi.fn(async () => { throw new Error('legacy getAllBranches should not run'); });
        const repo = makeRepositoryMock({ getAllBranches: legacyGetAllBranches });
        const runtimeRegistry = new RepositoryRegistry();
        const runtimeRepository = submoduleRepositoryModel('modules/lib', {
            listBranches: vi.fn(async () => [{ name: 'feature/submodule', isCurrent: false, hash: 'abc123', ahead: 0, behind: 0, isRemote: false }]),
            deleteBranch: vi.fn(async () => {}),
        });
        runtimeRegistry.registerRepository(runtimeRepository);
        const router = new ChangesMessageRouter(
            makeRepositoryAccessor(repo),
            () => {},
            vi.fn(async () => {}),
            async () => {},
            undefined,
            runtimeRegistry,
        );
        router.setKnownSubmodulePaths(['modules/lib']);

        await router.handle({ type: 'changes/submoduleToolbarCommand', submodulePath: 'modules/lib', command: 'deleteBranch' });

        expect(runtimeRepository.listBranches).toHaveBeenCalled();
        expect(runtimeRepository.deleteBranch).toHaveBeenCalledWith('feature/submodule', false);
        expect(legacyGetAllBranches).not.toHaveBeenCalled();
    });

    it('reports a clear stash pop error when local changes would be overwritten', async () => {
        const gitError = Object.assign(new Error('git stash pop failed'), {
            stderr: [
                'error: Your local changes to the following files would be overwritten by merge:',
                '\tsrc/app.ts',
                'Please commit your changes or stash them before you merge.',
            ].join('\n'),
        });
        const repo = makeRepositoryMock();
        const context = repoContext();
        const runtimeRegistry = new RepositoryRegistry();
        const runtimeWorktree = worktreeModel({
            popStash: vi.fn(async () => { throw gitError; }),
        });
        runtimeRegistry.registerWorktree(runtimeWorktree);
        const messages: ChangesExtensionToWebviewMessage[] = [];
        const refresh = vi.fn(async () => {});
        const router = new ChangesMessageRouter(
            makeAccessor(repo, context),
            (message) => { messages.push(message); },
            refresh,
            async () => {},
            undefined,
            runtimeRegistry,
        );

        await router.handle({ type: 'changes/toolbarCommand', command: 'popLatestStash' });

        const error = messages.find((message) => message.type === 'changes/error');
        expect(error?.message).toBe('Stash pop could not be applied because local changes would be overwritten. Commit, stash, or discard your local changes, then try again.');
        expect(error?.error.details).toContain('src/app.ts');
        expect(refresh).toHaveBeenCalled();
    });
});

function repoContext(): RepoContext {
    return {
        id: 'repo',
        cwd: '/workspace',
        kind: RepoKind.Main,
        label: 'workspace',
    };
}

function makeAccessor(repo: ReturnType<typeof makeRepositoryMock>, context: RepoContext): ActiveRepositoryAccessor {
    return {
        currentRepository: repo,
        currentContext: context,
        requireRepository() {
            return repo;
        },
    };
}

const runtime = {
    supports: () => false,
    execute: async () => undefined,
} satisfies GitRuntime;

function repositoryModel(overrides: Partial<RuntimeRepository>): RuntimeRepository {
    return {
        repoId: 'repo',
        gitDir: '/workspace/.git',
        kind: 'main',
        label: 'workspace',
        runtime,
        getFileAtRevision: vi.fn(async () => ''),
        renameBranch: vi.fn(async () => {}),
        deleteBranch: vi.fn(async () => {}),
        listBranches: vi.fn(async () => []),
        listRemotes: vi.fn(async () => []),
        listTags: vi.fn(async () => []),
        addRemote: vi.fn(async () => {}),
        removeRemote: vi.fn(async () => {}),
        createTag: vi.fn(async () => {}),
        deleteTag: vi.fn(async () => {}),
        ...overrides,
    } as RuntimeRepository;
}

function worktreeModel(overrides: Partial<Worktree>): Worktree {
    return {
        repoId: 'repo',
        worktreeId: 'repo',
        path: '/workspace',
        isMain: true,
        head: 'abc123',
        dirty: false,
        runtime,
        stage: vi.fn(async () => {}),
        unstage: vi.fn(async () => {}),
        stageAll: vi.fn(async () => {}),
        unstageAll: vi.fn(async () => {}),
        discard: vi.fn(async () => {}),
        markResolved: vi.fn(async () => {}),
        acceptOurs: vi.fn(async () => {}),
        acceptTheirs: vi.fn(async () => {}),
        getStatus: vi.fn(async () => ({ staged: [], unstaged: [], conflicts: [], conflictState: 'none' })),
        listStashes: vi.fn(async () => ({ items: [], hasMore: false })),
        getStashFiles: vi.fn(async () => []),
        getStashSummary: vi.fn(async () => ''),
        commit: vi.fn(async () => {}),
        amendCommit: vi.fn(async () => {}),
        getFileFromIndex: vi.fn(async () => ''),
        stash: vi.fn(async () => {}),
        applyStash: vi.fn(async () => {}),
        popStash: vi.fn(async () => {}),
        dropStash: vi.fn(async () => {}),
        clearStashes: vi.fn(async () => {}),
        checkout: vi.fn(async () => {}),
        checkoutNewBranch: vi.fn(async () => {}),
        merge: vi.fn(async () => {}),
        rebase: vi.fn(async () => {}),
        abortRebase: vi.fn(async () => {}),
        undoLastCommit: vi.fn(async () => {}),
        continueMerge: vi.fn(async () => {}),
        continueRebase: vi.fn(async () => {}),
        abortMerge: vi.fn(async () => {}),
        cleanUntracked: vi.fn(async () => {}),
        ...overrides,
    } as Worktree;
}

function submoduleWorktreeModel(submodulePath: string, overrides: Partial<Worktree>): Worktree {
    const submoduleId = stableRepoContextId(`/workspace/${submodulePath}`);
    return worktreeModel({
        repoId: submoduleId,
        worktreeId: submoduleId,
        path: `/workspace/${submodulePath}`,
        ...overrides,
    });
}

function submoduleRepositoryModel(submodulePath: string, overrides: Partial<RuntimeRepository>): RuntimeRepository {
    const submoduleId = stableRepoContextId(`/workspace/${submodulePath}`);
    return repositoryModel({
        repoId: submoduleId,
        gitDir: `/workspace/${submodulePath}/.git`,
        kind: 'submodule',
        label: submodulePath,
        ...overrides,
    });
}
