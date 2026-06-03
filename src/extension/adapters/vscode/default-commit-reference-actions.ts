import { CommitReferenceActions } from '../../../application/usecases/commits/commit-reference-actions';
import { VscodeClipboard } from './vscode-clipboard';
import { VscodeTextInput } from './vscode-text-input';

export const defaultCommitReferenceActions = new CommitReferenceActions(
    new VscodeClipboard(),
    new VscodeTextInput(),
);
