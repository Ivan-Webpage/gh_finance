import { Injectable, signal, computed } from '@angular/core';
import { HttpBackend, HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { environment } from '../environments/environment';
import { resolveApiBaseUrl } from '../utils/api-base-url';

export interface Admin {
  adminId: number;
  email: string;
  name: string;
  avatarUrl?: string;
  roles: Array<{ role_id: number; role_name: string; display_name: string }>;
  permissions: string[];
}

export interface AuthResponse {
  success: boolean;
  data?: {
    token: string;
    admin: Admin;
  };
  error?: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private baseUrl = `${resolveApiBaseUrl(environment.apiUrl, environment.githubPagesApiUrl)}/admin`;
  private tokenKey = 'gh_finance_auth_token';
  private adminKey = 'gh_finance_admin_data';
  private expiryKey = 'gh_finance_token_expiry';

  private normalizeRoleName(roleName: string): string {
    const value = String(roleName || '').trim();
    if (!value) return '';

    // Backward/typo compatibility
    if (value === 'operation_manager') return 'operations_manager';

    return value;
  }

  private normalizeAdmin(admin: Admin): Admin {
    const roles = Array.isArray(admin?.roles) ? admin.roles : [];
    const normalizedRoles = roles.map(role => ({
      ...role,
      role_name: this.normalizeRoleName(role.role_name),
    }));

    return {
      ...admin,
      roles: normalizedRoles,
    };
  }

  // IMPORTANT:
  // This AuthService is injected by an HTTP interceptor.
  // If we inject Angular's HttpClient directly, it creates a DI cycle:
  // HttpClient -> HTTP_INTERCEPTORS -> AuthInterceptor -> AuthService -> HttpClient
  // Use HttpBackend to create a HttpClient instance that bypasses interceptors.
  private http: HttpClient;

  // Signals
  currentAdmin = signal<Admin | null>(null);
  isAuthenticated = signal(false);
  isLoading = signal(false);
  error = signal<string | null>(null);

  // Computed
  isSuperAdmin = computed(() => {
    const admin = this.currentAdmin();
    return admin?.roles.some(r => r.role_name === 'super_admin') ?? false;
  });

  isManagedAdmin = computed(() => {
    const admin = this.currentAdmin();
    return admin?.roles.some(r => ['super_admin', 'user_manager'].includes(r.role_name)) ?? false;
  });

  constructor(httpBackend: HttpBackend, private router: Router) {
    this.http = new HttpClient(httpBackend);
    this.initializeAuth();
  }

  /**
   * 初始化認證狀態（檢查本地存儲的令牌）
   */
  private initializeAuth() {
    const token = this.getToken();
    const expiry = this.getTokenExpiry();

    if (token && expiry) {
      // 檢查令牌是否過期
      if (new Date().getTime() < expiry) {
        const adminData = localStorage.getItem(this.adminKey);
        if (adminData) {
          this.currentAdmin.set(this.normalizeAdmin(JSON.parse(adminData)));
          this.isAuthenticated.set(true);
          this.validateStoredSession(token);
        }
      } else {
        // 令牌已過期，清除認證信息
        this.clearAuth();
      }
    }
  }

  private async validateStoredSession(token: string): Promise<void> {
    try {
      const headers = new HttpHeaders({
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      });

      await firstValueFrom(this.http.get(`${this.baseUrl}/auth`, { headers }));
    } catch (err: unknown) {
      // Only force-logout when the server explicitly says the token is invalid.
      // For network/CORS/TLS issues, keep the session to avoid logging out on refresh.
      const status = err instanceof HttpErrorResponse ? err.status : (err as any)?.status;
      if (status === 401 || status === 403) {
        this.clearAuth();
        this.router.navigate(['/login']);
        return;
      }

      console.warn('Session validation failed; keeping local session', err);
    }
  }

  /**
   * Google OAuth 登入
   */
  async loginWithGoogle(idToken: string): Promise<boolean> {
    try {
      this.isLoading.set(true);
      this.error.set(null);

      const response = await firstValueFrom(
        this.http.post<AuthResponse>(`${this.baseUrl}/auth/google`, { idToken })
      );

      if (response.success && response.data) {
        const { token, admin } = response.data;
        const normalizedAdmin = this.normalizeAdmin(admin);
        
        // 保存令牌和管理員數據
        this.saveToken(token);
        this.saveAdmin(normalizedAdmin);
        
        // 更新 signals
        this.currentAdmin.set(normalizedAdmin);
        this.isAuthenticated.set(true);

        return true;
      } else {
        this.error.set(response.error || 'Login failed');
        return false;
      }
    } catch (err: any) {
      const errorMsg = err.error?.error || 'Authentication failed';
      this.error.set(errorMsg);
      return false;
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * 登出
   */
  logout() {
    this.clearAuth();
    this.router.navigate(['/login']);
  }

  /**
   * 檢查用戶是否有特定權限
   */
  hasPermission(permissionCode: string): boolean {
    const admin = this.currentAdmin();
    return admin?.permissions.includes(permissionCode) ?? false;
  }

  /**
   * 檢查用戶是否有特定角色
   */
  hasRole(roleName: string): boolean {
    const admin = this.currentAdmin();
    return admin?.roles.some(r => r.role_name === roleName) ?? false;
  }

  /**
   * 檢查用戶是否有任一個角色
   */
  hasAnyRole(roleNames: string[]): boolean {
    const admin = this.currentAdmin();
    return admin?.roles.some(r => roleNames.includes(r.role_name)) ?? false;
  }

  /**
   * 獲取訪問令牌
   */
  getToken(): string | null {
    return localStorage.getItem(this.tokenKey);
  }

  /**
   * 獲取令牌過期時間
   */
  getTokenExpiry(): number | null {
    const expiry = localStorage.getItem(this.expiryKey);
    return expiry ? parseInt(expiry) : null;
  }

  /**
   * 保存令牌（7天）
   */
  private saveToken(token: string) {
    const expiryTime = new Date().getTime() + 7 * 24 * 60 * 60 * 1000; // 7 days
    localStorage.setItem(this.tokenKey, token);
    localStorage.setItem(this.expiryKey, expiryTime.toString());
  }

  /**
   * 保存管理員數據
   */
  private saveAdmin(admin: Admin) {
    localStorage.setItem(this.adminKey, JSON.stringify(admin));
  }

  /**
   * 清除認證信息
   */
  private clearAuth() {
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.adminKey);
    localStorage.removeItem(this.expiryKey);
    this.currentAdmin.set(null);
    this.isAuthenticated.set(false);
  }

  /**
   * 刷新令牌過期時間
   */
  refreshTokenExpiry() {
    const token = this.getToken();
    if (token) {
      this.saveToken(token);
    }
  }

  /**
   * 獲取當前管理員
   */
  getCurrentAdmin(): Admin | null {
    return this.currentAdmin();
  }

  /**
   * 更新並持久化當前管理員資料（例如：name、avatarUrl）
   * 用於個人資料更新後，同步 Header/其他 UI 顯示。
   */
  updateCurrentAdmin(partial: Partial<Admin>): void {
    const current = this.currentAdmin();
    if (!current) return;

    const updated: Admin = {
      ...current,
      ...partial,
      roles: partial.roles ?? current.roles,
      permissions: partial.permissions ?? current.permissions,
    };

    this.currentAdmin.set(updated);
    localStorage.setItem(this.adminKey, JSON.stringify(updated));
  }

  /**
   * 檢查令牌是否將在7天內過期
   */
  isTokenExpiringSoon(): boolean {
    const expiry = this.getTokenExpiry();
    if (!expiry) return true;

    const now = new Date().getTime();
    const oneHourMs = 60 * 60 * 1000;
    return expiry - now < oneHourMs;
  }
}