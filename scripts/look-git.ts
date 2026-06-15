#!/usr/bin/env node
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

type Author = {
    readonly name: string;
    readonly email: string;
};

type CommitOptions = {
    readonly author?: Author;
};

type CliOptions = {
    readonly output?: string;
};

type ScenarioSetup = (target: string, outputRoot: string) => void;

type RemoteFixtureSource = {
    readonly origin: string;
};

const repoRoot = path.resolve(__dirname, '..');
const defaultOutputRoot = path.join(repoRoot, '.look-git-fixtures');

const authors: readonly Author[] = [
    { name: 'Ava Martin', email: 'ava.martin@example.com' },
    { name: 'Ben Carter', email: 'ben.carter@example.com' },
    { name: 'Chloe Nguyen', email: 'chloe.nguyen@example.com' },
    { name: 'Dana Scott', email: 'dana.scott@example.com' },
    { name: 'Eli Rivera', email: 'eli.rivera@example.com' },
    { name: 'Fatima Khan', email: 'fatima.khan@example.com' },
    { name: 'Grace Hopper', email: 'grace.hopper@example.com' },
    { name: 'Mathias Dev', email: 'mathias.dev@example.com' },
];

const scenarios = new Map<string, ScenarioSetup>([
    ['basics', setupBasics],
    ['empty', setupEmptyRepo],
    ['empty-repo', setupEmptyRepo],
    ['file-context', setupFileContextMenu],
    ['file-context-menu', setupFileContextMenu],
    ['merge-conflicts', setupMergeConflicts],
    ['merge-conflics', setupMergeConflicts],
    ['graph-heavy', setupGraphHeavy],
    ['heavy-graph', setupGraphHeavy],
    ['interactive-rebase-conflicts', setupInteractiveRebaseConflicts],
    ['interactive-rebase-multiple-conflicts', setupInteractiveRebaseConflicts],
    ['rebase-conflicts', setupRebaseConflicts],
    ['remote', setupRemote],
    ['remote-failure', setupRemoteUnavailable],
    ['remote-offline', setupRemoteUnavailable],
    ['remote-only', setupRemoteOnly],
    ['remote-unavailable', setupRemoteUnavailable],
    ['remotes', setupRemote],
    ['stash-pop-blocked', setupStashPopBlocked],
    ['stash-pop-local-changes', setupStashPopBlocked],
    ['submodules', setupSubmodules],
    ['unpublished', setupUnpublishedBranch],
    ['unpublished-branch', setupUnpublishedBranch],
    ['worktree', setupWorktrees],
    ['worktrees', setupWorktrees],
]);

let commitIndex = 0;

main();

function main(): void {
    const [command, scenarioArg, ...rest] = process.argv.slice(2);
    const options = parseOptions(rest);

    if (!command || command === 'help' || command === '--help' || command === '-h') {
        printHelp();
        return;
    }

    if (command !== 'setup') {
        fail(`Unknown command: ${command}`);
    }

    if (!scenarioArg || scenarioArg === 'list') {
        printScenarios();
        return;
    }

    const scenarioNames = scenarioArg === 'all' ? uniqueScenarios() : [scenarioArg];
    const outputRoot = path.resolve(options.output ?? defaultOutputRoot);
    fs.mkdirSync(outputRoot, { recursive: true });

    for (const scenarioName of scenarioNames) {
        const setup = scenarios.get(scenarioName);
        if (!setup) {
            fail(`Unknown setup scenario: ${scenarioName}`);
        }

        const normalizedName = canonicalScenarioName(scenarioName);
        const target = path.join(outputRoot, normalizedName);
        resetDir(target);
        setup(target, outputRoot);
        printSummary(normalizedName, target);
    }
}

function parseOptions(args: readonly string[]): CliOptions {
    let output: string | undefined;
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--output' || arg === '-o') {
            const value = args[i + 1];
            if (!value) {
                fail(`${arg} requires a path.`);
            }
            output = value;
            i++;
            continue;
        }
        fail(`Unknown option: ${arg}`);
    }
    return { output };
}

function printHelp(): void {
    console.log([
        'Usage:',
        '  ./lookGit setup <scenario> [--output <dir>]',
        '',
        'Scenarios:',
        `  ${uniqueScenarios().join(', ')}`,
        '',
        'Examples:',
        '  ./lookGit setup basics',
        '  ./lookGit setup merge-conflicts',
        '  ./lookGit setup merge-conflics',
        '  ./lookGit setup graph-heavy',
        '  ./lookGit setup interactive-rebase-conflicts',
        '  ./lookGit setup empty-repo',
        '  ./lookGit setup file-context-menu',
        '  ./lookGit setup remote',
        '  ./lookGit setup remote-only',
        '  ./lookGit setup unpublished-branch',
        '  ./lookGit setup remote-unavailable',
        '  ./lookGit setup stash-pop-blocked',
        '  ./lookGit setup rebase-conflicts --output /tmp/look-git-fixtures',
        '  ./lookGit setup worktrees',
        '  ./lookGit setup all',
    ].join('\n'));
}

function printScenarios(): void {
    console.log(uniqueScenarios().join('\n'));
}

function printSummary(name: string, target: string): void {
    const branchCount = git(target, ['for-each-ref', '--format=%(refname:short)', 'refs/heads']).split('\n').filter(Boolean).length;
    const remoteCount = git(target, ['remote']).split('\n').filter(Boolean).length;
    const remoteBranchCount = git(target, ['for-each-ref', '--format=%(refname:short)', 'refs/remotes']).split('\n').filter(Boolean).length;
    const commitCount = git(target, ['rev-list', '--all', '--count']).trim();
    const worktreeCount = git(target, ['worktree', 'list', '--porcelain']).split('\n').filter((line) => line.startsWith('worktree ')).length;
    console.log(`Created ${name}: ${target}`);
    console.log(`  branches: ${branchCount}`);
    if (remoteCount > 0) {
        console.log(`  remotes: ${remoteCount}`);
    }
    if (remoteBranchCount > 0) {
        console.log(`  remote branches: ${remoteBranchCount}`);
    }
    console.log(`  commits: ${commitCount}`);
    if (worktreeCount > 1) {
        console.log(`  worktrees: ${worktreeCount}`);
    }
    console.log(`  code ${target}`);
}

function uniqueScenarios(): readonly string[] {
    return [
        'basics',
        'empty-repo',
        'file-context-menu',
        'graph-heavy',
        'interactive-rebase-conflicts',
        'merge-conflicts',
        'rebase-conflicts',
        'remote',
        'remote-only',
        'remote-unavailable',
        'stash-pop-blocked',
        'submodules',
        'unpublished-branch',
        'worktrees',
    ];
}

