import { Invoice, Payment } from '../entities/index.js';
export interface InvoiceRepository {
  findById(id: string): Promise<Invoice | null>;
  listByPortCall(portCallId: string): Promise<Invoice[]>;
  nextSequenceNumber(tenantId: string, year: number): Promise<string>;
  save(inv: Invoice): Promise<void>;
  savePayment(p: Payment): Promise<void>;
}
