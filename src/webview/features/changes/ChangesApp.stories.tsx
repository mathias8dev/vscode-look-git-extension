import type { Meta, StoryObj } from '@storybook/react-vite';
import { ConflictState, RepositoryState, type StatusData } from '../../../protocol/changes/types';
import { OperationNoticeActionKind, OperationStatus } from '../../../protocol/shared/operation';
import {
    changedFiles,
    conflictFiles,
    noop,
    stagedFiles,
    stashEntries,
    stashFiles,
    submodules,
    submoduleStatusData,
} from '../../storybookFixtures';
import { ChangeSectionId } from './changeTree';
import { ChangesApp } from './ChangesApp';
import { ChangesSortMode, ChangesViewMode, createInitialChangesState, submoduleStashKey, type ChangesState } from './changesState';

const status = {
    repositoryState: RepositoryState.Available,
    currentBranch: 'feature/storybook',
    staged: stagedFiles,
    unstaged: changedFiles,
    conflicts: conflictFiles,
    conflictState: ConflictState.Rebase,
    stashes: stashEntries,
    submodules,
} satisfies StatusData;

const expandedSubmoduleStashKey = submoduleStashKey('vendor/ui-kit', 0);

const mixedRepositoryState = {
    ...createInitialChangesState({ viewMode: ChangesViewMode.List, sortMode: ChangesSortMode.Path }),
    status,
    loading: false,
    selectedItemIds: [`${ChangeSectionId.Conflicts}:${conflictFiles[0].filePath}:`],
    selectionAnchorId: `${ChangeSectionId.Conflicts}:${conflictFiles[0].filePath}:`,
    expandedStashIndexes: [0],
    stashFilesByIndex: { 0: stashFiles },
    expandedSubmodulePaths: ['vendor/ui-kit'],
    submoduleStatusByPath: { 'vendor/ui-kit': submoduleStatusData },
    expandedSubmoduleStashKeys: [expandedSubmoduleStashKey],
    submoduleStashFilesByKey: { [expandedSubmoduleStashKey]: stashFiles },
    operationStatus: {
        type: 'changes/operationStatus',
        operationId: 'storybook-rebase',
        status: OperationStatus.Conflict,
        command: 'abortRebase',
        target: 'feature/storybook',
        actions: [OperationNoticeActionKind.ShowOutput],
    },
} satisfies ChangesState;

const meta = {
    title: 'Changes/Scenarios',
    component: ChangesApp,
    args: appArgs(mixedRepositoryState),
    argTypes: {
        state: { control: false },
    },
    decorators: [
        (Story) => (
            <div className="storybook-app-frame">
                <Story />
            </div>
        ),
    ],
} satisfies Meta<typeof ChangesApp>;

export default meta;

type Story = StoryObj<typeof meta>;

export const MixedRepository = {} satisfies Story;

export const TreeMode = {
    args: appArgs({
        ...mixedRepositoryState,
        viewMode: ChangesViewMode.Tree,
    }),
} satisfies Story;

export const ConflictsOnly = {
    args: appArgs({
        ...mixedRepositoryState,
        showConflictsOnly: true,
    }),
} satisfies Story;

export const CleanRepository = {
    args: appArgs({
        ...createInitialChangesState(),
        loading: false,
        status: {
            repositoryState: RepositoryState.Available,
            currentBranch: 'main',
            staged: [],
            unstaged: [],
            conflicts: [],
            conflictState: ConflictState.None,
            stashes: [],
            submodules: [],
        },
    }),
} satisfies Story;

export const MissingRepository = {
    args: appArgs({
        ...createInitialChangesState(),
        loading: false,
        status: {
            repositoryState: RepositoryState.Missing,
            staged: [],
            unstaged: [],
            conflicts: [],
            conflictState: ConflictState.None,
            stashes: [],
            submodules: [],
        },
    }),
} satisfies Story;

function appArgs(state: ChangesState) {
    return {
        state,
        onSectionToggle: noop,
        onSelectItem: noop,
        onRowAction: noop,
        onBulkAction: noop,
        onExplainSelection: noop,
        onSelectionContextTarget: noop,
        onCommit: noop,
        onCommitComposerContextTarget: noop,
        onGenerateCommitMessage: noop,
        onClearPathFilter: noop,
        onToggleShowConflictsOnly: noop,
        onOperationAction: noop,
        onShowErrorOutput: noop,
        onDismissError: noop,
        onShowOperationOutput: noop,
        onDismissOperation: noop,
        onCreateStash: noop,
        onToggleStash: noop,
        onStashAction: noop,
        onStashFileDiff: noop,
        onSubmoduleAction: noop,
        onSubmoduleContextTarget: noop,
        onToggleSubmodule: noop,
        onSubmoduleRowAction: noop,
        onSubmoduleBulkAction: noop,
        onExplainSubmoduleChanges: noop,
        onExplainSubmoduleSelection: noop,
        onSubmoduleSelectionContextTarget: noop,
        onSubmoduleOperationAction: noop,
        onSubmoduleCommit: noop,
        onSubmoduleCommitComposerContextTarget: noop,
        onGenerateCommitMessageForSubmodule: noop,
        onSubmoduleCreateStash: noop,
        onToggleSubmoduleStash: noop,
        onSubmoduleStashAction: noop,
        onSubmoduleStashFileDiff: noop,
    };
}
