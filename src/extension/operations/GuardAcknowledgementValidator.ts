import type { GuardAcknowledgement, OperationPlan, ValidatedGuardAcknowledgement } from '@application/ports/operation-guard';
import { OperationPlanRegistry, isExpired } from '@extension/operations/OperationPlanRegistry';

export interface GuardValidationContext {
    readonly repositoryId: string;
    readonly worktreeId?: string;
}

export class GuardAcknowledgementValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'GuardAcknowledgementValidationError';
    }
}

export class GuardAcknowledgementValidator {
    constructor(private readonly plans: OperationPlanRegistry) {}

    validate(
        acknowledgement: GuardAcknowledgement,
        context: GuardValidationContext,
        now = new Date(),
    ): ValidatedGuardAcknowledgement {
        const plan = this.plans.get(acknowledgement.planId);
        if (!plan) {
            throw new GuardAcknowledgementValidationError(`Operation plan "${acknowledgement.planId}" does not exist.`);
        }

        validateContext(plan, context);
        validateExpiry(plan, now);
        validatePreview(plan, acknowledgement);
        validateGuards(plan, acknowledgement);

        return { ...acknowledgement, plan };
    }
}

function validateContext(plan: OperationPlan, context: GuardValidationContext): void {
    if (plan.repositoryId !== context.repositoryId || plan.worktreeId !== context.worktreeId) {
        throw new GuardAcknowledgementValidationError('Operation acknowledgement does not match the execution context.');
    }
}

function validateExpiry(plan: OperationPlan, now: Date): void {
    if (isExpired(plan, now)) {
        throw new GuardAcknowledgementValidationError(`Operation plan "${plan.id}" has expired.`);
    }
}

function validatePreview(plan: OperationPlan, acknowledgement: GuardAcknowledgement): void {
    if (plan.preview?.hash && plan.preview.hash !== acknowledgement.previewHash) {
        throw new GuardAcknowledgementValidationError('Operation acknowledgement preview hash does not match the plan.');
    }
}

function validateGuards(plan: OperationPlan, acknowledgement: GuardAcknowledgement): void {
    const acknowledged = new Set(acknowledgement.acknowledgedGuards);
    const missing = plan.guards.map((guard) => guard.kind).filter((kind) => !acknowledged.has(kind));
    if (missing.length > 0) {
        throw new GuardAcknowledgementValidationError(`Operation acknowledgement is missing guards: ${missing.join(', ')}.`);
    }
}