function canonicalScenarioName(name: string): string {
    if (name === 'empty') { return 'empty-repo'; }
    if (name === 'file-context') { return 'file-context-menu'; }
    if (name === 'worktree') { return 'worktrees'; }
    if (name === 'remotes') { return 'remote'; }
    if (name === 'heavy-graph') { return 'graph-heavy'; }
    if (name === 'interactive-rebase-multiple-conflicts') { return 'interactive-rebase-conflicts'; }
    if (name === 'remote-failure' || name === 'remote-offline') { return 'remote-unavailable'; }
    if (name === 'unpublished') { return 'unpublished-branch'; }
    if (name === 'stash-pop-local-changes') { return 'stash-pop-blocked'; }
    return name === 'merge-conflics' ? 'merge-conflicts' : name;
}

function resetDir(target: string): void {
    fs.rmSync(target, { recursive: true, force: true });
    fs.mkdirSync(target, { recursive: true });
}

function setupBasics(target: string): void {
    initRepo(target);
    write(target, 'README.md', '# Look Git fixture\n\nA repository with a busy history.\n');
    commit(target, 'docs(core): add project overview');
    write(target, 'src/core/repository.ts', 'export const repository = "main";\n');
    commit(target, 'feat(core): add repository primitive');

    const branches: readonly {
        readonly name: string;
        readonly scope: string;
        readonly merge: boolean;
        readonly commits: readonly {
            readonly file: string;
            readonly content: string;
            readonly message: string;
        }[];
    }[] = [
        {
            name: 'feat/auth-kit',
            scope: 'auth',
            merge: true,
            commits: [
                { file: 'src/auth/session.ts', content: 'export const session = "created";\n', message: 'feat(auth): add session model' },
                { file: 'src/auth/permissions.ts', content: 'export const permissions = ["read", "write"];\n', message: 'feat(auth): add permission matrix' },
            ],
        },
        {
            name: 'feat/graph-lanes',
            scope: 'graph',
            merge: true,
            commits: [
                { file: 'src/graph/lanes.ts', content: 'export const lanes = ["main", "feature"];\n', message: 'feat(graph): add lane allocator' },
                { file: 'src/graph/colors.ts', content: 'export const colors = ["blue", "green", "pink"];\n', message: 'feat(graph): add lane color palette' },
            ],
        },
        {
            name: 'feat/changes-panel',
            scope: 'changes',
            merge: true,
            commits: [
                { file: 'src/changes/status.ts', content: 'export const statusSections = ["staged", "changes"];\n', message: 'feat(changes): add status sections' },
                { file: 'src/changes/actions.ts', content: 'export const actions = ["stage", "discard"];\n', message: 'feat(changes): add row actions' },
            ],
        },
        {
            name: 'fix/diff-selection',
            scope: 'diff',
            merge: true,
            commits: [
                { file: 'src/diff/selection.ts', content: 'export const selectedPath = "README.md";\n', message: 'fix(diff): keep selected path stable' },
                { file: 'tests/diff-selection.test.ts', content: 'export const covered = true;\n', message: 'test(diff): cover selection refresh' },
            ],
        },
        {
            name: 'refactor/protocol-slices',
            scope: 'protocol',
            merge: true,
            commits: [
                { file: 'src/protocol/graph.ts', content: 'export const graphMessage = "graph/dataRequest";\n', message: 'refactor(protocol): add graph message slice' },
                { file: 'src/protocol/changes.ts', content: 'export const changesMessage = "changes/statusRequest";\n', message: 'refactor(protocol): add changes message slice' },
            ],
        },
        {
            name: 'feat/worktrees',
            scope: 'worktrees',
            merge: true,
            commits: [
                { file: 'src/worktrees/list.ts', content: 'export const worktrees = [];\n', message: 'feat(worktrees): add list model' },
                { file: 'src/worktrees/create.ts', content: 'export const createWorktree = true;\n', message: 'feat(worktrees): add creation flow' },
            ],
        },
        {
            name: 'feat/submodules',
            scope: 'submodules',
            merge: true,
            commits: [
                { file: 'src/submodules/status.ts', content: 'export const submoduleStatuses = ["clean", "dirty"];\n', message: 'feat(submodules): add status badges' },
                { file: 'src/submodules/actions.ts', content: 'export const submoduleActions = ["open", "update"];\n', message: 'feat(submodules): add action model' },
            ],
        },
        {
            name: 'docs/user-guide',
            scope: 'docs',
            merge: false,
            commits: [
                { file: 'docs/user-guide.md', content: '# User guide\n\nOpen the graph and inspect history.\n', message: 'docs(graph): add user guide draft' },
                { file: 'docs/shortcuts.md', content: '# Shortcuts\n\nEnter commits and arrows navigate.\n', message: 'docs(core): document navigation shortcuts' },
            ],
        },
        {
            name: 'chore/ci-matrix',
            scope: 'ci',
            merge: false,
            commits: [
                { file: '.github/workflows/test.yml', content: 'name: test\n', message: 'chore(ci): add test workflow' },
                { file: '.github/workflows/e2e.yml', content: 'name: e2e\n', message: 'chore(ci): add e2e workflow' },
            ],
        },
        {
            name: 'release/0.2',
            scope: 'release',
            merge: false,
            commits: [
                { file: 'CHANGELOG.md', content: '# Changelog\n\n## 0.2.0\n\nFixture release notes.\n', message: 'docs(release): add changelog entry' },
                { file: 'VERSION', content: '0.2.0-fixture\n', message: 'chore(release): bump fixture version' },
            ],
        },
        {
            name: 'experiment/side-panel-redesign',
            scope: 'webview',
            merge: false,
            commits: [
                { file: 'experiments/side-panel.md', content: '# Side panel redesign\n', message: 'feat(webview): prototype side panel layout' },
                { file: 'experiments/sidebar-density.md', content: '# Density notes\n', message: 'docs(webview): record density notes' },
            ],
        },
    ];

    for (const branch of branches) {
        git(target, ['checkout', '-q', 'main']);
        git(target, ['checkout', '-q', '-b', branch.name]);
        for (const change of branch.commits) {
            write(target, change.file, change.content);
            commit(target, change.message, { author: nextAuthor() });
        }
        if (branch.merge) {
            git(target, ['checkout', '-q', 'main']);
            git(target, ['merge', '--no-ff', '-m', `chore(${branch.scope}): merge ${branch.name}`, branch.name], { author: nextAuthor() });
        }
    }

    git(target, ['checkout', '-q', 'main']);
    write(target, 'src/core/repository.ts', 'export const repository = "main-updated";\n');
    commit(target, 'fix(core): update repository primitive', { author: nextAuthor() });
    write(target, 'tests/graph/lanes.test.ts', 'export const graphLanesCovered = true;\n');
    commit(target, 'test(graph): cover lane fixture data', { author: nextAuthor() });
    git(target, ['tag', 'v0.2.0']);

    write(target, 'src/staged.ts', 'export const staged = true;\n');
    git(target, ['add', 'src/staged.ts']);
    write(target, 'src/core/repository.ts', 'export const repository = "dirty-working-tree";\n');
    write(target, 'notes/local.md', 'Untracked local note.\n');
    write(target, 'stash/wip.txt', 'stashed idea\n');
    git(target, ['stash', 'push', '-u', '-m', 'wip(core): stash fixture idea', '--', 'stash/wip.txt']);
}

