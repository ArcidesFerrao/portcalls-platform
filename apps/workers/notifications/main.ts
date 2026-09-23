// Notifications worker (§8 consumer): MilestoneOverdue / PortCallClosed /
// InvoicePaid → render template → dispatch channel. Idempotent via eventId.
import { buildContainer, Container } from '../container.js';
import type { OutboxRecord } from '@portcalls/domain';
import type { DomainEvent } from '@portcalls/domain';
import { MessageHandler } from '@portcalls/infra';
import { logger } from '@portcalls/infra';

const seen = new Set<string>(); // idempotency keys (§8 "payload com eventId idempotente")

export function notificationHandler(container?: Container): MessageHandler {
  const c = container ?? buildContainer();
  return {
    async handle(record: OutboxRecord) {
      if (seen.has(record.id)) return; // at-least-once → dedupe on eventId
      const event = JSON.parse(record.payload) as DomainEvent<Record<string, string>>;
      const params = { email: 'ops@example.com', reference: 'DEMO', ...event.payload };
      switch (event.type) {
        case 'MilestoneOverdue':
          c.notifications.dispatch('email', c.notifications.render('milestone_overdue', params as never)); break;
        case 'PortCallClosed':
          c.notifications.dispatch('email', c.notifications.render('portcall_closed', params as never)); break;
        case 'InvoicePaid':
          c.notifications.dispatch('email', c.notifications.render('invoice_paid', params as never)); break;
        default: return;
      }
      seen.add(record.id);
      logger.info('notification dispatched', { type: event.type, tenantId: event.tenantId });
    },
  };
}
