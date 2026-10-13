// Local metadata cache (§7): reads keep working even when SharePoint is down.
export interface CacheEntry<T> { value: T; expiresAt: number; }

export class MetadataCache<T> {
  private map = new Map<string, CacheEntry<T>>();
  constructor(private ttlMs = 5 * 60_000, private now: () => number = Date.now) {}

  get(key: string): T | undefined {
    const e = this.map.get(key);
    if (!e) return undefined;
    // Expired entries are hidden from fresh reads but KEPT in the map so that
    // getStale() can still serve them while upstream (SharePoint) is down (§7).
    if (e.expiresAt <= this.now()) return undefined;
    return e.value;
  }
  /** Stale entry still returned on upstream failure ("leitura mesmo com SharePoint em baixo"). */
  getStale(key: string): T | undefined { return this.map.get(key)?.value; }
  set(key: string, value: T): void { this.map.set(key, { value, expiresAt: this.now() + this.ttlMs }); }
  invalidate(key: string): void { this.map.delete(key); }
  get size(): number { return this.map.size; }
}
