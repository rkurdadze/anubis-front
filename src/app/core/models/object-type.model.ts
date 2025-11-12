import { Vault } from './vault.model';

export interface ObjectType {
  id: number;
  name: string;
  nameI18n?: string | null;
  vault: Vault | null;
  aclId?: number | null;
  aclName?: string | null;
}

export interface SaveObjectTypePayload {
  name: string;
  nameI18n?: string | null;
  vaultId: number;
  aclId?: number | null;
}
