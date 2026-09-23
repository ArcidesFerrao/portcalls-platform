// Onboarding state machine (§14).
import { uuid, nowIso, EntityBase } from '@portcalls/shared';

export const ONBOARDING_STATES = [
  'LEAD', 'QUALIFIED', 'DEMO', 'PROPOSAL', 'ACCEPTED', 'PAYMENT_PENDING', 'PAID',
  'PROVISIONING', 'CONFIGURATION', 'INTEGRATION', 'USER_SETUP', 'TRAINING', 'READY', 'LIVE',
] as const;
export type OnboardingState = typeof ONBOARDING_STATES[number];

const TRANSITIONS: Record<OnboardingState, OnboardingState[]> = {
  LEAD: ['QUALIFIED'], QUALIFIED: ['DEMO'], DEMO: ['PROPOSAL'], PROPOSAL: ['ACCEPTED'],
  ACCEPTED: ['PAYMENT_PENDING'], PAYMENT_PENDING: ['PAID'], PAID: ['PROVISIONING'],
  PROVISIONING: ['CONFIGURATION'], CONFIGURATION: ['INTEGRATION'], INTEGRATION: ['USER_SETUP'],
  USER_SETUP: ['TRAINING'], TRAINING: ['READY'], READY: ['LIVE'], LIVE: [],
};

export class Onboarding implements EntityBase {
  id = uuid(); tenantId = ''; createdAt = nowIso(); updatedAt = nowIso();
  state: OnboardingState = 'LEAD';
  history: Array<{ from: OnboardingState; to: OnboardingState; at: string; actor: string }> = [];
  constructor(public customerName: string, public source: 'crm_webhook' | 'manual') {}

  canTransition(to: OnboardingState): boolean { return TRANSITIONS[this.state].includes(to); }

  transition(to: OnboardingState, actor: string): OnboardingState {
    if (!this.canTransition(to)) throw new Error(`Illegal onboarding transition ${this.state} → ${to}`);
    this.history.push({ from: this.state, to, at: nowIso(), actor });
    this.state = to; this.updatedAt = nowIso();
    return this.state;
  }

  /** §14 checkpoints */
  get provisioned(): boolean { return this.history.some(h => h.to === 'PROVISIONING'); }
  get isLive(): boolean { return this.state === 'LIVE'; }
}
