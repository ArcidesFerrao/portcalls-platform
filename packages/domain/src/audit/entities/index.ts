// AuditEvent — append-only trail consumed from the outbox (§8, §10 "Audit").
import { uuid, nowIso } from '@portcalls/shared';

export interface AuditEvent {
  id: string;
  tenantId: string;
  actorId: string;
  action: string;          // permission-style verb or event type
  resourceType: string;
  resourceId: string;
  detail: Record<string, unknown>;
  ip?: string;
  createdAt: string;
}

export function makeAudit(partial: Omit<AuditEvent, 'id' | 'createdAt'>): AuditEvent {
  return { id: uuid(), createdAt: nowIso(), ...partial };
}
