// Repository ports for Port Operations (Prisma adapters in infra).
import { Vessel, PortCall, Client } from '../entities/index.js';
import { TxHandle } from '../../shared-kernel/outbox/index.js';

export interface VesselRepository {
  findById(id: string): Promise<Vessel | null>;
  findByImo(imo: string): Promise<Vessel | null>;
  list(): Promise<Vessel[]>;
  save(v: Vessel, tx?: TxHandle): Promise<void>;
}
export interface PortCallRepository {
  findById(id: string): Promise<PortCall | null>;
  listByTenant(filter?: { status?: string; vesselId?: string }): Promise<PortCall[]>;
  /** Persists aggregate AND appends outbox events in one transaction (§8). */
  saveWithEvents(pc: PortCall, tx?: TxHandle): Promise<void>;
}
export interface ClientRepository {
  findById(id: string): Promise<Client | null>;
  list(): Promise<Client[]>;
  save(c: Client): Promise<void>;
}
