export interface ViewGrouping {
  level: number;
  propertyDefId: number;
}

export interface ObjectView {
  id: number;
  name: string;
  isCommon?: boolean;
  createdById?: number;
  filterJson?: string;
  sortOrder?: number;
  groupings?: ViewGrouping[];
}

export interface ObjectViewFilterCondition {
  propertyDefId: number;
  op: string;
  value?: string;
  valueTo?: string;
}
