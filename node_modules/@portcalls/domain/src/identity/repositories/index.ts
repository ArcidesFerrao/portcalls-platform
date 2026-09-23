// Repository ports for the Identity context (adapters in infra).
import { User, Membership, Session } from '../entities/index.js';

export interface UserRepository {
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  create(user: User): Promise<void>;
}
export interface MembershipRepository {
  listByUser(userId: string): Promise<Membership[]>;
  create(m: Membership): Promise<void>;
}
export interface SessionRepository {
  create(s: Session): Promise<void>;
  findByTokenHash(hash: string): Promise<Session | null>;
  revoke(id: string): Promise<void>;
}
