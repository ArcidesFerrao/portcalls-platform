// ---------------------------------------------------------------------------
// Circuit Breaker (§7): CLOSED → (N consecutive failures) → OPEN →
// (half-open probe after cooldown) → CLOSED/OPEN. Protects the app from a
// SharePoint that is down so requests fail fast instead of piling up.
// ---------------------------------------------------------------------------
export type BreakerState = 'closed' | 'open' | 'half_open';

export interface BreakerOptions { failureThreshold: number; cooldownMs: number; now?: () => number; }

export class CircuitBreaker {
  private state: BreakerState = 'closed';
  private failures = 0;
  private openedAt = 0;
  private readonly clock: () => number;
  constructor(private opts: BreakerOptions) { this.clock = opts.now ?? Date.now; }

  get current(): BreakerState {
    if (this.state === 'open' && this.clock() - this.openedAt >= this.opts.cooldownMs) this.state = 'half_open';
    return this.state;
  }

  async exec<T>(fn: () => Promise<T>): Promise<T> {
    const s = this.current;
    if (s === 'open') throw new Error('Circuit open: SharePoint unavailable, failing fast');
    try {
      const out = await fn();
      this.onSuccess();
      return out;
    } catch (e) {
      this.onFailure();
      throw e;
    }
  }

  private onSuccess() { this.failures = 0; this.state = 'closed'; }
  private onFailure() {
    this.failures++;
    if (this.state === 'half_open' || this.failures >= this.opts.failureThreshold) {
      this.state = 'open'; this.openedAt = this.clock();
    }
  }
}
