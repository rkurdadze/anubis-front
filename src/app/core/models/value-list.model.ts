export interface ValueList {
  id: number;
  name: string;
  nameI18n?: Record<string, string>;
  isActive: boolean;
}

export interface ValueListItem {
  id: number;
  valueListId: number;
  value: string;
  valueI18n?: Record<string, string>;
  sortOrder?: number;
  isActive: boolean;
  parentItemId?: number | null;
  externalCode?: string;
}
