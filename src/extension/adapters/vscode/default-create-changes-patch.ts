import { CreateChangesPatchUseCase } from '../../../application/usecases/changes/create-changes-patch';
import { NodeTextFileWriter } from '../node/node-text-file-writer';
import { VscodeClipboard } from './vscode-clipboard';
import { VscodeCommitPatchDestinationPicker } from './vscode-commit-patch-destination-picker';
import { VscodeSaveFile } from './vscode-save-file';

export const defaultCreateChangesPatch = new CreateChangesPatchUseCase(
    new VscodeCommitPatchDestinationPicker(),
    new VscodeSaveFile(),
    new NodeTextFileWriter(),
    new VscodeClipboard(),
);
