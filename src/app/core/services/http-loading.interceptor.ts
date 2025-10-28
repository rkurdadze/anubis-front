import { Injectable } from '@angular/core';
import {
  HttpEvent,
  HttpHandler,
  HttpInterceptor,
  HttpRequest
} from '@angular/common/http';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';

import { LoadingIndicatorService } from './loading-indicator.service';

@Injectable()
export class HttpLoadingInterceptor implements HttpInterceptor {
  constructor(private readonly loader: LoadingIndicatorService) {}

  intercept(req: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    this.loader.start();
    return next.handle(req).pipe(finalize(() => this.loader.stop()));
  }
}
