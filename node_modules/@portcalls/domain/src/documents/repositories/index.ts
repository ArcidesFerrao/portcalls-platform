import { Document } from '../entities/index.js';
export interface DocumentRepository {
  findById(id: string): Promise<Document | null>;
  listByEntity(entityType: string, entityId: string): Promise<Document[]>;
  save(d: Document): Promise<void>;
  softDelete(id: string): Promise<void>;
}
