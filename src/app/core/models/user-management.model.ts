export type UserStatus = 'active' | 'inactive' | 'locked';

export type GranteeType = 'user' | 'group' | 'role';

export interface RoleSummary {
  id: number;
  name: string;
  active: boolean;
}

export interface SecurityPrincipal {
  id: number;
  type: GranteeType;
  displayName: string;
  login: string | null;
  description: string | null;
  status: UserStatus | null;
  groupIds: number[];
  memberIds: number[];
  directRoleIds: number[];
  effectiveRoleIds: number[];
  directRoles: RoleSummary[];
  effectiveRoles: RoleSummary[];
}

export interface SaveAclPayload {
  name: string;
  description?: string | null;
}

export interface SaveAclEntryPayload {
  granteeType: GranteeType;
  granteeId: number;
  canRead?: boolean;
  canWrite?: boolean;
  canDelete?: boolean;
  canChangeAcl?: boolean;
}

export interface Role {
  id: number;
  name: string;
  description: string | null;
  system: boolean;
  active: boolean;
}

export interface SaveRolePayload {
  name: string;
  description?: string | null;
  active: boolean;
}

export interface Group {
  id: number;
  name: string;
  memberIds: number[];
  roleIds: number[];
}

export interface SaveGroupPayload {
  name: string;
  memberIds: number[];
  roleIds: number[];
}

export interface User {
  id: number;
  username: string;
  fullName: string | null;
  status: UserStatus;
  groupIds: number[];
  roleIds: number[];
}

export interface SaveUserPayload {
  username: string;
  fullName: string | null;
  status: UserStatus;
  groupIds: number[];
  roleIds: number[];
  password?: string | null;
}
