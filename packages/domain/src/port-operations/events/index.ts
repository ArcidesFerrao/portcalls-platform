// Domain events emitted by the Port Operations context (§8).
import { makeEvent, DomainEvent } from '../../shared-kernel/events/index.js';

export interface PortCallPayload {
  portCallId: string; vesselId: string; clientId: string;
  portCode: string; eta: string; etd: string; reference: string;
}
export interface MilestonePayload {
  portCallId: string; processId: string; milestoneId: string;
  name: string; authority: string; plannedAt: string;
}

export const portCallCreated = (t: string, p: PortCallPayload, c: string): DomainEvent<PortCallPayload> =>
  makeEvent({ type: 'PortCallCreated', tenantId: t, aggregateType: 'PortCall', aggregateId: p.portCallId, correlationId: c, payload: p });

export const portCallClosed = (t: string, p: PortCallPayload, c: string): DomainEvent<PortCallPayload> =>
  makeEvent({ type: 'PortCallClosed', tenantId: t, aggregateType: 'PortCall', aggregateId: p.portCallId, correlationId: c, payload: p });

export const milestoneCompleted = (t: string, p: MilestonePayload, c: string): DomainEvent<MilestonePayload> =>
  makeEvent({ type: 'MilestoneCompleted', tenantId: t, aggregateType: 'Milestone', aggregateId: p.milestoneId, correlationId: c, payload: p });

export const milestoneOverdue = (t: string, p: MilestonePayload, c: string): DomainEvent<MilestonePayload> =>
  makeEvent({ type: 'MilestoneOverdue', tenantId: t, aggregateType: 'Milestone', aggregateId: p.milestoneId, correlationId: c, payload: p });
