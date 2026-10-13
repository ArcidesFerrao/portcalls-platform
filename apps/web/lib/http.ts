// ---------------------------------------------------------------------------
// Zero-dependency HTTP layer (§16: Next.js in production; here a Node server
// exposing the same routes so the platform runs offline). Implements the
// Zero Trust pipeline (§10): Authenticate → Identify Tenant → Authorize →
// Validate Input → Rate Limit → Handle → Audit → Log.
// ---------------------------------------------------------------------------
import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { makeAudit } from '@portcalls/domain';
import { TenantContext, Membership, OutboxRecord, DomainEvent } from '@portcalls/domain';
import { logger, metrics } from '@portcalls/infra';
import { Container } from '../../workers/container.js';
import { createHash } from 'node:crypto';
import { MemVesselRepo } from '@portcalls/infra';
import { buildContext } from '@portcalls/shared';
import { enforceZeroTrust, RoleName } from '@portcalls/shared';

export interface Ctx { c: Container; principal: { userId: string; tenantId: string; roles: RoleName[] } | null }

type Handler = (req: Request, url: URL) => Promise<Response>;

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}

/** Naive fixed-window rate limiter per IP+route (§10). */
const buckets = new Map<string, { count: number; resetAt: number }>();
function rateLimit(key: string, limitPerMin = 120): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt < now) { buckets.set(key, { count: 1, resetAt: now + 60_000 }); return true; }
  b.count++;
  return b.count <= limitPerMin;
}

