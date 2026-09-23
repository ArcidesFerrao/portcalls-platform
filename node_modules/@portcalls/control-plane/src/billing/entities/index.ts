// Billing (§13): Plan, Subscription, Entitlement, Usage.
import { uuid, nowIso, EntityBase } from '@portcalls/shared';

export type PlanTier = 'basic' | 'professional' | 'enterprise';

export interface Entitlements {
  portcalls: number;            // per month (-1 = unlimited)
  users: number;
  reports: boolean;
  api: boolean;
  integrations: ('sharepoint' | 'payments')[];
  advanced_analytics: boolean;
  storageMb: number;
}

export const PLANS: Record<PlanTier, { priceEurCents: number; entitlements: Entitlements }> = {
  basic:        { priceEurCents:   99_00, entitlements: { portcalls: 20,  users: 3,  reports: true,  api: false, integrations: [],                        advanced_analytics: false, storageMb: 2_000 } },
  professional: { priceEurCents:  299_00, entitlements: { portcalls: 100, users: 10, reports: true,  api: true,  integrations: ['sharepoint'],            advanced_analytics: false, storageMb: 20_000 } },
  enterprise:   { priceEurCents:  799_00, entitlements: { portcalls: -1,  users: -1, reports: true,  api: true,  integrations: ['sharepoint', 'payments'], advanced_analytics: true,  storageMb: 200_000 } },
};

export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'cancelled';

export class Subscription implements EntityBase {
  id = uuid(); tenantId = ''; createdAt = nowIso(); updatedAt = nowIso();
  status: SubscriptionStatus = 'trialing';
  currentPeriodEnd: string;
  constructor(public plan: PlanTier, public deploymentType: 'saas' | 'on_premise' = 'saas') {
    this.currentPeriodEnd = new Date(Date.now() + 30 * 86400_000).toISOString();
  }
  activate() { this.status = 'active'; }
  entitlements(): Entitlements { return structuredClone(PLANS[this.plan].entitlements); }
}

export interface UsageRecord { tenantId: string; metric: keyof Entitlements | 'storage_mb'; value: number; period: string; }

/** Throws when a tenant exceeds its plan quota (§13 enforcement point). */
export function assertWithinEntitlement(ent: Entitlements, usage: UsageRecord[]): void {
  for (const u of usage) {
    const limit = (ent as unknown as Record<string, number | boolean>)[u.metric];
    if (typeof limit === 'number' && limit >= 0 && u.value > limit) {
      throw new Error(`Quota exceeded: ${String(u.metric)} (${u.value} > ${limit})`);
    }
  }
}
void uuid; void nowIso;
