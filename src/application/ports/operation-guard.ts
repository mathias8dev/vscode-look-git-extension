import type { SemanticGitOperation } from '@application/ports/git-operation';

export type OperationGuardKind =
    | 'confirm'
    | 'previewRequired'
    | 'cleanWorktreeRequired'
    | 'noOperationInProgress'
    | 'requiresCredentials'
    | 'requiresInitializedSubmodule'
    | 'destructive'
    | 'highRiskRemote';

export type OperationGuardLevel = 'info' | 'warning' | 'danger';

export interface OperationGuard {
    readonly kind: OperationGuardKind;
    readonly level: OperationGuardLevel;
    readonly reason: string;
}

export interface SemanticActionPolicy {
    readonly action: SemanticGitOperation;
    readonly guards: readonly OperationGuard[];
}

export type OperationTargetKind =
    | 'ref'
    | 'path'
    | 'commit'
    | 'stash'
    | 'worktree'
    | 'submodule'
    | 'remote';

export interface OperationTarget {
    readonly kind: OperationTargetKind;
    readonly id: string;
    readonly label: string;
}

export interface OperationPreview {
    readonly kind: string;
    readonly summary: Readonly<Record<string, unknown>>;
    readonly hash?: string;
}

export interface RecoveryHint {
    readonly kind: string;
    readonly description: string;
    readonly data?: Readonly<Record<string, unknown>>;
}

export interface OperationPlan {
    readonly id: string;
    readonly action: SemanticGitOperation;
    readonly repositoryId: string;
    readonly worktreeId?: string;
    readonly guards: readonly OperationGuard[];
    readonly targets: readonly OperationTarget[];
    readonly preview?: OperationPreview;
    readonly recovery?: RecoveryHint;
    readonly expiresAt?: string;
}

export interface GuardAcknowledgement {
    readonly planId: string;
    readonly acknowledgedGuards: readonly OperationGuardKind[];
    readonly previewHash?: string;
}

export interface ValidatedGuardAcknowledgement extends GuardAcknowledgement {
    readonly plan: OperationPlan;
}
