import { Routes } from '@angular/router';

import { ObjectsListComponent } from './pages/objects-list/objects-list.component';
import { ObjectDetailComponent } from './pages/object-detail/object-detail.component';

export const OBJECTS_ROUTES: Routes = [
  {
    path: ':id',
    component: ObjectDetailComponent
  },
  {
    path: '',
    component: ObjectsListComponent
  }
];
