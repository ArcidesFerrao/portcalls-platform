// License entity for on-premise deployments (§12).
export type LicenseStatus = 'ACTIVE' | 'EXPIRING_SOON' | 'GRACE_PERIOD' | 'EXPIRED' | 'REVOKED';

export interface LicensePayload {
  customerId: string;
  product: 'portcalls';
  deploymentType: 'on_premise' | 'hybrid';
  issuedAt: string;
  expiresAt: string;
  gracePeriodDays: number;
  renewalPolicy: 'auto' | 'manual';
  maxUsers: number;
  features: string[];
  tier: 'basic' | 'professional' | 'enterprise';
}

export interface SignedLicense {
  payload: LicensePayload;
  /** base64 Ed25519 signature over canonical JSON of payload. */
  signature: string;
}
