import type { Server } from 'node:http';
export function addressInfo(server: Server): number {
  const a = server.address();
  if (!a || typeof a === 'string') throw new Error('server not listening');
  return a.port;
}
