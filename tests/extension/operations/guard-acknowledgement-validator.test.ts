import { describe, expect, it } from 'vitest';
import { GuardAcknowledgementValidator, GuardAcknowledgementValidationError } from '@extension/operations/guard-acknowledgement-validator';
import { OperationPlanRegistry } from '@extension/operations/operation-plan-registry';
import type { OperationPlan } from '@application/ports/operation-guard';

describe('GuardAcknowledgementValidator', () => {
    it('returns a validated acknowledgement when plan, context, guards, preview, and expiry match', () => {
        const registry = new OperationPlanRegistry();
        const plan = operationPlan();
        registry.store(plan);
        const validator = new GuardAcknowledgementValidator(registry);

        const validated = validator.validate({
            planId: 'plan',
            acknowledgedGuards: ['previewRequired', 'confirm', 'destructive'],
            previewHash: 'preview-hash',
        }, {
            repositoryId: 'repo',
            worktreeId: 'worktree',
        }, new Date('2026-06-20T10:00:00.000Z'));

        expect(validated.plan).toBe(plan);
    });

    it('rejects missing plans', () => {
        const validator = new GuardAcknowledgementValidator(new OperationPlanRegistry());

        expect(() => validator.validate({
            planId: 'missing',
            acknowledgedGuards: [],
        }, {
            repositoryId: 'repo',
        })).toThrow(GuardAcknowledgementValidationError);
    });

    it('rejects context mismatches', () => {
        const registry = new OperationPlanRegistry();
        registry.store(operationPlan());
        const validator = new GuardAcknowledgementValidator(registry);

        expect(() => validator.validate({
            planId: 'plan',
            acknowledgedGuards: ['previewRequired', 'confirm', 'destructive'],
            previewHash: 'preview-hash',
        }, {
            repositoryId: 'repo',
            worktreeId: 'other',
        })).toThrow(/execution context/);
    });

    it('rejects stale preview hashes', () => {
        const registry = new OperationPlanRegistry();
        registry.store(operationPlan());
        const validator = new GuardAcknowledgementValidator(registry);

        expect(() => validator.validate({
            planId: 'plan',
            acknowledgedGuards: ['previewRequired', 'confirm', 'destructive'],
            previewHash: 'stale',
        }, {
            repositoryId: 'repo',
            worktreeId: 'worktree',
        }, new Date('2026-06-20T10:00:00.000Z'))).toThrow(/preview hash/);
    });

    it('rejects missing guard acknowledgements', () => {
        const registry = new OperationPlanRegistry();
        registry.store(operationPlan());
        const validator = new GuardAcknowledgementValidator(registry);

        expect(() => validator.validate({
            planId: 'plan',
            acknowledgedGuards: ['confirm'],
            previewHash: 'preview-hash',
        }, {
            repositoryId: 'repo',
            worktreeId: 'worktree',
        }, new Date('2026-06-20T10:00:00.000Z'))).toThrow(/missing guards/);
    });

    it('rejects expired plans', () => {
        const registry = new OperationPlanRegistry();
        registry.store(operationPlan({ expiresAt: '2026-06-20T09:00:00.000Z' }));
        const validator = new GuardAcknowledgementValidator(registry);

        expect(() => validator.validate({
            planId: 'plan',
            acknowledgedGuards: ['previewRequired', 'confirm', 'destructive'],
            previewHash: 'preview-hash',
        }, {
            repositoryId: 'repo',
            worktreeId: 'worktree',
        }, new Date('2026-06-20T10:00:00.000Z'))).toThrow(/expired/);
    });
});

function operationPlan(overrides: Partial<OperationPlan> = {}): OperationPlan {
    return {
        id: 'plan',
        action: 'resetHard',
        repositoryId: 'repo',
        worktreeId: 'worktree',
        guards: [
            { kind: 'previewRequired', level: 'warning', reason: 'Preview the reset target.' },
            { kind: 'confirm', level: 'warning', reason: 'Confirm reset.' },
            { kind: 'destructive', level: 'danger', reason: 'Reset hard can discard local work.' },
        ],
        targets: [{ kind: 'ref', id: 'HEAD~1', label: 'HEAD~1' }],
        preview: { kind: 'reset', summary: { ref: 'HEAD~1' }, hash: 'preview-hash' },
        expiresAt: '2026-06-20T11:00:00.000Z',
        ...overrides,
    };
}
