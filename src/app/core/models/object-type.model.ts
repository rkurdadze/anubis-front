import { Vault } from './vault.model';

export interface ObjectType {
  id: number;
  name: string;
  vault: Vault | null;
}

export interface SaveObjectTypePayload {
  name: string;
  vaultId: number;
}
