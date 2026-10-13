import { MetadataCache } from '@portcalls/integrations';
async function test(name: string, fn: () => Promise<void> | void) { await fn(); console.log('ok', name); }
await test('full test 8 replica', async () => {
  let clock = 0;
  const cache = new MetadataCache<string>(100, () => clock);
  cache.set('k', 'v'); clock = 1400;
  const g = (cache as any).get;
  console.log('via method:', cache.get('k'));
  console.log('detached:', g.call(cache, 'k'));
  console.log('fresh instance:', (() => { const c2 = new MetadataCache<string>(100, () => 1400); c2['map'].set('k', { value: 'v', expiresAt: 1600 }); return c2.get('k'); })());
});
