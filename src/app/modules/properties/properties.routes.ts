import { Routes } from '@angular/router';

import { PropertyDefinitionsComponent } from './pages/property-definitions/property-definitions.component';

export const PROPERTIES_ROUTES: Routes = [
  {
    path: '',
    component: PropertyDefinitionsComponent
  }
];
