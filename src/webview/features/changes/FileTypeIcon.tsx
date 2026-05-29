import type { FileIconKind } from './fileIconModel';

interface FileTypeIconProps {
    readonly kind: FileIconKind;
}

export function FileTypeIcon({ kind }: FileTypeIconProps) {
    return (
        <svg className={`file-type-icon file-type-${kind}`} viewBox="0 0 16 16" aria-hidden="true">
            {iconShape(kind)}
        </svg>
    );
}

function iconShape(kind: FileIconKind) {
    switch (kind) {
        case 'submodule':
            return (
                <>
                    <path d="M2.5 4.5h4l1 1h6v6.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 1.5 12V6A1.5 1.5 0 0 1 3 4.5" />
                    <path d="M5 8h6M5 10.5h4" />
                </>
            );
        case 'image':
            return (
                <>
                    <path d="M2.5 2.5h11v11h-11z" />
                    <path d="m4 11 2.2-2.5 1.6 1.8 1.9-2.7L12 11z" />
                    <circle cx="5.6" cy="5.5" r="1" />
                </>
            );
        case 'markdown':
            return (
                <>
                    <path d="M2.5 3.5h11v9h-11z" />
                    <path d="M4.5 10V6l1.7 2 1.7-2v4M10.3 6v4M8.8 8.7l1.5 1.5 1.5-1.5" />
                </>
            );
        case 'json':
            return (
                <>
                    <path d="M5.8 3.2C4.3 4.1 3.6 5.5 3.6 8s.7 3.9 2.2 4.8M10.2 3.2c1.5.9 2.2 2.3 2.2 4.8s-.7 3.9-2.2 4.8" />
                    <path d="M7.2 8h1.6" />
                </>
            );
        case 'package':
            return (
                <>
                    <path d="m8 2.3 5 2.8v5.8l-5 2.8-5-2.8V5.1z" />
                    <path d="M3.3 5.3 8 8l4.7-2.7M8 8v5.3" />
                </>
            );
        case 'git':
            return (
                <>
                    <path d="m8 2.2 5.8 5.8L8 13.8 2.2 8z" />
                    <path d="M6.1 6.1 9.9 9.9M6.1 6.1h2.4M9.9 9.9V7.5" />
                    <circle cx="6.1" cy="6.1" r=".7" />
                    <circle cx="9.9" cy="9.9" r=".7" />
                </>
            );
        case 'typescript':
        case 'javascript':
        case 'css':
        case 'html':
        case 'config':
        case 'file':
            return (
                <>
                    <path d="M4 1.8h5.5L13 5.3V14H4z" />
                    <path d="M9.5 1.8v3.5H13M6 8h4M6 10.5h3" />
                </>
            );
    }
}
