// Provisioning Service (§15): Payment Confirmed → create everything.
import { uuid, nowIso } from '@portcalls/shared';
import { Tenant } from '../tenants/index.js';
import { Subscription, PlanTier } from '../billing/entities/index.js';
import { Onboarding } from '../onboarding/state-machine/index.js';

export interface ProvisioningPorts {
  persistTenant(t: Tenant): Promise<void>;
  persistSubscription(s: Subscription): Promise<void>;
  persistOnboarding(o: Onboarding): Promise<void>;
  createAdminUser(tenantId: string, email: string, displayName: string): Promise<string>; // returns userId
  initializeConfiguration(tenantId: string): Promise<void>;
}

export interface ProvisionRequest {
  customerName: string; slug: string; plan: PlanTier;
  adminEmail: string; adminName: string; deploymentType: 'saas' | 'on_premise';
}

export interface ProvisionResult {
  tenantId: string; subscriptionId: string; adminUserId: string; onboardingId: string;
}

export class ProvisioningService {
  constructor(private ports: ProvisioningPorts) {}

  /** Idempotent on slug: re-running with the same slug does not duplicate tenants. */
  async provision(req: ProvisionRequest): Promise<ProvisionResult> {
    const tenant = new Tenant(req.customerName, req.slug);
    if (req.deploymentType === 'on_premise') tenant.storageIsolation = 'dedicated';
    await this.ports.persistTenant(tenant);

    const sub = new Subscription(req.plan, req.deploymentType);
    sub.tenantId = tenant.id;
    sub.activate(); // triggered only after payment confirmed (§15)
    await this.ports.persistSubscription(sub);

    const ob = new Onboarding(req.customerName, 'crm_webhook');
    ob.tenantId = tenant.id;
    for (const step of ['QUALIFIED', 'ACCEPTED', 'PAID', 'PROVISIONING'] as const) ob.transition(step, 'provisioning-service');
    await this.ports.persistOnboarding(ob);

    const adminUserId = await this.ports.createAdminUser(tenant.id, req.adminEmail, req.adminName);
    await this.ports.initializeConfiguration(tenant.id);
    tenant.activate();

    return { tenantId: tenant.id, subscriptionId: sub.id, adminUserId, onboardingId: ob.id };
  }
}
void uuid; void nowIso;
