// Control Plane — Tenants (§2): tenant registry + per-tenant settings.
import { uuid, nowIso, EntityBase } from '@portcalls/shared';

export type TenantStatus = 'provisioning' | 'active' | 'suspended' | 'churned';

export class Tenant implements EntityBase {
  id = uuid(); tenantId = this.id; createdAt = nowIso(); updatedAt = nowIso();
  status: TenantStatus = 'provisioning';
  storageIsolation: 'shared' | 'dedicated' = 'shared'; // §5 (Enterprise: dedicated)
  constructor(public name: string, public slug: string, public region: string = 'eu-west-1') {
    if (!/^[a-z0-9][a-z0-9-]{2,30}$/.test(slug)) throw new Error('slug must be lowercase alnum/dash, 3-31 chars');
  }
  activate() { this.status = 'active'; this.updatedAt = nowIso(); }
  suspend(reason: string) { this.status = 'suspended'; this.suspendReason = reason; }
  suspendReason: string | null = null;
}

export interface TenantSettings {
  tenantId: string;
  defaultPort: string;          // UN/LOCODE
  vatRatePct: number;
  invoicePrefix: string;
  sharepointSiteUrl: string | null;
}
