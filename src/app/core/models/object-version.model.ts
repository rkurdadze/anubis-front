import { ObjectVersionAudit } from './object-version-audit.model';

export interface ObjectVersionObjectData {
  name?: string;
  typeId?: number | string | null;
  classId?: number | string | null;
}

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
  name?: string;
  typeId?: number | string | null;
  classId?: number | string | null;
  objectData?: ObjectVersionObjectData;
  objectSnapshot?: ObjectVersionObjectData;
}

export interface ObjectVersionDetail extends ObjectVersion {}
