// ---------------------------------------------------------------------------
// Core domain (§3): Vessel 1:N PortCall 1:N Process 1:N Milestone 1:1 Clearance
// ---------------------------------------------------------------------------
import { uuid, nowIso, EntityBase, ValidationError } from '@portcalls/shared';

export class Vessel implements EntityBase {
  id = uuid(); tenantId = ''; createdAt = nowIso(); updatedAt = nowIso();
  constructor(
    public name: string,
    public imoNumber: string,   // persistent vessel identity
    public flag: string,
    public vesselType: string,
    public grossTonnage: number,
  ) { this.validate(); }
  validate() {
    if (!this.name.trim()) throw new ValidationError('Vessel name required');
    if (!/^9\d{8}$/.test(this.imoNumber)) throw new ValidationError('IMO number must be 9 digits starting with 9');
    if (this.grossTonnage <= 0) throw new ValidationError('Gross tonnage must be positive');
  }
}

export type PortCallStatus = 'draft' | 'scheduled' | 'in_progress' | 'completed' | 'closed' | 'cancelled';

export class PortCall implements EntityBase {
  id = uuid(); tenantId = ''; createdAt = nowIso(); updatedAt = nowIso();
  status: PortCallStatus = 'draft';
  processes: Process[] = [];
  constructor(
    public vesselId: string,
    public clientId: string,
    public portCode: string,      // UN/LOCODE, e.g. PTLIS
    public eta: string,           // estimated time of arrival
    public etd: string,           // estimated time of departure
    public reference: string,     // agent's operational reference
  ) { this.validate(); }
  validate() {
    if (!/^[A-Z]{2}[A-Z ]{2,5}$/.test(this.portCode)) throw new ValidationError('portCode must be UN/LOCODE (country + 3-char location, e.g. PTLIS or "PT LIS")');
    if (new Date(this.etd) <= new Date(this.eta)) throw new ValidationError('ETD must be after ETA');
  }
  schedule() { this.expect('draft'); this.status = 'scheduled'; this.touch(); }
  start()    { this.expect('scheduled'); this.status = 'in_progress'; this.touch(); }
  complete() {
    this.expect('in_progress');
    const open = this.processes.flatMap(p => p.milestones).filter(m => m.status !== 'cleared' && m.status !== 'skipped');
    if (open.length) throw new ValidationError(`Cannot complete: ${open.length} milestone(s) not cleared`);
    this.status = 'completed'; this.touch();
  }
  close() { this.expect('completed'); this.status = 'closed'; this.closedAt = nowIso(); this.touch(); }
  cancel(reason: string) {
    if (this.status === 'closed' || this.status === 'cancelled') throw new ValidationError(`Cannot cancel a ${this.status} port call`);
    this.status = 'cancelled'; this.cancelReason = reason; this.touch();
  }
  closedAt: string | null = null;
  cancelReason: string | null = null;
  addProcess(p: Process) { this.processes.push(p); this.touch(); }
  progressPct(): number {
    const ms = this.processes.flatMap(p => p.milestones);
    if (!ms.length) return 0;
    return Math.round((ms.filter(m => m.status === 'cleared').length / ms.length) * 100);
  }
  private expect(...allowed: PortCallStatus[]) {
    if (!allowed.includes(this.status)) throw new ValidationError(`Illegal transition ${this.status} → target (expected ${allowed.join('|')})`);
  }
  private touch() { this.updatedAt = nowIso(); }
}

export class Process implements EntityBase {
  id = uuid(); tenantId = ''; createdAt = nowIso(); updatedAt = nowIso();
  milestones: Milestone[] = [];
  constructor(public portCallId: string, public name: string, public order: number) {}
  addMilestone(m: Milestone) { this.milestones.push(m); m.processId = this.id; }
}

export type MilestoneStatus = 'pending' | 'in_progress' | 'cleared' | 'overdue' | 'skipped';

export class Milestone implements EntityBase {
  id = uuid(); tenantId = ''; createdAt = nowIso(); updatedAt = nowIso();
  status: MilestoneStatus = 'pending';
  processId = '';
  clearance: AuthorityClearance | null = null;
  completedAt: string | null = null;
  constructor(
    public name: string,
    public authority: string,          // Alfândega | Capitania | Sanidade | ...
    public plannedAt: string,          // deadline
    public order: number,
  ) {}
  begin() { if (this.status !== 'pending') throw new ValidationError('Only pending milestones can begin'); this.status = 'in_progress'; }
  clear(at = nowIso()) {
    if (this.clearance && !this.clearance.isCleared()) {
      throw new ValidationError('Authority clearance requires all documents before clearing');
    }
    if (this.status === 'cleared') throw new ValidationError('Already cleared');
    this.status = 'cleared'; this.completedAt = at; this.updatedAt = at;
  }
  markOverdueIfPast(now = new Date()): boolean {
    if ((this.status === 'pending' || this.status === 'in_progress') && new Date(this.plannedAt) < now) {
      this.status = 'overdue'; return true;
    }
    return false;
  }
}

export class AuthorityClearance implements EntityBase {
  id = uuid(); tenantId = ''; createdAt = nowIso(); updatedAt = nowIso();
  /** Document ids required by the authority before the milestone can clear. */
  requiredDocumentIds: string[] = [];
  submittedDocumentIds: string[] = [];
  constructor(public milestoneId: string, public authority: string) {}
  require(documents: string[]) { this.requiredDocumentIds = [...new Set([...this.requiredDocumentIds, ...documents])]; }
  submit(documentId: string) { if (!this.submittedDocumentIds.includes(documentId)) this.submittedDocumentIds.push(documentId); }
  isCleared(): boolean { return this.requiredDocumentIds.every(d => this.submittedDocumentIds.includes(d)); }
}

export class Client implements EntityBase {
  id = uuid(); tenantId = ''; createdAt = nowIso(); updatedAt = nowIso();
  constructor(public name: string, public vatNumber: string, public email: string, public billingAddress: string) {
    if (!name.trim()) throw new ValidationError('Client name required');
    if (!/^[A-Z]{2}\d{5,12}$/.test(vatNumber)) throw new ValidationError('VAT must look like PT500000000');
  }
}
