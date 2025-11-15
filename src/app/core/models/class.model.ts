export interface ObjectClass {
  id: number;
  objectTypeId: number;
  aclId?: number | null;
  parentClassId?: number | null;
  name: string;
  description?: string;
  isActive: boolean;
}

export interface ObjectClassRequest {
  objectTypeId: number;
  aclId?: number | null;
  parentClassId?: number | null;
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

export interface ClassTreeNode {
  id: number;
  name: string;
  description?: string;
  isActive: boolean;
  objectTypeId: number;
  aclId?: number | null;
  parentClassId?: number | null;
  children: ClassTreeNode[];
}

export interface EffectiveClassProperty {
  classId: number;
  propertyDefId: number;
  propertyName: string;
  inherited: boolean;
  sourceClassId: number;
  sourceClassName: string;
  overriddenClassId?: number | null;
  overridesParent?: boolean;
  isReadonly?: boolean;
  isHidden?: boolean;
  displayOrder?: number | null;
}
