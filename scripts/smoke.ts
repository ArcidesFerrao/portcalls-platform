// ---------------------------------------------------------------------------
// End-to-end smoke test (§20): exercises every bounded context + workers.
// Run: npm run smoke
// ---------------------------------------------------------------------------
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  TenantContext, Membership, User, hashPassword, OutboxRelay, summarize,
} from '@portcalls/domain';
import { MemVesselRepo, MemPortCallRepo, MemOutbox } from '@portcalls/infra';
import { ProvisioningService, Onboarding } from '@portcalls/control-plane';
import { CircuitBreaker, MetadataCache, verifyStripeLikeSignature } from '@portcalls/integrations';
import { generateMonthlyReport } from '../apps/workers/report-generation/main.js';
import { buildContainer } from '../apps/workers/container.js';
import { createApp } from '../apps/web/lib/http.js';
import { addressInfo } from './net.js';

let passed = 0;
async function test(name: string, fn: () => Promise<void> | void) {
  await fn(); passed++; console.log(`  \u2713 ${name}`);
}

console.log('PortCalls \u2014 smoke suite\n');

// 1. Multi-tenancy + RLS-equivalent scoping (§5)
await test('tenant isolation in repository layer', async () => {
  const c = buildContainer();
  const tA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', tB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  await TenantContext.run({ tenantId: tA, userId: 'u1' }, async () => {
    await c.portOps.registerVessel({ name: 'A', imoNumber: '991234567', flag: 'PT', vesselType: 'cargo', grossTonnage: 5000 });
  });
  await TenantContext.run({ tenantId: tB, userId: 'u2' }, async () => {
    const list = await new MemVesselRepo(c.db).list();
    assert.equal(list.length, 0, 'tenant B must not see tenant A vessels');
  });
});

// 2. Domain model state machine (§3)
await test('port call lifecycle transitions enforced', async () => {
  const c = buildContainer();
  const T = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  await TenantContext.run({ tenantId: T, userId: 'ops' }, async () => {
    await c.portOps.registerVessel({ name: 'Atlantic Star', imoNumber: '907472938', flag: 'PT', vesselType: 'tanker', grossTonnage: 48211 });
    const client = await c.portOps.createClient({ name: 'Evolure Shipping', vatNumber: 'PT500000000', email: 'op@evolure.pt', billingAddress: 'Lisboa' });
    const pc = await c.portOps.createPortCall({ imoNumber: '907472938', clientId: client.id, portCode: 'PT LIS', eta: '2026-10-01T08:00:00Z', etd: '2026-10-02T08:00:00Z', reference: 'PC-2026-001' });
    assert.equal(pc.status, 'draft');
    await assert.rejects(() => c.portOps.transition(pc.id, 'start'), /Illegal transition/);
    await c.portOps.transition(pc.id, 'schedule');
    await c.portOps.transition(pc.id, 'start');
    await assert.rejects(() => c.portOps.transition(pc.id, 'complete'), /not cleared/);
    for (const m of pc.processes.flatMap(p => p.milestones)) await c.portOps.clearMilestone(pc.id, m.id);
    await c.portOps.transition(pc.id, 'complete');
    await c.portOps.transition(pc.id, 'close');
    assert.equal(pc.status, 'closed');
    assert.equal(pc.progressPct(), 100);
  });
});

