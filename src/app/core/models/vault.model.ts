import { FileStorage } from './file-storage.model';

export interface Vault {
  id: number;
  code: string;
  name: string;
  description?: string;
  isActive: boolean;
  defaultStorage?: FileStorage | null;
}

export interface SaveVaultPayload {
  code: string;
  name: string;
  description?: string;
  defaultStorageId: number | null;
  isActive: boolean;
}
