import { LinkDirection } from './object-link-direction.enum';

export interface ObjectLink {
  id: number;
  sourceId: number;
  targetId: number;
  roleId: number;
  roleName?: string;
  direction: LinkDirection;
}

export interface ObjectLinksResponse {
  object: RepositoryObjectSummary;
  outgoing: ObjectLink[];
  incoming: ObjectLink[];
}

export interface RepositoryObjectSummary {
  id: number;
  name: string;
  typeId: number;
  classId?: number | null;
}