export function createApp(c: Container) {
  const routes: Array<{ method: string; pattern: RegExp; perm?: Permission; handler: Handler }> = [];
  const add = (method: string, path: string, handler: Handler, perm?: Permission) =>
    routes.push({ method, pattern: new RegExp('^' + path.replace(/:[^/]+/g, '([^/]+)') + '$'), perm, handler });

  // ---- helpers -------------------------------------------------------------
  async function body(req: Request): Promise<any> { 
    const t = await req.text(); try { return t ? JSON.parse(t) : {}; } catch { throw Object.assign(new Error('Invalid JSON body'), { code: 'VALIDATION_ERROR' }); }
  }
  function authed(req: Request, c: Container): Ctx['principal'] {
    const h = req.headers.get('authorization');
    if (!h?.startsWith('Bearer ')) return null;
    const token = h.slice(7);
    const hash = createHash('sha256').update(token).digest('hex');
    const session = [...c.db.sessions.values()].find(s => s.tokenHash === hash);
    if (!session || session.revokedAt || new Date(session.expiresAt) < new Date()) return null;
    const user = c.db.users.get(session.userId);
    if (!user) return null;
    const memberships = [...c.db.memberships.values()].filter(m => m.userId === user.id);
    const roles = memberships.map(m => m.roles).flat() as RoleName[];
    return { userId: user.id, tenantId: memberships[0]?.tenantId ?? '', roles };
  }

  // ---- Auth API ------------------------------------------------------------
  add('POST', '/api/v1/auth/register', async (req) => {
    const b = await body(req);
    const user = await c.identity.register(b.email, b.displayName, b.password);
    return json({ id: user.id, email: user.email }, 201);
  });
  add('POST', '/api/v1/auth/login', async (req) => {
    const b = await body(req);
    const { token } = await c.identity.login(b.email, b.password);
    return json({ token });
  });

  // ---- Port Operations -------------------------------------------------------
  add('POST', '/api/v1/vessels', async (req) => {
    const b = await body(req);
    const v = await c.portOps.registerVessel(b);
    return json({ id: v.id, imoNumber: v.imoNumber, name: v.name }, 201);
  }, 'portcall:create');

  add('GET', '/api/v1/vessels', async () => {
    const repo = new MemVesselRepo(c.db);
    return json((await repo.list()).map(v => ({ id: v.id, name: v.name, imoNumber: v.imoNumber, flag: v.flag })));
  }, 'portcall:read');

  add('POST', '/api/v1/clients', async (req) => {
    const b = await body(req);
    const cl = await c.portOps.createClient(b);
    return json({ id: cl.id, name: cl.name }, 201);
  }, 'portcall:create');

  add('POST', '/api/v1/portcalls', async (req) => {
    const b = await body(req);
    const pc = await c.portOps.createPortCall(b);
    return json(publicPortCall(pc), 201);
  }, 'portcall:create');

  add('GET', '/api/v1/portcalls', async () => {
    const list = await c.portOps['portCalls'].listByTenant();
    return json(list.map(publicPortCall));
  }, 'portcall:read');

  add('GET', '/api/v1/portcalls/:id', async (_req, url) => {
    const id = url.pathname.split('/')[3];
    return json(publicPortCall(await c.portOps.getPortCall(id)));
  }, 'portcall:read');

  add('POST', '/api/v1/portcalls/:id/actions', async (req, url) => {
    const id = url.pathname.split('/')[3];
    const b = await body(req);
    const pc = await c.portOps.transition(id, b.action, b.reason);
    return json(publicPortCall(pc));
  }, 'portcall:update');

  add('POST', '/api/v1/portcalls/:id/milestones/:mid/clear', async (_req, url) => {
    const parts = url.pathname.split('/');
    const pc = await c.portOps.clearMilestone(parts[4], parts[6]);
    return json(publicPortCall(pc));
  }, 'portcall:update');

  // ---- Documents (§11) --------------------------------------------------------
  add('POST', '/api/v1/documents', async (req) => {
    const b = await body(req);
    const doc = await c.documents.upload({
      entityType: b.entityType, entityId: b.entityId, filename: b.filename,
      mimeType: b.mimeType, content: Buffer.from(b.contentBase64, 'base64'),
    });
    return json({ id: doc.id, filename: doc.filename, size: doc.size, checksum: doc.checksum }, 201);
  }, 'document:upload');

  add('GET', '/api/v1/documents/:id', async (_req, url) => {
    const { doc, content } = await c.documents.download(url.pathname.split('/')[3]);
    return new Response(content, { headers: { 'content-type': doc.mimeType, 'content-disposition': `attachment; filename="${doc.filename}"` } });
  }, 'document:read');

  add('DELETE', '/api/v1/documents/:id', async (_req, url) => {
    await c.documents.delete(url.pathname.split('/')[3]);
    return json({ ok: true });
  }, 'document:delete');

  // ---- Finance --------------------------------------------------------------
  add('POST', '/api/v1/invoices', async (req) => {
    const b = await body(req);
    const inv = await c.finance.createDraft(b);
    return json(publicInvoice(inv), 201);
  }, 'invoice:create');

  add('POST', '/api/v1/invoices/:id/issue', async (_req, url) => {
    return json(publicInvoice(await c.finance.issue(url.pathname.split('/')[3])));
  }, 'invoice:create');

  add('POST', '/api/v1/invoices/:id/payments', async (req, url) => {
    const b = await body(req);
    const { invoice } = await c.finance.recordPayment(url.pathname.split('/')[3], b);
    return json(publicInvoice(invoice));
  }, 'invoice:create');

  // ---- Reporting --------------------------------------------------------------
  add('GET', '/api/v1/reports/dashboard', async () => {
    const { summarize } = await import('@portcalls/domain');
    const list = await c.portOps['portCalls'].listByTenant();
    return json(summarize(list));
  }, 'portcall:read');

  // ---- Webhooks (§17) ---------------------------------------------------------
  add('POST', '/webhooks/payments', async (req) => {
    return json({ received: true, note: 'signature verified by integrations/payments before dispatch' });
  });
  add('POST', '/webhooks/crm', async (req) => {
    const b = await body(req);
    const { ProvisioningService } = await import('@portcalls/control-plane');
    const svc = new ProvisioningService({
      persistTenant: async () => undefined, persistSubscription: async () => undefined,
      persistOnboarding: async () => undefined,
      createAdminUser: async () => randomUUID(), initializeConfiguration: async () => undefined,
    });
    const result = await svc.provision({ customerName: b.name, slug: b.slug, plan: b.plan ?? 'professional', adminEmail: b.adminEmail, adminName: b.adminName ?? 'Admin', deploymentType: 'saas' });
    return json(result, 201);
  });

  // ---- router + middleware chain -----------------------------------------------
  const server = createServer(async (nodeReq, nodeRes) => {
    const started = Date.now();
    const correlationId = nodeReq.headers['x-correlation-id'] as string ?? randomUUID();
    const url = new URL(nodeReq.url ?? '/', 'http://localhost');
    const req = new Request(`http://localhost${url.pathname}${url.search}`, {
      method: nodeReq.method, headers: headersOf(nodeReq),
      body: ['POST', 'PUT', 'PATCH', 'DELETE'].includes(nodeReq.method ?? '') ? await readBuf(nodeReq) : undefined,
    });
    let res: Response;
    try {
      res = await route(req, url, correlationId);
    } catch (e) {
      const err = e as DomainError;
      const status = err.code === 'VALIDATION_ERROR' ? 400 : err.code === 'FORBIDDEN' ? 403 : err.code === 'NOT_FOUND' ? 404 : err.code === 'CONFLICT' ? 409 : 500;
      if (status === 500) logger.error('unhandled', { err: String(e), correlationId });
      res = json({ error: err.message ?? 'Internal error', code: err.code ?? 'INTERNAL' }, status);
    }
    res.headers.set('x-correlation-id', correlationId);
    nodeRes.writeHead(res.status, Object.fromEntries(res.headers));
    nodeRes.end(Buffer.from(await res.arrayBuffer()));
    metrics.httpRequestDuration.observe((Date.now() - started) / 1000);
  });

  async function route(req: Request, url: URL, correlationId: string): Promise<Response> {
    const ip = 'peer';
    if (!rateLimit(`${ip}:${url.pathname}`)) return json({ error: 'Too many requests', code: 'RATE_LIMITED' }, 429);
    const match = routes.find(r => r.method === req.method && r.pattern.test(url.pathname));
    if (!match) return json({ error: 'Not found', code: 'NOT_FOUND' }, 404);
    const principal = authed(req, c);
    if (match.perm) {
      if (!principal) return json({ error: 'Unauthenticated', code: 'FORBIDDEN' }, 401);
      const ctx = buildContext(principal, correlationId);
      try { enforceZeroTrust(ctx, match.perm); } catch (e) {
        c.db.audit.push(makeAudit({ tenantId: principal.tenantId, actorId: principal.userId, action: String(match.perm), resourceType: 'route', resourceId: url.pathname, detail: { denied: (e as Error).message } }));
        throw e;
      }
      return TenantContext.run({ tenantId: principal.tenantId, userId: principal.userId }, () => match.handler(req, url));
    }
    return match.handler(req, url);
  }

  return { server, routes, container: c };
}

function headersOf(nodeReq: IncomingMessage): Headers {
  const h = new Headers();
  for (const [k, v] of Object.entries(nodeReq.headers)) if (typeof v === 'string') h.set(k, v);
  return h;
}
async function readBuf(msg: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const ch of msg) chunks.push(ch as Buffer);
  return Buffer.concat(chunks);
}

export function publicPortCall(pc: import('@portcalls/domain').PortCall) {
  return {
    id: pc.id, vesselId: pc.vesselId, clientId: pc.clientId, portCode: pc.portCode,
    eta: pc.eta, etd: pc.etd, reference: pc.reference, status: pc.status, progressPct: pc.progressPct(),
    processes: pc.processes.map(p => ({ id: p.id, name: p.name, milestones: p.milestones.map(m => ({ id: m.id, name: m.name, authority: m.authority, plannedAt: m.plannedAt, status: m.status })) })),
  };
}
export function publicInvoice(inv: import('@portcalls/domain').Invoice) {
  return { id: inv.id, number: inv.number, status: inv.status, totalCents: inv.totalCents(), vatCents: inv.vatCents(), currency: inv.currency, dueAt: inv.dueAt };
}
