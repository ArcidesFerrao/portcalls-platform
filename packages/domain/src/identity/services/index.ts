// Authentication + Authorization services (§9, §10).
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { ForbiddenError, ValidationError, uuid, nowIso } from '@portcalls/shared';
import { User, Session, Membership } from '../entities/index.js';
import { UserRepository, SessionRepository, MembershipRepository } from '../repositories/index.js';

const SCRYPT_N = 16384, KEY_LEN = 64;
import { scryptSync } from 'node:crypto';

export function hashPassword(pw: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(pw, salt, KEY_LEN, { N: SCRYPT_N }).toString('hex');
  return `scrypt$${salt}$${hash}`;
}
export function verifyPassword(pw: string, stored: string): boolean {
  const [alg, salt, hash] = stored.split('$');
  if (alg !== 'scrypt') return false;
  const candidate = scryptSync(pw, salt, KEY_LEN, { N: SCRYPT_N });
  return timingSafeEqual(candidate, Buffer.from(hash, 'hex'));
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class IdentityService {
  constructor(
    private users: UserRepository,
    private sessions: SessionRepository,
    private memberships: MembershipRepository,
  ) {}

  async register(email: string, displayName: string, password: string): Promise<User> {
    if (!EMAIL_RE.test(email)) throw new ValidationError('Invalid email');
    if (password.length < 10) throw new ValidationError('Password too short (min 10)');
    if (await this.users.findByEmail(email)) throw new ForbiddenError('Email already registered');
    const user = new User(email.toLowerCase(), displayName, hashPassword(password));
    await this.users.create(user);
    return user;
  }

  /** Returns session token (raw — only its hash is persisted). */
  async login(email: string, password: string, ttlHours = 12): Promise<{ session: Session; token: string }> {
    const user = await this.users.findByEmail(email);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      throw new ForbiddenError('Invalid credentials'); // same error → no user enumeration
    }
    const token = randomBytes(32).toString('base64url');
    const session = new Session(user.id, this.hashToken(token),
      new Date(Date.now() + ttlHours * 3600_000).toISOString());
    session.tenantId = user.tenantId;
    await this.sessions.create(session);
    return { session, token };
  }

  async logout(sessionId: string): Promise<void> { await this.sessions.revoke(sessionId); }

  async resolve(token: string): Promise<{ user: User; memberships: Membership[] } | null> {
    const session = await this.sessions.findByTokenHash(this.hashToken(token));
    if (!session || !session.isActive) return null;
    const user = await this.users.findById(session.userId);
    if (!user || !user.active) return null;
    const memberships = await this.memberships.listByUser(user.id);
    return { user, memberships };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
