import { PropertyValue } from './property-value.model';
import { ObjectVersion } from './object-version.model';
import { ObjectLink } from './object-link.model';

export interface RepositoryObject {
  id: number;
  name: string;
  typeId: number;
  classId?: number | null;
  vaultId?: number | null;
  isDeleted?: boolean;
  createdAt?: string;
  createdBy?: string;
}

export interface RepositoryObjectRequest {
  name: string;
  typeId: number;
  classId?: number | null;
  vaultId?: number | null;
  properties?: PropertyValue[];
}

export interface RepositoryObjectDetail extends RepositoryObject {
  versions: ObjectVersion[];
  properties: PropertyValue[];
  files: ObjectFile[];
  links: ObjectLink[];
}

export interface ObjectFile {
  id: number;
  objectId: number;
  versionId: number;
  filename: string;
  mimeType: string;
  size: number;
}
