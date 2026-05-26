import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { GitService } from '../../src/gitService';

export interface TempGitRepo {
    cwd: string;
    service: GitService;
    git(args: string[], options?: { env?: Record<string, string> }): string;
    gitTrim(args: string[], options?: { env?: Record<string, string> }): string;
    write(filePath: string, content: string): void;
    writeBuffer(filePath: string, content: Buffer): void;
    mkdir(dirPath: string): void;
    commit(message: string): string;
    commitFile(filePath: string, content: string, message: string, author?: FixtureAuthor, date?: string): string;
    cleanup(): void;
}

export interface FixtureAuthor {
    name: string;
    email: string;
}

export interface RichHistoryFixture {
    repo: TempGitRepo;
    branches: string[];
    authors: FixtureAuthor[];
    commitCount: number;
}

export interface RemoteWorkflowFixture {
    local: TempGitRepo;
    remote: TempGitRepo;
    remotePath: string;
    seed: TempGitRepo;
    cleanup(): void;
}

export const FIXTURE_AUTHORS: FixtureAuthor[] = [
    { name: 'Alice Example', email: 'alice@example.com' },
    { name: 'Bob Example', email: 'bob@example.com' },
    { name: 'Chloe Example', email: 'chloe@example.com' },
    { name: 'Dana Example', email: 'dana@example.com' },
    { name: 'Erin Example', email: 'erin@example.com' },
    { name: 'Frank Example', email: 'frank@example.com' },
    { name: 'Grace Example', email: 'grace@example.com' },
    { name: 'Hana Example', email: 'hana@example.com' },
    { name: 'Ivan Example', email: 'ivan@example.com' },
    { name: 'Jules Example', email: 'jules@example.com' },
    { name: 'Kai Example', email: 'kai@example.com' },
];

export function createTempGitRepo(): TempGitRepo {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'look-git-test-'));

    const git = (args: string[], options?: { env?: Record<string, string> }) => execFileSync(
        'git',
        args,
        {
            cwd,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
            env: {
                ...process.env,
                GIT_AUTHOR_DATE: '2024-01-01T00:00:00Z',
                GIT_COMMITTER_DATE: '2024-01-01T00:00:00Z',
                ...options?.env,
            },
        }
    );
    const gitTrim = (args: string[], options?: { env?: Record<string, string> }) => git(args, options).trim();

    const resolveInsideRepo = (relativePath: string): string => {
        const fullPath = path.resolve(cwd, relativePath);
        const relative = path.relative(cwd, fullPath);
        if (relative.startsWith('..') || path.isAbsolute(relative)) {
            throw new Error(`Test path escapes temp repository: ${relativePath}`);
        }
        return fullPath;
    };

    try {
        git(['init', '-q']);
        git(['checkout', '-q', '-b', 'main']);
        git(['config', 'user.email', 'test@example.com']);
        git(['config', 'user.name', 'Test User']);
        git(['config', 'gc.auto', '0']);
        git(['config', 'maintenance.auto', 'false']);
    } catch (error) {
        fs.rmSync(cwd, { recursive: true, force: true });
        throw error;
    }

    return {
        cwd,
        service: new GitService(cwd),
        git,
        gitTrim,
        write(filePath: string, content: string) {
            const fullPath = resolveInsideRepo(filePath);
            fs.mkdirSync(path.dirname(fullPath), { recursive: true });
            fs.writeFileSync(fullPath, content);
        },
        writeBuffer(filePath: string, content: Buffer) {
            const fullPath = resolveInsideRepo(filePath);
            fs.mkdirSync(path.dirname(fullPath), { recursive: true });
            fs.writeFileSync(fullPath, content);
        },
        mkdir(dirPath: string) {
            fs.mkdirSync(resolveInsideRepo(dirPath), { recursive: true });
        },
        commit(message: string) {
            git(['add', '-A']);
            git(['commit', '-q', '-m', message]);
            return gitTrim(['rev-parse', 'HEAD']);
        },
        commitFile(filePath: string, content: string, message: string, author = FIXTURE_AUTHORS[0], date = '2024-01-01T00:00:00Z') {
            const fullPath = resolveInsideRepo(filePath);
            fs.mkdirSync(path.dirname(fullPath), { recursive: true });
            fs.writeFileSync(fullPath, content);
            git(['add', '-A']);
            git(['commit', '-q', '-m', message], {
                env: {
                    GIT_AUTHOR_NAME: author.name,
                    GIT_AUTHOR_EMAIL: author.email,
                    GIT_AUTHOR_DATE: date,
                    GIT_COMMITTER_NAME: author.name,
                    GIT_COMMITTER_EMAIL: author.email,
                    GIT_COMMITTER_DATE: date,
                },
            });
            return gitTrim(['rev-parse', 'HEAD']);
        },
        cleanup() {
            fs.rmSync(cwd, { recursive: true, force: true });
        },
    };
}

