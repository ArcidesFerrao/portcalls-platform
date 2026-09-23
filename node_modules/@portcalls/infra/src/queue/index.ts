// Queue abstraction (§8). Production: Redis Streams/BullMQ adapter behind this
// same interface; here an in-process broker keeps the platform fully runnable.
import type { OutboxRecord } from '@portcalls/domain';

export interface MessageHandler { handle(record: OutboxRecord): Promise<void>; }

export class InProcessBroker {
  private subscriptions: Array<{ pattern: string; handler: MessageHandler }> = [];
  public delivered: OutboxRecord[] = [];

  subscribe(pattern: string, handler: MessageHandler): void {
    this.subscriptions.push({ pattern, handler });
  }

  /** Publish with at-least-once semantics: failures are retried by caller. */
  async publish(record: OutboxRecord): Promise<void> {
    const subs = this.subscriptions.filter(s => s.pattern === '*' || s.pattern === record.type);
    if (!subs.length) throw new Error(`No subscriber for event ${record.type}`);
    for (const s of subs) await s.handler.handle(record); // throws → relay retries (§19 zero-loss)
    this.delivered.push(record);
  }
}
