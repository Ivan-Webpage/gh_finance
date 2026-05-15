import { ChangeDetectionStrategy, Component, computed, CUSTOM_ELEMENTS_SCHEMA, EventEmitter, inject, Input, OnInit, Output, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { AuthService } from '../../services/auth.service';

interface NavLink {
  path?: string;
  icon: string;
  name: string;
  children?: NavLink[];
}

@Component({
  selector: 'app-sidebar',
  templateUrl: './sidebar.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class SidebarComponent implements OnInit {
  @Input() isMobile = false;
  @Input() isMobileOpen = false;
  @Output() closeMobile = new EventEmitter<void>();

  private router = inject(Router);
  private authService = inject(AuthService);
  
  openMenu = signal<string | null>(null);
  isSuperAdmin = signal(false);
  isCollapsed = signal(false);

  private allNavLinks: NavLink[] = [
    { path: '/dashboard', icon: 'grid-outline', name: '儀表板' },
    {
      name: '財務與分析',
      icon: 'analytics-outline',
      children: [
        { path: '/daily-revenue', icon: 'stats-chart-outline', name: '當日營收' },
        { path: '/financial-statements', icon: 'document-text-outline', name: '財務報表' },
        { path: '/customer-analysis', icon: 'people-outline', name: '顧客管理' },
        { path: '/product-analysis', icon: 'cube-outline', name: '商品分析' },
        { path: '/monthly-targets', icon: 'trending-up-outline', name: '營收目標' },
      ]
    },
    {
      name: '成本與廠商',
      icon: 'wallet-outline',
      children: [
        { path: '/product-cost', icon: 'pricetags-outline', name: '商品成本' },
        { path: '/purchase-orders', icon: 'receipt-outline', name: '進貨單管理' },
        { path: '/vendors', icon: 'briefcase-outline', name: '廠商管理' },
      ]
    },
    {
      name: '交易與帳務',
      icon: 'reader-outline',
      children: [
        { path: '/ledger', icon: 'reader-outline', name: '流水帳' },
        { path: '/accounts-payable', icon: 'cash-outline', name: '應付帳款' },
        { path: '/auto-debits', icon: 'repeat-outline', name: '固定自動扣繳' },
      ]
    },
    {
      name: '行銷與活動',
      icon: 'megaphone-outline',
      children: [
        { path: '/events', icon: 'calendar-outline', name: '活動管理' },
        { path: '/reminders', icon: 'notifications-outline', name: '事項提醒' },
      ]
    },
    {
      name: '股東與薪資',
      icon: 'people-circle-outline',
      children: [
        { path: '/payroll', icon: 'card-outline', name: '打卡薪資' },
        { path: '/shift-schedule', icon: 'calendar-number-outline', name: '排班表' },
        { path: '/company-profile', icon: 'person-outline', name: '公司個人資料' },
        { path: '/shareholder-rebates', icon: 'diamond-outline', name: '股東回饋金' },
        { path: '/shareholding-ratio', icon: 'pie-chart-outline', name: '股權比例' },
      ]
    },
    {
      name: '協作空間',
      icon: 'people-outline',
      children: [
        { path: '/goal-setting', icon: 'trophy-outline', name: '團隊目標設定' },
        { path: '/future-plans', icon: 'rocket-outline', name: '未來計畫' },
        { path: '/shareholder-records', icon: 'document-text-outline', name: '個人每周進度紀錄' },
        { path: '/decision-log', icon: 'key-outline', name: '重大事項佈達' },
      ]
    },
    {
      name: '帳號管理',
      icon: 'person-circle-outline',
      children: [
        { path: '/account', icon: 'settings-outline', name: '帳號設定' },
        { path: '/user-management', icon: 'shield-checkmark-outline', name: '使用者管理' },
      ]
    }
  ];

  navLinks = computed(() => {
    if (!this.authService.isAuthenticated()) {
      return [];
    }

    const isViewer = this.authService.hasRole('viewer');
    const hiddenForViewer = new Set([
      '/customer-analysis',
      '/monthly-targets',
      '/accounts-payable',
      '/product-cost',
      '/vendors',
      '/purchase-orders',
      '/company-profile',
      '/user-management',
      '/role-permissions',
      '/goal-setting',
      '/future-plans',
    ]);

    const links = this.allNavLinks
      .map(link => {
        if (!link.children) {
          return link;
        }

        const children = link.children.filter(child => {
          if (!this.isSuperAdmin() && (child.path === '/role-permissions' || child.path === '/company-profile' || child.path === '/user-management')) {
            return false;
          }

          if (isViewer && child.path && hiddenForViewer.has(child.path)) {
            return false;
          }

          return true;
        });

        return { ...link, children };
      })
      .filter(link => !link.children || link.children.length > 0);

    // Add super admin menu if user is super admin
    if (this.isSuperAdmin()) {
      return [
        ...links.slice(0, links.length - 1), // Keep everything except last 帳號管理
        {
          name: '帳號管理',
          icon: 'person-circle-outline',
          children: [
            { path: '/account', icon: 'settings-outline', name: '帳號設定' },
            { path: '/user-management', icon: 'shield-checkmark-outline', name: '使用者管理' },
            { path: '/role-permissions', icon: 'lock-closed-outline', name: '角色權限控管' },
          ]
        }
      ];
    }

    return links;
  });

  ngOnInit(): void {
    this.isSuperAdmin.set(this.authService.hasRole('super_admin'));
    
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd)
    ).subscribe(() => {
      const activeMenu = this.navLinks().find(link => this.isMenuActive(link.children));
      if (activeMenu) {
        // Automatically open the menu containing the active link
        this.openMenu.set(activeMenu.name);
      }
    });
  }

  toggleMenu(name: string): void {
    this.openMenu.update(current => (current === name ? null : name));
  }

  toggleCollapse(): void {
    if (this.isMobile) {
      return;
    }

    this.isCollapsed.update(current => !current);
  }

  onNavigate(): void {
    if (this.isMobile) {
      this.closeMobile.emit();
    }
  }

  isMenuActive(children: NavLink[] | undefined): boolean {
    if (!children) return false;
    return children.some(child => child.path && this.router.isActive(child.path, { 
      paths: 'exact', 
      queryParams: 'subset', 
      fragment: 'ignored', 
      matrixParams: 'ignored' 
    }));
  }
}