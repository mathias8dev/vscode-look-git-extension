import * as path from 'node:path';
import { createTempGitRepo } from '@tests/helpers/git-repo';
import { RuntimeGitRepository } from '@extension/git/runtime-git-repository';

export function createComparisonFixture() {
    const repo = createTempGitRepo();
    repo.write('src/original.ts', 'export const original = true;\n');
    repo.write('src/edited.ts', 'before\n');
    repo.write('src/deleted.ts', 'delete me\n');
    const ancestor = repo.commit('Initial files');
    repo.commitFile('base-only.ts', 'main\n', 'Base-only change');
    repo.git(['checkout', '-q', '-b', 'feature', ancestor]);
    repo.git(['mv', 'src/original.ts', 'src/renamed.ts']);
    repo.git(['rm', '-q', 'src/deleted.ts']);
    repo.write('src/edited.ts', 'after\nsecond\n');
    repo.write('src/新しい file.ts', 'unicode\n');
    repo.writeBuffer('image.bin', Buffer.from([0, 1, 2, 0, 255]));
    const feature = repo.commit('Feature changes\n\nFull commit body for review.');
    repo.git(['checkout', '-q', 'main']);
    const repository = new RuntimeGitRepository({ repoId: repo.cwd, cwd: repo.cwd, gitDir: path.join(repo.cwd, '.git'), kind: 'main', label: 'Comparison fixture' });
    return { repo, repository, ancestor, feature };
}
