import {GranteeType, SecurityPrincipal} from './user-management.model';

export interface AclEntry {
  id: number;
  aclId: number;
  granteeType: GranteeType;
  granteeId: number;
  canRead: boolean;
  canWrite: boolean;
  canDelete: boolean;
  canChangeAcl: boolean;
  principal: SecurityPrincipal | null;
}

export interface Acl {
  id: number;
  name: string;
  description: string | null;
  entries: AclEntry[];
}
