// License state machine (§12): ACTIVE → EXPIRING_SOON → GRACE_PERIOD → EXPIRED → REVOKED
import { SignedLicense, LicenseStatus } from '../entities/index.js';
import { verifyLicense } from '../signing/index.js';

export interface LicenseEvaluation {
  status: LicenseStatus;
  readOnly: boolean;           // EXPIRED/REVOKED ⇒ read-only mode
  daysRemaining: number;
}

export function evaluateLicense(lic: SignedLicense, publicKeyPem: string, now = new Date()): LicenseEvaluation {
  if (!verifyLicense(lic, publicKeyPem)) return { status: 'REVOKED', readOnly: true, daysRemaining: 0 };
  const p = lic.payload;
  const expires = new Date(p.expiresAt);
  const graceEnd = new Date(expires.getTime() + p.gracePeriodDays * 86400_000);
  const msPerDay = 86400_000;
  if (now >= graceEnd) return { status: 'EXPIRED', readOnly: true, daysRemaining: 0 };
  if (now >= expires) return { status: 'GRACE_PERIOD', readOnly: false, daysRemaining: Math.ceil((graceEnd.getTime() - now.getTime()) / msPerDay) };
  const days = Math.ceil((expires.getTime() - now.getTime()) / msPerDay);
  return { status: days <= 30 ? 'EXPIRING_SOON' : 'ACTIVE', readOnly: false, daysRemaining: days };
}