// 3. Transactional outbox + relay + queue consumers (§8)
await test('outbox events flow to notification worker (zero-loss)', async () => {
  const c = buildContainer();
  const { notificationHandler } = await import('../apps/workers/notifications/main.js');
  const T = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  await TenantContext.run({ tenantId: T, userId: 'ops' }, async () => {
    await c.portOps.registerVessel({ name: 'Cape Runner', imoNumber: '915556789', flag: 'PA', vesselType: 'bulk', grossTonnage: 82000 });
    const client = await c.portOps.createClient({ name: 'Cape Lines', vatNumber: 'PA900123456', email: 'ops@cape.pa', billingAddress: 'Panama' });
    const pc = await c.portOps.createPortCall({ imoNumber: '915556789', clientId: client.id, portCode: 'PA ON', eta: '2026-09-20T00:00:00Z', etd: '2026-09-21T00:00:00Z', reference: 'PC-X' });
    await c.portOps.transition(pc.id, 'schedule');
    await c.portOps.transition(pc.id, 'start');
    for (const m of pc.processes.flatMap(p => p.milestones)) await c.portOps.clearMilestone(pc.id, m.id);
    await c.portOps.transition(pc.id, 'complete');
    await c.portOps.transition(pc.id, 'close');
    assert.ok(c.db.outbox.length >= 2, 'events persisted transactionally');
    assert.ok(c.db.outbox.every(r => !r.publishedAt), 'nothing published until relay runs');
    c.broker.subscribe('*', notificationHandler());
    const relay = new OutboxRelay(new MemOutbox(c.db), c.broker);
    const n = await relay.drainOnce(100);
    assert.ok(n >= 2, 'relay drained events');
    assert.ok(c.emailLog.sent.some(m => m.subject.includes('fechada')), 'notification rendered & dispatched');
  });
});

// 4. Documents pipeline (§7, §11)
await test('upload validation chain rejects bad files, stores good ones', async () => {
  const c = buildContainer();
  const T = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  await TenantContext.run({ tenantId: T, userId: 'doc-user' }, async () => {
    const ok = Buffer.from('%PDF-1.4 fake pdf content');
    const doc = await c.documents.upload({ entityType: 'portcall', entityId: 'pc1', filename: 'manifest.pdf', mimeType: 'application/pdf', content: ok });
    assert.match(doc.checksum, /^[a-f0-9]{64}$/);
    const { content } = await c.documents.download(doc.id);
    assert.deepEqual(content, ok);
    await assert.rejects(() => c.documents.upload({ entityType: 'portcall', entityId: 'pc1', filename: 'evil.exe', mimeType: 'application/pdf', content: ok }), /Extension/, 'exe disguised as pdf rejected');
    await assert.rejects(() => c.documents.upload({ entityType: 'portcall', entityId: 'pc1', filename: 'note.txt', mimeType: 'application/zip', content: ok }), /Unsupported MIME/);
    await c.documents.delete(doc.id);
    await assert.rejects(() => c.documents.download(doc.id), /not found/i);
  });
});

// 5. Finance (§3)
await test('invoice issue + payment with VAT math', async () => {
  const c = buildContainer();
  const T = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
  await TenantContext.run({ tenantId: T, userId: 'fin' }, async () => {
    const inv = await c.finance.createDraft({ portCallId: 'pc9', clientId: 'cl9', lines: [{ description: 'Agent fees', quantity: 2, unitPriceCents: 50000, vatRatePct: 23 }] });
    assert.equal(inv.subtotalCents(), 100000);
    assert.equal(inv.vatCents(), 23000);
    assert.equal(inv.totalCents(), 123000);
    await c.finance.issue(inv.id);
    assert.match(inv.number!, /^\d{4}\/\d{4}$/);
    const { invoice } = await c.finance.recordPayment(inv.id, { amountCents: 123000, method: 'transfer', reference: 'SEPA-1' });
    assert.equal(invoice.status, 'paid');
  });
});

// 6. Control plane: provisioning + onboarding states (§14, §15)
await test('CRM webhook provisions tenant and advances onboarding', async () => {
  const svc = new ProvisioningService({
    persistTenant: async () => {}, persistSubscription: async () => {}, persistOnboarding: async () => {},
    createAdminUser: async () => 'user-1', initializeConfiguration: async () => {},
  });
  const r = await svc.provision({ customerName: 'Nova Agências', slug: 'nova-agencias', plan: 'enterprise', adminEmail: 'a@b.pt', adminName: 'A', deploymentType: 'saas' });
  assert.ok(r.tenantId && r.subscriptionId && r.adminUserId);
  const ob = new Onboarding('X', 'manual');
  for (const s of ['QUALIFIED','DEMO','PROPOSAL','ACCEPTED','PAYMENT_PENDING','PAID'] as const) ob.transition(s, 'crm');
  assert.equal(ob.state, 'PAID');
  assert.throws(() => { ob.transition('LIVE', 'crm'); }, /Illegal/);
});

