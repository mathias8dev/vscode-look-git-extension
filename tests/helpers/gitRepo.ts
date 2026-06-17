// Git test fixture helpers — no dependency on src/ so they work in all phases
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const RETRYABLE_RM_ERRORS = new Set(['EBUSY', 'ENOTEMPTY', 'EPERM', 'EACCES']);
const RM_MAX_ATTEMPTS = 10;

function sleepSync(ms: number): void {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

export function removeDirSyncWithRetry(dirPath: string): void {
    for (let attempt = 0; attempt < RM_MAX_ATTEMPTS; attempt++) {
        try {
            // maxRetries/retryDelay add native linear backoff for Windows file-lock errors
            // (EBUSY/EPERM/ENOTEMPTY) within a single call; the outer loop waits longer between
            // calls for a lingering git child-process handle on the temp repo to be released.
            fs.rmSync(dirPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
            return;
        } catch (error) {
            const code = (error as NodeJS.ErrnoException).code;
            if (!code || !RETRYABLE_RM_ERRORS.has(code)) { throw error; }
            if (attempt === RM_MAX_ATTEMPTS - 1) {
                // Best-effort teardown: a temp dir we cannot unlink (a stuck git handle on Windows)
                // must not fail an otherwise-passing test. The OS reclaims os.tmpdir() eventually.
                return;
            }
            sleepSync(100 * (attempt + 1));
        }
    }
}

export interface TempGitRepo {
    readonly cwd: string;
    git(args: string[], options?: { env?: Record<string, string> }): string;
    gitTrim(args: string[], options?: { env?: Record<string, string> }): string;
    write(filePath: string, content: string): void;
    writeBuffer(filePath: string, content: Buffer): void;
    mkdir(dirPath: string): void;
    commit(message: string): string;
    commitFile(filePath: string, content: string, message: string, author?: FixtureAuthor, date?: string): string;
    cleanup(): void;
}

export interface FixtureAuthor { name: string; email: string; }

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

function fixtureAuthorAt(index: number): FixtureAuthor {
    const author = FIXTURE_AUTHORS[index % FIXTURE_AUTHORS.length];
    if (!author) { throw new Error(`Missing fixture author at index ${index}.`); }
    return author;
}

/**
 * Normalise a path for cross-platform comparison: resolve symlinks and Windows 8.3 short names,
 * unify separators to '/', and lowercase the drive letter. Use when comparing a test-held path
 * against one produced by git (forward slashes) or VS Code (backslashes, lowercase drive), which
 * format the same location differently on Windows. A no-op on Linux.
 */
export function normalizePathForCompare(p: string): string {
    let resolved = p;
    try { resolved = fs.realpathSync.native(p); } catch { resolved = path.resolve(p); }
    return resolved.replace(/[\\/]+/g, '/').replace(/^([a-zA-Z]):/, (_match, drive: string) => `${drive.toLowerCase()}:`);
}

export function samePath(a: string, b: string): boolean {
    return normalizePathForCompare(a) === normalizePathForCompare(b);
}

export function createTempGitRepo(): TempGitRepo {
    // Pinned below to git's own canonical path so fixture paths compare equal to git output on every OS.
    let cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'look-git-test-'));

    const git = (args: string[], options?: { env?: Record<string, string> }) => execFileSync('git', args, {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        // Identity via env (not just `git config`) so commits run through `-C <submodule>` also have an
        // author/committer on hosts without a global git identity (e.g. CI runners).
        env: {
            ...process.env,
            GIT_AUTHOR_NAME: 'Test User', GIT_AUTHOR_EMAIL: 'test@example.com',
            GIT_COMMITTER_NAME: 'Test User', GIT_COMMITTER_EMAIL: 'test@example.com',
            GIT_AUTHOR_DATE: '2024-01-01T00:00:00Z', GIT_COMMITTER_DATE: '2024-01-01T00:00:00Z',
            ...options?.env,
        },
    });
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
        // Keep file content byte-identical across OSes (Windows git defaults to autocrlf=true).
        git(['config', 'core.autocrlf', 'false']);
        git(['config', 'core.eol', 'lf']);
        git(['config', 'gc.auto', '0']);
        git(['config', 'maintenance.auto', 'false']);
        // Pin cwd to git's canonical path (forward slashes, long names, resolved symlinks) so fixture
        // paths compare equal to git output cross-platform (macOS /private/var, Windows C:/.../long-name).
        cwd = gitTrim(['rev-parse', '--show-toplevel']);
    } catch (error) {
        removeDirSyncWithRetry(cwd);
        throw error;
    }

    return {
        cwd,
        git,
        gitTrim,
        write(filePath, content) {
            const fp = resolveInsideRepo(filePath);
            fs.mkdirSync(path.dirname(fp), { recursive: true });
            fs.writeFileSync(fp, content);
        },
        writeBuffer(filePath, content) {
            const fp = resolveInsideRepo(filePath);
            fs.mkdirSync(path.dirname(fp), { recursive: true });
            fs.writeFileSync(fp, content);
        },
        mkdir(dirPath) { fs.mkdirSync(resolveInsideRepo(dirPath), { recursive: true }); },
        commit(message) {
            git(['add', '-A']);
            git(['commit', '-q', '-m', message]);
            return gitTrim(['rev-parse', 'HEAD']);
        },
        commitFile(filePath, content, message, author = fixtureAuthorAt(0), date = '2024-01-01T00:00:00Z') {
            const fp = resolveInsideRepo(filePath);
            fs.mkdirSync(path.dirname(fp), { recursive: true });
            fs.writeFileSync(fp, content);
            git(['add', '-A']);
            git(['commit', '-q', '-m', message], {
                env: {
                    GIT_AUTHOR_NAME: author.name, GIT_AUTHOR_EMAIL: author.email, GIT_AUTHOR_DATE: date,
                    GIT_COMMITTER_NAME: author.name, GIT_COMMITTER_EMAIL: author.email, GIT_COMMITTER_DATE: date,
                },
            });
            return gitTrim(['rev-parse', 'HEAD']);
        },
        cleanup() { removeDirSyncWithRetry(cwd); },
    };
}

