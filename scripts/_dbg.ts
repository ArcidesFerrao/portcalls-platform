import { MetadataCache } from '@portcalls/integrations';
let clock = 0;
const cache = new MetadataCache<string>(100, () => clock);
cache.set('k', 'v'); clock = 1400;
console.log('dbg get:', cache.get('k'));
