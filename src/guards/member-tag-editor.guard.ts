import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { MEMBER_TAG_EDITOR_ROLES } from '../utils/member-tags';

/**
 * 只有超級管理員、經營管理者可以進入（LINE 推播頁）。後端 API 也會檢查同一組角色。
 */
export const memberTagEditorGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.hasAnyRole(MEMBER_TAG_EDITOR_ROLES)) {
    return true;
  }

  router.navigate(['/dashboard'], { queryParams: { error: 'insufficient-permissions' } });
  return false;
};
