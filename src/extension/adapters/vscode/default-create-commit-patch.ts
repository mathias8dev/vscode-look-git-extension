import { CreateCommitPatchUseCase } from '../../../application/usecases/commits/create-commit-patch';
import { NodeTextFileWriter } from '../node/node-text-file-writer';
import { VscodeSaveFile } from './vscode-save-file';

export const defaultCreateCommitPatch = new CreateCommitPatchUseCase(
    new VscodeSaveFile(),
    new NodeTextFileWriter(),
);
