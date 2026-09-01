import { ErrorHandler, Injectable } from '@angular/core';
import { environment } from '../environments/environment';
import { resolveApiBaseUrl } from '../utils/api-base-url';

/**
 * 捕捉未預期的 Angular runtime 例外（元件內未被 try/catch 接住的 TypeError 等），
 * 回報給 backend 的 /api/error-report，由 backend 統一寄告警信。
 *
 * 刻意不在這裡回報一般 HTTP 呼叫失敗（interceptor 層級）——那些打 backend API 失敗的
 * 情況，backend 自己的錯誤告警機制已經寄過一次信了，這裡再報一次只是重複噪音。
 */
@Injectable()
export class RemoteErrorHandler implements ErrorHandler {
  private lastReportedAt = 0;
  private readonly reportCooldownMs = 5000;

  handleError(error: unknown): void {
    console.error(error);
    this.report(error);
  }

  private report(error: unknown): void {
    if (typeof fetch !== 'function') return;

    const now = Date.now();
    if (now - this.lastReportedAt < this.reportCooldownMs) return;
    this.lastReportedAt = now;

    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    const baseUrl = resolveApiBaseUrl(environment.apiUrl, environment.githubPagesApiUrl);

    fetch(`${baseUrl}/error-report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        stack,
        url: typeof window !== 'undefined' ? window.location.href : undefined,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      }),
      keepalive: true,
    }).catch(() => {
      // 回報本身失敗不應該影響使用者操作，靜默吞掉。
    });
  }
}
