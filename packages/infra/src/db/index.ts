// ---------------------------------------------------------------------------
// In-memory database adapter implementing all domain repository ports.
// Zero external dependencies → the whole platform runs & is testable offline.
// Swap for PrismaClient adapters (schema.prisma) in production (§16).
// Every collection row carries tenantId; queries are scoped via TenantContext,
// mirroring what PostgreSQL RLS enforces at the DB layer (§5).
// ---------------------------------------------------------------------------
import {
  TenantContext,
  User, Membership, Session,
  Vessel, PortCall, Client,
  Document,
  Invoice, Payment,
  type UserRepository, type MembershipRepository, type SessionRepository,
  type VesselRepository, type PortCallRepository, type ClientRepository,
  type DocumentRepository, type InvoiceRepository,
  type DomainEvent, type OutboxWriter, type OutboxStore, type OutboxRecord, type TxHandle, type AuditEvent,
  type AuditEvent,
} from '@portcalls/domain';
import { nowIso } from '@portcalls/shared';

type Row<T> = T & { tenantId: string };

export class MemoryDb {
  users = new Map<string, Row<User>>();
  sessions = new Map<string, Row<Session>>();
  memberships = new Map<string, Row<Membership>>();
  vessels = new Map<string, Row<Vessel>>();
  clients = new Map<string, Row<Client>>();
  portCalls = new Map<string, Row<PortCall>>();
  documents = new Map<string, Row<Document>>();
  invoices = new Map<string, Row<Invoice>>();
  payments = new Map<string, Row<Payment>>();
  outbox: Array<Row<OutboxRecord>> = [];
  audit: AuditEvent[] = [];

  private scoped<T extends { tenantId: string }>(rows: Iterable<T>): T[] {
    const { tenantId } = TenantContext.require();
    return [...rows].filter(r => r.tenantId === tenantId);
  }
}

// ---- Identity adapters -----------------------------------------------------
export class MemUserRepo implements UserRepository {
  constructor(private db: MemoryDb) {}
  async findByEmail(email: string) { return this.db.users.get(email.toLowerCase()) ?? null; }
  async findById(id: string) { return this.db.users.get(id) ?? null; }
  async create(u: User) { this.db.users.set(u.id, u as Row<User>); this.db.users.set(u.email.toLowerCase(), u as Row<User>); }
}
export class MemSessionRepo implements SessionRepository {
  constructor(private db: MemoryDb) {}
  async create(s: Session) { this.db.sessions.set(s.id, s as Row<Session>); }
  async findByTokenHash(h: string) { return [...this.db.sessions.values()].find(s => s.tokenHash === h) ?? null; }
  async revoke(id: string) { const s = this.db.sessions.get(id); if (s) s.revokedAt = nowIso(); }
}
export class MemMembershipRepo implements MembershipRepository {
  constructor(private db: MemoryDb) {}
  async listByUser(userId: string) { return this.db.scoped(this.db.memberships.values()).filter(m => m.userId === userId); }
  async create(m: Membership) { this.db.memberships.set(m.id, m as Row<Membership>); }
}

// ---- Port Operations adapters ----------------------------------------------
export class MemVesselRepo implements VesselRepository {
  constructor(private db: MemoryDb) {}
  async findById(id: string) { return this.db.scoped(this.db.vessels.values()).find(v => v.id === id) ?? null; }
  async findByImo(imo: string) { return this.db.scoped(this.db.vessels.values()).find(v => v.imoNumber === imo) ?? null; }
  async list() { return this.db.scoped(this.db.vessels.values()); }
  async save(v: Vessel) { this.db.vessels.set(v.id, v as Row<Vessel>); }
}
export class MemClientRepo implements ClientRepository {
  constructor(private db: MemoryDb) {}
  async findById(id: string) { return this.db.scoped(this.db.clients.values()).find(c => c.id === id) ?? null; }
  async list() { return this.db.scoped(this.db.clients.values()); }
  async save(c: Client) { this.db.clients.set(c.id, c as Row<Client>); }
}
export class MemPortCallRepo implements PortCallRepository {
  constructor(private db: MemoryDb) {}
  async findById(id: string) { return this.db.scoped(this.db.portCalls.values()).find(p => p.id === id) ?? null; }
  async listByTenant(filter?: { status?: string; vesselId?: string }) {
    return this.db.scoped(this.db.portCalls.values())
      .filter(p => (!filter?.status || p.status === filter.status) && (!filter?.vesselId || p.vesselId === filter.vesselId));
  }
  async saveWithEvents(pc: PortCall) { hydrateTimestamps(pc); this.db.portCalls.set(pc.id, pc as Row<PortCall>); }
}
function hydrateTimestamps(pc: PortCall) { pc.updatedAt = nowIso(); }

// ---- Documents adapter -------------------------------------------------------
export class MemDocumentRepo implements DocumentRepository {
  constructor(private db: MemoryDb) {}
  async findById(id: string) { return this.db.scoped(this.db.documents.values()).find(d => d.id === id) ?? null; }
  async listByEntity(entityType: string, entityId: string) {
    return this.db.scoped(this.db.documents.values()).filter(d => d.entityType === entityType && d.entityId === entityId && !d.deletedAt);
  }
  async save(d: Document) { this.db.documents.set(d.id, d as Row<Document>); }
  async softDelete(id: string) { const d = this.db.documents.get(id); if (d) d.deletedAt = nowIso(); }
}

// ---- Finance adapter ---------------------------------------------------------
export class MemInvoiceRepo implements InvoiceRepository {
  private seq = new Map<string, number>();
  constructor(private db: MemoryDb) {}
  async findById(id: string) { return this.db.scoped(this.db.invoices.values()).find(i => i.id === id) ?? null; }
  async listByPortCall(portCallId: string) { return this.db.scoped(this.db.invoices.values()).filter(i => i.portCallId === portCallId); }
  async nextSequenceNumber(tenantId: string, year: number): Promise<string> {
    const key = `${tenantId}:${year}`;
    const n = (this.seq.get(key) ?? 0) + 1;
    this.seq.set(key, n);
    return `${year}/${String(n).padStart(4, '0')}`;
  }
  async save(inv: Invoice) { this.db.invoices.set(inv.id, inv as Row<Invoice>); }
  async savePayment(p: Payment) { this.db.payments.set(p.id, p as Row<Payment>); }
}

// ---- Outbox adapter (§8) ------------------------------------------------------
export class MemOutbox implements OutboxWriter, OutboxStore {
  constructor(private db: MemoryDb) {}
  async enqueue(_tx: TxHandle, event: DomainEvent): Promise<void> {
    this.db.outbox.push({
      id: event.eventId, tenantId: event.tenantId, type: event.type,
      payload: JSON.stringify(event), createdAt: nowIso(), publishedAt: null, attempts: 0, lastError: null,
    });
  }
  async fetchUnpublished(limit: number): Promise<OutboxRecord[]> {
    return this.db.outbox.filter(r => !r.publishedAt).slice(0, limit);
  }
  async markPublished(id: string): Promise<void> {
    const r = this.db.outbox.find(x => x.id === id); if (r) r.publishedAt = nowIso();
  }
  async markFailed(id: string, error: string): Promise<void> {
    const r = this.db.outbox.find(x => x.id === id);
    if (r) { r.attempts++; r.lastError = error; }
  }
}

// ---- Audit sink ---------------------------------------------------------------
export class MemAuditSink {
  constructor(private db: MemoryDb) {}
  record(a: AuditEvent) { this.db.audit.push(a); }
}

