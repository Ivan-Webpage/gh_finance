import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  OnInit,
  CUSTOM_ELEMENTS_SCHEMA
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AuthService } from '../../services/auth.service';
import { environment } from '../../environments/environment';
import { resolveApiBaseUrl } from '../../utils/api-base-url';

// Updated: Fixed filter to allow editing non-super_admin roles
interface Permission {
  permission_id: number;
  permission_code: string;
  display_name: string;
  description: string;
  category: string;
  is_assigned: boolean;
}

interface Role {
  role_id: number;
  role_name: string;
  display_name: string;
  description: string;
  is_system: boolean;
  permission_count?: number;
}

@Component({
  selector: 'app-role-permission-management',
  templateUrl: './role-permission-management.component.html',
  styleUrls: ['./role-permission-management.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class RolePermissionManagementComponent implements OnInit {
  private baseUrl = `${resolveApiBaseUrl(environment.apiUrl, environment.githubPagesApiUrl)}/admin`;
  private authService = inject(AuthService);
  private http = inject(HttpClient);

  // --- State Signals ---
  roles = signal<Role[]>([]);
  selectedRole = signal<Role | null>(null);
  permissions = signal<Record<string, Permission[]>>({});
  selectedPermissions = signal<Set<number>>(new Set());

  // --- UI State ---
  isLoading = signal(false);
  isSaving = signal(false);
  error = signal<string | null>(null);
  successMessage = signal<string | null>(null);
  
  // --- Dialog State ---
  showRoleDialog = signal(false);
  showDeleteDialog = signal(false);
  editingRole = signal<Role | null>(null);
  roleToDelete = signal<Role | null>(null);
  
  // --- Form State ---
  roleFormData = signal<{ displayName: string; description: string }>({
    displayName: '',
    description: '',
  });

  // --- Filter ---
  searchTerm = signal('');

  // Expose global objects for template access
  readonly Object = Object;
  readonly Math = Math;

  // --- Computed ---
  filteredRoles = computed(() => {
    const term = this.searchTerm().toLowerCase();
    return this.roles()
      .filter(r => r.role_name !== 'super_admin') // 排除系統內建最高權限角色
      .filter(r => r.display_name.toLowerCase().includes(term));
  });

  permissionsByCategory = computed(() => {
    return this.permissions();
  });

  categoryCount = computed(() => {
    const categories = Object.keys(this.permissionsByCategory());
    return {
      total: categories.length,
      categories: categories,
    };
  });

  assignedCount = computed(() => {
    return this.selectedPermissions().size;
  });

  ngOnInit(): void {
    this.loadRoles();
  }

  private getAuthHeaders(): HttpHeaders | null {
    const token = this.authService.getToken();
    if (!token) {
      this.error.set('尚未登入');
      return null;
    }
    return new HttpHeaders({
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    });
  }

  private handleHttpError(err: any, fallbackMessage: string): string {
    if (err?.status === 401) {
      this.error.set('登入狀態失效，請重新登入');
      this.authService.logout();
      return '登入狀態失效，請重新登入';
    }

    return err?.error?.error || err?.message || fallbackMessage;
  }

  /**
   * Load all roles
   */
  private loadRoles(): void {
    const headers = this.getAuthHeaders();
    if (!headers) return;

    this.isLoading.set(true);
    this.error.set(null);

    const url = `${this.baseUrl}/roles?limit=100`;

    this.http.get<any>(url, { headers }).subscribe({
      next: (response) => {
        const roles = response?.data || [];
        
        this.roles.set(roles);
        this.isLoading.set(false);

        // Auto-select first non-system role
        const firstEditableRole = roles.find((r: Role) => !r.is_system);
        if (firstEditableRole) {
          this.selectRole(firstEditableRole);
        } else {
          console.warn('No editable roles found');
        }
      },
      error: (err) => {
        console.error('Error loading roles:', err);
        const errorMsg = this.handleHttpError(err, '讀取角色失敗');
        this.error.set(errorMsg);
        this.isLoading.set(false);
      },
    });
  }

  /**
   * Load permissions for selected role
   */
  selectRole(role: Role): void {
    this.selectedRole.set(role);
    this.selectedPermissions.set(new Set());
    this.error.set(null);

    const headers = this.getAuthHeaders();
    if (!headers) return;

    this.isLoading.set(true);

    this.http
      .get<any>(`${this.baseUrl}/role-permissions?roleId=${role.role_id}`, { headers })
      .subscribe({
        next: (response) => {
          const permissionsData = response?.permissions || {};

          // Mark assigned permissions
          const assigned = new Set<number>();
          Object.values(permissionsData).forEach((perms: any) => {
            perms.forEach((perm: Permission) => {
              if (perm.is_assigned) {
                assigned.add(perm.permission_id);
              }
            });
          });

          this.permissions.set(permissionsData);
          this.selectedPermissions.set(assigned);
          this.isLoading.set(false);
        },
        error: (err) => {
          console.error('Error loading permissions:', err);
          this.error.set(this.handleHttpError(err, '讀取權限失敗'));
          this.isLoading.set(false);
        },
      });
  }

  /**
   * Toggle permission assignment
   */
  togglePermission(permissionId: number, isAssigned: boolean): void {
    const updated = new Set(this.selectedPermissions());
    if (isAssigned) {
      updated.delete(permissionId);
    } else {
      updated.add(permissionId);
    }
    this.selectedPermissions.set(updated);
  }

  /**
   * Select all permissions in a category
   */
  selectAllInCategory(category: string): void {
    const perms = this.permissions()[category] || [];
    const updated = new Set(this.selectedPermissions());

    perms.forEach(perm => {
      updated.add(perm.permission_id);
    });

    this.selectedPermissions.set(updated);
  }

  /**
   * Deselect all permissions in a category
   */
  deselectAllInCategory(category: string): void {
    const perms = this.permissions()[category] || [];
    const updated = new Set(this.selectedPermissions());

    perms.forEach(perm => {
      updated.delete(perm.permission_id);
    });

    this.selectedPermissions.set(updated);
  }

  /**
   * Get number of assigned permissions in a category
   */
  getCategoryAssignedCount(category: string): number {
    const perms = this.permissions()[category] || [];
    let count = 0;
    perms.forEach(perm => {
      if (this.selectedPermissions().has(perm.permission_id)) {
        count++;
      }
    });
    return count;
  }

  /**
   * Check if all permissions in category are selected
   */
  isCategoryFullySelected(category: string): boolean {
    const perms = this.permissions()[category] || [];
    if (perms.length === 0) return false;
    return perms.every(p => this.selectedPermissions().has(p.permission_id));
  }

  /**
   * Save permissions for selected role
   */
  savePermissions(): void {
    const role = this.selectedRole();
    if (!role) {
      this.error.set('請選擇要儲存的角色');
      return;
    }

    const headers = this.getAuthHeaders();
    if (!headers) return;

    this.isSaving.set(true);
    this.error.set(null);
    this.successMessage.set(null);

    const payload = {
      roleId: role.role_id,
      permissionIds: Array.from(this.selectedPermissions()),
    };

    this.http.post<any>(`${this.baseUrl}/role-permissions`, payload, { headers }).subscribe({
      next: (response) => {
        this.isSaving.set(false);
        this.successMessage.set(
          `已更新角色「${role.display_name}」的權限（${this.assignedCount()} 項）`
        );

        // Reload roles to update permission counts
        setTimeout(() => {
          this.loadRoles();
        }, 1500);
      },
      error: (err) => {
        this.isSaving.set(false);
        this.error.set(this.handleHttpError(err, '儲存權限失敗'));
      },
    });
  }

  /**
   * Reset permissions to original state
   */
  resetPermissions(): void {
    const role = this.selectedRole();
    if (role) {
      this.selectRole(role);
    }
  }

  /**
   * Select all permissions
   */
  selectAllPermissions(): void {
    const updated = new Set<number>();
    Object.values(this.permissions()).forEach((perms: Permission[]) => {
      perms.forEach(perm => {
        updated.add(perm.permission_id);
      });
    });
    this.selectedPermissions.set(updated);
  }

  /**
   * Clear all permissions
   */
  clearAllPermissions(): void {
    this.selectedPermissions.set(new Set());
  }

  /**
   * Open dialog to create new role
   */
  openCreateRoleDialog(): void {
    this.editingRole.set(null);
    this.roleFormData.set({ displayName: '', description: '' });
    this.showRoleDialog.set(true);
    this.error.set(null);
  }

  /**
   * Open dialog to edit role
   */
  openEditRoleDialog(role: Role): void {
    this.editingRole.set(role);
    this.roleFormData.set({ 
      displayName: role.display_name, 
      description: role.description || '' 
    });
    this.showRoleDialog.set(true);
    this.error.set(null);
  }

  /**
   * Close role dialog
   */
  closeRoleDialog(): void {
    this.showRoleDialog.set(false);
    this.editingRole.set(null);
    this.roleFormData.set({ displayName: '', description: '' });
    this.error.set(null);
  }

  /**
   * Save role (create or update)
   */
  saveRole(): void {
    const formData = this.roleFormData();
    
    if (!formData.displayName.trim()) {
      this.error.set('角色名稱不可為空');
      return;
    }

    const headers = this.getAuthHeaders();
    if (!headers) return;

    this.isSaving.set(true);
    this.error.set(null);

    const editingRole = this.editingRole();
    
    if (editingRole) {
      // Update existing role
      this.http.put<any>(`${this.baseUrl}/roles/${editingRole.role_id}`, {
        displayName: formData.displayName.trim(),
        description: formData.description.trim() || null,
      }, { headers }).subscribe({
        next: (response) => {
          this.isSaving.set(false);
          this.successMessage.set(`已更新角色「${formData.displayName}」`);
          this.closeRoleDialog();
          this.loadRoles();
          
          // Clear success message after 3 seconds
          setTimeout(() => {
            this.successMessage.set(null);
          }, 3000);
        },
        error: (err) => {
          this.isSaving.set(false);
          this.error.set(this.handleHttpError(err, '更新角色失敗'));
        },
      });
    } else {
      // Create new role
      // Generate role_name: use timestamp + random suffix to ensure uniqueness
      // Format: role_YYYYMMDDHHMSS_XXXX where XXXX is random 4 hex digits
      const now = new Date();
      const timestamp = now.getFullYear().toString() +
        (now.getMonth() + 1).toString().padStart(2, '0') +
        now.getDate().toString().padStart(2, '0') +
        now.getHours().toString().padStart(2, '0') +
        now.getMinutes().toString().padStart(2, '0') +
        now.getSeconds().toString().padStart(2, '0');
      const random = Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0');
      const roleName = `role_${timestamp}_${random}`;
      
      this.http.post<any>(`${this.baseUrl}/roles`, {
        roleName,
        displayName: formData.displayName.trim(),
        description: formData.description.trim() || null,
      }, { headers }).subscribe({
        next: (response) => {
          this.isSaving.set(false);
          this.successMessage.set(`已新增角色「${formData.displayName}」`);
          this.closeRoleDialog();
          this.loadRoles();
          
          // Clear success message after 3 seconds
          setTimeout(() => {
            this.successMessage.set(null);
          }, 3000);
        },
        error: (err) => {
          this.isSaving.set(false);
          this.error.set(this.handleHttpError(err, '新增角色失敗'));
        },
      });
    }
  }

  /**
   * Open delete confirmation dialog
   */
  openDeleteDialog(role: Role): void {
    this.roleToDelete.set(role);
    this.showDeleteDialog.set(true);
    this.error.set(null);
  }

  /**
   * Close delete dialog
   */
  closeDeleteDialog(): void {
    this.showDeleteDialog.set(false);
    this.roleToDelete.set(null);
    this.error.set(null);
  }

  /**
   * Delete role
   */
  deleteRole(): void {
    const role = this.roleToDelete();
    if (!role) return;

    const headers = this.getAuthHeaders();
    if (!headers) return;

    this.isSaving.set(true);
    this.error.set(null);

    this.http.delete<any>(`${this.baseUrl}/roles/${role.role_id}`, { headers }).subscribe({
      next: (response) => {
        this.isSaving.set(false);
        this.successMessage.set(`已刪除角色「${role.display_name}」`);
        this.closeDeleteDialog();
        
        // If deleted role was selected, clear selection
        if (this.selectedRole()?.role_id === role.role_id) {
          this.selectedRole.set(null);
          this.permissions.set({});
          this.selectedPermissions.set(new Set());
        }
        
        this.loadRoles();
        
        // Clear success message after 3 seconds
        setTimeout(() => {
          this.successMessage.set(null);
        }, 3000);
      },
      error: (err) => {
        this.isSaving.set(false);
        this.error.set(this.handleHttpError(err, '刪除角色失敗'));
      },
    });
  }

  /**
   * Update form data - display name
   */
  updateRoleDisplayName(value: string): void {
    const current = this.roleFormData();
    this.roleFormData.set({
      displayName: value,
      description: current.description
    });
  }

  /**
   * Update form data - description
   */
  updateRoleDescription(value: string): void {
    const current = this.roleFormData();
    this.roleFormData.set({
      displayName: current.displayName,
      description: value
    });
  }
}

