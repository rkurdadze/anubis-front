export type UserStatus = 'active' | 'inactive';

export interface UserRole {
  id: number;
  name: string;
  description: string;
  permissions: string[];
  members: number;
}

export interface User {
  id: number;
  name: string;
  email: string;
  status: UserStatus;
  lastLogin: string | null;
  roles: number[];
}

export interface SaveUserPayload {
  name: string;
  email: string;
  status: UserStatus;
  roleIds: number[];
}

export interface SaveRolePayload {
  name: string;
  description: string;
  permissions: string[];
}