export function createBareGitRepo(): TempGitRepo {
    const cwd = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'look-git-bare-test-')));
    // `-c safe.bareRepository=all` lets git operate on this bare repo even when the host sets
    // `safe.bareRepository=explicit` (a security default some environments inject), which would
    // otherwise make every command here fail with "cannot use bare repository".
    const git = (args: string[], opts?: { env?: Record<string, string> }) => execFileSync('git', ['-c', 'safe.bareRepository=all', ...args], {
        cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, ...opts?.env },
    });
    git(['init', '--bare', '-q']);
    const noop = () => { throw new Error('Not available on bare repo'); };
    return {
        cwd, git, gitTrim: (args, o) => git(args, o).trim(),
        write: noop, writeBuffer: noop, mkdir: noop, commit: noop, commitFile: noop,
        cleanup() { removeDirSyncWithRetry(cwd); },
    };
}

export function createRichHistoryFixture(options: { commitCount?: number; dirty?: boolean } = {}): RichHistoryFixture {
    const commitCount = options.commitCount ?? 120;
    const repo = createTempGitRepo();
    const branches = ['feature/ui', 'feature/api', 'bugfix/status', 'docs/readme', 'experiment/graph', 'release/2024.01', 'hotfix/security'];

    repo.commitFile('src/root.txt', 'root\n', 'initial commit', FIXTURE_AUTHORS[0], '2024-01-01T00:00:00Z');
    repo.commitFile('src/core.ts', 'export const core = true;\n', 'add core module', FIXTURE_AUTHORS[1], '2024-01-02T00:00:00Z');

    for (const branch of branches) {
        repo.git(['checkout', '-q', 'main']);
        repo.git(['checkout', '-q', '-b', branch]);
        for (let i = 0; i < 4; i++) {
            const author = fixtureAuthorAt(i + branch.length);
            const day = String(3 + i + branches.indexOf(branch) * 4).padStart(2, '0');
            repo.commitFile(`${branch.replace(/\//g, '-')}/file-${i}.txt`, `${branch} change ${i}\n`, `${branch} change ${i}`, author, `2024-01-${day}T00:00:00Z`);
        }
    }

    repo.git(['checkout', '-q', 'main']);
    for (let i = 0; i < commitCount - 30; i++) {
        const author = fixtureAuthorAt(i);
        const day = String((i % 28) + 1).padStart(2, '0');
        repo.commitFile(`history/commit-${String(i).padStart(3, '0')}.txt`, `history ${i}\n`, `history commit ${i}`, author, `2024-02-${day}T00:00:00Z`);
    }

    repo.git(['tag', 'v1.0.0']);
    repo.git(['mv', 'src/core.ts', 'src/core-renamed.ts']);
    repo.commit('rename core module');
    repo.git(['rm', '-q', 'src/root.txt']);
    repo.commit('delete root text');

    if (options.dirty ?? true) { repo.write('src/dirty.txt', 'working tree edit\n'); }

    return { repo, branches: ['main', ...branches], authors: FIXTURE_AUTHORS, commitCount };
}

