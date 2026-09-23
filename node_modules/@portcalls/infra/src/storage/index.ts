// Storage adapters (§7): S3 and MinIO share the AWS SDK shape; both implement
// the domain StorageAdapter port. LocalDiskAdapter ships in @portcalls/domain.
import type { StorageAdapter, StoredObject } from '@portcalls/domain';

export interface S3LikeClient {
  putObject(bucket: string, key: string, body: Buffer): Promise<void>;
  getObject(bucket: string, key: string): Promise<Buffer>;
  deleteObject(bucket: string, key: string): Promise<void>;
}

/** Adapter for any S3-compatible endpoint (AWS S3 or self-hosted MinIO — §5). */
export class S3CompatibleAdapter implements StorageAdapter {
  readonly provider: string;
  constructor(private client: S3LikeClient, private bucket: string, provider: 's3' | 'minio' = 's3') {
    this.provider = provider;
  }
  async put(id: string, data: Buffer): Promise<StoredObject> {
    await this.client.putObject(this.bucket, id, data);
    return { contentId: id };
  }
  async get(id: string): Promise<Buffer> { return this.client.getObject(this.bucket, id); }
  async delete(id: string): Promise<void> { await this.client.deleteObject(this.bucket, id); }
}
