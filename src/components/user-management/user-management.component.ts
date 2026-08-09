import { ChangeDetectionStrategy, Component, computed, inject, signal, CUSTOM_ELEMENTS_SCHEMA, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AuthService } from '../../services/auth.service';
import { User, UserRole, UserStatus } from '../../models/financial.model';
import { environment } from '../../environments/environment';
import { resolveApiBaseUrl } from '../../utils/api-base-url';

@Component({
  selector: 'app-user-management',
  templateUrl: './user-management.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class UserManagementComponent implements OnInit {
  private baseUrl = `${resolveApiBaseUrl(environment.apiUrl, environment.githubPagesApiUrl)}/admin`;
  private authService = inject(AuthService);
  private fb = inject(FormBuilder);
  private http = inject(HttpClient);

  // --- State Signals ---
  isModalOpen = signal(false);
  editingUser = signal<User | null>(null);
  userToDelete = signal<User | null>(null);

  // --- Filter Signals ---
  searchTerm = signal('');
  roleFilter = signal<UserRole | ''>('');
  statusFilter = signal<UserStatus | ''>('');

  // --- Data ---
  users = signal<User[]>([]);
  roleOptions = signal<Array<{ role_id: number; role_name: string; display_name: string }>>([]);
  roles = signal<UserRole[]>(['超級管理員', '管理員', '財務', '營運']);
  statuses = signal<UserStatus[]>(['啟用', '停用']);
  isLoading = signal(false);
  error = signal<string | null>(null);
  canCreateUsers = signal(false);
  canUpdateUsers = signal(false);
  canDeleteUsers = signal(false);
  
  // --- Form ---
  userForm = this.fb.group({
    name: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    role: ['營運' as UserRole, Validators.required],
    status: ['啟用' as UserStatus, Validators.required],
  });

  // --- Computed ---
  filteredUsers = computed(() => {
    const term = this.searchTerm().toLowerCase();
    const role = this.roleFilter();
    const status = this.statusFilter();
    
    return this.users()
      .filter(u => !role || u.role === role)
      .filter(u => !status || u.status === status)
      .filter(u => !term || u.name.toLowerCase().includes(term) || u.email.toLowerCase().includes(term));
  });
  
  resetFilters(): void {
    this.searchTerm.set('');
    this.roleFilter.set('');
    this.statusFilter.set('');
  }

  ngOnInit(): void {
    const isViewer = this.authService.hasRole('viewer');
    const canManage = this.authService.hasPermission('manage_admins') || this.authService.hasRole('super_admin');

    this.canCreateUsers.set(!isViewer && (this.authService.hasPermission('create_admins') || canManage));
    this.canUpdateUsers.set(!isViewer && (this.authService.hasPermission('update_admins') || canManage));
    this.canDeleteUsers.set(!isViewer && (this.authService.hasPermission('delete_admins') || canManage));

    this.loadRoles();
    this.loadUsers();
  }

  private loadRoles(): void {
    const headers = this.getAuthHeaders();
    if (!headers) return;

    this.http.get<any>(`${this.baseUrl}/roles?limit=100`, { headers }).subscribe({
      next: (response) => {
        const roles = response?.data || [];
        this.roleOptions.set(roles);
        if (roles.length > 0) {
          const displayRoles = Array.from(new Set(
            roles
              .map((r: any) => String(r.display_name || r.role_name || '').trim())
              .filter((name: string) => !!name)
          )) as UserRole[];
          this.roles.set(displayRoles.length > 0 ? displayRoles : ['超級管理員', '管理員', '財務', '營運']);
        }
      },
      error: () => {
        // keep fallback roles
      }
    });
  }

  private loadUsers(): void {
    const headers = this.getAuthHeaders();
    if (!headers) {
      this.error.set('尚未登入');
      return;
    }

    this.isLoading.set(true);
    this.error.set(null);

    const params: string[] = [];
    if (this.searchTerm()) {
      params.push(`search=${encodeURIComponent(this.searchTerm())}`);
    }
    const roleCode = this.mapRoleToCode(this.roleFilter() || undefined);
    if (roleCode) {
      params.push(`role=${encodeURIComponent(roleCode)}`);
    }

    const query = params.length ? `?${params.join('&')}` : '';

    this.http.get<any>(`${this.baseUrl}/users${query}`, { headers }).subscribe({
      next: (response) => {
        const rows = response?.data || [];
        const mapped = rows.map((row: any) => this.mapUser(row));
        this.users.set(mapped);
        this.isLoading.set(false);
      },
      error: (err) => {
        this.error.set(err.error?.error || '載入使用者失敗');
        this.isLoading.set(false);
      }
    });
  }

  // --- Modal & Form Handling ---
  openModal(user: User | null = null): void {
    const canProceed = user ? this.canUpdateUsers() : this.canCreateUsers();
    if (!canProceed) {
      this.error.set(user ? '您沒有編輯使用者的權限' : '您沒有新增使用者的權限');
      return;
    }

    this.editingUser.set(user);
    this.userForm.reset({ role: '營運', status: '啟用' });
    if (user) {
      if (user.role && !this.roles().includes(user.role)) {
        this.roles.update(current => [...current, user.role]);
      }
      this.userForm.patchValue(user);
    }
    this.userForm.updateValueAndValidity();
    this.isModalOpen.set(true);
  }

  closeModal(): void {
    this.isModalOpen.set(false);
  }

  handleFormSubmit(): void {
    const canProceed = this.editingUser() ? this.canUpdateUsers() : this.canCreateUsers();
    if (!canProceed) {
      this.error.set(this.editingUser() ? '您沒有編輯使用者的權限' : '您沒有新增使用者的權限');
      return;
    }

    if (this.userForm.invalid) {
      return;
    }

    const headers = this.getAuthHeaders();
    if (!headers) {
      this.error.set('尚未登入');
      return;
    }

    const formValue = this.userForm.value;
    const roleId = this.mapRoleToId(formValue.role as UserRole | undefined);
    const payload: any = {
      name: formValue.name,
      email: formValue.email,
      status: this.mapStatusToApi(formValue.status as UserStatus | undefined),
      roleIds: roleId ? [roleId] : []
    };

    if (this.editingUser()) {
      const userId = this.editingUser()!.id;
      this.http.put<any>(`${this.baseUrl}/users/${userId}`, payload, { headers }).subscribe({
        next: () => {
          this.closeModal();
          this.loadUsers();
        },
        error: (err) => {
          this.error.set(err.error?.error || '更新使用者失敗');
        }
      });
      return;
    }

    this.http.post<any>(`${this.baseUrl}/users`, payload, { headers }).subscribe({
      next: () => {
        this.closeModal();
        this.loadUsers();
      },
      error: (err) => {
        this.error.set(err.error?.error || '新增使用者失敗');
      }
    });
  }

  // --- Deletion ---
  requestDelete(user: User): void {
    if (!this.canDeleteUsers()) {
      this.error.set('您沒有刪除使用者的權限');
      return;
    }
    this.userToDelete.set(user);
  }

  confirmDelete(): void {
    if (!this.canDeleteUsers()) {
      this.error.set('您沒有刪除使用者的權限');
      return;
    }

    if (!this.userToDelete()) return;

    const headers = this.getAuthHeaders();
    if (!headers) {
      this.error.set('尚未登入');
      return;
    }

    const userId = this.userToDelete()!.id;
    this.http.delete<any>(`${this.baseUrl}/users/${userId}`, { headers }).subscribe({
      next: () => {
        this.cancelDelete();
        this.loadUsers();
      },
      error: (err) => {
        this.error.set(err.error?.error || '刪除使用者失敗');
      }
    });
  }

  cancelDelete(): void {
    this.userToDelete.set(null);
  }
  
  // --- UI Helpers ---
  getRoleClass(role: UserRole): string {
    switch (role) {
      case '管理員': return 'bg-red-100 text-red-800';
      case '財務': return 'bg-blue-100 text-blue-800';
      case '營運': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  }

  getStatusClass(status: UserStatus): string {
    return status === '啟用' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800';
  }

  private getAuthHeaders(): HttpHeaders | null {
    const token = this.authService.getToken();
    if (!token) return null;
    return new HttpHeaders({
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    });
  }

  private mapUser(row: any): User {
    const roleDisplayName = String((row.role_names && row.role_names[0]) || '').trim();
    const roleCode = String((row.role_codes && row.role_codes[0]) || '').trim();
    const role = (roleDisplayName || roleCode || '營運') as UserRole;
    const status = this.mapStatusFromApi(row.status);
    return {
      id: String(row.admin_id),
      name: row.name,
      email: row.email,
      role,
      status,
      lastLogin: this.formatDate(row.last_login_at)
    };
  }

  private mapRoleToId(role?: UserRole): number | null {
    if (!role) return null;
    const value = String(role).trim();
    const match = this.roleOptions().find(r => r.display_name === value || r.role_name === value);
    return match?.role_id ?? null;
  }

  private mapRoleToCode(role?: UserRole): string | null {
    if (!role) return null;
    const value = String(role).trim();
    const match = this.roleOptions().find(r => r.display_name === value || r.role_name === value);
    return match?.role_name ?? null;
  }

  private mapStatusToApi(status?: UserStatus): string | undefined {
    if (!status) return undefined;
    return status === '啟用' ? 'active' : 'inactive';
  }

  private mapStatusFromApi(status?: string): UserStatus {
    return status === 'active' ? '啟用' : '停用';
  }

  private formatDate(date?: string): string {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('zh-TW', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}