import { StorageKind } from './storage-kind.enum';

export interface FileStorage {
  id: number;
  kind: StorageKind;
  name?: string;
  description?: string;
  basePath?: string;
  bucket?: string;
  endpoint?: string;
  accessKey?: string;
  secretKey?: string;
  isDefault: boolean;
  isActive: boolean;
}

export interface Vault {
  id: number;
  code: string;
  name: string;
  description?: string;
  isActive: boolean;
  defaultStorage?: FileStorage | null;
}
