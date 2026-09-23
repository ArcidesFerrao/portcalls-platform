// Billing service: subscription lifecycle + payment webhook handling (§17).
import { nowIso } from '@portcalls/shared';
import { Subscription, PlanTier, PLANS, assertWithinEntitlement, UsageRecord } from '../entities/index.js';

export interface PaymentGateway {
  createCheckout(subscriptionId: string, amountCents: number, currency: string): Promise<{ url: string; reference: string }>;
  verifyWebhookSignature(rawBody: string, signature: string, secret: string): boolean;
}

export class BillingService {
  private subs = new Map<string, Subscription>();
  constructor(private gateway: PaymentGateway) {}

  startSubscription(tenantId: string, plan: PlanTier): Subscription {
    const s = new Subscription(plan);
    s.tenantId = tenantId;
    this.subs.set(s.id, s);
    return s;
  }

  checkoutUrl(subscriptionId: string) {
    const s = this.mustGet(subscriptionId);
    return this.gateway.createCheckout(s.id, PLANS[s.plan].priceEurCents, 'EUR');
  }

  /** Called by the payments webhook after signature verification (§17). */
  confirmPayment(subscriptionId: string): Subscription {
    const s = this.mustGet(subscriptionId);
    s.activate();
    s.currentPeriodEnd = new Date(Date.now() + 30 * 86400_000).toISOString();
    return s;
  }

  checkQuotas(subscriptionId: string, usage: UsageRecord[]) {
    const s = this.mustGet(subscriptionId);
    assertWithinEntitlement(s.entitlements(), usage.map(u => ({ ...u, tenantId: s.tenantId })));
  }

  cancel(subscriptionId: string) { const s = this.mustGet(subscriptionId); s.status = 'cancelled'; s.updatedAt = nowIso(); }

  private mustGet(id: string): Subscription {
    const s = this.subs.get(id);
    if (!s) throw new Error(`Subscription ${id} not found`);
    return s;
  }
}
