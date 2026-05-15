
import { ChangeDetectionStrategy, Component, HostListener, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { SidebarComponent } from './components/sidebar/sidebar.component';
import { HeaderComponent } from './components/header/header.component';
import { AuthService } from './services/auth.service';
import { CommonModule } from '@angular/common';
import { filter, Subscription } from 'rxjs';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, SidebarComponent, HeaderComponent, CommonModule],
})
export class AppComponent implements OnInit, OnDestroy {
  authService = inject(AuthService);
  private router = inject(Router);
  private readonly mobileBreakpoint = 1024;
  private lastBlockedAt = 0;
  private pointerDownCaptureHandler = (event: Event) => this.onGlobalClickCapture(event as MouseEvent);
  private captureHandler = (event: Event) => this.onGlobalClickCapture(event as MouseEvent);
  private routeSub?: Subscription;
  private mutationObserver?: MutationObserver;
  isMobile = signal(false);
  isSidebarOpen = signal(false);

  ngOnInit(): void {
    this.updateViewportState();
    document.addEventListener('pointerdown', this.pointerDownCaptureHandler, true);
    document.addEventListener('click', this.captureHandler, true);
    this.routeSub = this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe(() => this.applyViewerUiRestrictions());

    this.mutationObserver = new MutationObserver(() => this.applyViewerUiRestrictions());
    this.mutationObserver.observe(document.body, { childList: true, subtree: true });
    this.applyViewerUiRestrictions();
  }

  @HostListener('window:resize')
  onResize(): void {
    this.updateViewportState();
  }

  ngOnDestroy(): void {
    document.removeEventListener('pointerdown', this.pointerDownCaptureHandler, true);
    document.removeEventListener('click', this.captureHandler, true);
    this.routeSub?.unsubscribe();
    this.mutationObserver?.disconnect();
  }

  toggleSidebar(): void {
    if (!this.isMobile()) {
      return;
    }

    this.isSidebarOpen.update(current => !current);
  }

  closeSidebar(): void {
    this.isSidebarOpen.set(false);
  }

  private updateViewportState(): void {
    const mobile = window.innerWidth < this.mobileBreakpoint;
    this.isMobile.set(mobile);

    if (!mobile) {
      this.isSidebarOpen.set(false);
    }
  }

  private onGlobalClickCapture(event: MouseEvent): void {
    if (!this.authService.isAuthenticated() || !this.isReadonlyRole()) {
      return;
    }

    const target = event.target as HTMLElement | null;
    const trigger = target?.closest('button, a, [role="button"]') as HTMLElement | null;
    if (!trigger) {
      return;
    }

    // Always allow sidebar/header controls for navigation and layout
    if (trigger.closest('app-sidebar') || trigger.closest('app-header')) {
      return;
    }

    if (this.isViewerAllowedControl(trigger)) {
      return;
    }

    if (this.isDismissControl(trigger)) {
      return;
    }

    if (!this.isBlockedInContentArea(trigger)) {
      return;
    }

    if (trigger instanceof HTMLButtonElement && trigger.disabled) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    (event as any).stopImmediatePropagation?.();

    const now = Date.now();
    if (now - this.lastBlockedAt > 1500) {
      this.lastBlockedAt = now;
      alert('檢視者與股東僅可讀取資料，無法執行新增、編輯或刪除操作');
    }
  }

  private applyViewerUiRestrictions(): void {
    if (!this.authService.isAuthenticated() || !this.isReadonlyRole()) {
      return;
    }

    const main = document.querySelector('main');
    if (!main) {
      return;
    }

    const interactiveNodes = main.querySelectorAll<HTMLElement>('button, a, [role="button"]');
    interactiveNodes.forEach(node => {
      if (this.isViewerAllowedControl(node) || this.isDismissControl(node)) {
        node.removeAttribute('data-viewer-blocked');
        if (node instanceof HTMLButtonElement && node.hasAttribute('data-viewer-forced-disabled')) {
          node.disabled = false;
          node.classList.remove('cursor-not-allowed', 'opacity-50');
          node.removeAttribute('data-viewer-forced-disabled');
        }
        return;
      }

      if (node instanceof HTMLButtonElement) {
        node.disabled = true;
        node.classList.add('cursor-not-allowed', 'opacity-50');
        node.setAttribute('data-viewer-forced-disabled', 'true');
      } else {
        node.setAttribute('data-viewer-blocked', 'true');
      }
    });
  }

  private isBlockedInContentArea(control: HTMLElement): boolean {
    const inContent = !!control.closest('main');
    if (!inContent) {
      return false;
    }

    return !!control.closest('button, a, [role="button"]');
  }

  private isDismissControl(control: HTMLElement): boolean {
    const text = this.getControlText(control);
    const title = (control.getAttribute('title') || '').trim();
    const iconNames = Array.from(control.querySelectorAll('ion-icon')).map(icon => icon.getAttribute('name') || '');

    if (/取消|關閉|返回|回上頁|離開/.test(text) || /關閉|取消/.test(title)) {
      return true;
    }

    const dismissIcons = ['close-outline', 'close-circle-outline', 'arrow-back-outline'];
    return iconNames.some(name => dismissIcons.includes(name));
  }

