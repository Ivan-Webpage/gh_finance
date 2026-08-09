

import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter, withHashLocation } from '@angular/router';
import { provideHttpClient, withInterceptorsFromDi, HTTP_INTERCEPTORS } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { AppComponent } from './src/app.component';
import { APP_ROUTES } from './src/app.routes';
import { AuthInterceptor } from './src/interceptors/auth.interceptor';
import { ViewerReadonlyInterceptor } from './src/interceptors/viewer-readonly.interceptor';
import { ApiFallbackInterceptor } from './src/interceptors/api-fallback.interceptor';

bootstrapApplication(AppComponent, {
  providers: [
    provideZonelessChangeDetection(),
    provideRouter(APP_ROUTES, withHashLocation()),
    provideHttpClient(withInterceptorsFromDi()),
    {
      provide: HTTP_INTERCEPTORS,
      useClass: ApiFallbackInterceptor,
      multi: true,
    },
    {
      provide: HTTP_INTERCEPTORS,
      useClass: AuthInterceptor,
      multi: true,
    },
    {
      provide: HTTP_INTERCEPTORS,
      useClass: ViewerReadonlyInterceptor,
      multi: true,
    },
  ],
}).catch(err => console.error(err));
// AI Studio always uses an `index.tsx` file for all project types.
    