// 7. Licensing Ed25519 (§12)
await test('license signed by Evolure verifies on-premise; tamper fails', async () => {
  const { generateKeyPairSync } = await import('node:crypto');
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const { signLicense, verifyLicense, evaluateLicense, canonicalJson } = await import('@portcalls/control-plane');
  const priv = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const payload = {
    customerId: 'cust-1', product: 'portcalls' as const, deploymentType: 'on_premise' as const,
    issuedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 365 * 86400_000).toISOString(),
    gracePeriodDays: 14, renewalPolicy: 'auto' as const, maxUsers: 50, features: ['sharepoint'], tier: 'enterprise' as const,
  };
  const lic = signLicense(payload, priv);
  const pub = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  assert.ok(verifyLicense(lic, pub));
  assert.equal(evaluateLicense(lic, pub).status, 'ACTIVE');
  const expired = { ...payload, expiresAt: new Date(Date.now() - 5 * 86400_000).toISOString() };
  assert.equal(evaluateLicense(signLicense(expired, priv), pub).status, 'GRACE_PERIOD');
  assert.ok(!verifyLicense({ ...lic, payload: { ...lic.payload, maxUsers: 9999 } }, pub), 'tampered payload invalid');
  assert.ok(canonicalJson({ b: 1, a: 2 }) === '{"a":2,"b":1}', 'canonical JSON sorts keys');
});

// 8. SharePoint resilience (§7)
await test('circuit breaker opens after failures; cache serves stale reads', async () => {
  let clock = 0;
  const br = new CircuitBreaker({ failureThreshold: 3, cooldownMs: 1000, now: () => clock });
  for (let i = 0; i < 3; i++) await br.exec(() => Promise.reject(new Error('boom'))).catch(() => {});
  assert.equal(br.current, 'open');
  await assert.rejects(() => br.exec(() => Promise.resolve(1)), /failing fast/);
  clock = 1500;
  assert.equal(br.current, 'half_open');
  await br.exec(() => Promise.resolve(1));
  assert.equal(br.current, 'closed');
  const cache = new MetadataCache<string>(100, () => clock);
  cache.set('k', 'v'); clock = 140;
  assert.equal(cache.get('k'), undefined);
  assert.equal(cache.getStale('k'), 'v', 'stale read still available when upstream down');
});

// 9. Payments webhook signature (§17)
await test('webhook HMAC verification accepts valid, rejects forged', async () => {
  const { createHmac } = await import('node:crypto');
  const secret = 'whsec_test';
  const body = JSON.stringify({ type: 'checkout.session.completed' });
  const t = Math.floor(Date.now() / 1000);
  const v1 = createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
  assert.ok(verifyStripeLikeSignature(body, `t=${t},v1=${v1}`, secret));
  assert.ok(!verifyStripeLikeSignature(body, `t=${t},v1=deadbeef`, secret));
  assert.ok(!verifyStripeLikeSignature(body, `t=${t - 9999},v1=${v1}`, secret), 'replay outside window rejected');
});

