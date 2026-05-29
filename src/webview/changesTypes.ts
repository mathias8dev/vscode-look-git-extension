export interface StatusEntry {
    indexStatus: string;
    workTreeStatus: string;
    filePath: string;
    origPath?: string;
    isSubmodule?: boolean;
}

export interface StashEntry {
    index: number;
    message: string;
}

export interface StatusData {
    staged: StatusEntry[];
    unstaged: StatusEntry[];
    conflicts: StatusEntry[];
    conflictState: 'none' | 'merge' | 'rebase';
    stashes: StashEntry[];
}

export interface StashFileEntry {
    status: string;
    filePath: string;
    origPath?: string;
}

export interface ViewState {
    commitMessage: string;
    commitMode: string;
    stagedCollapsed: boolean;
    unstagedCollapsed: boolean;
    conflictsCollapsed: boolean;
    stashesCollapsed: boolean;
    viewAsTree: boolean;
    expandedFolders: string[];
}
