import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { GitProcessRepository } from '../../../src/extension/git/GitProcessRepository';
import { ChangesMessageRouter, buildStatusData } from '../../../src/extension/messaging/ChangesMessageRouter';
import type { ChangesExtensionToWebviewMessage, SubmoduleStashFilesResponse, SubmoduleStatusResponse } from '../../../src/protocol/changes/messages';
import { SubmoduleStatus } from '../../../src/protocol/shared/repo';
import type { ActiveRepositoryAccessor } from '../../../src/extension/repositories/ActiveRepositoryRegistry';
import { getFixtureRepoPath } from '../../helpers/fixtureRepo';
import { runTestCases, type TestCase } from '../../helpers/testRunner';

export function run(): Promise<void> {
    const tests: TestCase[] = [
        {
            name: 'activates the extension and contributes commands and views',
            run: async () => {
                const extension = vscode.extensions.getExtension('mathias8dev.look-git');
                assert.ok(extension, 'Expected the Look Git extension to be installed in the test host.');

                await extension.activate();
                assert.equal(extension.isActive, true);

                const commands = await vscode.commands.getCommands(true);
                assert.ok(
                    commands.includes('workbench.view.extension.look-git'),
                    'Expected the Look Git Activity Bar container command to be registered.',
                );
                assert.ok(
                    commands.includes('lookGit.changesView.focus'),
                    'Expected the Changes view focus command to be registered.',
                );
                assert.ok(
                    commands.includes('lookGit.commitHistory.focus'),
                    'Expected the Commit History view focus command to be registered.',
                );
                assert.ok(
                    commands.includes('lookGit.graphView.focus'),
                    'Expected the Git Graph view focus command to be registered.',
                );
            },
        },
    ];

    const fixturePath = getFixtureRepoPath();
    if (!fixturePath) {
        tests.push({
            name: 'skips fixture-backed submodule integration tests when fixture repo is absent',
            run: () => {
                console.log('  skip fixture-backed tests: set LOOK_GIT_FIXTURE_REPO or create ~/CodeProjects/look-git-fixture-repo');
            },
        });
    } else {
        tests.push(
            {
                name: 'builds complete Changes status data from the dirty fixture submodules',
                run: async () => {
                    const repo = new GitProcessRepository(fixturePath);
                    const [status, stashes, submodules] = await Promise.all([
                        repo.getStatus(),
                        repo.stashList(),
                        repo.getSubmoduleStatus(),
                    ]);
                    const data = buildStatusData(status, stashes, submodules).data;

                    assert.equal(data.submodules.length, 3);
                    assert.equal(data.submodules.find((entry) => entry.path === 'modules/auth-kit')?.status, SubmoduleStatus.Dirty);
                    assert.equal(data.submodules.find((entry) => entry.path === 'modules/billing-core')?.status, SubmoduleStatus.Dirty);
                    assert.equal(data.submodules.find((entry) => entry.path === 'modules/analytics-adapter')?.status, SubmoduleStatus.Dirty);
                    assert.ok(data.staged.some((entry) => entry.filePath === 'src/graphFilter.ts'));
                    assert.ok([...data.staged, ...data.unstaged].some((entry) => entry.filePath === 'README.md'));
                    assert.ok(data.unstaged.some((entry) => entry.filePath === 'modules/auth-kit' && entry.isSubmodule));
                },
            },
            {
                name: 'loads staged and unstaged files inside each fixture submodule',
                run: async () => {
                    const repo = new GitProcessRepository(fixturePath);
                    const messages: ChangesExtensionToWebviewMessage[] = [];
                    const accessor: ActiveRepositoryAccessor = {
                        currentRepository: repo,
                        currentContext: undefined,
                        requireRepository: () => repo,
                    };
                    const router = new ChangesMessageRouter(accessor, (message) => { messages.push(message); }, async () => {});

                    await router.handle({ type: 'changes/getSubmoduleStatus', requestId: 'auth', path: 'modules/auth-kit' });
                    await router.handle({ type: 'changes/getSubmoduleStatus', requestId: 'billing', path: 'modules/billing-core' });
                    await router.handle({ type: 'changes/getSubmoduleStatus', requestId: 'analytics', path: 'modules/analytics-adapter' });

                    const auth = submoduleResponse(messages, 'auth');
                    assertStatusFile(auth.data.unstaged, 'index.ts');
                    assertStatusFile(auth.data.unstaged, 'LOCAL_NOTES.md');
                    assert.ok(auth.data.stashes.some((stash) => stash.message.includes('fixture stash for modules/auth-kit')));

                    const billing = submoduleResponse(messages, 'billing');
                    assertStatusFile(billing.data.staged, 'README.md');
                    assertStatusFile(billing.data.unstaged, 'experiment.ts');
                    assert.ok(billing.data.stashes.some((stash) => stash.message.includes('fixture stash for modules/billing-core')));

                    const analytics = submoduleResponse(messages, 'analytics');
                    assertStatusFile(analytics.data.unstaged, 'index.ts');
                    assertStatusFile(analytics.data.unstaged, 'fixtures/local-event.json');
                    assert.ok(analytics.data.stashes.some((stash) => stash.message.includes('fixture stash for modules/analytics-adapter')));

                    await router.handle({
                        type: 'changes/getSubmoduleStashFiles',
                        requestId: 'auth-stash-files',
                        submodulePath: 'modules/auth-kit',
                        index: 0,
                    });
                    const stashFiles = submoduleStashFilesResponse(messages, 'auth-stash-files');
                    assertStatusFile(stashFiles.files, 'STASHED_ONLY.md');
                },
            },
        );
    }

    return runTestCases('Look Git integration', tests);
}

function submoduleStashFilesResponse(
    messages: readonly ChangesExtensionToWebviewMessage[],
    requestId: string,
): SubmoduleStashFilesResponse {
    const response = messages.find((message): message is SubmoduleStashFilesResponse =>
        message.type === 'changes/submoduleStashFiles' && message.requestId === requestId);
    assert.ok(response, `Expected submodule stash files response for ${requestId}.`);
    return response;
}

function submoduleResponse(
    messages: readonly ChangesExtensionToWebviewMessage[],
    requestId: string,
): SubmoduleStatusResponse {
    const response = messages.find((message): message is SubmoduleStatusResponse =>
        message.type === 'changes/submoduleStatusData' && message.requestId === requestId);
    assert.ok(response, `Expected submodule status response for ${requestId}.`);
    return response;
}

function assertStatusFile(entries: readonly { readonly filePath: string }[], filePath: string): void {
    assert.ok(entries.some((entry) => entry.filePath === filePath), `Expected status entry for ${filePath}.`);
}
