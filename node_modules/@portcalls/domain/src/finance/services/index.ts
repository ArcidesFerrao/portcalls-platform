// Finance application service — emits InvoiceCreated/InvoicePaid via outbox (§8).
import { NotFoundError, ValidationError } from '@portcalls/shared';
import { TenantContext } from '../../shared-kernel/tenant-context/index.js';
import { OutboxWriter } from '../../shared-kernel/outbox/index.js';
import { makeEvent } from '../../shared-kernel/events/index.js';
import { Invoice, Payment, InvoiceLine } from '../entities/index.js';
import { InvoiceRepository } from '../repositories/index.js';

export class FinanceService {
  constructor(private repo: InvoiceRepository, private outbox: OutboxWriter) {}

  async createDraft(input: { portCallId: string; clientId: string; lines: InvoiceLine[] }): Promise<Invoice> {
    const { tenantId } = TenantContext.require();
    const inv = new Invoice(input.portCallId, input.clientId);
    inv.tenantId = tenantId;
    input.lines.forEach(l => inv.addLine(l));
    await this.repo.save(inv);
    return inv;
  }

  async issue(invoiceId: string): Promise<Invoice> {
    const inv = await this.mustFind(invoiceId);
    const { tenantId } = TenantContext.require();
    const year = new Date().getFullYear();
    const num = await this.repo.nextSequenceNumber(tenantId, year); // e.g. 2026/0007
    inv.issue(num);
    await this.repo.save(inv);
    await this.outbox.enqueue({}, makeEvent({
      type: 'InvoiceCreated', tenantId, aggregateType: 'Invoice', aggregateId: inv.id,
      correlationId: TenantContext.require().userId,
      payload: { invoiceId: inv.id, number: inv.number, portCallId: inv.portCallId, clientId: inv.clientId, totalCents: inv.totalCents() },
    }));
    return inv;
  }

  async recordPayment(invoiceId: string, input: { amountCents: number; method: Payment['method']; reference: string }): Promise<{ invoice: Invoice; payment: Payment }> {
    const inv = await this.mustFind(invoiceId);
    const { tenantId, userId } = TenantContext.require();
    const payment = new Payment(inv.id, input.amountCents, input.method, input.reference);
    payment.tenantId = tenantId;
    if (input.amountCents + 0 < inv.totalCents()) throw new ValidationError('Partial payments not supported in v1');
    inv.markPaid();
    await this.repo.savePayment(payment);
    await this.repo.save(inv);
    await this.outbox.enqueue({}, makeEvent({
      type: 'InvoicePaid', tenantId, aggregateType: 'Invoice', aggregateId: inv.id, correlationId: userId,
      payload: { invoiceId: inv.id, number: inv.number, amountCents: inv.totalCents(), paidAt: inv.paidAt },
    }));
    return { invoice: inv, payment };
  }

  private async mustFind(id: string): Promise<Invoice> {
    const inv = await this.repo.findById(id);
    if (!inv) throw new NotFoundError('Invoice');
    return inv;
  }
}
