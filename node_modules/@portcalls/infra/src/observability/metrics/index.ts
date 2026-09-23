// Metrics registry (§19): counters/histograms + PromQL-style alert rules file.
class Histogram {
  private values: number[] = [];
  observe(v: number) { this.values.push(v); if (this.values.length > 10_000) this.values.splice(0, 5_000); }
  percentile(p: number): number {
    if (!this.values.length) return 0;
    const s = [...this.values].sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.floor(s.length * p))];
  }
  get count() { return this.values.length; }
}

export const metrics = {
  httpRequestDuration: new Histogram(),   // seconds — SLO p95 < 2s (§19)
  eventsProcessed: new Map<string, number>(), // per event type
  errorsTotal: 0,
  latencyBudgetRemaining(): number {
    const p95 = this.httpRequestDuration.percentile(0.95);
    return Math.max(0, 1 - p95 / 2); // budget vs 2s target
  },
  recordEvent(type: string) {
    this.eventsProcessed.set(type, (this.eventsProcessed.get(type) ?? 0) + 1);
  },
};
export { Histogram };
