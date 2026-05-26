import * as path from 'path';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import { runTests } from '@vscode/test-electron';

interface FixtureRepo {
    cwd: string;
    cleanup(): void;
}

function git(cwd: string, args: string[], env: Record<string, string> = {}): string {
    return execFileSync('git', args, {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
            ...process.env,
            GIT_AUTHOR_DATE: '2024-01-01T00:00:00Z',
            GIT_COMMITTER_DATE: '2024-01-01T00:00:00Z',
            ...env,
        },
    }).trim();
}

function commitFile(
    cwd: string,
    filePath: string,
    content: string,
    message: string,
    authorName: string,
    authorEmail: string,
    date: string,
): void {
    const fullPath = path.join(cwd, filePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
    git(cwd, ['add', '-A']);
    git(cwd, ['commit', '-q', '-m', message], {
        GIT_AUTHOR_NAME: authorName,
        GIT_AUTHOR_EMAIL: authorEmail,
        GIT_AUTHOR_DATE: date,
        GIT_COMMITTER_NAME: authorName,
        GIT_COMMITTER_EMAIL: authorEmail,
        GIT_COMMITTER_DATE: date,
    });
}

function createFixtureRepo(): FixtureRepo {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'look-git-integration-'));
    try {
        git(cwd, ['init', '-q']);
        git(cwd, ['checkout', '-q', '-b', 'main']);
        git(cwd, ['config', 'user.email', 'integration@example.com']);
        git(cwd, ['config', 'user.name', 'Integration User']);

        commitFile(
            cwd,
            'src/file.txt',
            'initial\n',
            'initial commit',
            'Alice Example',
            'alice@example.com',
            '2024-01-01T00:00:00Z',
        );
        commitFile(
            cwd,
            'src/core.ts',
            'export const core = true;\n',
            'add core module',
            'Bob Example',
            'bob@example.com',
            '2024-01-02T00:00:00Z',
        );
        commitFile(
            cwd,
            'README.md',
            '# Look Git fixture\n\nIntegration history.\n',
            'document fixture project',
            'Frank Example',
            'frank@example.com',
            '2024-01-03T00:00:00Z',
        );
        commitFile(
            cwd,
            'src/config.ts',
            'export const pageSize = 50;\n',
            'add config module',
            'Grace Example',
            'grace@example.com',
            '2024-01-04T00:00:00Z',
        );

        git(cwd, ['checkout', '-q', '-b', 'feature/ui']);
        commitFile(
            cwd,
            'src/ui.ts',
            'export const ui = "feature";\n',
            'add ui branch work',
            'Chloe Example',
            'chloe@example.com',
            '2024-01-05T00:00:00Z',
        );
        commitFile(
            cwd,
            'src/ui/theme.ts',
            'export const theme = "dark";\n',
            'add ui theme',
            'Hana Example',
            'hana@example.com',
            '2024-01-06T00:00:00Z',
        );
        commitFile(
            cwd,
            'src/ui/actions.ts',
            'export const actions = ["stage", "discard"];\n',
            'wire ui actions',
            'Chloe Example',
            'chloe@example.com',
            '2024-01-07T00:00:00Z',
        );

        git(cwd, ['checkout', '-q', 'main']);
        git(cwd, ['checkout', '-q', '-b', 'feature/api']);
        commitFile(
            cwd,
            'src/api.ts',
            'export const api = "feature";\n',
            'add api branch work',
            'Dana Example',
            'dana@example.com',
            '2024-01-08T00:00:00Z',
        );
        commitFile(
            cwd,
            'src/api/routes.ts',
            'export const routes = ["/status"];\n',
            'add api routes',
            'Ivan Example',
            'ivan@example.com',
            '2024-01-09T00:00:00Z',
        );
        commitFile(
            cwd,
            'src/api/client.ts',
            'export const client = "git";\n',
            'add api client',
            'Dana Example',
            'dana@example.com',
            '2024-01-10T00:00:00Z',
        );

        git(cwd, ['checkout', '-q', 'main']);
        commitFile(
            cwd,
            'src/file.txt',
            'initial\nmain change\n',
            'update main file',
            'Erin Example',
            'erin@example.com',
            '2024-01-11T00:00:00Z',
        );
        commitFile(
            cwd,
            'src/history.ts',
            'export const history = true;\n',
            'add history module',
            'Jules Example',
            'jules@example.com',
            '2024-01-12T00:00:00Z',
        );

        git(cwd, ['checkout', '-q', '-b', 'bugfix/status']);
        commitFile(
            cwd,
            'src/status.ts',
            'export const status = "clean";\n',
            'add status parser',
            'Kai Example',
            'kai@example.com',
            '2024-01-13T00:00:00Z',
        );
        commitFile(
            cwd,
            'src/status.ts',
            'export const status = "dirty";\n',
            'handle dirty status',
            'Alice Example',
            'alice@example.com',
            '2024-01-14T00:00:00Z',
        );

        git(cwd, ['checkout', '-q', 'main']);
        git(cwd, ['checkout', '-q', '-b', 'docs/readme']);
        commitFile(
            cwd,
            'docs/usage.md',
            '# Usage\n\nOpen the Look Git view.\n',
            'add usage docs',
            'Frank Example',
            'frank@example.com',
            '2024-01-15T00:00:00Z',
        );
        commitFile(
            cwd,
            'docs/testing.md',
            '# Testing\n\nRun npm run test:all.\n',
            'document testing flow',
            'Grace Example',
            'grace@example.com',
            '2024-01-16T00:00:00Z',
        );

        git(cwd, ['checkout', '-q', 'main']);
        git(cwd, ['checkout', '-q', '-b', 'experiment/graph']);
        commitFile(
            cwd,
            'src/graph/model.ts',
            'export const graphModel = true;\n',
            'add graph model',
            'Hana Example',
            'hana@example.com',
            '2024-01-17T00:00:00Z',
        );
        commitFile(
            cwd,
            'src/graph/render.ts',
            'export const renderGraph = true;\n',
            'add graph renderer',
            'Ivan Example',
            'ivan@example.com',
            '2024-01-18T00:00:00Z',
        );
        commitFile(
            cwd,
            'src/graph/filter.ts',
            'export const filterGraph = true;\n',
            'add graph filters',
            'Jules Example',
            'jules@example.com',
            '2024-01-19T00:00:00Z',
        );

        git(cwd, ['checkout', '-q', 'main']);
        commitFile(
            cwd,
            'CHANGELOG.md',
            '# Changelog\n\n- Fixture expanded.\n',
            'add changelog',
            'Kai Example',
            'kai@example.com',
            '2024-01-20T00:00:00Z',
        );

        fs.writeFileSync(path.join(cwd, 'src', 'file.txt'), 'initial\nmain change\nworking tree edit\n');
    } catch (error) {
        fs.rmSync(cwd, { recursive: true, force: true });
        throw error;
    }
    return {
        cwd,
        cleanup() {
            fs.rmSync(cwd, { recursive: true, force: true });
        },
    };
}

async function main(): Promise<void> {
    const extensionDevelopmentPath = path.resolve(__dirname, '../../../..');
    const extensionTestsPath = path.resolve(__dirname, 'suite');
    const fixtureRepo = createFixtureRepo();

    delete process.env.ELECTRON_RUN_AS_NODE;
    for (const key of Object.keys(process.env)) {
        if (key.startsWith('VSCODE_')) {
            delete process.env[key];
        }
    }

    try {
        await runTests({
            version: '1.85.2',
            extensionDevelopmentPath,
            extensionTestsPath,
            extensionTestsEnv: {
                LOOK_GIT_INTEGRATION_REPO: fixtureRepo.cwd,
            },
            launchArgs: [
                fixtureRepo.cwd,
                '--disable-workspace-trust',
                '--skip-welcome',
                '--skip-release-notes',
            ],
        });
    } finally {
        fixtureRepo.cleanup();
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
