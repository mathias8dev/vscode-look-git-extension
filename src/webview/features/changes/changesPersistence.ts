import type { ChangeSectionId } from './changeTree';
import type { ChangesSortMode, ChangesState, ChangesStatePreferences, ChangesViewMode } from './changesState';

interface PersistedChangesWebviewState {
    readonly viewMode?: unknown;
    readonly sortMode?: unknown;
    readonly pathFilter?: unknown;
    readonly collapsedSectionIds?: unknown;
    readonly commitMessageHistory?: unknown;
}

const VIEW_MODES: ReadonlySet<ChangesViewMode> = new Set(['tree', 'list']);
const SORT_MODES: ReadonlySet<ChangesSortMode> = new Set(['path', 'status', 'directory']);
const SECTION_IDS: ReadonlySet<ChangeSectionId> = new Set(['conflicts', 'staged', 'unstaged']);

export function readChangesStatePreferences(value: unknown): ChangesStatePreferences {
    if (!isRecord(value)) { return {}; }
    const persisted = value as PersistedChangesWebviewState;
    return {
        viewMode: isStringInSet(persisted.viewMode, VIEW_MODES) ? persisted.viewMode : undefined,
        sortMode: isStringInSet(persisted.sortMode, SORT_MODES) ? persisted.sortMode : undefined,
        pathFilter: typeof persisted.pathFilter === 'string' ? persisted.pathFilter : undefined,
        collapsedSectionIds: stringArrayInSet(persisted.collapsedSectionIds, SECTION_IDS),
        commitMessageHistory: stringArray(persisted.commitMessageHistory),
    };
}

export function changesStateToPersisted(state: ChangesState): ChangesStatePreferences {
    return {
        viewMode: state.viewMode,
        sortMode: state.sortMode,
        pathFilter: state.pathFilter,
        collapsedSectionIds: state.collapsedSectionIds,
        commitMessageHistory: state.commitMessageHistory,
    };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function isStringInSet<TValue extends string>(value: unknown, values: ReadonlySet<TValue>): value is TValue {
    return typeof value === 'string' && values.has(value as TValue);
}

function stringArray(value: unknown): readonly string[] | undefined {
    return Array.isArray(value) && value.every((entry) => typeof entry === 'string') ? value : undefined;
}

function stringArrayInSet<TValue extends string>(
    value: unknown,
    values: ReadonlySet<TValue>,
): readonly TValue[] | undefined {
    if (!Array.isArray(value)) { return undefined; }
    const result = value.filter((entry): entry is TValue => isStringInSet(entry, values));
    return result.length === value.length ? result : undefined;
}
