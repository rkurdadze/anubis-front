import { VersionChangeType } from './version-change-type.enum';

export interface ObjectVersionAudit {
  id: number;
  versionId: number;
  changeType: VersionChangeType;
  modifiedBy: number;
  modifiedAt: string;
  changeSummary?: string;
  fieldChanged?: string;
  oldValue?: string;
  newValue?: string;
}
