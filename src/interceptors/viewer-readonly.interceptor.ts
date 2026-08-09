import { Injectable } from '@angular/core';
import {
  HttpErrorResponse,
  HttpEvent,
  HttpHandler,
  HttpInterceptor,
  HttpRequest,
} from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

@Injectable()
export class ViewerReadonlyInterceptor implements HttpInterceptor {
  constructor(private authService: AuthService) {}

  intercept(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    if (!this.authService.isAuthenticated() || !this.authService.hasAnyRole(['viewer', 'shareholder'])) {
      return next.handle(request);
    }

    const method = (request.method || '').toUpperCase();
    const isReadonlyMethod = method === 'GET' || method === 'HEAD' || method === 'OPTIONS';
    if (isReadonlyMethod) {
      return next.handle(request);
    }

    const isOwnProfileUpdate = (method === 'PUT' || method === 'PATCH') && /\/admin\/profile(\?|$)/.test(request.url);
    if (isOwnProfileUpdate) {
      return next.handle(request);
    }

    return throwError(() => new HttpErrorResponse({
      status: 403,
      statusText: 'Forbidden',
      url: request.url,
      error: {
        success: false,
        error: '檢視者與股東僅可讀取資料，無法執行新增、編輯或刪除操作',
      },
    }));
  }
}
