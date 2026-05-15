import { Component, signal, OnInit } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService, Admin } from '../../services/auth.service';
import { environment } from '../../environments/environment';
import { resolveApiBaseUrl } from '../../utils/api-base-url';

@Component({
  selector: 'app-account',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="account-container">
      <h2>我的帳號</h2>

      <div class="account-layout">
        <!-- Profile Card -->
        <div class="profile-section">
          <div class="profile-header">
            <div class="profile-avatar">
              <img
                [src]="resolveAvatarUrl(profileData()?.avatarUrl)"
                (error)="handleAvatarError($event)"
                referrerpolicy="no-referrer"
                alt="Avatar"
              />
            </div>
            <div class="profile-info">
              <h3>{{ profileData()?.name }}</h3>
              <p>{{ profileData()?.email }}</p>
              <p class="status" [class]="'status-' + profileData()?.status">
                {{ getStatusLabel(profileData()?.status) }}
              </p>
            </div>
          </div>

          <div class="profile-details">
            <div class="detail-row">
              <label>帳號狀態：</label>
              <span class="value">{{ getStatusLabel(profileData()?.status) }}</span>
            </div>
            <div class="detail-row">
              <label>建立時間：</label>
              <span class="value">{{ formatDate(profileData()?.createdAt) }}</span>
            </div>
            <div class="detail-row">
              <label>最後登入：</label>
              <span class="value">{{ formatDate(profileData()?.lastLoginAt) }}</span>
            </div>
          </div>
        </div>

        <!-- Edit Profile Section -->
        <div class="edit-section">
          <h3>編輯個人資料</h3>
          <form (ngSubmit)="updateProfile()">
            <div class="form-group">
              <label>姓名</label>
              <input
                type="text"
                [(ngModel)]="formData.name"
                name="name"
                placeholder="輸入您的姓名"
              />
            </div>

            <div class="form-group">
              <label>頭像 URL</label>
              <input
                type="url"
                [(ngModel)]="formData.avatarUrl"
                name="avatarUrl"
                placeholder="https://..."
              />
            </div>

            <button type="submit" [disabled]="isUpdating()">
              {{ isUpdating() ? '保存中...' : '保存修改' }}
            </button>

            <div *ngIf="successMessage()" class="success-message">
              {{ successMessage() }}
            </div>
          </form>
        </div>

        <!-- Roles & Permissions Section -->
        <div class="roles-section">
          <h3>角色和權限</h3>

          <div class="roles-container">
            <h4>我的角色</h4>
            <div class="role-list">
              <span
                class="role-badge"
                *ngFor="let role of profileData()?.roles"
              >
                {{ role.display_name }}
              </span>
            </div>
          </div>

          <div class="permissions-container">
            <h4>我的權限</h4>
            <div class="permissions-grid">
              <div
                class="permission-item"
                *ngFor="let perm of profileData()?.permissions"
              >
                <span class="permission-code">{{ perm }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Activity Section -->
        <div class="activity-section">
          <h3>最近活動</h3>
          <div class="activity-info">
            <p>最後登入時間：{{ formatDate(profileData()?.lastLoginAt) }}</p>
            <p>帳號建立時間：{{ formatDate(profileData()?.createdAt) }}</p>
          </div>
        </div>
      </div>

      <!-- Loading -->
      <div *ngIf="isLoading()" class="loading">載入中...</div>

      <!-- Error -->
      <div *ngIf="error()" class="error-message">{{ error() }}</div>
    </div>
  `,
  styles: [`
    .account-container {
      padding: 20px;
      max-width: 1000px;
      margin: 0 auto;
    }

    h2 {
      margin-bottom: 30px;
      color: #333;
    }

    .account-layout {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
      gap: 30px;
    }

    /* Profile Section */
    .profile-section {
      background: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }

    .profile-header {
      display: flex;
      gap: 20px;
      margin-bottom: 20px;
      padding-bottom: 20px;
      border-bottom: 1px solid #eee;
    }

    .profile-avatar {
      width: 100px;
      height: 100px;
      border-radius: 50%;
      overflow: hidden;
      flex-shrink: 0;
    }

    .profile-avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .profile-info h3 {
      margin: 0 0 5px 0;
      color: #333;
    }

    .profile-info p {
      margin: 0;
      color: #666;
      font-size: 13px;
    }

    .status {
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
      display: inline-block;
      margin-top: 8px;
    }

    .status-active {
      background-color: #d4edda;
      color: #155724;
    }

    .status-inactive {
      background-color: #f8d7da;
      color: #721c24;
    }

    .status-suspended {
      background-color: #fff3cd;
      color: #856404;
    }

    .profile-details {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .detail-row {
      display: flex;
      justify-content: space-between;
    }

    .detail-row label {
      font-weight: 600;
      color: #333;
    }

    .detail-row .value {
      color: #666;
    }

    /* Edit Section */
    .edit-section,
    .roles-section,
    .activity-section {
      background: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }

    h3 {
      margin-top: 0;
      margin-bottom: 15px;
      color: #333;
      font-size: 16px;
    }

    h4 {
      margin-bottom: 10px;
      color: #333;
      font-size: 14px;
    }

    .form-group {
      margin-bottom: 15px;
    }

    .form-group label {
      display: block;
      margin-bottom: 5px;
      font-weight: 600;
      color: #333;
      font-size: 13px;
    }

    .form-group input {
      width: 100%;
      padding: 10px;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-size: 13px;
      box-sizing: border-box;
    }

    .form-group input:focus {
      outline: none;
      border-color: #3f51b5;
      box-shadow: 0 0 0 3px rgba(63, 81, 181, 0.1);
    }

    button[type='submit'] {
      background-color: #3f51b5;
      color: white;
      padding: 10px 20px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 600;
    }

    button[type='submit']:hover:not(:disabled) {
      background-color: #303c7e;
    }

    button[type='submit']:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .role-badge {
      display: inline-block;
      background-color: #e0e7ff;
      color: #3f51b5;
      padding: 6px 12px;
      border-radius: 4px;
      font-size: 12px;
      margin-right: 8px;
      margin-bottom: 8px;
    }

    .role-list {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .permissions-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
      gap: 10px;
    }

    .permission-item {
      background-color: #f5f5f5;
      padding: 8px;
      border-radius: 4px;
      border-left: 3px solid #3f51b5;
      font-size: 12px;
    }

    .permission-code {
      font-family: 'Courier New', monospace;
      color: #333;
    }

    .success-message {
      background-color: #d4edda;
      color: #155724;
      padding: 10px;
      border-radius: 4px;
      font-size: 12px;
      margin-top: 10px;
      border: 1px solid #c3e6cb;
    }

    .error-message {
      background-color: #f8d7da;
      color: #721c24;
      padding: 10px;
      border-radius: 4px;
      font-size: 12px;
      margin-top: 10px;
      border: 1px solid #f5c6cb;
    }

    .activity-info {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .activity-info p {
      margin: 0;
      color: #666;
      font-size: 13px;
    }

    .loading {
      text-align: center;
      padding: 40px;
      color: #666;
    }

    @media (max-width: 768px) {
      .account-layout {
        grid-template-columns: 1fr;
      }

      .profile-header {
        flex-direction: column;
        align-items: center;
        text-align: center;
      }

      .permissions-grid {
        grid-template-columns: 1fr;
      }
    }
  `],
})
export class AccountComponent implements OnInit {
  private baseUrl = `${resolveApiBaseUrl(environment.apiUrl, environment.githubPagesApiUrl)}/admin`;
  private readonly fallbackAvatarUrl = this.buildFallbackAvatarUrl();
  // Block only obvious placeholder hosts; allow common image CDNs (e.g. i.imgur.com).
  private readonly blockedAvatarHosts = ['via.placeholder.com'];

  // Signals
  profileData = signal<Admin | null>(null);
  isLoading = signal(false);
  isUpdating = signal(false);
  error = signal<string | null>(null);
  successMessage = signal<string | null>(null);

  // Form data
  formData = {
    name: '',
    avatarUrl: '',
  };


  constructor(private http: HttpClient, private authService: AuthService) {}

  ngOnInit() {
    this.loadProfile();
  }

  loadProfile() {
    this.isLoading.set(true);
    this.error.set(null);

    const headers = this.getAuthHeaders();
    if (!headers) {
      this.error.set('尚未登入，請重新登入');
      this.isLoading.set(false);
      return;
    }

    this.http.get<any>(`${this.baseUrl}/profile`, { headers }).subscribe({
      next: (response) => {
        this.profileData.set(response.data);
        this.formData = {
          name: response.data.name,
          avatarUrl: response.data.avatarUrl || '',
        };

        // Keep header/auth context in sync with latest profile changes.
        this.authService.updateCurrentAdmin({
          name: response.data.name,
          avatarUrl: response.data.avatarUrl || '',
        });
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Profile load error:', err);
        let errorMsg = '載入個人資料失敗';
        if (err.status === 401) {
          errorMsg = '認證失敗，請重新登入';
        } else if (err.status === 404) {
          errorMsg = '找不到帳號資訊';
        } else if (err.error?.error) {
          errorMsg = err.error.error;
        }
        this.error.set(errorMsg);
        this.isLoading.set(false);
      },
    });
  }

  updateProfile() {
    this.isUpdating.set(true);
    this.successMessage.set(null);

    const headers = this.getAuthHeaders();
    if (!headers) {
      this.error.set('尚未登入');
      this.isUpdating.set(false);
      return;
    }

    this.http
      .put(`${this.baseUrl}/profile`, this.formData, { headers })
      .subscribe({
        next: () => {
          this.successMessage.set('個人資料已成功更新');
          this.isUpdating.set(false);
          this.loadProfile();

          setTimeout(() => {
            this.successMessage.set(null);
          }, 3000);
        },
        error: (err) => {
          this.error.set(err.error?.error || '更新失敗');
          this.isUpdating.set(false);
        },
      });
  }


  getStatusLabel(status?: string): string {
    const labels: { [key: string]: string } = {
      active: '啟用',
      inactive: '停用',
      suspended: '暫停',
    };
    return labels[status || ''] || status || '-';
  }

  formatDate(date?: string): string {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('zh-TW', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  private getAuthHeaders(): HttpHeaders | null {
    const token = this.authService.getToken();
    if (!token) return null;
    return new HttpHeaders({
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    });
  }

  resolveAvatarUrl(avatarUrl?: string | null): string {
    const value = String(avatarUrl || '').trim();
    if (!value) {
      return this.fallbackAvatarUrl;
    }

    if (!/^https?:\/\//i.test(value)) {
      return this.fallbackAvatarUrl;
    }

    try {
      const parsed = new URL(value);
      if (this.blockedAvatarHosts.some(host => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`))) {
        return this.fallbackAvatarUrl;
      }
      return value;
    } catch {
      return this.fallbackAvatarUrl;
    }
  }

  handleAvatarError(event: Event): void {
    const img = event.target as HTMLImageElement | null;
    if (!img) return;

    if (img.src !== this.fallbackAvatarUrl) {
      img.src = this.fallbackAvatarUrl;
    }
  }

  private buildFallbackAvatarUrl(): string {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" fill="#e5e7eb"/><circle cx="50" cy="38" r="18" fill="#9ca3af"/><path d="M20 88c5-17 16-25 30-25s25 8 30 25" fill="#9ca3af"/></svg>`;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  }
}
