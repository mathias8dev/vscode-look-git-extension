import { createRequire } from 'node:module';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('icon gallery', () => {
    it('indexes file icons by their resolved extensions', () => {
        const require = createRequire(import.meta.url);
        const loaded: unknown = require(path.join(process.cwd(), 'scripts', 'generate-icon-gallery.js'));
        if (!isIconGalleryModule(loaded)) { throw new Error('Invalid icon gallery module.'); }
        const entries = loaded.collectFileTypeIcons();

        expect(extensionsFor(entries, 'file-type-typescript-official')).toContain('.ts');
        expect(extensionsFor(entries, 'file-type-typescript-official')).toContain('.mts');
        expect(extensionsFor(entries, 'file-type-typescriptdef-official')).toContain('.d.ts');
        expect(extensionsFor(entries, 'file-type-reactts')).toContain('.tsx');
        expect(extensionsFor(entries, 'file-type-graphql')).toContain('.gql');
        expect(extensionsFor(entries, 'file-type-graphql')).toContain('.graphql');
        expect(extensionsFor(entries, 'file-type-kotlin')).toContain('.kts');
    });
});

interface IconGalleryEntry {
    readonly kind: string;
    readonly matches: readonly string[];
}

interface IconGalleryModule {
    readonly collectFileTypeIcons: () => readonly IconGalleryEntry[];
}

function isIconGalleryModule(value: unknown): value is IconGalleryModule {
    return typeof value === 'object'
        && value !== null
        && typeof Reflect.get(value, 'collectFileTypeIcons') === 'function';
}

function extensionsFor(entries: readonly IconGalleryEntry[], iconName: string): readonly string[] {
    const entry = entries.find((candidate) => candidate.kind === iconName);
    if (!entry) { throw new Error(`Missing ${iconName} icon.`); }
    return entry.matches;
}