  private isViewerAllowedControl(control: HTMLElement): boolean {
    const text = this.getControlText(control);
    const title = (control.getAttribute('title') || '').trim();
    const href = (control as HTMLAnchorElement).getAttribute?.('href') || '';
    const iconNames = Array.from(control.querySelectorAll('ion-icon')).map(icon => icon.getAttribute('name') || '');

    if (control.closest('[data-viewer-allow="true"]')) {
      return true;
    }

    if (/篩選|重設篩選|查詢|搜尋|下一頁|上一頁|展開|收合/.test(text) || /篩選|重設篩選|查詢|搜尋/.test(title)) {
      return true;
    }

    if (this.isTabControl(control)) {
      return true;
    }

    if (this.isTimeFilterControl(control, text, title, iconNames)) {
      return true;
    }

    if (this.isPaginationControl(control, iconNames)) {
      return true;
    }

    if (href.includes('/login') || href.includes('/dashboard')) {
      return true;
    }

    if (this.isAccountRoute()) {
      return true;
    }

    return false;
  }

  private isAccountRoute(): boolean {
    return this.router.url.startsWith('/account');
  }

  private isTabControl(control: HTMLElement): boolean {
    const role = (control.getAttribute('role') || '').toLowerCase();
    if (role === 'tab' || !!control.closest('[role="tablist"]')) {
      return true;
    }

    if (!!control.closest('nav[aria-label="Tabs"], nav[aria-label="tabs"], [aria-label="頁籤"]')) {
      return true;
    }

    const parent = control.parentElement;
    if (!parent) {
      return false;
    }

    const siblingButtons = Array.from(parent.children).filter(child => {
      const el = child as HTMLElement;
      const childRole = (el.getAttribute('role') || '').toLowerCase();
      return el.tagName === 'BUTTON' || childRole === 'button' || childRole === 'tab';
    });

    if (siblingButtons.length < 2) {
      return false;
    }

    const parentClass = String((parent as HTMLElement).className || '').toLowerCase();
    const controlClass = String(control.className || '').toLowerCase();
    const hasTabContainerStyle = parentClass.includes('border-b') || parentClass.includes('space-x') || parentClass.includes('gap-');
    const hasTabButtonStyle = controlClass.includes('font-medium') && controlClass.includes('py-') && controlClass.includes('px-');

    return hasTabContainerStyle && hasTabButtonStyle;
  }

  private isTimeFilterControl(control: HTMLElement, text: string, title: string, iconNames: string[]): boolean {
    const timeKeywordRegex = /日期|時間|期間|區間|月份|年度|本月|上月|下月|本週|上週|下週|今天|今日|昨天|明天|今年|去年|最近|近7天|近30天|上一月|下一月|上一年|下一年/;
    if (timeKeywordRegex.test(text) || timeKeywordRegex.test(title)) {
      return true;
    }

    const timeIcons = ['calendar-outline', 'calendar-number-outline', 'chevron-back-outline', 'chevron-forward-outline', 'caret-back-outline', 'caret-forward-outline'];
    if (!iconNames.some(name => timeIcons.includes(name))) {
      return false;
    }

    const nearbyText = (control.parentElement?.textContent || '').replace(/\s+/g, '').trim();
    return /年|月|日|日期|期間|區間|時間|週/.test(nearbyText);
  }

  private isPaginationControl(control: HTMLElement, iconNames: string[]): boolean {
    const pagerIcons = ['chevron-back-outline', 'chevron-forward-outline', 'caret-back-outline', 'caret-forward-outline'];
    if (!iconNames.some(name => pagerIcons.includes(name))) {
      return false;
    }

    const nearbyText = (control.parentElement?.textContent || '').replace(/\s+/g, '').trim();
    return /第\d+頁|共\d+頁|顯示第|共\d+筆|上一頁|下一頁/.test(nearbyText);
  }

  private isReadonlyRole(): boolean {
    return this.authService.hasAnyRole(['viewer', 'shareholder']);
  }

  private isMutationAction(control: HTMLElement): boolean {
    const text = this.getControlText(control);
    const title = (control.getAttribute('title') || '').trim();
    const href = (control as HTMLAnchorElement).getAttribute?.('href') || '';
    const iconNames = Array.from(control.querySelectorAll('ion-icon')).map(icon => icon.getAttribute('name') || '');

    const keywords = ['新增', '編輯', '刪除', '儲存', '保存', '更新', '確認刪除', '提交', '送出', '建立', '發放', '支付', '釋放'];
    if (keywords.some(keyword => text.includes(keyword) || title.includes(keyword))) {
      return true;
    }

    if (href.includes('/new') || href.includes('/edit/')) {
      return true;
    }

    const mutationIcons = ['add-outline', 'create-outline', 'trash-outline', 'save-outline', 'checkmark-outline'];
    return iconNames.some(name => mutationIcons.includes(name));
  }

  private getControlText(control: HTMLElement): string {
    return (control.textContent || '').replace(/\s+/g, '').trim();
  }
}