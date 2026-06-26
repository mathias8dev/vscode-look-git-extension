import { CommitReferenceActions } from '@application/usecases/commits/commit-reference-actions';
import { VscodeClipboard } from '@extension/adapters/vscode/vscode-clipboard';
import { VscodeTextInput } from '@extension/adapters/vscode/vscode-text-input';

export const defaultCommitReferenceActions = new CommitReferenceActions(
    new VscodeClipboard(),
    new VscodeTextInput(),
);
