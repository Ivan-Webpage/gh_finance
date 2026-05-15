import { inject } from '@angular/core';
import { Router, CanActivateFn, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { AuthService } from '../services/auth.service';

/**
 * Guard to check if user is authenticated and token is not expired
 * Usage in route: { path: 'admin', component: AdminComponent, canActivate: [authGuard] }
 */
export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // 检查是否已认证
  if (!authService.isAuthenticated()) {
    router.navigate(['/login'], { queryParams: { returnUrl: state.url } });
    return false;
  }

  // 检查 Token 是否已过期
  const expiry = authService.getTokenExpiry();
  const now = new Date().getTime();

  if (expiry && now >= expiry) {
    // Token 已过期，强制重新登入
    authService.logout();
    router.navigate(['/login'], { queryParams: { returnUrl: state.url, expired: true } });
    return false;
  }

  return true;
};

/**
 * Guard to check if user has specific permission
 * Usage in route: { 
 *   path: 'admin/users', 
 *   component: UsersComponent, 
 *   canActivate: [permissionGuard], 
 *   data: { permission: 'manage_admins' }
 * }
 */
export const permissionGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  
  if (!authService.isAuthenticated()) {
    router.navigate(['/login']);
    return false;
  }

  const requiredPermission = route.data['permission'];
  if (!requiredPermission) {
    return true;
  }

  if (authService.hasPermission(requiredPermission)) {
    return true;
  }

  router.navigate(['/unauthorized']);
  return false;
};

/**
 * Guard to check if user has specific role
 * Usage in route: {
 *   path: 'admin',
 *   component: AdminComponent,
 *   canActivate: [roleGuard],
 *   data: { role: 'super_admin' }
 * }
 */
export const roleGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  
  if (!authService.isAuthenticated()) {
    router.navigate(['/login']);
    return false;
  }

  const requiredRole = route.data['role'];
  if (!requiredRole) {
    return true;
  }

  if (authService.hasRole(requiredRole)) {
    return true;
  }

  router.navigate(['/unauthorized']);
  return false;
};
