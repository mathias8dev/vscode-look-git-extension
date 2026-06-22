import type { CodiconName } from '@webview/shared/codicon';

export enum ChangeRowAction {
    Open = 'open',
    Diff = 'diff',
    Stage = 'stage',
    Unstage = 'unstage',
    Discard = 'discard',
    OpenMergeEditor = 'openMergeEditor',
    MarkResolved = 'markResolved',
    AcceptOurs = 'acceptOurs',
    AcceptTheirs = 'acceptTheirs',
}

export interface ChangeActionDescriptor<TAction extends string> {
    readonly action: TAction;
    readonly icon: CodiconName;
    readonly label: string;
    readonly title: string;
}
