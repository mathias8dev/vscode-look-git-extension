import { GitPushOutcome } from '@application/ports/git-capabilities';

export interface CommandExecutionResult {
    readonly shouldRefresh: boolean;
    readonly pushOutcome?: GitPushOutcome;
}

export function commandExecutionResult(shouldRefresh: boolean, pushOutcome?: GitPushOutcome): CommandExecutionResult {
    return {
        shouldRefresh,
        ...(pushOutcome ? { pushOutcome } : {}),
    };
}

export function pushCommandExecutionResult(pushOutcome: GitPushOutcome): CommandExecutionResult {
    return commandExecutionResult(pushOutcome !== GitPushOutcome.Delegated, pushOutcome);
}
