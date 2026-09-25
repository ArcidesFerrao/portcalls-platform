// ---------------------------------------------------------------------------
// Authorization model (TheArchitecture.md §6): permission strings + roles
// ---------------------------------------------------------------------------

export const PERMISSIONS = [
  'portcall:create', 'portcall:read', 'portcall:update', 'portcall:close',
  'document:read', 'document:upload', 'document:delete',
  'invoice:read', 'invoice:create',
  'user:manage', 'billing:manage', 'settings:manage',
] as const;

export type Permission = typeof PERMISSIONS[number];

export type RoleName = 'Admin' | 'Operations' | 'Finance' | 'Viewer';

const WILDCARD = (prefix: string): Permission[] =>
  PERMISSIONS.filter((p) => p.startsWith(prefix));

export const ROLE_PERMISSIONS: Record<RoleName, Permission[]> = {
  Admin: [...PERMISSIONS],                    // Admin → *
  Operations: [...WILDCARD('portcall:'), ...WILDCARD('document:')],
  Finance: [...WILDCARD('invoice:'), 'document:read'],
  Viewer: PERMISSIONS.filter((p) => p.endsWith(':read')),
};

export function hasPermission(granted: Set<Permission>, required: Permission): boolean {
  return granted.has(required);
}

export function permissionsForRoles(roles: RoleName[]): Set<Permission> {
  const set = new Set<Permission>();
  for (const r of roles) for (const p of ROLE_PERMISSIONS[r]) set.add(p);
  return set;
}
