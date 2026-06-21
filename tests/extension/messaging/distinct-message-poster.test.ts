import { describe, expect, it } from 'vitest';
import { DistinctMessagePoster } from '@extension/messaging/distinct-message-poster';

describe('DistinctMessagePoster', () => {
    it('posts the first value and suppresses equal values for the same key', () => {
        const posted: string[] = [];
        const poster = new DistinctMessagePoster<string, { readonly value: number }>(
            (message) => { posted.push(message); },
            (previous, next) => previous.value === next.value,
        );

        expect(poster.postIfChanged('changes', { value: 1 }, 'first')).toBe(true);
        expect(poster.postIfChanged('changes', { value: 1 }, 'same')).toBe(false);

        expect(posted).toEqual(['first']);
    });

    it('tracks keys independently and can reset cached values', () => {
        const posted: string[] = [];
        const poster = new DistinctMessagePoster<string, { readonly value: number }>(
            (message) => { posted.push(message); },
            (previous, next) => previous.value === next.value,
        );

        poster.remember('graph:main', { value: 1 });
        expect(poster.postIfChanged('graph:main', { value: 1 }, 'main-same')).toBe(false);
        expect(poster.postIfChanged('graph:submodule', { value: 1 }, 'submodule-first')).toBe(true);

        poster.reset('graph:main');
        expect(poster.postIfChanged('graph:main', { value: 1 }, 'main-after-reset')).toBe(true);

        expect(posted).toEqual(['submodule-first', 'main-after-reset']);
    });

    it('can bound retained values', () => {
        const posted: string[] = [];
        const poster = new DistinctMessagePoster<string, { readonly value: number }>(
            (message) => { posted.push(message); },
            (previous, next) => previous.value === next.value,
            1,
        );

        poster.remember('first', { value: 1 });
        poster.remember('second', { value: 2 });

        expect(poster.postIfChanged('first', { value: 1 }, 'first-again')).toBe(true);
        expect(poster.postIfChanged('second', { value: 2 }, 'second-again')).toBe(true);
        expect(posted).toEqual(['first-again', 'second-again']);
    });
});
