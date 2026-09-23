// ---------------------------------------------------------------------------
// Zero Trust request pipeline helpers (§10). Framework-agnostic: the web app
// and the HTTP API both run requests through `enforceZeroTrust`.
// ---------------------------------------------------------------------------
import { ForbiddenError, ValidationError } from '../types/index.js';
import { Permission, permissionsForRoles, hasPermission } from '../permissions/index.js';
import { RoleName } from '../permissions/index.js';

export interface Principal {
  userId: string;
  tenantId: string;
  roles: RoleName[];
}

export interface RequestContext {
  principal: Principal;
  permissions: Set<Permission>;
  correlationId: string;
}

export function buildContext(principal: Principal, correlationId: string): RequestContext {
  return { principal, permissions: permissionsForRoles(principal.roles), correlationId };
}

/** Authenticate → Identify Tenant → Authorize Action → Validate Input */
export function enforceZeroTrust(
  ctx: RequestContext | null,
  required: Permission,
  validate?: () => void,
): RequestContext {
  if (!ctx) throw new ForbiddenError('Unauthenticated');
  if (!ctx.principal.tenantId) throw new ForbiddenError('Tenant not identified');
  if (!hasPermission(ctx.permissions, required)) {
    throw new ForbiddenError(`Missing permission: ${required}`);
  }
  validate?.();
  return ctx;
}

/** Simple input validation helper (whitelist regex based). */
export function safeInput(value: string, pattern: RegExp, field: string): string {
  if (!pattern.test(value)) throw new ValidationError(`Invalid ${field}`);
  return value;
}