function setupEmptyRepo(target: string): void {
    initRepo(target);
    write(target, 'README.md', '# Empty repository fixture\n\nNo commits yet.\n');
    git(target, ['add', 'README.md']);
    write(target, 'notes/first-commit-plan.md', 'Prepare the first commit from an unborn branch.\n');
}

function setupGraphHeavy(target: string): void {
    initRepo(target);
    write(target, 'README.md', '# Graph heavy fixture\n\nLarge merge-heavy history for graph renderer validation.\n');
    commit(target, 'docs(graph): add heavy graph fixture overview');
    write(target, 'src/graph/shared-filter.ts', 'export const selectedRevision = 0;\n');
    commit(target, 'feat(graph): seed selected path history');

    const mergeQueue: string[] = [];
    let branchIndex = 0;
    let batchIndex = 0;
    const mainScopes = ['graph', 'core', 'changes', 'webview', 'protocol'] as const;

    for (let i = 1; i <= 220; i++) {
        const scope = mainScopes[i % mainScopes.length];
        write(target, `src/main/segment-${String(i).padStart(3, '0')}.ts`, `export const mainSegment${i} = ${i};\n`);
        if (i % 11 === 0) {
            write(target, 'src/graph/shared-filter.ts', `export const selectedRevision = ${i};\n`);
        }
        commit(target, `feat(${scope}): add main graph segment ${i}`, { author: nextAuthor() });

        if (i % 3 !== 0) { continue; }

        const branchName = `feature/graph-heavy-${String(branchIndex).padStart(2, '0')}`;
        const baseOffset = Math.min(i - 1, branchIndex % 23);
        const base = git(target, ['rev-parse', `HEAD~${baseOffset}`]).trim();
        git(target, ['checkout', '-q', '-b', branchName, base]);
        for (let j = 1; j <= 4; j++) {
            write(
                target,
                `src/topics/topic-${String(branchIndex).padStart(2, '0')}-${j}.ts`,
                `export const topic${branchIndex}Step${j} = "${branchName}";\n`,
            );
            commit(target, `feat(graph): add heavy topic ${branchIndex} step ${j}`, { author: nextAuthor() });
        }
        if (branchIndex % 13 === 0) {
            write(target, `tests/graph/heavy-topic-${String(branchIndex).padStart(2, '0')}.test.ts`, `export const topic${branchIndex}Covered = true;\n`);
            commit(target, `test(graph): cover heavy topic ${branchIndex}`, { author: nextAuthor() });
        }

        git(target, ['checkout', '-q', 'main']);
        if (branchIndex % 5 !== 4) {
            mergeQueue.push(branchName);
        }
        if (mergeQueue.length >= 4) {
            git(target, ['merge', '--no-ff', '-m', `chore(graph): merge heavy graph batch ${batchIndex}`, ...mergeQueue], { author: nextAuthor() });
            if (batchIndex % 3 === 0) {
                git(target, ['tag', `graph-heavy-batch-${batchIndex}`]);
            }
            mergeQueue.length = 0;
            batchIndex++;
        }
        branchIndex++;
    }

    if (mergeQueue.length > 0) {
        git(target, ['merge', '--no-ff', '-m', `chore(graph): merge heavy graph batch ${batchIndex}`, ...mergeQueue], { author: nextAuthor() });
    }

    git(target, ['checkout', '-q', 'main']);
    write(target, 'docs/graph-heavy-summary.md', '# Graph heavy summary\n');
    commit(target, 'docs(graph): summarize heavy graph fixture', { author: nextAuthor() });
}

function setupMergeConflicts(target: string): void {
    initRepo(target);
    write(target, 'README.md', '# Merge conflict fixture\n');
    commit(target, 'docs(conflicts): add merge fixture overview');
    write(target, 'conflict.txt', 'base\n');
    commit(target, 'feat(conflicts): add shared merge base');
    git(target, ['checkout', '-q', '-b', 'incoming']);
    write(target, 'conflict.txt', 'incoming branch\n');
    commit(target, 'feat(conflicts): update incoming branch', { author: nextAuthor() });
    write(target, 'incoming-only.txt', 'incoming only\n');
    commit(target, 'feat(conflicts): add incoming side file', { author: nextAuthor() });
    git(target, ['checkout', '-q', 'main']);
    write(target, 'conflict.txt', 'current branch\n');
    commit(target, 'feat(conflicts): update current branch', { author: nextAuthor() });
    write(target, 'current-only.txt', 'current only\n');
    commit(target, 'feat(conflicts): add current side file', { author: nextAuthor() });
    expectGitFailure(target, ['merge', 'incoming']);
}

function setupRebaseConflicts(target: string): void {
    initRepo(target);
    write(target, 'README.md', '# Rebase conflict fixture\n');
    commit(target, 'docs(conflicts): add rebase fixture overview');
    write(target, 'conflict.txt', 'base\n');
    const base = commit(target, 'feat(conflicts): add shared rebase base');
    git(target, ['checkout', '-q', '-b', 'feature/rebase-conflict', base]);
    write(target, 'conflict.txt', 'feature branch\n');
    commit(target, 'feat(conflicts): update feature branch', { author: nextAuthor() });
    write(target, 'feature-only.txt', 'feature only\n');
    commit(target, 'feat(conflicts): add feature side file', { author: nextAuthor() });
    git(target, ['checkout', '-q', 'main']);
    write(target, 'conflict.txt', 'main branch\n');
    commit(target, 'feat(conflicts): update main branch', { author: nextAuthor() });
    write(target, 'main-only.txt', 'main only\n');
    commit(target, 'feat(conflicts): add main side file', { author: nextAuthor() });
    git(target, ['checkout', '-q', 'feature/rebase-conflict']);
    expectGitFailure(target, ['rebase', 'main']);
}

