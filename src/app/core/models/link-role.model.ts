import { LinkDirection } from './object-link-direction.enum';

export interface LinkRole {
  id: number;
  name: string;
  nameI18n?: Record<string, string>;
  description?: string;
  direction: LinkDirection;
  sourceTypeId?: number | null;
  targetTypeId?: number | null;
  isActive: boolean;
}
