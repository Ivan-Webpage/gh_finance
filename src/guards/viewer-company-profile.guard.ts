import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const viewerCompanyProfileGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.hasRole('viewer')) {
    router.navigate(['/dashboard'], { queryParams: { error: 'viewer-readonly' } });
    return false;
  }

  return true;
};
