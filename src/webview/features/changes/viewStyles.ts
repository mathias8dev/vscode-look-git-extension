import type { CSSProperties } from 'react';

export function depthStyle(depth: number): CSSProperties & { readonly '--depth': number } {
    return { '--depth': depth };
}
