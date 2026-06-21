import { CreateCommitPatchUseCase } from '@application/usecases/commits/create-commit-patch';
import { NodeTextFileWriter } from '@extension/adapters/node/node-text-file-writer';
import { VscodeClipboard } from '@extension/adapters/vscode/vscode-clipboard';
import { VscodeCommitPatchDestinationPicker } from '@extension/adapters/vscode/vscode-commit-patch-destination-picker';
import { VscodeSaveFile } from '@extension/adapters/vscode/vscode-save-file';

export const defaultCreateCommitPatch = new CreateCommitPatchUseCase(
    new VscodeCommitPatchDestinationPicker(),
    new VscodeSaveFile(),
    new NodeTextFileWriter(),
    new VscodeClipboard(),
);
