// Identity bounded context (§9): User, Organization, Role, Permission, Session
import { uuid, nowIso, EntityBase } from '@portcalls/shared';
import { RoleName, Permission, permissionsForRoles } from '@portcalls/shared';

export class Organization implements EntityBase {
  id = uuid(); tenantId = ''; createdAt = nowIso(); updatedAt = nowIso();
  constructor(public name: string, public domain?: string) {}
}

export class User implements EntityBase {
  id = uuid(); tenantId = ''; createdAt = nowIso(); updatedAt = nowIso();
  active = true;
  constructor(public email: string, public displayName: string, public passwordHash: string) {}
}

/** Membership links a User to an Organization (tenant) with roles. */
export class Membership {
  id = uuid(); tenantId = ''; createdAt = nowIso();
  constructor(public userId: string, public organizationId: string, public roles: RoleName[]) {}
  permissions(): Set<Permission> { return permissionsForRoles(this.roles); }
}

export class Session {
  id = uuid(); tenantId = ''; createdAt = nowIso(); revokedAt: string | null = null;
  constructor(public userId: string, public tokenHash: string, public expiresAt: string) {}
  get isActive(): boolean { return !this.revokedAt && new Date(this.expiresAt) > new Date(); }
}
