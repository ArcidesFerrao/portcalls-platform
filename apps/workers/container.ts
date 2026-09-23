// ---------------------------------------------------------------------------
// Composition root: wires domain services to infra adapters (ports & adapters).
// Shared by the web app and every worker.
// ---------------------------------------------------------------------------
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  IdentityService, PortOperationsService, DocumentService, FinanceService,
  NotificationService, LocalDiskAdapter, OutboxRelay, StorageProvider,
} from '@portcalls/domain';
import {
  MemoryDb, MemUserRepo, MemSessionRepo, MemMembershipRepo, MemVesselRepo,
  MemClientRepo, MemPortCallRepo, MemDocumentRepo, MemInvoiceRepo, MemOutbox,
  InProcessBroker,
} from '@portcalls/infra';
import { ConsoleSender } from '@portcalls/integrations';

export function buildContainer() {
  const db = new MemoryDb();
  const outbox = new MemOutbox(db);
  const broker = new InProcessBroker();

  const identity = new IdentityService(new MemUserRepo(db), new MemSessionRepo(db), new MemMembershipRepo(db));
  const portOps = new PortOperationsService(new MemVesselRepo(db), new MemPortCallRepo(db), new MemClientRepo(db), outbox);
  const storageRoot = process.env.STORAGE_ROOT ?? join(tmpdir(), 'portcalls-storage');
  const adapters = new Map<StorageProvider, import('@portcalls/domain').StorageAdapter>([
    ['local', new LocalDiskAdapter(storageRoot)],
  ]);
  const documents = new DocumentService(new MemDocumentRepo(db), adapters, 'local', outbox);
  const finance = new FinanceService(new MemInvoiceRepo(db), outbox);
  const emailLog = new ConsoleSender();
  const notifications = new NotificationService(new Map([['email', emailLog], ['inapp', emailLog]]));
  const relay = new OutboxRelay(outbox, broker);

  return { db, outbox, broker, identity, portOps, documents, finance, notifications, relay, emailLog };
}
export type Container = ReturnType<typeof buildContainer>;
void join;
