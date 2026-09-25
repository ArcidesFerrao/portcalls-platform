// ---------------------------------------------------------------------------
// Document Service (§7, §11): validate MIME → extension → size → safe id →
// (optional malware scan) → store → metadata + DocumentUploaded outbox event.
// ---------------------------------------------------------------------------
import { uuid, nowIso, ValidationError, NotFoundError } from '@portcalls/shared';
import { TenantContext } from '../../shared-kernel/tenant-context/index.js';
import { makeEvent, DomainEvent } from '../../shared-kernel/events/index.js';
import { OutboxWriter } from '../../shared-kernel/outbox/index.js';
import { Document, StorageProvider } from '../entities/index.js';
import { StorageAdapter, safeStorageId, sha256 } from '../storage-adapters/index.js';
import { DocumentRepository } from '../repositories/index.js';

const ALLOWED_MIME_EXT: Record<string, string[]> = {
  'application/pdf': ['pdf'],
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['docx'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['xlsx'],
  'text/plain': ['txt'],
};
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB default entitlement

export interface MalwareScanner { scan(content: Buffer): Promise<boolean>; }

export class DocumentService {
  constructor(
    private repo: DocumentRepository,
    private adapters: Map<StorageProvider, StorageAdapter>,
    private defaultProvider: StorageProvider,
    private outbox: OutboxWriter,
    private scanner?: MalwareScanner,
  ) {}

  async upload(input: {
    entityType: Document['entityType']; entityId: string;
    filename: string; mimeType: string; content: Buffer;
  }): Promise<Document> {
    const { tenantId, userId } = TenantContext.require();

    // §11 validation chain -------------------------------------------------
    const ext = (input.filename.split('.').pop() ?? '').toLowerCase();
    const allowedExts = ALLOWED_MIME_EXT[input.mimeType];
    if (!allowedExts) throw new ValidationError(`Unsupported MIME type: ${input.mimeType}`);
    if (!allowedExts.includes(ext)) throw new ValidationError(`Extension .${ext} does not match declared MIME ${input.mimeType}`);
    if (/[\\/:*?"<>|\x00-\x1f]/.test(input.filename)) throw new ValidationError('Filename contains illegal characters');
    if (input.content.length === 0) throw new ValidationError('Empty file');
    if (input.content.length > MAX_UPLOAD_BYTES) throw new ValidationError(`File exceeds ${MAX_UPLOAD_BYTES} bytes`);
    if (this.scanner && !(await this.scanner.scan(input.content))) {
      throw new ValidationError('File failed malware scan');
    }

    const doc = new Document(
      input.entityType, input.entityId,
      input.filename.normalize('NFKD'), input.mimeType, input.content.length,
      sha256(input.content), this.defaultProvider, '', userId,
    );
    doc.tenantId = tenantId;
    doc.storageObjectId = safeStorageId(tenantId, doc.id, input.filename);

    const adapter = this.adapters.get(this.defaultProvider);
    if (!adapter) throw new Error(`No storage adapter configured for ${this.defaultProvider}`);
    await adapter.put(doc.storageObjectId, input.content);
    await this.repo.save(doc);

    const event: DomainEvent = makeEvent({
      type: 'DocumentUploaded', tenantId, aggregateType: 'Document', aggregateId: doc.id,
      correlationId: userId,
      payload: { documentId: doc.id, entityType: doc.entityType, entityId: doc.entityId, filename: doc.filename },
    });
    await this.outbox.enqueue({ doc }, event);
    return doc;
  }

  async download(documentId: string): Promise<{ doc: Document; content: Buffer }> {
    const doc = await this.repo.findById(documentId);
    if (!doc || doc.deletedAt) throw new NotFoundError('Document');
    const adapter = this.adapters.get(doc.storageProvider as StorageProvider);
    if (!adapter) throw new Error(`Unknown storage provider ${doc.storageProvider}`);
    return { doc, content: await adapter.get(doc.storageObjectId) };
  }

  async delete(documentId: string): Promise<void> {
    const doc = await this.repo.findById(documentId);
    if (!doc) throw new NotFoundError('Document');
    await this.adapters.get(doc.storageProvider as StorageProvider)?.delete(doc.storageObjectId);
    await this.repo.softDelete(documentId);
    await this.outbox.enqueue({}, makeEvent({
      type: 'DocumentDeleted', tenantId: doc.tenantId, aggregateType: 'Document',
      aggregateId: doc.id, correlationId: TenantContext.require().userId,
      payload: { documentId: doc.id, entityType: doc.entityType, entityId: doc.entityId },
    }));
  }
}
