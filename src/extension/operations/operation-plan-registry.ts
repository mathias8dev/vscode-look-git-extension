import type { OperationPlan } from '@application/ports/operation-guard';

export class OperationPlanRegistry {
    private readonly plans = new Map<string, OperationPlan>();

    store(plan: OperationPlan): OperationPlan {
        this.plans.set(plan.id, plan);
        return plan;
    }

    get(planId: string): OperationPlan | undefined {
        return this.plans.get(planId);
    }

    expire(planId: string): void {
        this.plans.delete(planId);
    }

    clearExpired(now = new Date()): void {
        for (const [planId, plan] of this.plans) {
            if (isExpired(plan, now)) {
                this.plans.delete(planId);
            }
        }
    }
}

export function isExpired(plan: OperationPlan, now = new Date()): boolean {
    return Boolean(plan.expiresAt && Date.parse(plan.expiresAt) <= now.getTime());
}