function setupInteractiveRebaseConflicts(target: string): void {
    initRepo(target);
    write(target, 'README.md', [
        '# Interactive rebase conflict fixture',
        '',
        'Open this repository on `feature/interactive-rebase-conflicts`.',
        'Start a Visual Rebase onto `main` to hit several sequential conflicts.',
        '',
        'Expected conflict order:',
        '1. `src/app.ts`',
        '2. `src/settings.ts`',
        '3. `src/api.ts`',
        '',
    ].join('\n'));
    commit(target, 'docs(rebase): add interactive conflict fixture guide', { author: nextAuthor() });
    write(target, 'src/app.ts', 'export const appState = "base";\n');
    write(target, 'src/settings.ts', 'export const settingsMode = "base";\n');
    write(target, 'src/api.ts', 'export const apiEndpoint = "base";\n');
    commit(target, 'feat(rebase): add shared interactive rebase base', { author: nextAuthor() });
    const base = git(target, ['rev-parse', 'HEAD']).trim();

    git(target, ['checkout', '-q', '-b', 'feature/interactive-rebase-conflicts', base]);
    write(target, 'src/app.ts', 'export const appState = "feature-dashboard";\n');
    commit(target, 'feat(rebase): update app state on feature branch', { author: nextAuthor() });
    write(target, 'src/feature/notes.ts', 'export const featureNote = "between app and settings conflicts";\n');
    commit(target, 'feat(rebase): add feature note between conflicts', { author: nextAuthor() });
    write(target, 'src/settings.ts', 'export const settingsMode = "feature-relaxed";\n');
    commit(target, 'feat(rebase): update settings on feature branch', { author: nextAuthor() });
    write(target, 'src/feature/audit.ts', 'export const auditEnabled = true;\n');
    commit(target, 'feat(rebase): add audit side commit', { author: nextAuthor() });
    write(target, 'src/api.ts', 'export const apiEndpoint = "feature-v2";\n');
    commit(target, 'feat(rebase): update api endpoint on feature branch', { author: nextAuthor() });
    write(target, 'docs/feature-plan.md', '# Feature plan\n\nFinal clean commit after the conflict sequence.\n');
    commit(target, 'docs(rebase): add feature plan after conflicts', { author: nextAuthor() });

    git(target, ['checkout', '-q', 'main']);
    write(target, 'src/app.ts', 'export const appState = "main-dashboard";\n');
    commit(target, 'feat(rebase): update app state on main branch', { author: nextAuthor() });
    write(target, 'docs/main-release.md', '# Main release\n\nMain branch commit between conflict sources.\n');
    commit(target, 'docs(rebase): add main release note', { author: nextAuthor() });
    write(target, 'src/settings.ts', 'export const settingsMode = "main-strict";\n');
    commit(target, 'feat(rebase): update settings on main branch', { author: nextAuthor() });
    write(target, 'src/main/telemetry.ts', 'export const telemetry = "main";\n');
    commit(target, 'feat(rebase): add main telemetry side commit', { author: nextAuthor() });
    write(target, 'src/api.ts', 'export const apiEndpoint = "main-v2";\n');
    commit(target, 'feat(rebase): update api endpoint on main branch', { author: nextAuthor() });

    git(target, ['checkout', '-q', 'feature/interactive-rebase-conflicts']);
}

function setupStashPopBlocked(target: string): void {
    initRepo(target);
    write(target, 'README.md', '# Stash pop blocked fixture\n\nUse Look Git to pop the stash and verify the local-change error stays visible.\n');
    commit(target, 'docs(changes): add stash pop blocked fixture overview');
    write(target, 'src/app.ts', 'base\n');
    commit(target, 'feat(changes): add tracked app file', { author: nextAuthor() });
    write(target, 'src/app.ts', 'stashed\n');
    git(target, ['stash', 'push', '-m', 'wip(changes): blocked stash pop fixture', '--', 'src/app.ts']);
    write(target, 'src/app.ts', 'local unstaged\n');
}

function setupFileContextMenu(target: string, outputRoot: string): void {
    const remoteRoot = path.join(outputRoot, '.file-context-menu-remotes');
    fs.rmSync(remoteRoot, { recursive: true, force: true });
    fs.mkdirSync(remoteRoot, { recursive: true });

    initRepo(target);
    write(target, '.gitignore', 'repos/\n');
    write(target, 'README.md', '# File context menu fixture\n\nOpen this folder, then right-click files inside repos/* to verify Look Git resolves the clicked file repository.\n');
    commit(target, 'docs(context): add active workspace fixture');
    write(target, 'src/active-repo.ts', 'export const activeRepo = true;\n');
    commit(target, 'feat(context): add active repository marker', { author: nextAuthor() });

    setupHistoryTargetRepo(
        path.join(target, 'repos', 'history-target'),
        path.join(remoteRoot, 'history-target.git'),
    );
    setupPullConflictTargetRepo(
        path.join(target, 'repos', 'pull-conflict-target'),
        path.join(remoteRoot, 'pull-conflict-target.git'),
        path.join(remoteRoot, 'pull-conflict-writer'),
    );
}

function setupHistoryTargetRepo(repoPath: string, origin: string): void {
    initBareRepo(origin);
    initRepo(repoPath);
    git(repoPath, ['remote', 'add', 'origin', origin]);
    write(repoPath, 'README.md', '# History target\n\nRight-click src/app.ts and choose Look Git > Show History.\n');
    commit(repoPath, 'docs(context): add history target overview', { author: nextAuthor() });
    write(repoPath, 'src/app.ts', 'export const version = 1;\n');
    commit(repoPath, 'feat(context): add file history baseline', { author: nextAuthor() });
    write(repoPath, 'src/app.ts', 'export const version = 2;\n');
    commit(repoPath, 'feat(context): update file history target', { author: nextAuthor() });
    git(repoPath, ['push', '-q', '-u', 'origin', 'main']);
    write(repoPath, 'src/app.ts', 'export const version = 3;\n');
    commit(repoPath, 'feat(context): add local push candidate', { author: nextAuthor() });
}

function setupPullConflictTargetRepo(repoPath: string, origin: string, writerPath: string): void {
    initBareRepo(origin);
    initRepo(repoPath);
    git(repoPath, ['remote', 'add', 'origin', origin]);
    write(repoPath, 'README.md', '# Pull conflict target\n\nRight-click src/app.ts and choose Look Git > Pull to verify native conflict warnings.\n');
    commit(repoPath, 'docs(context): add pull conflict target overview', { author: nextAuthor() });
    write(repoPath, 'src/app.ts', 'export const value = "base";\n');
    commit(repoPath, 'feat(context): add pull conflict baseline', { author: nextAuthor() });
    git(repoPath, ['push', '-q', '-u', 'origin', 'main']);

    fs.rmSync(writerPath, { recursive: true, force: true });
    git(path.dirname(writerPath), ['clone', '-q', origin, writerPath]);
    configureRepo(writerPath);
    write(writerPath, 'src/app.ts', 'export const value = "remote";\n');
    commit(writerPath, 'feat(context): add remote pull conflict side', { author: nextAuthor() });
    git(writerPath, ['push', '-q', 'origin', 'main']);
    git(repoPath, ['fetch', '-q', 'origin']);

    write(repoPath, 'src/app.ts', 'export const value = "local";\n');
    commit(repoPath, 'feat(context): add local pull conflict side', { author: nextAuthor() });
}

