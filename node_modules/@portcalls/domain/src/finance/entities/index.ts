// Finance bounded context: Invoice + Payment (§3, §8).
import { uuid, nowIso, EntityBase, ValidationError } from '@portcalls/shared';

export type InvoiceStatus = 'draft' | 'issued' | 'paid' | 'void' | 'overdue';

export interface InvoiceLine { description: string; quantity: number; unitPriceCents: number; vatRatePct: number; }

export class Invoice implements EntityBase {
  id = uuid(); tenantId = ''; createdAt = nowIso(); updatedAt = nowIso();
  status: InvoiceStatus = 'draft';
  lines: InvoiceLine[] = [];
  issuedAt: string | null = null;
  paidAt: string | null = null;
  number: string = '';
  constructor(public portCallId: string, public clientId: string, public currency: string = 'EUR') {}
  addLine(l: InvoiceLine) {
    if (l.quantity <= 0 || l.unitPriceCents < 0) throw new ValidationError('Invalid invoice line');
    this.lines.push(l);
  }
  subtotalCents(): number { return this.lines.reduce((s, l) => s + l.quantity * l.unitPriceCents, 0); }
  vatCents(): number { return this.lines.reduce((s, l) => s + Math.round(l.quantity * l.unitPriceCents * l.vatRatePct / 100), 0); }
  totalCents(): number { return this.subtotalCents() + this.vatCents(); }
  issue(number: string, dueDays = 30) {
    if (this.status !== 'draft') throw new ValidationError('Only draft invoices can be issued');
    if (!this.lines.length) throw new ValidationError('Cannot issue an empty invoice');
    this.number = number; this.status = 'issued'; this.issuedAt = nowIso();
    this.dueAt = new Date(Date.now() + dueDays * 86400_000).toISOString();
  }
  dueAt: string | null = null;
  markPaid(at = nowIso()) {
    if (this.status !== 'issued' && this.status !== 'overdue') throw new ValidationError(`Cannot pay a ${this.status} invoice`);
    this.status = 'paid'; this.paidAt = at;
  }
  voidInvoice(reason: string) {
    if (this.status === 'paid') throw new ValidationError('Paid invoices cannot be voided');
    this.status = 'void'; this.voidReason = reason;
  }
  voidReason: string | null = null;
}

export class Payment implements EntityBase {
  id = uuid(); tenantId = ''; createdAt = nowIso(); updatedAt = nowIso();
  constructor(
    public invoiceId: string,
    public amountCents: number,
    public method: 'transfer' | 'card' | 'cash',
    public reference: string,
    public paidAt: string = nowIso(),
  ) { if (amountCents <= 0) throw new ValidationError('Payment amount must be positive'); }
}
