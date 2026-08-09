import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const viewerRestrictedPagesGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.hasRole('viewer')) {
    router.navigate(['/dashboard'], { queryParams: { error: 'viewer-route-blocked' } });
    return false;
  }

  return true;
};
