import { Injectable } from '@angular/core';
import {
  HttpErrorResponse,
  HttpEvent,
  HttpHandler,
  HttpInterceptor,
  HttpRequest,
} from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from '../environments/environment';
import { resolveApiBaseUrl } from '../utils/api-base-url';

@Injectable()
export class ApiFallbackInterceptor implements HttpInterceptor {
  intercept(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    return next.handle(request).pipe(
      catchError((error: HttpErrorResponse) => {
        if (!this.shouldRetry(error, request)) {
          return throwError(() => error);
        }

        const fallbackUrl = this.getFallbackUrl(request.url);
        if (!fallbackUrl || fallbackUrl === request.url) {
          return throwError(() => error);
        }

        const retryRequest = request.clone({
          url: fallbackUrl,
          setHeaders: {
            'x-api-fallback-attempt': '1',
          },
        });

        return next.handle(retryRequest);
      })
    );
  }

  private shouldRetry(error: HttpErrorResponse, request: HttpRequest<any>): boolean {
    if (request.headers.get('x-api-fallback-attempt') === '1') {
      return false;
    }

    const isApiRequest = request.url.includes('/api/');
    if (!isApiRequest) {
      return false;
    }

    // Only retry safe/read-only methods to avoid duplicate writes or side effects.
    const safeMethod = request.method === 'GET' || request.method === 'HEAD';
    if (!safeMethod) {
      return false;
    }

    const retryableStatus = [0, 404, 502, 503, 504];
    return retryableStatus.includes(error.status);
  }

  private getFallbackUrl(url: string): string | null {
    const cleanEnv = resolveApiBaseUrl(environment.apiUrl, environment.githubPagesApiUrl).replace(/\/$/, '');

    const toSuffixFromAbsolute = (prefix: string): string | null => {
      const normalizedPrefix = prefix.replace(/\/$/, '');
      if (url.startsWith(normalizedPrefix + '/')) {
        return url.substring(normalizedPrefix.length);
      }
      if (url === normalizedPrefix) {
        return '';
      }
      return null;
    };

    const localAbsolutePrefixes = [
      'https://127.0.0.1:3000/api',
      'https://localhost:3000/api',
      'http://127.0.0.1:3000/api',
      'http://localhost:3000/api',
      'http://0.0.0.0:3000/api',
    ];

    for (const prefix of localAbsolutePrefixes) {
      const suffix = toSuffixFromAbsolute(prefix);
      if (suffix !== null) {
        if (prefix.startsWith('https://')) {
          return `http://localhost:3000/api${suffix}`;
        }
        return `/api${suffix}`;
      }
    }

    if (url.startsWith('/api/')) {
      if (cleanEnv && /^https?:\/\//i.test(cleanEnv)) {
        return `${cleanEnv}${url.substring('/api'.length)}`;
      }
      return `http://localhost:3000${url}`;
    }

    if (cleanEnv && /^https?:\/\//i.test(cleanEnv)) {
      const envSuffix = toSuffixFromAbsolute(cleanEnv);
      if (envSuffix !== null) {
        return `/api${envSuffix}`;
      }
    }

    return null;
  }
}
