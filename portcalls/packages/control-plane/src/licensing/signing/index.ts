// ---------------------------------------------------------------------------
// License signing (§12): private key NEVER leaves Evolure (sign side);
// on-premise installs embed only the PUBLIC key to verify.
// ---------------------------------------------------------------------------
import { sign, verify, createHash } from 'node:crypto';
import { LicensePayload, SignedLicense } from '../entities/index.js';

/** Canonical JSON: sorted keys, no whitespace — stable across runtimes. */
export function canonicalJson(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(obj as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}

export function licenseDigest(payload: LicensePayload): Buffer {
  return createHash('sha256').update(canonicalJson(payload)).digest();
}

/** Evolure side — requires the PEM private key (kept in control-plane HSM/vault). */
export function signLicense(payload: LicensePayload, privateKeyPem: string): SignedLicense {
  const signature = sign(null, licenseDigest(payload), privateKeyPem).toString('base64');
  return { payload, signature };
}

/** Customer side — public key shipped inside the appliance image. */
export function verifyLicense(lic: SignedLicense, publicKeyPem: string): boolean {
  try {
    return verify(null, licenseDigest(lic.payload), publicKeyPem, Buffer.from(lic.signature, 'base64'));
  } catch { return false; }
}
