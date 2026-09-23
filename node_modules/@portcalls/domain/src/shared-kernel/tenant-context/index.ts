// ---------------------------------------------------------------------------
// TenantContext (§5): AsyncLocalStorage-based ambient tenant so every query
// sets `app.tenant_id` for PostgreSQL RLS without threading ids manually.
// ---------------------------------------------------------------------------
import { AsyncLocalStorage } from 'node:async_hooks';

export interface TenantIdentity { tenantId: string; userId: string }

const als = new AsyncLocalStorage<TenantIdentity>();

export const TenantContext = {
  run<T>(identity: TenantIdentity, fn: () => T): T { return als.run(identity, fn); },
  get(): TenantIdentity | undefined { return als.getStore(); },
  require(): TenantIdentity {
    const id = als.getStore();
    if (!id) throw new Error('Outside tenant scope: refusing unscoped DB access');
    return id;
  },
};

/** Builds the SQL statement a repository must run at tx start for RLS (§5). */
export function rlsSessionSql(tenantId: string): string {
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRe.test(tenantId)) throw new Error('Invalid tenant id — possible injection');
  return `SET LOCAL app.tenant_id = '${tenantId}'`;
}
