import { MetadataCache } from '@portcalls/integrations';
async function test(name: string, fn: () => Promise<void> | void) { await fn(); console.log('ok', name); }
await test('circuit + cache', async () => {
  let clock = 0;
  const cache = new MetadataCache<string>(100, () => clock);
  cache.set('k', 'v'); clock = 1400;
  console.log('inside test get:', cache.get('k'));
});