function setupRemote(target: string, outputRoot: string): void {
    const remoteRoot = path.join(outputRoot, '.remotes');
    const seed = path.join(outputRoot, '.remote-seed');
    fs.rmSync(remoteRoot, { recursive: true, force: true });
    fs.rmSync(seed, { recursive: true, force: true });
    fs.mkdirSync(remoteRoot, { recursive: true });

    const origin = path.join(remoteRoot, 'origin.git');
    const upstream = path.join(remoteRoot, 'upstream.git');
    initBareRepo(origin);
    initBareRepo(upstream);

    initRepo(seed);
    git(seed, ['remote', 'add', 'origin', origin]);
    git(seed, ['remote', 'add', 'upstream', upstream]);
    write(seed, 'README.md', '# Remote fixture\n\nBranches, upstreams, divergence, and remote-only refs.\n');
    commit(seed, 'docs(core): add remote fixture overview');

    const mainCommits: readonly { readonly file: string; readonly content: string; readonly message: string }[] = [
        { file: 'src/core/remotes.ts', content: 'export const remotes = ["origin", "upstream"];\n', message: 'feat(core): add remote registry model' },
        { file: 'src/graph/remoteRefs.ts', content: 'export const remoteRefs = true;\n', message: 'feat(graph): add remote ref metadata' },
        { file: 'src/changes/upstreamStatus.ts', content: 'export const upstreamStatus = "synced";\n', message: 'feat(changes): add upstream status summary' },
        { file: 'tests/remote/status.test.ts', content: 'export const remoteStatusCovered = true;\n', message: 'test(graph): cover remote status fixtures' },
        { file: 'docs/remotes.md', content: '# Remotes\n\nFixture branches exercise remotes.\n', message: 'docs(graph): document remote branch display' },
        { file: '.github/workflows/remotes.yml', content: 'name: remotes\n', message: 'chore(ci): add remote fixture workflow' },
    ];
    for (const change of mainCommits) {
        write(seed, change.file, change.content);
        commit(seed, change.message, { author: nextAuthor() });
    }
    const sharedBase = git(seed, ['rev-parse', 'HEAD']).trim();

    const originBranches: readonly {
        readonly name: string;
        readonly commits: readonly { readonly file: string; readonly content: string; readonly message: string }[];
    }[] = [
        {
            name: 'feature/shared-tracking',
            commits: [
                { file: 'src/graph/sharedTracking.ts', content: 'export const sharedTracking = "remote";\n', message: 'feat(graph): add shared tracking branch model' },
                { file: 'tests/graph/shared-tracking.test.ts', content: 'export const sharedTrackingCovered = true;\n', message: 'test(graph): cover shared tracking branch' },
            ],
        },
        {
            name: 'feature/diverged',
            commits: [
                { file: 'src/graph/diverged.ts', content: 'export const diverged = "base";\n', message: 'feat(graph): add diverged branch baseline' },
                { file: 'docs/diverged.md', content: '# Diverged branch\n', message: 'docs(graph): explain diverged branch state' },
            ],
        },
        {
            name: 'feat/local-ahead',
            commits: [
                { file: 'src/changes/ahead.ts', content: 'export const ahead = "remote-base";\n', message: 'feat(changes): add ahead branch baseline' },
                { file: 'tests/changes/ahead.test.ts', content: 'export const aheadCovered = true;\n', message: 'test(changes): cover ahead branch baseline' },
            ],
        },
        {
            name: 'feature/remote-only-dashboard',
            commits: [
                { file: 'src/webview/remoteDashboard.ts', content: 'export const dashboard = "remote-only";\n', message: 'feat(webview): add remote dashboard shell' },
                { file: 'src/webview/remoteFilters.ts', content: 'export const filters = ["author", "path"];\n', message: 'feat(webview): add remote dashboard filters' },
                { file: 'docs/remote-dashboard.md', content: '# Remote dashboard\n', message: 'docs(webview): describe remote dashboard' },
            ],
        },
        {
            name: 'docs/remote-only-guide',
            commits: [
                { file: 'docs/remote-guide.md', content: '# Remote guide\n', message: 'docs(core): add remote-only guide' },
                { file: 'docs/remote-faq.md', content: '# Remote FAQ\n', message: 'docs(core): add remote branch faq' },
            ],
        },
        {
            name: 'chore/remote-ci-matrix',
            commits: [
                { file: '.github/workflows/remote-linux.yml', content: 'name: remote-linux\n', message: 'chore(ci): add remote linux job' },
                { file: '.github/workflows/remote-windows.yml', content: 'name: remote-windows\n', message: 'chore(ci): add remote windows job' },
            ],
        },
        {
            name: 'release/2.0',
            commits: [
                { file: 'CHANGELOG.md', content: '# Changelog\n\n## 2.0.0\n\nRemote fixture release.\n', message: 'docs(core): add remote release notes' },
                { file: 'VERSION', content: '2.0.0-remote\n', message: 'chore(core): bump remote fixture version' },
            ],
        },
        {
            name: 'hotfix/security-patch',
            commits: [
                { file: 'src/core/securityPatch.ts', content: 'export const patched = true;\n', message: 'fix(core): add remote security patch' },
            ],
        },
        {
            name: 'experiment/remote-graph-density',
            commits: [
                { file: 'experiments/remote-density.md', content: '# Remote density\n', message: 'feat(graph): prototype remote graph density' },
                { file: 'experiments/remote-lanes.md', content: '# Remote lanes\n', message: 'docs(graph): record remote lane findings' },
            ],
        },
        {
            name: 'refactor/protocol-remote-slices',
            commits: [
                { file: 'src/protocol/remoteGraph.ts', content: 'export const remoteGraph = "graph/dataRequest";\n', message: 'refactor(protocol): add remote graph slice fixture' },
                { file: 'src/protocol/remoteChanges.ts', content: 'export const remoteChanges = "changes/statusRequest";\n', message: 'refactor(protocol): add remote changes slice fixture' },
            ],
        },
    ];

    for (const branch of originBranches) {
        createRemoteFixtureBranch(seed, branch.name, sharedBase, branch.commits);
        git(seed, ['push', '-q', 'origin', `${branch.name}:${branch.name}`]);
    }

    git(seed, ['checkout', '-q', 'main']);
    write(seed, 'src/graph/mainRemote.ts', 'export const mainRemote = true;\n');
    commit(seed, 'feat(graph): add main remote graph surface', { author: nextAuthor() });
    git(seed, ['merge', '--no-ff', '-m', 'chore(graph): merge feature/shared-tracking', 'feature/shared-tracking'], { author: nextAuthor() });
    git(seed, ['merge', '--no-ff', '-m', 'chore(ci): merge chore/remote-ci-matrix', 'chore/remote-ci-matrix'], { author: nextAuthor() });
    write(seed, 'docs/remote-release-checklist.md', '# Remote release checklist\n');
    commit(seed, 'docs(core): add remote release checklist', { author: nextAuthor() });
    git(seed, ['tag', 'v2.0.0-remote']);
    git(seed, ['push', '-q', 'origin', 'main']);
    git(seed, ['push', '-q', 'origin', '--tags']);
    git(seed, ['push', '-q', 'upstream', 'main']);

    createRemoteFixtureBranch(seed, 'feature/upstream-review', sharedBase, [
        { file: 'src/graph/upstreamReview.ts', content: 'export const upstreamReview = true;\n', message: 'feat(graph): add upstream review branch' },
        { file: 'tests/graph/upstream-review.test.ts', content: 'export const upstreamReviewCovered = true;\n', message: 'test(graph): cover upstream review branch' },
    ]);
    git(seed, ['push', '-q', 'upstream', 'feature/upstream-review:feature/upstream-review']);
    createRemoteFixtureBranch(seed, 'release/upstream-sync', sharedBase, [
        { file: 'docs/upstream-sync.md', content: '# Upstream sync\n', message: 'docs(core): add upstream sync notes' },
        { file: 'src/core/upstreamSync.ts', content: 'export const upstreamSync = true;\n', message: 'feat(core): add upstream sync marker' },
    ]);
    git(seed, ['push', '-q', 'upstream', 'release/upstream-sync:release/upstream-sync']);

    fs.rmSync(target, { recursive: true, force: true });
    git(outputRoot, ['clone', '-q', origin, target]);
    configureRepo(target);
    git(target, ['remote', 'add', 'upstream', upstream]);
    git(target, ['fetch', '-q', '--all']);

    checkoutTrackingBranch(target, 'origin/feature/shared-tracking');
    checkoutTrackingBranch(target, 'origin/feature/diverged');
    write(target, 'src/graph/divergedLocal.ts', 'export const divergedLocal = true;\n');
    commit(target, 'fix(graph): add local diverged branch change', { author: nextAuthor() });

    checkoutTrackingBranch(target, 'origin/feat/local-ahead');
    write(target, 'src/changes/localAheadOne.ts', 'export const localAheadOne = true;\n');
    commit(target, 'feat(changes): add first local ahead change', { author: nextAuthor() });
    write(target, 'src/changes/localAheadTwo.ts', 'export const localAheadTwo = true;\n');
    commit(target, 'test(changes): cover local ahead branch', { author: nextAuthor() });

    checkoutTrackingBranch(target, 'origin/release/2.0');
    checkoutTrackingBranch(target, 'origin/hotfix/security-patch');
    checkoutTrackingBranch(target, 'origin/chore/remote-ci-matrix');

    git(seed, ['checkout', '-q', 'feature/diverged']);
    write(seed, 'src/graph/divergedOrigin.ts', 'export const divergedOrigin = true;\n');
    commit(seed, 'fix(graph): add origin diverged branch change', { author: nextAuthor() });
    git(seed, ['push', '-q', 'origin', 'feature/diverged']);

    git(seed, ['checkout', '-q', 'release/2.0']);
    write(seed, 'docs/remote-release-followup.md', '# Remote release follow-up\n');
    commit(seed, 'docs(core): add remote release follow-up', { author: nextAuthor() });
    git(seed, ['push', '-q', 'origin', 'release/2.0']);
    git(target, ['fetch', '-q', 'origin']);

    git(target, ['checkout', '-q', '-b', 'docs/local-only-runbook', 'main']);
    write(target, 'docs/local-runbook.md', '# Local runbook\n');
    commit(target, 'docs(core): add local-only runbook', { author: nextAuthor() });
    write(target, 'docs/local-checklist.md', '# Local checklist\n');
    commit(target, 'docs(core): add local-only checklist', { author: nextAuthor() });

    git(target, ['checkout', '-q', '-b', 'experiment/unpublished-graph', 'main']);
    write(target, 'experiments/unpublished-graph.md', '# Unpublished graph\n');
    commit(target, 'feat(graph): prototype unpublished graph branch', { author: nextAuthor() });
    write(target, 'experiments/unpublished-renderer.md', '# Unpublished renderer\n');
    commit(target, 'refactor(graph): tune unpublished renderer fixture', { author: nextAuthor() });

    git(target, ['checkout', '-q', 'main']);
    write(target, 'stash/remote-wip.txt', 'remote stash scratchpad\n');
    git(target, ['stash', 'push', '-u', '-m', 'wip(graph): stash remote fixture note', '--', 'stash/remote-wip.txt']);
    write(target, 'src/remote/staged-local.ts', 'export const remoteStaged = true;\n');
    git(target, ['add', 'src/remote/staged-local.ts']);
    write(target, 'README.md', '# Remote fixture\n\nLocal dirty README edit after fetching remotes.\n');
    write(target, 'notes/remote-local.md', 'Local remote scenario note.\n');
}

