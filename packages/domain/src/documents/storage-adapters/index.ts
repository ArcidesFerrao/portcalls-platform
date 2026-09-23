// ---------------------------------------------------------------------------
// Storage Adapter port (§7) + local filesystem implementation used for dev
// and tests. SharePoint / S3 / MinIO adapters implement the same interface.
// ---------------------------------------------------------------------------
import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { ValidationError } from '@portcalls/shared';

export interface StoredObject { contentId: string; }

export interface StorageAdapter {
  readonly provider: string;
  put(safeId: string, data: Buffer): Promise<StoredObject>;
  get(safeId: string): Promise<Buffer>;
  delete(safeId: string): Promise<void>;
}

/** Safe storage identifier: no user-controlled path characters (§11). */
export function safeStorageId(tenantId: string, documentId: string, filename: string): string {
  const ext = (filename.match(/\.([a-z0-9]{1,8})$/i)?.[1] ?? 'bin').toLowerCase();
  return `${tenantId}/${documentId}.${ext}`;
}

export function sha256(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

export class LocalDiskAdapter implements StorageAdapter {
  readonly provider = 'local';
  constructor(private root: string) {}
  private path(id: string): string {
    if (id.includes('..') || id.startsWith('/')) throw new ValidationError('Unsafe storage id');
    return join(this.root, id);
  }
  async put(id: string, data: Buffer): Promise<StoredObject> {
    const p = this.path(id);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, data);
    return { contentId: id };
  }
  async get(id: string): Promise<Buffer> { return readFile(this.path(id)); }
  async delete(id: string): Promise<void> { await unlink(this.path(id)).catch(() => undefined); }
}
