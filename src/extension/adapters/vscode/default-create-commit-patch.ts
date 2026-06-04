import { CreateCommitPatchUseCase } from '../../../application/usecases/commits/create-commit-patch';
import { NodeTextFileWriter } from '../node/node-text-file-writer';
import { VscodeClipboard } from './vscode-clipboard';
import { VscodeCommitPatchDestinationPicker } from './vscode-commit-patch-destination-picker';
import { VscodeSaveFile } from './vscode-save-file';

export const defaultCreateCommitPatch = new CreateCommitPatchUseCase(
    new VscodeCommitPatchDestinationPicker(),
    new VscodeSaveFile(),
    new NodeTextFileWriter(),
    new VscodeClipboard(),
);
