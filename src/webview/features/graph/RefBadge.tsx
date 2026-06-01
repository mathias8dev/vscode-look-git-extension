import type { ParsedRef } from './refModel';

interface RefBadgeProps {
    readonly parsed: ParsedRef;
    readonly onDoubleClick?: () => void;
}

export function RefBadge({ parsed, onDoubleClick }: RefBadgeProps) {
    return (
        <span
            className={`ref-badge ref-badge-${parsed.kind}`}
            title={parsed.fullRef}
            onDoubleClick={onDoubleClick}
        >
            {parsed.label}
        </span>
    );
}
