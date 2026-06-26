import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SEMANTIC_GIT_OPERATIONS, isSemanticGitOperation } from '@application/ports/git-operation';

const STORIES_ROOT = path.resolve(process.cwd(), 'docs', 'architecture', 'stories', 'semantic-git-actions');
const STORIES_README = path.join(STORIES_ROOT, 'README.md');

describe('semantic git action stories', () => {
    it('covers every declared semantic git operation in story action lists', () => {
        const documentedOperations = semanticActionsFromReadme();

        expect(documentedOperations.filter((operation) => !isSemanticGitOperation(operation))).toEqual([]);
        expect([...documentedOperations].sort()).toEqual([...SEMANTIC_GIT_OPERATIONS].sort());
    });

    it('keeps story implementation links resolvable', () => {
        const missingLinks = implementationLinksFromReadme()
            .filter((link) => !fs.existsSync(path.join(STORIES_ROOT, link)));

        expect(missingLinks).toEqual([]);
    });

    it('keeps each semantic story anchored by actions and special cases', () => {
        const weakStories = storySections()
            .filter((section) => !hasSemanticActions(section.body) || specialCaseCount(section.body) < 3)
            .map((section) => section.title);

        expect(weakStories).toEqual([]);
    });
});

function semanticActionsFromReadme(): readonly string[] {
    const source = storiesReadme();
    return [...source.matchAll(/^Semantic actions: (.+)$/gm)]
        .flatMap((match) => [...operationLine(match).matchAll(/`([^`]+)`/g)])
        .map((operationMatch) => operationMatch[1])
        .filter((operation): operation is string => operation !== undefined);
}

function operationLine(match: RegExpMatchArray): string {
    return match[1] ?? '';
}

function implementationLinksFromReadme(): readonly string[] {
    const source = storiesReadme();
    return [...source.matchAll(/^Implementation: \[.+?\]\((.+?\.mermaid)\)$/gm)]
        .map((match) => match[1])
        .filter((link): link is string => link !== undefined);
}

function storySections(): readonly { readonly title: string; readonly body: string }[] {
    const source = storiesReadme();
    const chunks = source.split(/^## Story: /gm).slice(1);
    return chunks.map((chunk) => {
        const [title = '', ...bodyLines] = chunk.split('\n');
        return { title, body: bodyLines.join('\n') };
    });
}

function storiesReadme(): string {
    return fs.readFileSync(STORIES_README, 'utf8').replace(/\r\n/g, '\n');
}

function hasSemanticActions(body: string): boolean {
    return /^Semantic actions: .+$/m.test(body);
}

function specialCaseCount(body: string): number {
    const specialCases = body.split(/^Special cases:\n/m)[1];
    if (!specialCases) { return 0; }
    const listBeforeNextHeading = specialCases.split(/^## /m)[0] ?? '';
    return [...listBeforeNextHeading.matchAll(/^- /gm)].length;
}
