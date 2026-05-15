import { Directive, Input, TemplateRef, ViewContainerRef, OnInit, OnDestroy } from '@angular/core';
import { AuthService } from '../services/auth.service';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

/**
 * Structural directive to show/hide elements based on permissions
 * Usage: *appHasPermission="'permission_code'"
 * Example: <button *appHasPermission="'manage_admins'">Manage Users</button>
 */
@Directive({
  selector: '[appHasPermission]',
  standalone: true,
})
export class HasPermissionDirective implements OnInit, OnDestroy {
  private permission: string = '';
  private destroy$ = new Subject<void>();

  constructor(
    private templateRef: TemplateRef<any>,
    private viewContainer: ViewContainerRef,
    private authService: AuthService
  ) {}

  @Input()
  set appHasPermission(permission: string) {
    this.permission = permission;
    this.updateView();
  }

  ngOnInit() {
    // Watch for changes in current admin (permissions)
    this.authService.currentAdmin
      .subscribe({
        next: () => this.updateView(),
      });
  }

  private updateView() {
    if (this.authService.hasPermission(this.permission)) {
      this.viewContainer.createEmbeddedView(this.templateRef);
    } else {
      this.viewContainer.clear();
    }
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }
}

/**
 * Directive to show/hide elements based on role
 * Usage: *appHasRole="'role_name'"
 * Example: <div *appHasRole="'super_admin'">Admin Panel</div>
 */
@Directive({
  selector: '[appHasRole]',
  standalone: true,
})
export class HasRoleDirective implements OnInit, OnDestroy {
  private role: string = '';
  private destroy$ = new Subject<void>();

  constructor(
    private templateRef: TemplateRef<any>,
    private viewContainer: ViewContainerRef,
    private authService: AuthService
  ) {}

  @Input()
  set appHasRole(role: string) {
    this.role = role;
    this.updateView();
  }

  ngOnInit() {
    // Watch for changes in current admin (roles)
    this.authService.currentAdmin
      .subscribe({
        next: () => this.updateView(),
      });
  }

  private updateView() {
    if (this.authService.hasRole(this.role)) {
      this.viewContainer.createEmbeddedView(this.templateRef);
    } else {
      this.viewContainer.clear();
    }
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }
}

/**
 * Directive to show/hide elements based on any of multiple roles
 * Usage: *appHasAnyRole="['role1', 'role2']"
 * Example: <div *appHasAnyRole="['super_admin', 'admin']">Admin Area</div>
 */
@Directive({
  selector: '[appHasAnyRole]',
  standalone: true,
})
export class HasAnyRoleDirective implements OnInit, OnDestroy {
  private roles: string[] = [];
  private destroy$ = new Subject<void>();

  constructor(
    private templateRef: TemplateRef<any>,
    private viewContainer: ViewContainerRef,
    private authService: AuthService
  ) {}

  @Input()
  set appHasAnyRole(roles: string[]) {
    this.roles = roles;
    this.updateView();
  }

  ngOnInit() {
    // Watch for changes in current admin (roles)
    this.authService.currentAdmin
      .subscribe({
        next: () => this.updateView(),
      });
  }

  private updateView() {
    if (this.authService.hasAnyRole(this.roles)) {
      this.viewContainer.createEmbeddedView(this.templateRef);
    } else {
      this.viewContainer.clear();
    }
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