function setupRemoteOnly(target: string, outputRoot: string): void {
    const source = createRemoteStateSource(outputRoot, 'remote-only');

    initRepo(target);
    git(target, ['remote', 'add', 'origin', source.origin]);
    git(target, ['fetch', '-q', 'origin']);
    write(target, 'README.md', '# Remote-only local repository\n\nRemote refs exist, but HEAD has no commit yet.\n');
    git(target, ['add', 'README.md']);
    write(target, 'notes/remote-only-local.md', 'Local draft while only remote history exists.\n');
}

function setupRemoteUnavailable(target: string, outputRoot: string): void {
    const source = createRemoteStateSource(outputRoot, 'remote-unavailable');

    fs.rmSync(target, { recursive: true, force: true });
    git(outputRoot, ['clone', '-q', source.origin, target]);
    configureRepo(target);
    git(target, ['remote', 'set-url', 'origin', path.join(path.dirname(source.origin), 'missing-origin.git')]);
    write(target, 'src/local/rescue.ts', 'export const rescue = true;\n');
    commit(target, 'fix(core): add local rescue change', { author: nextAuthor() });
}

function setupUnpublishedBranch(target: string, outputRoot: string): void {
    const source = createRemoteStateSource(outputRoot, 'unpublished-branch');

    fs.rmSync(target, { recursive: true, force: true });
    git(outputRoot, ['clone', '-q', source.origin, target]);
    configureRepo(target);
    git(target, ['checkout', '-q', '-b', 'feature/not-published']);
    write(target, 'src/graph/notPublished.ts', 'export const notPublished = true;\n');
    commit(target, 'feat(graph): add unpublished branch surface', { author: nextAuthor() });
    write(target, 'tests/graph/not-published.test.ts', 'export const notPublishedCovered = true;\n');
    commit(target, 'test(graph): cover unpublished branch surface', { author: nextAuthor() });
    write(target, 'notes/not-published-local.md', 'Local note before publishing the branch.\n');
}

