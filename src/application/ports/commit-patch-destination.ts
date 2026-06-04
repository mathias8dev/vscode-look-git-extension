export enum CommitPatchDestination {
    Clipboard,
    File,
}

export interface CommitPatchDestinationPickerPort {
    pickCommitPatchDestination(): Promise<CommitPatchDestination | undefined>;
}
