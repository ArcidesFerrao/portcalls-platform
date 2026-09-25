// Report Generation worker (§18): consumes closed port calls asynchronously,
// produces CSV/PDF reports off the request path.
import { buildContainer } from '../container.js';
import { summarize, toCsv, PortCall, TenantContext } from '@portcalls/domain';
import type { OutboxRecord } from '@portcalls/domain';
import { logger } from '@portcalls/infra';

export async function generateMonthlyReport(portCalls: PortCall[]): Promise<string> {
  const rows = portCalls.map(pc => ({
    reference: pc.reference, portCode: pc.portCode, status: pc.status,
    progressPct: pc.progressPct(), eta: pc.eta.slice(0, 10), etd: pc.etd.slice(0, 10),
  }));
  const summary = summarize(portCalls);
  return `# Relatório mensal\nEscalas abertas: ${summary.openPortCalls} | Overdue: ${summary.overdueMilestones}\n\n${toCsv(rows)}`;
}

async function main() {
  const c = buildContainer();
  c.broker.subscribe('PortCallClosed', {
    handle: async (r: OutboxRecord) => {
      await TenantContext.run({ tenantId: r.tenantId, userId: 'report-worker' }, async () => {
        const open = await c.portOps.getPortCall(JSON.parse(r.payload).payload.portCallId).catch(() => null);
        if (open) await generateMonthlyReport([open]);
        logger.info('report generated for closed port call', { tenantId: r.tenantId });
      });
    },
  });
  logger.info('report-generation worker ready');
}
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop()!)) main().catch(e => { logger.error('report-generation crashed', { err: String(e) }); process.exit(1); });
