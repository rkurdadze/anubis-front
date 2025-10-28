import { PropertyDataType } from './property-data-type.enum';

export interface PropertyDefinition {
  id: number;
  name: string;
  captionI18n?: Record<string, string>;
  dataType: PropertyDataType;
  refObjectTypeId?: number | null;
  valueListId?: number | null;
  isMultiselect?: boolean;
  isRequired?: boolean;
  isUnique?: boolean;
  regex?: string;
  defaultValue?: string;
  description?: string;
  isActive?: boolean;
}

export interface PropertyDefinitionRequest {
  name: string;
  captionI18n?: Record<string, string>;
  dataType: PropertyDataType;
  refObjectTypeId?: number | null;
  valueListId?: number | null;
  isMultiselect?: boolean;
  isRequired?: boolean;
  isUnique?: boolean;
  regex?: string;
  defaultValue?: string;
  description?: string;
}
