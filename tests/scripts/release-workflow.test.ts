import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('release workflow', () => {
    const workflow = fs.readFileSync(path.join(process.cwd(), '.github', 'workflows', 'ci.yml'), 'utf8');

    it('publishes only commits associated with a merged release pull request', () => {
        expect(workflow).toContain("github.event_name == 'push' && github.ref_name == github.event.repository.default_branch");
        expect(workflow).toContain('github.rest.repos.listPullRequestsAssociatedWithCommit');
        expect(workflow).toContain('merged_at !== null');
        expect(workflow).toContain('base.ref === repository.default_branch');
        expect(workflow).toContain("head.repo?.full_name === repository.full_name");
        expect(workflow).toContain("head.ref.startsWith('release/')");
    });

    it('guards packaging and release creation with release pull request eligibility', () => {
        const eligibilityGuard = "steps.release_pr.outputs.eligible == 'true'";

        expect(workflow).toMatch(new RegExp(`- name: Package VSIX\\n\\s+if: ${eligibilityGuard.replaceAll('.', '\\.')}`));
        expect(workflow).toMatch(new RegExp(`- name: Create tag and GitHub release\\n\\s+if: ${eligibilityGuard.replaceAll('.', '\\.')}`));
    });
});