export function createBareGitRepo(): TempGitRepo {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'look-git-bare-test-'));
    const git = (args: string[], options?: { env?: Record<string, string> }) => execFileSync(
        'git',
        args,
        {
            cwd,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
            env: { ...process.env, ...options?.env },
        }
    );
    git(['init', '--bare', '-q']);
    return {
        cwd,
        service: new GitService(cwd),
        git,
        gitTrim: (args, options) => git(args, options).trim(),
        write() {
            throw new Error('Cannot write working-tree files in a bare fixture repository.');
        },
        writeBuffer() {
            throw new Error('Cannot write working-tree files in a bare fixture repository.');
        },
        mkdir() {
            throw new Error('Cannot create working-tree directories in a bare fixture repository.');
        },
        commit() {
            throw new Error('Cannot commit working-tree files in a bare fixture repository.');
        },
        commitFile() {
            throw new Error('Cannot commit working-tree files in a bare fixture repository.');
        },
        cleanup() {
            fs.rmSync(cwd, { recursive: true, force: true });
        },
    };
}

export function createRichHistoryFixture(options: { commitCount?: number; dirty?: boolean } = {}): RichHistoryFixture {
    const commitCount = options.commitCount ?? 120;
    const repo = createTempGitRepo();
    const branches = [
        'feature/ui',
        'feature/api',
        'bugfix/status',
        'docs/readme',
        'experiment/graph',
        'release/2024.01',
        'hotfix/security',
    ];

    repo.commitFile('src/root.txt', 'root\n', 'initial commit', FIXTURE_AUTHORS[0], '2024-01-01T00:00:00Z');
    repo.commitFile('src/core.ts', 'export const core = true;\n', 'add core module', FIXTURE_AUTHORS[1], '2024-01-02T00:00:00Z');

    for (const branch of branches) {
        repo.git(['checkout', '-q', 'main']);
        repo.git(['checkout', '-q', '-b', branch]);
        for (let i = 0; i < 4; i++) {
            const author = FIXTURE_AUTHORS[(i + branch.length) % FIXTURE_AUTHORS.length];
            const day = String(3 + i + branches.indexOf(branch) * 4).padStart(2, '0');
            repo.commitFile(
                `${branch.replace(/\//g, '-')}/file-${i}.txt`,
                `${branch} change ${i}\n`,
                `${branch} change ${i}`,
                author,
                `2024-01-${day}T00:00:00Z`,
            );
        }
    }

    repo.git(['checkout', '-q', 'main']);
    for (let i = 0; i < commitCount - 30; i++) {
        const author = FIXTURE_AUTHORS[i % FIXTURE_AUTHORS.length];
        const day = String((i % 28) + 1).padStart(2, '0');
        repo.commitFile(
            `history/commit-${String(i).padStart(3, '0')}.txt`,
            `history ${i}\n`,
            `history commit ${i}`,
            author,
            `2024-02-${day}T00:00:00Z`,
        );
    }

    repo.git(['tag', 'v1.0.0']);
    repo.git(['tag', 'fixture-rich-history']);
    repo.git(['mv', 'src/core.ts', 'src/core-renamed.ts']);
    repo.commit('rename core module');
    repo.git(['rm', '-q', 'src/root.txt']);
    repo.commit('delete root text');

    if (options.dirty ?? true) {
        repo.write('src/dirty.txt', 'working tree edit\n');
    }

    return { repo, branches: ['main', ...branches], authors: FIXTURE_AUTHORS, commitCount };
}