export function createLargeHistoryFixture(commitCount = 1000): TempGitRepo {
    const repo = createTempGitRepo();
    const stream: string[] = [];
    const baseTimestamp = Date.UTC(2024, 0, 1, 0, 0, 0) / 1000;

    const appendCommit = (index: number, filePath: string, content: string, message: string): void => {
        const author = fixtureAuthorAt(index);
        const timestamp = baseTimestamp + index * 60;
        const blobMark = index + 1;
        stream.push('blob', `mark :${blobMark}`, `data ${Buffer.byteLength(content, 'utf8')}`, content,
            'commit refs/heads/main',
            `author ${author.name} <${author.email}> ${timestamp} +0000`,
            `committer ${author.name} <${author.email}> ${timestamp} +0000`,
            `data ${Buffer.byteLength(message, 'utf8')}`, message,
            `M 100644 :${blobMark} ${filePath}`, '');
    };

    appendCommit(0, 'large/root.txt', 'root\n', 'large root');
    for (let i = 1; i < commitCount; i++) {
        appendCommit(i, 'large/history.txt', `large history ${i}\n`, `large commit ${i}`);
    }

    execFileSync('git', ['fast-import', '--quiet'], { cwd: repo.cwd, input: stream.join('\n'), encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    repo.git(['reset', '--hard', 'main']);
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

    return { local, remote, remotePath: remote.cwd, seed, cleanup() { local.cleanup(); remote.cleanup(); seed.cleanup(); } };
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

export function createStashPopBlockedByLocalChangesFixture(): TempGitRepo {
    const repo = createTempGitRepo();
    repo.commitFile('src/app.ts', 'base\n', 'base', FIXTURE_AUTHORS[0], '2024-01-01T00:00:00Z');
    repo.write('src/app.ts', 'stashed\n');
    repo.git(['stash', 'push', '-m', 'stash change', '--', 'src/app.ts']);
    repo.write('src/app.ts', 'local unstaged\n');
    return repo;
}

export function addLinkedWorktree(sourceRepo: TempGitRepo, branch: string): { worktreePath: string; cleanup: () => void } {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'look-git-wt-'));
    sourceRepo.git(['worktree', 'add', '-q', '-b', branch, tempDir]);
    // Use git's canonical form so this path matches git's worktree-list output cross-platform.
    const worktreePath = sourceRepo.gitTrim(['-C', tempDir, 'rev-parse', '--show-toplevel']);
    return {
        worktreePath,
        cleanup() {
            try { sourceRepo.git(['worktree', 'remove', '--force', worktreePath]); } catch { /* ignore */ }
            removeDirSyncWithRetry(worktreePath);
        },
    };
}

export function createSubmoduleFixture(): { parent: TempGitRepo; subPath: string; cleanup: () => void } {
    const child = createTempGitRepo();
    child.write('child.txt', 'child content\n');
    child.commit('init child');

    const parent = createTempGitRepo();
    parent.write('root.txt', 'root\n');
    parent.commit('init parent');
    parent.git(['-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', child.cwd, 'modules/child']);
    parent.git(['commit', '-q', '-m', 'add submodule']);

    return { parent, subPath: 'modules/child', cleanup() { child.cleanup(); parent.cleanup(); } };
}