function setupSubmodules(target: string, outputRoot: string): void {
    const sourceRoot = path.join(outputRoot, '.submodule-sources');
    fs.rmSync(sourceRoot, { recursive: true, force: true });
    fs.mkdirSync(sourceRoot, { recursive: true });

    const moduleNames = ['auth-kit', 'billing-core', 'analytics-engine'];
    for (const moduleName of moduleNames) {
        setupSubmoduleSource(path.join(sourceRoot, moduleName), moduleName);
    }

    initRepo(target);
    write(target, 'README.md', '# Submodule fixture\n');
    commit(target, 'docs(submodules): add parent overview');

    for (const moduleName of moduleNames) {
        git(target, ['-c', 'protocol.file.allow=always', 'submodule', 'add', path.join(sourceRoot, moduleName), `modules/${moduleName}`]);
        commit(target, `feat(submodules): add ${moduleName} module`, { author: nextAuthor() });
    }

    write(target, 'src/parent-staged.ts', 'export const parentStaged = true;\n');
    git(target, ['add', 'src/parent-staged.ts']);
    write(target, 'src/parent-unstaged.ts', 'export const parentUnstaged = true;\n');
    write(target, 'stash/parent-wip.txt', 'parent stash\n');
    git(target, ['stash', 'push', '-u', '-m', 'wip(submodules): parent stash', '--', 'stash/parent-wip.txt']);

    for (const moduleName of moduleNames) {
        setupDirtySubmodule(path.join(target, 'modules', moduleName), moduleName);
    }
}

function setupWorktrees(target: string, outputRoot: string): void {
    const worktreeRoot = path.join(outputRoot, '.worktrees');
    fs.rmSync(worktreeRoot, { recursive: true, force: true });
    fs.mkdirSync(worktreeRoot, { recursive: true });

    initRepo(target);
    write(target, 'README.md', '# Worktree fixture\n\nLinked worktrees with clean, committed, and dirty states.\n');
    commit(target, 'docs(worktrees): add fixture overview');
    write(target, 'src/core/app.ts', 'export const app = "look-git";\n');
    commit(target, 'feat(core): add application shell');
    write(target, 'src/worktrees/registry.ts', 'export const registry = new Map<string, string>();\n');
    commit(target, 'feat(worktrees): add registry baseline');
    const sharedBase = git(target, ['rev-parse', 'HEAD']).trim();
    write(target, 'src/graph/main.ts', 'export const graph = "main";\n');
    commit(target, 'feat(graph): add main graph surface');
    write(target, 'src/changes/main.ts', 'export const changes = "main";\n');
    commit(target, 'feat(changes): add main changes surface');

    const cleanReview = addBranchWorktree(target, worktreeRoot, 'feature-review-clean', 'feature/review-clean', sharedBase);
    write(cleanReview, 'src/review/queue.ts', 'export const queue = ["pending", "approved"];\n');
    commit(cleanReview, 'feat(worktrees): add review queue', { author: nextAuthor() });
    write(cleanReview, 'tests/review-queue.test.ts', 'export const reviewQueueCovered = true;\n');
    commit(cleanReview, 'test(worktrees): cover review queue', { author: nextAuthor() });

    const releasePrep = addBranchWorktree(target, worktreeRoot, 'release-prep-clean', 'release/1.0-worktree', 'main');
    write(releasePrep, 'CHANGELOG.md', '# Changelog\n\n## 1.0.0\n\nWorktree fixture release.\n');
    commit(releasePrep, 'docs(release): add worktree release notes', { author: nextAuthor() });
    write(releasePrep, 'VERSION', '1.0.0-worktree\n');
    commit(releasePrep, 'chore(release): bump worktree fixture version', { author: nextAuthor() });

    const dirtyStatus = addBranchWorktree(target, worktreeRoot, 'fix-status-dirty', 'fix/status-worktree', sharedBase);
    write(dirtyStatus, 'src/status/model.ts', 'export const statusModel = "committed";\n');
    commit(dirtyStatus, 'fix(worktrees): add status model baseline', { author: nextAuthor() });
    write(dirtyStatus, 'src/status/staged.ts', 'export const stagedStatus = true;\n');
    git(dirtyStatus, ['add', 'src/status/staged.ts']);
    write(dirtyStatus, 'src/status/model.ts', 'export const statusModel = "dirty";\n');
    write(dirtyStatus, 'notes/status-local.md', 'Local status investigation.\n');
    write(dirtyStatus, 'stash/status-scratch.md', 'Temporary status scratchpad.\n');
    git(dirtyStatus, ['stash', 'push', '-u', '-m', 'wip(worktrees): stash status scratchpad', '--', 'stash/status-scratch.md']);

    const uncommittedDraft = addBranchWorktree(target, worktreeRoot, 'feature-uncommitted-draft', 'feat/uncommitted-worktree', sharedBase);
    write(uncommittedDraft, 'src/draft/staged.ts', 'export const stagedDraft = true;\n');
    git(uncommittedDraft, ['add', 'src/draft/staged.ts']);
    write(uncommittedDraft, 'src/draft/local.ts', 'export const localDraft = true;\n');
    write(uncommittedDraft, 'notes/draft-plan.md', 'Draft worktree plan.\n');

    const detachedAudit = addDetachedWorktree(target, worktreeRoot, 'detached-audit', sharedBase);
    write(detachedAudit, 'audit/staged-audit.md', '# Staged audit\n');
    git(detachedAudit, ['add', 'audit/staged-audit.md']);
    write(detachedAudit, 'audit/local-audit.md', '# Local audit\n');

    git(target, ['checkout', '-q', 'main']);
    write(target, 'src/main-staged.ts', 'export const mainStaged = true;\n');
    git(target, ['add', 'src/main-staged.ts']);
    write(target, 'src/main-local.ts', 'export const mainLocal = true;\n');
}

function setupSubmoduleSource(source: string, moduleName: string): void {
    initRepo(source);
    write(source, 'README.md', `# ${moduleName}\n`);
    commit(source, `docs(${moduleName}): add module readme`, { author: nextAuthor() });
    write(source, 'module.ts', `export const moduleName = "${moduleName}";\n`);
    commit(source, `feat(${moduleName}): add module entrypoint`, { author: nextAuthor() });
    write(source, 'conflict.txt', 'base\n');
    commit(source, `feat(${moduleName}): add conflict baseline`, { author: nextAuthor() });
}

function setupDirtySubmodule(submodulePath: string, moduleName: string): void {
    write(submodulePath, `stash-${moduleName}.txt`, `${moduleName} stash\n`);
    git(submodulePath, ['stash', 'push', '-u', '-m', `wip(${moduleName}): stash fixture work`, '--', `stash-${moduleName}.txt`]);
    git(submodulePath, ['checkout', '-q', '-b', `${moduleName}/incoming-conflict`]);
    write(submodulePath, 'conflict.txt', `${moduleName} incoming\n`);
    commit(submodulePath, `feat(${moduleName}): update incoming conflict side`, { author: nextAuthor() });
    git(submodulePath, ['checkout', '-q', 'main']);
    write(submodulePath, 'conflict.txt', `${moduleName} current\n`);
    commit(submodulePath, `feat(${moduleName}): update current conflict side`, { author: nextAuthor() });
    expectGitFailure(submodulePath, ['merge', `${moduleName}/incoming-conflict`]);
    write(submodulePath, `staged-${moduleName}.ts`, `export const staged = "${moduleName}";\n`);
    git(submodulePath, ['add', `staged-${moduleName}.ts`]);
    write(submodulePath, 'module.ts', `export const moduleName = "${moduleName}-dirty";\n`);
    write(submodulePath, `untracked-${moduleName}.md`, `${moduleName} untracked\n`);
}

