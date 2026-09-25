// Document entity (§7 & §11 metadata model).
import { uuid, nowIso, EntityBase } from '@portcalls/shared';

export type StorageProvider = 'sharepoint' | 's3' | 'minio' | 'local';

export class Document implements EntityBase {
  id = uuid(); tenantId = ''; createdAt = nowIso(); updatedAt = nowIso();
  deletedAt: string | null = null;
  constructor(
    public entityType: 'portcall' | 'process' | 'milestone' | 'invoice' | 'client',
    public entityId: string,
    public filename: string,
    public mimeType: string,
    public size: number,
    public checksum: string,           // sha256 of content
    public storageProvider: StorageProvider,
    public storageObjectId: string,    // opaque safe identifier (§11)
    public createdBy: string,
  ) {}
}