// 10. Zero Trust HTTP pipeline end-to-end (§10)
await test('HTTP API enforces authN, authZ, tenant scoping via real server', async () => {
  const c = buildContainer();
  const app = createApp(c);
  await new Promise<void>(res => app.server.listen(0, res));
  const base = `http://127.0.0.1:${addressInfo(app.server)}`;
  const TENANT = 'abababab-abab-4bab-8bab-abababababab';
  const email = `admin-${Date.now()}@demo.pt`;
  const reg = await fetch(`${base}/api/v1/auth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, displayName: 'A', password: 'Sup3rSecret!2026' }) });
  assert.equal(reg.status, 201);
  const unauth = await fetch(`${base}/api/v1/portcalls`);
  assert.equal(unauth.status, 401, 'unauthenticated rejected');
  const login = await fetch(`${base}/api/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'Sup3rSecret!2026' }) });
  const { token } = await login.json() as { token: string };
  assert.ok(token);
  const hash = createHash('sha256').update(token).digest('hex');
  const session = [...c.db.sessions.values()].find(s => s.tokenHash === hash)!;
  const mem = new Membership(session.userId, TENANT, ['Admin']);
  mem.tenantId = TENANT;
  c.db.memberships.set(mem.id, mem as never);
  const listRes = await fetch(`${base}/api/v1/portcalls`, { headers: { authorization: `Bearer ${token}` } });
  assert.equal(listRes.status, 200);
  const created = await fetch(`${base}/api/v1/portcalls`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ imoNumber: '990000001', clientId: 'nope', portCode: 'PT LIS', eta: '2026-11-01T00:00:00Z', etd: '2026-11-02T00:00:00Z', reference: 'R1' }) });
  assert.equal(created.status, 404, 'missing vessel maps to NOT_FOUND through error mapper');
  const viewer = new User(`viewer-${Date.now()}@demo.pt`, 'V', hashPassword('AnotherSecret!9'));
  c.db.users.set(viewer.id, viewer as never); c.db.users.set(viewer.email, viewer as never);
  const vm = new Membership(viewer.id, TENANT, ['Viewer']);
  vm.tenantId = TENANT;
  c.db.memberships.set(vm.id, vm as never);
  const vtok = (await c.identity.login(viewer.email, 'AnotherSecret!9')).token;
  const forbidden = await fetch(`${base}/api/v1/portcalls`, { method: 'POST', headers: { authorization: `Bearer ${vtok}`, 'content-type': 'application/json' }, body: '{}' });
  assert.equal(forbidden.status, 403, 'Viewer lacks portcall:create');
  assert.ok(c.db.audit.some(a => (a.detail as { denied?: string }).denied), 'denial audited');
  app.server.close();
});

// 11. Reporting + async report worker (§18)
await test('dashboard summary + monthly CSV report', async () => {
  const c = buildContainer();
  const T = 'bdbdbdbd-bdbd-4bdb-8bdb-bdbdbdbdbdbd';
  await TenantContext.run({ tenantId: T, userId: 'rep' }, async () => {
    await c.portOps.registerVessel({ name: 'Report Ship', imoNumber: '922222234', flag: 'ES', vesselType: 'ro-ro', grossTonnage: 12000 });
    const client = await c.portOps.createClient({ name: 'Rep Co', vatNumber: 'B1234567B', email: 'r@r.es', billingAddress: 'Vigo' });
    const pc = await c.portOps.createPortCall({ imoNumber: '922222234', clientId: client.id, portCode: 'ES VGO', eta: '2026-09-01T00:00:00Z', etd: '2026-09-03T00:00:00Z', reference: 'REP-1' });
    await c.portOps.transition(pc.id, 'schedule'); await c.portOps.transition(pc.id, 'start');
    const overdue = await c.portOps.sweepOverdue(new Date('2026-09-02T00:00:00Z'));
    assert.ok(overdue >= 1, 'overdue sweep flagged milestones');
    const list = await new MemPortCallRepo(c.db).listByTenant();
    const s = summarize(list);
    assert.equal(s.openPortCalls, 1);
    assert.ok(s.overdueMilestones >= 1);
    const csv = await generateMonthlyReport(list);
    assert.ok(csv.includes('REP-1') && csv.includes('reference'));
  });
});

// 12. Billing entitlements (§13)
await test('plan quotas enforced per tier', async () => {
  const { BillingService, PLANS } = await import('@portcalls/control-plane');
  const gateway = { createCheckout: async () => ({ url: 'https://checkout.local', reference: 'r' }), verifyWebhookSignature: () => true };
  const bs = new BillingService(gateway);
  const sub = bs.startSubscription('t1', 'basic');
  const period = new Date().toISOString().slice(0, 7);
  bs.checkQuotas(sub.id, [{ tenantId: 't1', metric: 'portcalls', value: 15, period }]);
  assert.throws(() => bs.checkQuotas(sub.id, [{ tenantId: 't1', metric: 'portcalls', value: 21, period }]), /Quota exceeded/);
  assert.equal(PLANS.enterprise.entitlements.portcalls, -1);
});

console.log(`\n${passed}/12 groups passed \u2714`);
