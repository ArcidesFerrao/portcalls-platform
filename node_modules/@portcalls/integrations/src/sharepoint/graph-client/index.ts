// ---------------------------------------------------------------------------
// Minimal Microsoft Graph client for SharePoint document libraries (§7).
// Uses client-credentials flow; wrapped in circuit breaker + metadata cache.
// HTTP transport injectable for tests/offline mode.
// ---------------------------------------------------------------------------
import { CircuitBreaker } from '../circuit-breaker/index.js';
import { MetadataCache } from '../cache/index.js';

export type HttpFetch = (url: string, init?: RequestInit) => Promise<Response>;

export interface GraphFileMeta { id: string; name: string; size: number; lastModifiedDateTime: string; webUrl?: string; }

export interface GraphConfig {
  tenantId: string;          // AAD tenant
  clientId: string;
  clientSecret: string;
  siteId: string;            // SharePoint root site id
  driveId: string;           // document library drive id
  fetch?: HttpFetch;
  breaker?: CircuitBreaker;
}

export class SharePointGraphClient {
  private token: { value: string; expiresAt: number } | null = null;
  private cache = new MetadataCache<GraphFileMeta[]>(60_000);
  private breaker: CircuitBreaker;
  private http: HttpFetch;
  constructor(private cfg: GraphConfig) {
    this.breaker = cfg.breaker ?? new CircuitBreaker({ failureThreshold: 5, cooldownMs: 30_000 });
    this.http = cfg.fetch ?? ((u, i) => fetch(u, i));
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value;
    const res = await this.http(`https://login.microsoftonline.com/${this.cfg.tenantId}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: this.cfg.clientId, client_secret: this.cfg.clientSecret, scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials' }),
    });
    if (!res.ok) throw new Error(`AAD token error ${res.status}`);
    const j = await res.json() as { access_token: string; expires_in: number };
    this.token = { value: j.access_token, expiresAt: Date.now() + j.expires_in * 1000 };
    return this.token.value;
  }

  async listFolder(path: string): Promise<GraphFileMeta[]> {
    const cached = this.cache.get(path);
    if (cached) return cached;
    try {
      return await this.breaker.exec(async () => {
        const tok = await this.accessToken();
        const res = await this.http(
          `https://graph.microsoft.com/v1.0/sites/${this.cfg.siteId}/drives/${this.cfg.driveId}/root:/${encodeURIComponent(path)}:/children`,
          { headers: { authorization: `Bearer ${tok}` } },
        );
        if (!res.ok) throw new Error(`Graph error ${res.status}`);
        const j = await res.json() as { value: GraphFileMeta[] };
        this.cache.set(path, j.value);
        return j.value;
      });
    } catch (e) {
      const stale = this.cache.getStale(path);
      if (stale) return stale; // degrade gracefully with cached metadata
      throw e;
    }
  }

  async uploadFile(path: string, filename: string, content: Buffer): Promise<GraphFileMeta> {
    return this.breaker.exec(async () => {
      const tok = await this.accessToken();
      const res = await this.http(
        `https://graph.microsoft.com/v1.0/sites/${this.cfg.siteId}/drives/${this.cfg.driveId}/root:/${encodeURIComponent(path + '/' + filename)}:/content`,
        { method: 'PUT', headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/octet-stream' }, body: content },
      );
      if (!res.ok) throw new Error(`Graph upload error ${res.status}`);
      const meta = await res.json() as GraphFileMeta;
      this.cache.invalidate(path);
      return meta;
    });
  }
}
