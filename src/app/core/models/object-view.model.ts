export interface ViewGrouping {
  level: number;
  propertyDefId: number;
}

export interface ObjectView {
  id: number;
  name: string;
  isCommon?: boolean;
  createdById?: number;
  filterJson?: ObjectViewFilterCondition | null;
  sortOrder?: number;
  groupings?: ViewGrouping[];
}


export interface ObjectViewFilterCondition {
  propertyDefId?: number | null;
  op?: string;
  value?: string;
  valueTo?: string;
  operator?: 'AND' | 'OR';
  conditions?: ObjectViewFilterCondition[] | null;
}
