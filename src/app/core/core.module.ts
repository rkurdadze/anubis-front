import { NgModule, Optional, SkipSelf } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClientModule, HTTP_INTERCEPTORS } from '@angular/common/http';

import { ApiHttpService } from './services/api-http.service';
import { EnvironmentService } from './services/environment.service';
import { AuthTokenService } from './services/auth-token.service';
import { HttpErrorInterceptor } from './services/http-error.interceptor';
import { LoadingIndicatorService } from './services/loading-indicator.service';
import { HttpLoadingInterceptor } from './services/http-loading.interceptor';

@NgModule({
  imports: [CommonModule, HttpClientModule],
  providers: [
    ApiHttpService,
    EnvironmentService,
    AuthTokenService,
    LoadingIndicatorService,
    {
      provide: HTTP_INTERCEPTORS,
      useClass: HttpErrorInterceptor,
      multi: true
    },
    {
      provide: HTTP_INTERCEPTORS,
      useClass: HttpLoadingInterceptor,
      multi: true
    }
  ]
})
export class CoreModule {
  constructor(@Optional() @SkipSelf() parentModule?: CoreModule) {
    if (parentModule) {
      throw new Error('CoreModule уже загружен. Импортируйте его только в корневом модуле.');
    }
  }
}
