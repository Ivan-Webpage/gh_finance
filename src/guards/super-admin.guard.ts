import { Injectable, inject } from '@angular/core';
import { Router, CanActivateFn, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Injectable({
  providedIn: 'root'
})
class SuperAdminGuardService {
  private authService = inject(AuthService);

  async checkSuperAdmin(): Promise<boolean> {
    if (!this.authService.isAuthenticated()) {
      return false;
    }

    return this.authService.hasRole('super_admin');
  }
}

/**
 * 超級管理員路由守衛
 * 確保只有擁有 'super_admin' 角色的用戶可以訪問受保護的路由
 */
export const superAdminGuard: CanActivateFn = async (
  route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot
) => {
  const guardService = inject(SuperAdminGuardService);
  const router = inject(Router);

  const isSuperAdmin = await guardService.checkSuperAdmin();

  if (isSuperAdmin) {
    return true;
  }

  // 如果不是超級管理員，重定向到首頁並提示錯誤
  console.warn('Access denied: User is not a super admin');
  router.navigate(['/dashboard'], { queryParams: { error: 'insufficient-permissions' } });
  return false;
};
