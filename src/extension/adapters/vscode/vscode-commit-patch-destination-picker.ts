import * as vscode from 'vscode';
import { CommitPatchDestination, type CommitPatchDestinationPickerPort } from '@application/ports/commit-patch-destination';

const COPY_PATCH_LABEL = 'Copy Patch to Clipboard';
const SAVE_PATCH_LABEL = 'Save Patch to File...';

export class VscodeCommitPatchDestinationPicker implements CommitPatchDestinationPickerPort {
    async pickCommitPatchDestination(): Promise<CommitPatchDestination | undefined> {
        const selected = await vscode.window.showQuickPick([COPY_PATCH_LABEL, SAVE_PATCH_LABEL], {
            placeHolder: 'Create patch',
        });
        switch (selected) {
            case COPY_PATCH_LABEL:
                return CommitPatchDestination.Clipboard;
            case SAVE_PATCH_LABEL:
                return CommitPatchDestination.File;
            case undefined:
                return undefined;
        }
    }
}