function addBranchWorktree(parent: string, worktreeRoot: string, directoryName: string, branch: string, startPoint: string): string {
    const worktreePath = path.join(worktreeRoot, directoryName);
    git(parent, ['worktree', 'add', '-q', '-b', branch, worktreePath, startPoint]);
    return worktreePath;
}

function addDetachedWorktree(parent: string, worktreeRoot: string, directoryName: string, startPoint: string): string {
    const worktreePath = path.join(worktreeRoot, directoryName);
    git(parent, ['worktree', 'add', '-q', '--detach', worktreePath, startPoint]);
    return worktreePath;
}

function createRemoteFixtureBranch(
    cwd: string,
    branch: string,
    startPoint: string,
    commits: readonly { readonly file: string; readonly content: string; readonly message: string }[],
): void {
    git(cwd, ['checkout', '-q', '-B', branch, startPoint]);
    for (const change of commits) {
        write(cwd, change.file, change.content);
        commit(cwd, change.message, { author: nextAuthor() });
    }
}

function createRemoteStateSource(outputRoot: string, namespace: string): RemoteFixtureSource {
    const root = path.join(outputRoot, '.remote-state-sources', namespace);
    const origin = path.join(root, 'origin.git');
    const seed = path.join(root, 'seed');
    fs.rmSync(root, { recursive: true, force: true });
    fs.mkdirSync(root, { recursive: true });

    initBareRepo(origin);
    initRepo(seed);
    git(seed, ['remote', 'add', 'origin', origin]);
    write(seed, 'README.md', `# ${namespace} fixture\n\nFocused remote state repository.\n`);
    commit(seed, 'docs(core): add remote state overview', { author: nextAuthor() });
    write(seed, 'src/core/remoteState.ts', `export const remoteState = "${namespace}";\n`);
    commit(seed, 'feat(core): add remote state model', { author: nextAuthor() });
    write(seed, 'src/graph/remoteState.ts', 'export const graphRemoteState = true;\n');
    commit(seed, 'feat(graph): add remote state graph data', { author: nextAuthor() });
    const base = git(seed, ['rev-parse', 'HEAD']).trim();
    git(seed, ['push', '-q', 'origin', 'main']);

    createRemoteFixtureBranch(seed, 'feature/remote-review', base, [
        { file: 'src/review/remoteReview.ts', content: 'export const remoteReview = true;\n', message: 'feat(graph): add remote review branch' },
        { file: 'docs/remote-review.md', content: '# Remote review\n', message: 'docs(graph): document remote review branch' },
    ]);
    git(seed, ['push', '-q', 'origin', 'feature/remote-review:feature/remote-review']);

    createRemoteFixtureBranch(seed, 'release/remote-state', base, [
        { file: 'CHANGELOG.md', content: '# Changelog\n\n## Remote state\n', message: 'docs(core): add remote state release notes' },
        { file: 'VERSION', content: `${namespace}-fixture\n`, message: 'chore(core): bump remote state fixture version' },
    ]);
    git(seed, ['push', '-q', 'origin', 'release/remote-state:release/remote-state']);
    git(seed, ['checkout', '-q', 'main']);

    return { origin };
}

function checkoutTrackingBranch(cwd: string, remoteRef: string): void {
    git(cwd, ['checkout', '-q', '--track', remoteRef]);
}

function initBareRepo(cwd: string): void {
    fs.mkdirSync(cwd, { recursive: true });
    git(cwd, ['init', '--bare', '-q']);
    git(cwd, ['symbolic-ref', 'HEAD', 'refs/heads/main']);
    git(cwd, ['config', 'gc.auto', '0']);
    git(cwd, ['config', 'maintenance.auto', 'false']);
}

function initRepo(cwd: string): void {
    fs.mkdirSync(cwd, { recursive: true });
    git(cwd, ['init', '-q']);
    git(cwd, ['checkout', '-q', '-b', 'main']);
    configureRepo(cwd);
}

function configureRepo(cwd: string): void {
    git(cwd, ['config', 'user.name', 'Look Git Fixture']);
    git(cwd, ['config', 'user.email', 'fixture@example.com']);
    // Keep fixture file content byte-identical across OSes (Windows git defaults to autocrlf=true).
    git(cwd, ['config', 'core.autocrlf', 'false']);
    git(cwd, ['config', 'core.eol', 'lf']);
    git(cwd, ['config', 'gc.auto', '0']);
    git(cwd, ['config', 'maintenance.auto', 'false']);
}

function write(cwd: string, filePath: string, content: string): void {
    const fullPath = path.resolve(cwd, filePath);
    const relative = path.relative(cwd, fullPath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
        fail(`Refusing to write outside fixture: ${filePath}`);
    }
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
}

function commit(cwd: string, message: string, options: CommitOptions = {}): string {
    const author = options.author ?? nextAuthor();
    git(cwd, ['add', '-A']);
    git(cwd, ['commit', '-q', '-m', message], { author });
    return git(cwd, ['rev-parse', 'HEAD']).trim();
}

function git(cwd: string, args: readonly string[], options: CommitOptions = {}): string {
    const author = options.author ?? nextAuthor(false);
    const date = nextCommitDate();
    // Force LF on every command (including `clone`, which checks out before configureRepo runs) so
    // fixture content is byte-identical across OSes; Windows git otherwise defaults to autocrlf=true.
    // Allow operating on the bare origin/upstream repos even when the host sets
    // `safe.bareRepository=explicit` (a security default some environments inject).
    return execFileSync('git', ['-c', 'core.autocrlf=false', '-c', 'core.eol=lf', '-c', 'safe.bareRepository=all', ...args], {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
            ...process.env,
            GIT_AUTHOR_NAME: author.name,
            GIT_AUTHOR_EMAIL: author.email,
            GIT_AUTHOR_DATE: date,
            GIT_COMMITTER_NAME: author.name,
            GIT_COMMITTER_EMAIL: author.email,
            GIT_COMMITTER_DATE: date,
        },
    });
}

function expectGitFailure(cwd: string, args: readonly string[]): void {
    let failed = false;
    try {
        git(cwd, args);
    } catch (_error: unknown) {
        failed = true;
    }
    if (!failed) {
        fail(`Expected git ${args.join(' ')} to fail in ${cwd}`);
    }
}

function nextAuthor(advance = true): Author {
    const author = authors[commitIndex % authors.length];
    if (advance) {
        commitIndex++;
    }
    return author;
}

function nextCommitDate(): string {
    const timestamp = Date.UTC(2026, 4, 1, 9, 0, 0) + commitIndex * 60 * 60 * 1000;
    return new Date(timestamp).toISOString();
}

function fail(message: string): never {
    console.error(message);
    process.exit(1);
}
