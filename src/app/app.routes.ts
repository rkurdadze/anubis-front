import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'dashboard'
  },
  {
    path: 'dashboard',
    loadChildren: () => import('./modules/dashboard/dashboard.routes').then(m => m.DASHBOARD_ROUTES)
  },
  {
    path: 'objects',
    loadChildren: () => import('./modules/objects/objects.routes').then(m => m.OBJECTS_ROUTES)
  },
  {
    path: 'vaults',
    loadChildren: () => import('./modules/vaults/vaults.routes').then(m => m.VAULTS_ROUTES)
  },
  {
    path: 'object-types',
    loadChildren: () => import('./modules/object-types/object-types.routes').then(m => m.OBJECT_TYPES_ROUTES)
  },
  {
    path: 'classes',
    loadChildren: () => import('./modules/classes/classes.routes').then(m => m.CLASSES_ROUTES)
  },
  {
    path: 'properties',
    loadChildren: () => import('./modules/properties/properties.routes').then(m => m.PROPERTIES_ROUTES)
  },
  {
    path: 'value-lists',
    loadChildren: () => import('./modules/value-lists/value-lists.routes').then(m => m.VALUE_LISTS_ROUTES)
  },
  {
    path: 'views',
    loadChildren: () => import('./modules/views/views.routes').then(m => m.VIEWS_ROUTES)
  },
  {
    path: 'users',
    loadChildren: () => import('./modules/users/users.routes').then(m => m.USERS_ROUTES)
  },
  {
    path: 'search',
    loadChildren: () => import('./modules/search/search.routes').then(m => m.SEARCH_ROUTES)
  },
  {
    path: '**',
    redirectTo: 'dashboard'
  }
];
