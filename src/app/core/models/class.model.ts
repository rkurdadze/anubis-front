export interface ObjectClass {
  id: number;
  objectTypeId: number;
  aclId?: number | null;
  name: string;
  description?: string;
  isActive: boolean;
}

export interface ObjectClassRequest {
  objectTypeId: number;
  aclId?: number | null;
  name: string;
  description?: string;
  isActive?: boolean;
}

export interface ClassPropertyBinding {
  id: number;
  classId: number;
  propertyDefId: number;
  isReadonly?: boolean;
  isHidden?: boolean;
  displayOrder?: number;
  isActive: boolean;
  propertyName: string;
}

export interface ClassPropertyRequest {
  classId: number;
  propertyDefId: number;
  isReadonly?: boolean;
  isHidden?: boolean;
  displayOrder?: number;
}
