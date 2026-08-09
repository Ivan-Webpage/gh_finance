import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';
import { superAdminGuard } from './guards/super-admin.guard';
import { viewerCompanyProfileGuard } from './guards/viewer-company-profile.guard';
import { viewerRestrictedPagesGuard } from './guards/viewer-restricted-pages.guard';

export const APP_ROUTES: Routes = [
  // Public routes
  { path: 'login', loadComponent: () => import('./components/login/login.component').then(m => m.LoginComponent), title: '登入' },

  // Protected routes - require authentication
  { path: 'dashboard', loadComponent: () => import('./components/dashboard/dashboard.component').then(m => m.DashboardComponent), title: '儀表板', canActivate: [authGuard] },
  { path: 'financial-statements', loadComponent: () => import('./components/financial-statements/financial-statements.component').then(m => m.FinancialStatementsComponent), title: '財務報表', canActivate: [authGuard] },
  { path: 'customer-analysis', loadComponent: () => import('./components/customer-analysis/customer-analysis.component').then(m => m.CustomerAnalysisComponent), title: '顧客管理', canActivate: [authGuard, viewerRestrictedPagesGuard] },
  { path: 'product-analysis', loadComponent: () => import('./components/product-analysis/product-analysis.component').then(m => m.ProductAnalysisComponent), title: '商品分析', canActivate: [authGuard] },
  { path: 'product-cost', loadComponent: () => import('./components/product-cost/product-cost.component').then(m => m.ProductCostComponent), title: '商品成本', canActivate: [authGuard, viewerRestrictedPagesGuard] },
  { path: 'tarakou-whisky-sales', loadComponent: () => import('./components/tarakou-whisky-sales/tarakou-whisky-sales.component').then(m => m.TarakouWhiskySalesComponent), title: '太魯閣威士忌銷售', canActivate: [authGuard, viewerRestrictedPagesGuard] },
  { path: 'ledger', loadComponent: () => import('./components/ledger/ledger.component').then(m => m.LedgerComponent), title: '流水帳', canActivate: [authGuard] },
  { path: 'accounts-payable', loadComponent: () => import('./components/accounts-payable/accounts-payable.component').then(m => m.AccountsPayableComponent), title: '應付帳款', canActivate: [authGuard, viewerRestrictedPagesGuard] },
  { path: 'auto-debits', loadComponent: () => import('./components/auto-debits/auto-debits.component').then(m => m.AutoDebitsComponent), title: '固定自動扣繳', canActivate: [authGuard] },
  { path: 'off-book-finance', loadComponent: () => import('./components/off-book-finance/off-book-finance.component').then(m => m.OffBookFinanceComponent), title: '外帳財務', canActivate: [authGuard, viewerRestrictedPagesGuard] },
  { path: 'vendors', loadComponent: () => import('./components/vendors/vendors.component').then(m => m.VendorsComponent), title: '廠商管理', canActivate: [authGuard, viewerRestrictedPagesGuard] },
  { path: 'purchase-orders', loadComponent: () => import('./components/purchase-orders/purchase-orders.component').then(m => m.PurchaseOrdersComponent), title: '進貨單管理', canActivate: [authGuard, viewerRestrictedPagesGuard] },
  { path: 'events', loadComponent: () => import('./components/events/events.component').then(m => m.EventsComponent), title: '活動管理', canActivate: [authGuard] },
  { path: 'reminders', loadComponent: () => import('./components/reminders/reminders.component').then(m => m.RemindersComponent), title: '事項提醒', canActivate: [authGuard] },
  { path: 'reminders/new', loadComponent: () => import('./components/reminder-form/reminder-form.component').then(m => m.ReminderFormComponent), title: '新增事項提醒', canActivate: [authGuard] },
  { path: 'events/new', loadComponent: () => import('./components/event-form/event-form.component').then(m => m.EventFormComponent), title: '新增活動', canActivate: [authGuard] },
  { path: 'events/edit/:id', loadComponent: () => import('./components/event-form/event-form.component').then(m => m.EventFormComponent), title: '編輯活動', canActivate: [authGuard] },
  { path: 'daily-revenue', loadComponent: () => import('./components/daily-revenue/daily-revenue.component').then(m => m.DailyRevenueComponent), title: '當日營收', canActivate: [authGuard] },
  { path: 'daily-revenue/:date', loadComponent: () => import('./components/daily-revenue-detail/daily-revenue-detail.component').then(m => m.DailyRevenueDetailComponent), title: '當日營收明細', canActivate: [authGuard] },
  { path: 'payroll', loadComponent: () => import('./components/payroll/payroll.component').then(m => m.PayrollComponent), title: '薪資管理', canActivate: [authGuard] },
  { path: 'payroll/:employeeId/:year/:month', loadComponent: () => import('./components/payroll-detail/payroll-detail.component').then(m => m.PayrollDetailComponent), title: '薪資明細', canActivate: [authGuard] },
  { path: 'shift-schedule', loadComponent: () => import('./components/shift-schedule/shift-schedule.component').then(m => m.ShiftScheduleComponent), title: '排班表', canActivate: [authGuard] },
  { path: 'company-profile', loadComponent: () => import('./components/company-profile/company-profile.component').then(m => m.CompanyProfileComponent), title: '公司個人資料', canActivate: [authGuard, viewerCompanyProfileGuard] },
  { path: 'shareholder-rebates', loadComponent: () => import('./components/shareholder-rebates/shareholder-rebates.component').then(m => m.ShareholderRebatesComponent), title: '股東回饋金', canActivate: [authGuard] },
  { path: 'shareholding-ratio', loadComponent: () => import('./components/shareholding-ratio/shareholding-ratio.component').then(m => m.ShareholdingRatioComponent), title: '股權比例', canActivate: [authGuard] },
  { path: 'shareholder-records', loadComponent: () => import('./components/shareholder-records/shareholder-records.component').then(m => m.ShareholderRecordsComponent), title: '個人每周進度紀錄', canActivate: [authGuard] },
  { path: 'goal-setting', loadComponent: () => import('./components/goal-setting/goal-setting.component').then(m => m.GoalSettingComponent), title: '團隊目標設定', canActivate: [authGuard] },
  { path: 'future-plans', loadComponent: () => import('./components/future-plans/future-plans.component').then(m => m.FuturePlansComponent), title: '未來計畫', canActivate: [authGuard] },
  { path: 'monthly-targets', loadComponent: () => import('./components/monthly-targets/monthly-targets.component').then(m => m.MonthlyTargetsComponent), title: '營收目標', canActivate: [authGuard, viewerRestrictedPagesGuard] },
  { path: 'decision-log', loadComponent: () => import('./components/decision-log/decision-log.component').then(m => m.DecisionLogComponent), title: '重大事項佈達', canActivate: [authGuard] },
  { path: 'user-management', loadComponent: () => import('./components/user-management/user-management.component').then(m => m.UserManagementComponent), title: '使用者管理', canActivate: [authGuard, viewerRestrictedPagesGuard, superAdminGuard] },
  { path: 'role-permissions', loadComponent: () => import('./components/role-permission-management/role-permission-management.component').then(m => m.RolePermissionManagementComponent), title: '角色權限控管', canActivate: [authGuard, viewerRestrictedPagesGuard, superAdminGuard] },
  { path: 'account', loadComponent: () => import('./components/account/account.component').then(m => m.AccountComponent), title: '帳號設定', canActivate: [authGuard] },

  // Default and catch-all routes
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  { path: '**', redirectTo: 'login' }
];
