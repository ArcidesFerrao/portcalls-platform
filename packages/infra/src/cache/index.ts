// Cache port (§6). Production: Redis adapter; dev/test: in-memory LRU+TTL.
export interface CachePort {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  del(key: string): Promise<void>;
}

export class MemoryCache implements CachePort {
  private map = new Map<string, { v: unknown; exp: number }>();
  async get<T>(key: string): Promise<T | null> {
    const e = this.map.get(key);
    if (!e) return null;
    if (e.exp < Date.now()) { this.map.delete(key); return null; }
    return e.v as T;
  }
  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    this.map.set(key, { v: value, exp: Date.now() + ttlSeconds * 1000 });
  }
  async del(key: string): Promise<void> { this.map.delete(key); }
}
