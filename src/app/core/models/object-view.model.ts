export interface ViewGrouping {
  level: number;
  propertyDefId: number;
}

export interface ObjectView {
  id: number;
  name: string;
  isCommon?: boolean;
  createdById?: number;
  filterJson?: ObjectViewFilterCondition | { operator: 'AND' | 'OR'; conditions: ObjectViewFilterCondition[] } | null;
  sortOrder?: number;
  groupings?: ViewGrouping[];
}

export interface ObjectViewFilterCondition {
  propertyDefId: number;
  op: string;
  value?: string;
  valueTo?: string;
}
