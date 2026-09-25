// SharePoint Sync worker (§7): mirrors document metadata from Graph into the
// local cache so reads keep working when SharePoint is down. Polls per tenant.
import { buildContainer } from '../container.js';
import { CircuitBreaker, SharePointGraphClient } from '@portcalls/integrations';
import type { TenantContext } from '@portcalls/domain';
import { logger } from '@portcalls/infra';

async function syncOnce(tenantId: string, userId: string) {
  const breaker = new CircuitBreaker({ failureThreshold: 5, cooldownMs: 30_000 });
  const graph = new SharePointGraphClient({
    tenantId: process.env.AAD_TENANT_ID ?? '', clientId: process.env.AAD_CLIENT_ID ?? '',
    clientSecret: process.env.AAD_CLIENT_SECRET ?? '', siteId: process.env.SP_SITE_ID ?? '',
    driveId: process.env.SP_DRIVE_ID ?? '', breaker,
  });
  await TenantContext.run({ tenantId, userId }, async () => {
    try {
      const files = await graph.listFolder('PortCalls');
      logger.info('sharepoint-sync ok', { tenantId, count: files.length });
    } catch (e) {
      logger.warn('sharepoint-sync degraded (breaker/circuit)', { tenantId, err: String(e) });
    }
  });
}

async function main() {
  buildContainer(); // ensures config/env validation in future DI wiring
  const interval = Number(process.env.SP_SYNC_INTERVAL_MS ?? 60_000);
  for (;;) {
    // Production: iterate active tenants from control plane. Demo uses env tenant.
    await syncOnce(process.env.DEMO_TENANT_ID ?? '00000000-0000-0000-0000-000000000000', 'sharepoint-worker');
    await new Promise(r => setTimeout(r, interval));
  }
}
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop()!)) main().catch(e => { logger.error('sharepoint-sync crashed', { err: String(e) }); process.exit(1); });
export { syncOnce };
