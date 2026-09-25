// ---------------------------------------------------------------------------
// Domain events (§8 Outbox). Every event carries tenantId + correlationId.
// ---------------------------------------------------------------------------
export type EventTypeName =
  | 'PortCallCreated' | 'PortCallClosed'
  | 'MilestoneCompleted' | 'MilestoneOverdue'
  | 'DocumentUploaded' | 'DocumentDeleted'
  | 'InvoiceCreated' | 'InvoicePaid';

export interface DomainEvent<TPayload = unknown> {
  eventId: string;         // idempotency key for consumers
  type: EventTypeName;
  tenantId: string;
  aggregateType: string;
  aggregateId: string;
  occurredAt: string;
  correlationId: string;
  payload: TPayload;
}

export function makeEvent<P>(
  partial: Omit<DomainEvent<P>, 'eventId' | 'occurredAt'> & Partial<Pick<DomainEvent, 'eventId' | 'occurredAt'>>,
): DomainEvent<P> {
  return {
    eventId: partial.eventId ?? globalThis.crypto.randomUUID(),
    occurredAt: partial.occurredAt ?? new Date().toISOString(),
    ...partial,
  } as DomainEvent<P>;
}
