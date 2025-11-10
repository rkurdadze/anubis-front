import { enableProdMode, importProvidersFrom } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { provideAnimations } from '@angular/platform-browser/animations';

import { environment } from './environments/environment';
import { routes } from './app/app.routes';
import { AppComponent } from './app/app.component';
import { CoreModule } from './app/core/core.module';

if (environment.production) {
  enableProdMode();
}

const originalConsoleError = console.error;

console.error = function (...args) {
  const errorMessage = args[0]?.toString() || '';

  // Suppress AG Grid Enterprise License Warnings and Errors Containing '**********'
  if (
    errorMessage.includes('AG Grid Enterprise License') ||
    errorMessage.includes('****************************************') ||
    errorMessage.includes('All AG Grid Enterprise features are unlocked for trial') ||
    errorMessage.includes('hide the watermark') ||
    errorMessage.includes('ResizeObserver loop completed with undelivered notifications')
  ) {
    return;
  }

  // Call the original console.error for other errors
  originalConsoleError.apply(console, args);
};


bootstrapApplication(AppComponent, {
  providers: [
    provideRouter(routes),
    provideHttpClient(withInterceptors([])),
    provideAnimations(),
    importProvidersFrom(CoreModule)
  ]
}).catch(err => console.error(err));
