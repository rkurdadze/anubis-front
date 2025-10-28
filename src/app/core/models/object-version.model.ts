import { ObjectVersionAudit } from './object-version-audit.model';

export interface ObjectVersion {
  id: number;
  objectId: number;
  versionNum: number;
  comment?: string;
  createdByName?: string;
  createdAt?: string;
  modifiedAt?: string;
  singleFile?: boolean;
  auditTrail?: ObjectVersionAudit[];
}
