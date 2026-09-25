// ---------------------------------------------------------------------------
// Transactional Outbox (§8). Repositories persist domain events in the SAME
// transaction as the aggregate change; a relay drains them to the queue.
// ---------------------------------------------------------------------------
import { DomainEvent } from '../events/index.js';

export interface OutboxRecord {
  id: string;
  tenantId: string;
  type: DomainEvent['type'];
  payload: string;          // serialized DomainEvent
  createdAt: string;
  publishedAt: string | null;
  attempts: number;
  lastError: string | null;
}

/** Storage-neutral outbox writer (implemented by infra layer with Prisma). */
export interface OutboxWriter {
  enqueue(tx: TxHandle, event: DomainEvent): Promise<void>;
}

export interface OutboxStore {
  fetchUnpublished(limit: number): Promise<OutboxRecord[]>;
  markPublished(id: string): Promise<void>;
  markFailed(id: string, error: string): Promise<void>;
}

/** Sink where the relay publishes records (queue implementation lives in infra). */
export interface EventSink {
  publish(record: OutboxRecord): Promise<void>;
}

export class OutboxRelay {
  constructor(private readonly store: OutboxStore, private readonly sink: EventSink) {}

  /** One drain pass. Returns number of events published. Zero-loss guarantee:
   *  a record is only marked published after the sink acks it (§19 SLO). */
  async drainOnce(limit = 50): Promise<number> {
    const records = await this.store.fetchUnpublished(limit);
    let published = 0;
    for (const r of records) {
      try {
        await this.sink.publish(r);
        await this.store.markPublished(r.id);
        published++;
      } catch (e) {
        await this.store.markFailed(r.id, (e as Error).message);
      }
    }
    return published;
  }

  async runForever(intervalMs = 1000): Promise<never> {
    for (;;) {
      await this.drainOnce().catch(() => undefined);
      await new Promise((res) => setTimeout(res, intervalMs));
    }
  }
}

/** Marker type for a unit-of-work handle (Prisma tx in production). */
export type TxHandle = unknown;