export function createLargeHistoryFixture(commitCount = 1000): TempGitRepo {
    const repo = createTempGitRepo();
    repo.commitFile('large/root.txt', 'root\n', 'large root', FIXTURE_AUTHORS[0], '2024-01-01T00:00:00Z');
    let history = 'root\n';
    for (let i = 1; i < commitCount; i++) {
        const author = FIXTURE_AUTHORS[i % FIXTURE_AUTHORS.length];
        const day = String((i % 28) + 1).padStart(2, '0');
        history += `large history ${i}\n`;
        repo.commitFile(
            'large/history.txt',
            history,
            `large commit ${i}`,
            author,
            `2024-03-${day}T00:00:00Z`,
        );
    }
    return repo;
}

export function createRemoteWorkflowFixture(): RemoteWorkflowFixture {
    const seed = createTempGitRepo();
    seed.commitFile('remote.txt', 'base\n', 'remote base', FIXTURE_AUTHORS[0], '2024-01-01T00:00:00Z');
    seed.git(['checkout', '-q', '-b', 'feature/nested']);
    seed.commitFile('feature.txt', 'feature\n', 'remote feature', FIXTURE_AUTHORS[1], '2024-01-02T00:00:00Z');
    seed.git(['checkout', '-q', 'main']);

    const remote = createBareGitRepo();
    seed.git(['remote', 'add', 'origin', remote.cwd]);
    seed.git(['push', '-q', '--all', 'origin']);

    const local = createTempGitRepo();
    local.git(['remote', 'add', 'origin', remote.cwd]);
    local.git(['fetch', 'origin']);
    local.git(['reset', '--hard', 'origin/main']);
    local.git(['branch', '--set-upstream-to=origin/main', 'main']);
    local.git(['checkout', '-q', '-b', 'local-only']);
    local.commitFile('local.txt', 'local only\n', 'local only commit', FIXTURE_AUTHORS[2], '2024-01-03T00:00:00Z');
    local.git(['checkout', '-q', 'main']);

    return {
        local,
        remote,
        remotePath: remote.cwd,
        seed,
        cleanup() {
            local.cleanup();
            remote.cleanup();
            seed.cleanup();
        },
    };
}

export function createConflictWorkflowFixture(): TempGitRepo {
    const repo = createTempGitRepo();
    repo.commitFile('conflict.txt', 'base\n', 'base', FIXTURE_AUTHORS[0], '2024-01-01T00:00:00Z');
    repo.git(['checkout', '-q', '-b', 'incoming']);
    repo.commitFile('conflict.txt', 'incoming\n', 'incoming change', FIXTURE_AUTHORS[1], '2024-01-02T00:00:00Z');
    repo.git(['checkout', '-q', 'main']);
    repo.commitFile('conflict.txt', 'current\n', 'current change', FIXTURE_AUTHORS[2], '2024-01-03T00:00:00Z');
    return repo;
}

export function createEdgeFilesFixture(): TempGitRepo {
    const repo = createTempGitRepo();
    repo.commitFile('unicode/é space.txt', 'unicode\n', 'add unicode path', FIXTURE_AUTHORS[0], '2024-01-01T00:00:00Z');
    repo.commitFile('special/hash#query?.txt', 'special\n', 'add special path', FIXTURE_AUTHORS[1], '2024-01-02T00:00:00Z');
    repo.write('crlf.txt', 'a\r\nb\r\n');
    repo.writeBuffer('binary.bin', Buffer.from([0, 1, 2, 3, 255]));
    repo.git(['add', '-A']);
    repo.git(['commit', '-q', '-m', 'add crlf and binary']);
    return repo;
}
