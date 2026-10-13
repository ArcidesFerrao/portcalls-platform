import { MetadataCache } from '@portcalls/integrations';
let clock = 0;
const c = new MetadataCache<string>(100, () => clock);
c.set('k', 'v'); clock = 1400;
console.log('get:', c.get('k'), 'stale:', c.getStale('k'));
