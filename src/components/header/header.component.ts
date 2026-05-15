import { ChangeDetectionStrategy, Component, computed, CUSTOM_ELEMENTS_SCHEMA, effect, EventEmitter, inject, Input, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class HeaderComponent {
  @Input() isMobile = false;
  @Output() menuToggle = new EventEmitter<void>();

  authService = inject(AuthService);

  private avatarLoadError = signal(false);
  avatarSrc = computed(() => {
    const admin = this.authService.currentAdmin();
    const value = String(admin?.avatarUrl || '').trim();
    if (!value) return null;
    if (!/^https?:\/\//i.test(value)) return null;
    return value;
  });

  showAvatar = computed(() => !!this.avatarSrc() && !this.avatarLoadError());

  constructor() {
    // Reset load error when avatar URL changes (e.g., after profile update).
    effect(() => {
      this.avatarSrc();
      this.avatarLoadError.set(false);
    });
  }

  handleAvatarError(): void {
    this.avatarLoadError.set(true);
  }

  getRoleClass(roleName: string): string {
    switch (roleName) {
      case 'super_admin': return 'bg-red-100 text-red-800';
      case 'user_manager': return 'bg-blue-100 text-blue-800';
      case 'finance_manager': return 'bg-green-100 text-green-800';
      case 'operations_manager':
      case 'operation_manager':
        return 'bg-yellow-100 text-yellow-800';
      case 'viewer': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  }
}