// Application services for Port Operations — synchronous operations (§18).
import { NotFoundError, ValidationError, uuid } from '@portcalls/shared';
import { TenantContext } from '../../shared-kernel/tenant-context/index.js';
import { OutboxWriter, TxHandle } from '../../shared-kernel/outbox/index.js';
import { DomainEvent } from '../../shared-kernel/events/index.js';
import { Vessel, PortCall, Process, Milestone, AuthorityClearance, Client } from '../entities/index.js';
import { VesselRepository, PortCallRepository, ClientRepository } from '../repositories/index.js';
import { portCallCreated, portCallClosed, milestoneCompleted, milestoneOverdue, PortCallPayload, MilestonePayload } from '../events/index.js';

export class PortOperationsService {
  /** Events recorded during a service call; repository persists them in-tx (§8). */
  private pending: DomainEvent[] = [];

  constructor(
    private vessels: VesselRepository,
    private portCalls: PortCallRepository,
    private clients: ClientRepository,
    private outbox: OutboxWriter,
  ) {}

  async registerVessel(input: { name: string; imoNumber: string; flag: string; vesselType: string; grossTonnage: number }): Promise<Vessel> {
    const existing = await this.vessels.findByImo(input.imoNumber);
    if (existing) return existing; // Vessel is persistent across calls — reuse it
    const v = new Vessel(input.name, input.imoNumber, input.flag, input.vesselType, input.grossTonnage);
    v.tenantId = TenantContext.require().tenantId;
    await this.vessels.save(v);
    return v;
  }

  async createClient(input: { name: string; vatNumber: string; email: string; billingAddress: string }): Promise<Client> {
    const c = new Client(input.name, input.vatNumber, input.email, input.billingAddress);
    c.tenantId = TenantContext.require().tenantId;
    await this.clients.save(c);
    return c;
  }

  async createPortCall(input: {
    imoNumber: string; clientId: string; portCode: string; eta: string; etd: string; reference: string;
    template?: Array<{ process: string; milestones: Array<{ name: string; authority: string; offsetHours: number }> }>;
  }): Promise<PortCall> {
    const tenantId = TenantContext.require().tenantId;
    const vessel = await this.vessels.findByImo(input.imoNumber);
    if (!vessel) throw new NotFoundError('Vessel');
    const client = await this.clients.findById(input.clientId);
    if (!client) throw new NotFoundError('Client');

    const pc = new PortCall(vessel.id, client.id, input.portCode, input.eta, input.etd, input.reference);
    pc.tenantId = tenantId;

    // Build the standard clearance process template from ETA/ETD offsets.
    for (const [i, proc] of (input.template ?? DEFAULT_TEMPLATE).entries()) {
      const p = new Process(pc.id, proc.process, i);
      p.tenantId = tenantId;
      for (const [j, m] of proc.milestones.entries()) {
        const ms = new Milestone(m.name, m.authority, shiftIso(input.eta, m.offsetHours), j);
        ms.tenantId = tenantId;
        ms.clearance = new AuthorityClearance(ms.id, m.authority);
        ms.clearance.tenantId = tenantId;
        p.addMilestone(ms);
      }
      pc.addProcess(p);
    }

    this.emit(portCallCreated(tenantId, payloadOf(pc), TenantContext.require().userId));
    await this.portCalls.saveWithEvents(pc);
    await this.flushOutbox();
    return pc;
  }

  async transition(id: string, action: 'schedule' | 'start' | 'complete' | 'close' | 'cancel', reason?: string): Promise<PortCall> {
    const pc = await this.mustFind(id);
    switch (action) {
      case 'schedule': pc.schedule(); break;
      case 'start': pc.start(); break;
      case 'complete': pc.complete(); break;
      case 'close':
        pc.close();
        this.emit(portCallClosed(pc.tenantId, payloadOf(pc), TenantContext.require().userId));
        break;
      case 'cancel': pc.cancel(reason ?? 'no reason given'); break;
    }
    await this.portCalls.saveWithEvents(pc);
    await this.flushOutbox();
    return pc;
  }

  async clearMilestone(portCallId: string, milestoneId: string): Promise<PortCall> {
    const pc = await this.mustFind(portCallId);
    const ms = findMilestone(pc, milestoneId);
    if (!ms) throw new NotFoundError('Milestone');
    ms.clear();
    this.emit(milestoneCompleted(pc.tenantId, msPayload(pc, ms), TenantContext.require().userId));
    await this.portCalls.saveWithEvents(pc);
    await this.flushOutbox();
    return pc;
  }

  /** Nightly/hourly sweep: emits MilestoneOverdue for past-due milestones (§8). */
  async sweepOverdue(now = new Date()): Promise<number> {
    const tenantId = TenantContext.require().tenantId;
    const open = await this.portCalls.listByTenant({ status: 'in_progress' });
    let count = 0;
    for (const pc of open) {
      let dirty = false;
      for (const ms of pc.processes.flatMap(p => p.milestones)) {
        if (ms.markOverdueIfPast(now)) {
          dirty = true; count++;
          this.emit(milestoneOverdue(tenantId, msPayload(pc, ms), 'scheduler'));
        }
      }
      if (dirty) { await this.portCalls.saveWithEvents(pc); }
    }
    await this.flushOutbox();
    return count;
  }

  async getPortCall(id: string): Promise<PortCall> { return this.mustFind(id); }

  private mustFind(id: string): Promise<PortCall> {
    return this.portCalls.findById(id).then(pc => { if (!pc) throw new NotFoundError('PortCall'); return pc; });
  }
  private emit(e: DomainEvent) { this.pending.push(e); }
  private async flushOutbox() {
    const tx: TxHandle = { events: this.pending.splice(0) };
    for (const e of (tx as { events: DomainEvent[] }).events) await this.outbox.enqueue(tx, e);
  }
}

// ---------------------------------------------------------------------------
function payloadOf(pc: PortCall): PortCallPayload {
  return { portCallId: pc.id, vesselId: pc.vesselId, clientId: pc.clientId, portCode: pc.portCode, eta: pc.eta, etd: pc.etd, reference: pc.reference };
}
function msPayload(pc: PortCall, ms: Milestone): MilestonePayload {
  const proc = pc.processes.find(p => p.milestones.some(x => x.id === ms.id))!;
  return { portCallId: pc.id, processId: proc.id, milestoneId: ms.id, name: ms.name, authority: ms.authority, plannedAt: ms.plannedAt };
}
function findMilestone(pc: PortCall, id: string): Milestone | undefined {
  return pc.processes.flatMap(p => p.milestones).find(m => m.id === id);
}
function shiftIso(iso: string, hours: number): string {
  return new Date(new Date(iso).getTime() + hours * 3600_000).toISOString();
}
/** Default Portuguese port-call process template. */
export const DEFAULT_TEMPLATE = [
  { process: 'Chegada', milestones: [
    { name: 'Pré-notificação (FMM)', authority: 'Capitania', offsetHours: -24 },
    { name: 'Despacho de entrada', authority: 'Alfândega', offsetHours: 1 },
    { name: 'Controlo sanitário', authority: 'Sanidade', offsetHours: 2 },
  ]},
  { process: 'Operações', milestones: [
    { name: 'Amarração', authority: 'Capitania', offsetHours: 3 },
    { name: 'Descarga', authority: 'Terminal', offsetHours: 12 },
  ]},
  { process: 'Saída', milestones: [
    { name: 'Despacho de saída', authority: 'Alfândega', offsetHours: 22 },
    { name: 'Livre-prática / partida', authority: 'Capitania', offsetHours: 24 },
  ]},
];
void uuid; void ValidationError;
