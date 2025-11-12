import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ObjectViewFilterCondition } from '../../../core/models/object-view.model';
import { animate, state, style, transition, trigger } from '@angular/animations';

@Component({
  selector: 'app-filter-visual-group',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './filter-visual-group.component.html',
  styleUrls: ['./filter-visual-group.component.scss'],
  animations: [
    trigger('expandCollapseBody', [
      state('expanded', style({ height: '*', opacity: 1 })),
      state('collapsed', style({ height: '0px', opacity: 0 })),
      transition('expanded <=> collapsed', animate('200ms ease-in-out')),
    ]),
  ],
})
export class FilterVisualGroupComponent {
  @Input() group!: ObjectViewFilterCondition | { operator?: 'AND' | 'OR'; conditions?: any[] };
  @Input() level = 0;
  @Input() getPropertySummary!: (propertyDefId: number | null) => string;
  @Input() getOperatorLabel!: (value: string) => string;

  collapsed = false;

  toggleCollapsed(): void {
    if (this.isGroup(this.group)) this.collapsed = !this.collapsed;
  }

  isGroup(item: any): boolean {
    return !!item && typeof item === 'object' && Array.isArray(item.conditions);
  }

  get indentStyle() {
    return { 'margin-left.px': this.level * 18 };
  }

  get conditions(): any[] {
    if (this.isGroup(this.group)) return this.group.conditions!;
    return [this.group];
  }

  get conditionCount(): number {
    return this.conditions.length;
  }

  get expandState(): 'expanded' | 'collapsed' {
    return this.collapsed ? 'collapsed' : 'expanded';
  }
}
