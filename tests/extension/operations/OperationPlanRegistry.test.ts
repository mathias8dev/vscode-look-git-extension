import { describe, expect, it } from 'vitest';
import { OperationPlanRegistry } from '../../../src/extension/operations/OperationPlanRegistry';
import type { OperationPlan } from '../../../src/application/ports/operation-guard';

describe('OperationPlanRegistry', () => {
    it('stores, returns, and expires operation plans by id', () => {
        const registry = new OperationPlanRegistry();
        const plan = operationPlan({ id: 'plan-1' });

        expect(registry.store(plan)).toBe(plan);
        expect(registry.get('plan-1')).toBe(plan);

        registry.expire('plan-1');

        expect(registry.get('plan-1')).toBeUndefined();
    });

    it('clears expired plans without removing active plans', () => {
        const registry = new OperationPlanRegistry();
        const expired = operationPlan({ id: 'expired', expiresAt: '2026-06-20T09:00:00.000Z' });
        const active = operationPlan({ id: 'active', expiresAt: '2026-06-20T11:00:00.000Z' });

        registry.store(expired);
        registry.store(active);
        registry.clearExpired(new Date('2026-06-20T10:00:00.000Z'));

        expect(registry.get('expired')).toBeUndefined();
        expect(registry.get('active')).toBe(active);
    });
});

function operationPlan(overrides: Partial<OperationPlan>): OperationPlan {
    return {
        id: 'plan',
        action: 'resetHard',
        repositoryId: 'repo',
        guards: [],
        targets: [],
        ...overrides,
    };
}
