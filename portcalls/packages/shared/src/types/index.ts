// ---------------------------------------------------------------------------
// Shared Kernel — primitive types used across every bounded context
// ---------------------------------------------------------------------------

export type UUID = string;
export type ISODateTime = string; // ISO-8601

export interface EntityBase {
  id: UUID;
  tenantId: UUID;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export class DomainError extends Error {
  constructor(message: string, public readonly code: string = 'DOMAIN_ERROR') {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends DomainError {
  constructor(message: string, public readonly fields?: Record<string, string>) {
    super(message, 'VALIDATION_ERROR');
  }
}

export class ForbiddenError extends DomainError {
  constructor(message = 'Action not permitted') { super(message, 'FORBIDDEN'); }
}

export class NotFoundError extends DomainError {
  constructor(entity: string) { super(`${entity} not found`, 'NOT_FOUND'); }
}

export class ConflictError extends DomainError {
  constructor(message: string) { super(message, 'CONFLICT'); }
}

export function uuid(): UUID {
  // Node 20 crypto.randomUUID without importing node:crypto in shared layer
  return globalThis.crypto.randomUUID();
}

export function nowIso(): ISODateTime {
  return new Date().toISOString();
}
