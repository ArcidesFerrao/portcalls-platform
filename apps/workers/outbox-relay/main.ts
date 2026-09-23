// Outbox Relay worker (§8): drains unpublished events → queue. Zero-loss.
import { buildContainer } from '../container.js';
import { logger } from '@portcalls/infra';

async function main() {
  const c = buildContainer();
  c.broker.subscribe('*', { handle: async () => undefined }); // placeholder sink; prod = Redis/BullMQ
  logger.info('outbox-relay started');
  await c.relay.runForever(Number(process.env.RELAY_INTERVAL_MS ?? 1000));
}
main().catch((e) => { logger.error('outbox-relay crashed', { err: String(e) }); process.exit(1); });
