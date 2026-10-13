// Entry point: HTTP API + minimal SSR dashboard (§16).
import { buildContainer } from '../workers/container.js';
import { createApp } from './lib/http.ts';
import { TenantContext, Membership, User } from '@portcalls/domain';
import { hashPassword } from '@portcalls/domain';
import { logger } from '@portcalls/infra';

const c = buildContainer();
const app = createApp(c);

// Demo bootstrap: tenant + admin user so the platform is usable immediately.
const TENANT_ID = globalThis.crypto.randomUUID();
const admin = new User('admin@demo.evolutecare.pt', 'Demo Admin', hashPassword('Sup3rSecret!2026'));
c.db.users.set(admin.id, admin as never);
c.db.users.set(admin.email, admin as never);
const mem = new Membership(admin.id, TENANT_ID, ['Admin']);
mem.tenantId = TENANT_ID;
c.db.memberships.set(mem.id, mem as never);
logger.info('demo tenant bootstrapped', { tenantId: TENANT_ID, email: admin.email });

app.server.on('request', async (req, res) => {
  if ((req.url ?? '') === '/' ) {
    const html = await renderDashboard();
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }
});
const PORT = Number(process.env.PORT ?? 3000);
app.server.listen(PORT, () => logger.info(`PortCalls web ready on http://localhost:${PORT}`));

async function renderDashboard(): Promise<string> {
  // Server Components equivalent: render on server, ship no JS (§16).
  let body = '<tr><td colspan="5">Sem escalas — faça login e crie a primeira.</td></tr>';
  try {
    const list = await TenantContext.run({ tenantId: TENANT_ID, userId: admin.id }, async () => {
      const { MemPortCallRepo } = await import('@portcalls/infra');
      return new MemPortCallRepo(c.db).listByTenant();
    });
    if (list.length) {
      body = list.map(pc => `<tr><td>${esc(pc.reference)}</td><td>${esc(pc.portCode)}</td><td>${pc.eta.slice(0,10)}</td><td><span class="badge ${pc.status}">${pc.status}</span></td><td>${pc.progressPct()}%</td></tr>`).join('');
    }
  } catch { /* unauthenticated visitors see empty shell */ }
  return `<!doctype html><html lang="pt"><head><meta charset="utf-8"/><title>PortCalls — Evolure</title>
<link rel="stylesheet" href="/styles.css"/></head><body>
<header><strong>⚓ PortCalls</strong> <nav><a href="/portcalls">Escala de Navios</a><a href="/vessels">Navios</a><a href="/clients">Clientes</a><a href="/documents">Documentos</a><a href="/invoices">Faturas</a><a href="/settings">Configurações</a><a href="/admin">Administração</a></nav></header>
<main><h1>Dashboard</h1><table><thead><tr><th>Referência</th><th>Porto</th><th>ETA</th><th>Status</th><th>Progresso</th></tr></thead><tbody>${body}</tbody></table></main></body></html>`;
}
function esc(s: string): string { return s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;'); }
void User;
