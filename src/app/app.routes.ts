import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadChildren: () => import('./modules/dashboard/dashboard.routes').then(m => m.DASHBOARD_ROUTES)
  },
  {
    path: 'objects',
    loadChildren: () => import('./modules/objects/objects.routes').then(m => m.OBJECTS_ROUTES)
  }
];
