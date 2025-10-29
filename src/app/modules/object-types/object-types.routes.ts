import { Routes } from '@angular/router';

import { ObjectTypesListComponent } from './pages/object-types-list/object-types-list.component';

export const OBJECT_TYPES_ROUTES: Routes = [
  {
    path: '',
    component: ObjectTypesListComponent
  }
];
