import { Component, Input } from '@angular/core';
import { AbstractControl, FormArray, FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { NgForOf, NgIf, NgStyle } from '@angular/common';
import { PropertyDataType } from '../../../core/models/property-data-type.enum';
import { PropertyDefinition } from '../../../core/models/property-def.model';
import {FilterOperatorConfig} from '../views-workspace.component';

@Component({
  selector: 'app-filter-group',
  standalone: true,
  templateUrl: './filter-group.component.html',
  styleUrls: ['./filter-group.component.scss'],
  imports: [ReactiveFormsModule, NgForOf, NgIf, NgStyle]
})
export class FilterGroupComponent {
  @Input({ required: true }) group!: FormGroup;
  @Input() level = 0;
  @Input() propertyDefinitions: PropertyDefinition[] | null = [];
  @Input() operators: FilterOperatorConfig[] = [];


  readonly propertyDataTypeLabels: Record<PropertyDataType, string> = {
    TEXT: 'Текст',
    INTEGER: 'Целое число',
    FLOAT: 'Число',
    BOOLEAN: 'Логический',
    DATE: 'Дата',
    VALUELIST: 'Справочник',
    MULTI_VALUELIST: 'Мн. справочник'
  };

  constructor(private fb: FormBuilder) {}

  get conditions(): FormArray {
    return this.group.get('conditions') as FormArray;
  }

  isGroup(ctrl: AbstractControl): ctrl is FormGroup {
    return ctrl instanceof FormGroup && ctrl.get('conditions') instanceof FormArray;
  }

  addCondition(): void {
    this.conditions.push(
      this.fb.group({
        propertyDefId: [null],
        op: ['EQ'],
        value: [''],
        valueTo: ['']
      })
    );
  }

  addGroup(): void {
    this.conditions.push(
      this.fb.group({
        operator: ['AND'],
        conditions: this.fb.array([])
      })
    );
  }

  remove(index: number): void {
    this.conditions.removeAt(index);
  }

  removeSelf(parent: FormGroup | FormArray | null): void {
    if (parent instanceof FormArray) {
      const idx = parent.controls.indexOf(this.group);
      if (idx >= 0) parent.removeAt(idx);
    }
  }

}
