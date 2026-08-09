import { Injectable } from '@angular/core';
import {
  HttpRequest,
  HttpHandler,
  HttpEvent,
  HttpInterceptor,
  HttpErrorResponse,
} from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';
import { Router } from '@angular/router';

/**
 * HTTP Interceptor - 处理 JWT 认证和 Token 过期
 * 
 * 功能:
 * 1. 为所有 HTTP 请求添加 Bearer Token
 * 2. 捕获 401 Unauthorized 错误
 * 3. 检查 Token 是否已过期
 * 4. 强制重新登入并清除认证信息
 */
@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  constructor(private authService: AuthService, private router: Router) {}

  intercept(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    // 获取 Token
    const token = this.authService.getToken();

    // 检查 Token 是否存在且未过期
    if (token) {
      // 检查 Token 过期时间
      const expiry = this.authService.getTokenExpiry();
      const now = new Date().getTime();

      if (expiry && now >= expiry) {
        // Token 已过期，立即登出
        console.warn('Token 已过期，强制重新登入');
        this.authService.logout();
        this.router.navigate(['/login'], { queryParams: { expired: true } });
        return throwError(() => new Error('Token expired'));
      }

      // Token 有效，添加到请求头
      request = this.addToken(request, token);
    }

    return next.handle(request).pipe(
      catchError((error: HttpErrorResponse) => {
        // 处理 401 Unauthorized 错误
        if (error.status === 401) {
          const expiry = this.authService.getTokenExpiry();
          const now = new Date().getTime();

          if (expiry && now >= expiry) {
            console.warn('收到 401 Unauthorized 且 Token 已过期，强制重新登入');
            this.authService.logout();
            this.router.navigate(['/login'], {
              queryParams: {
                expired: true,
                returnUrl: this.router.url
              }
            });
          } else {
            console.warn('收到 401 Unauthorized，但 Token 仍有效，保留登入狀態');
          }
        }

        return throwError(() => error);
      })
    );
  }

  /**
   * 为请求添加 JWT Bearer Token
   */
  private addToken(request: HttpRequest<any>, token: string): HttpRequest<any> {
    return request.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`,
      },
    });
  }
}
