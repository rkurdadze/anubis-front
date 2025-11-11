import {ObjectViewFilterCondition} from './object-view.model';

export interface ObjectViewFilterGroup {
  operator: 'AND' | 'OR';
  conditions: (ObjectViewFilterCondition | ObjectViewFilterGroup)[];
}
