import { Routes } from '@angular/router';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { FinancialStatementsComponent } from './components/financial-statements/financial-statements.component';
import { CustomerAnalysisComponent } from './components/customer-analysis/customer-analysis.component';
import { ProductAnalysisComponent } from './components/product-analysis/product-analysis.component';
import { LedgerComponent } from './components/ledger/ledger.component';
import { AccountsPayableComponent } from './components/accounts-payable/accounts-payable.component';
import { AutoDebitsComponent } from './components/auto-debits/auto-debits.component';
import { EventsComponent } from './components/events/events.component';
import { EventFormComponent } from './components/event-form/event-form.component';
import { RemindersComponent } from './components/reminders/reminders.component';
import { ReminderFormComponent } from './components/reminder-form/reminder-form.component';
import { DailyRevenueComponent } from './components/daily-revenue/daily-revenue.component';
import { DailyRevenueDetailComponent } from './components/daily-revenue-detail/daily-revenue-detail.component';
import { PayrollComponent } from './components/payroll/payroll.component';
import { PayrollDetailComponent } from './components/payroll-detail/payroll-detail.component';
import { ShiftScheduleComponent } from './components/shift-schedule/shift-schedule.component';
import { CompanyProfileComponent } from './components/company-profile/company-profile.component';
import { ProductCostComponent } from './components/product-cost/product-cost.component';
import { VendorsComponent } from './components/vendors/vendors.component';
import { PurchaseOrdersComponent } from './components/purchase-orders/purchase-orders.component';
import { ShareholderRebatesComponent } from './components/shareholder-rebates/shareholder-rebates.component';
import { ShareholdingRatioComponent } from './components/shareholding-ratio/shareholding-ratio.component';
import { ShareholderRecordsComponent } from './components/shareholder-records/shareholder-records.component';
import { DecisionLogComponent } from './components/decision-log/decision-log.component';
import { FuturePlansComponent } from './components/future-plans/future-plans.component';
import { UserManagementComponent } from './components/user-management/user-management.component';
import { GoalSettingComponent } from './components/goal-setting/goal-setting.component';
import { MonthlyTargetsComponent } from './components/monthly-targets/monthly-targets.component';
import { LoginComponent } from './components/login/login.component';
import { AccountComponent } from './components/account/account.component';
import { RolePermissionManagementComponent } from './components/role-permission-management/role-permission-management.component';
import { authGuard } from './guards/auth.guard';
import { superAdminGuard } from './guards/super-admin.guard';
import { viewerCompanyProfileGuard } from './guards/viewer-company-profile.guard';
import { viewerRestrictedPagesGuard } from './guards/viewer-restricted-pages.guard';

export const APP_ROUTES: Routes = [
  // Public routes
  { path: 'login', component: LoginComponent, title: '登入' },

  // Protected routes - require authentication
  { path: 'dashboard', component: DashboardComponent, title: '儀表板', canActivate: [authGuard] },
  { path: 'financial-statements', component: FinancialStatementsComponent, title: '財務報表', canActivate: [authGuard] },
  { path: 'customer-analysis', component: CustomerAnalysisComponent, title: '顧客管理', canActivate: [authGuard, viewerRestrictedPagesGuard] },
  { path: 'product-analysis', component: ProductAnalysisComponent, title: '商品分析', canActivate: [authGuard] },
  { path: 'product-cost', component: ProductCostComponent, title: '商品成本', canActivate: [authGuard, viewerRestrictedPagesGuard] },
  { path: 'ledger', component: LedgerComponent, title: '流水帳', canActivate: [authGuard] },
  { path: 'accounts-payable', component: AccountsPayableComponent, title: '應付帳款', canActivate: [authGuard, viewerRestrictedPagesGuard] },
  { path: 'auto-debits', component: AutoDebitsComponent, title: '固定自動扣繳', canActivate: [authGuard] },
  { path: 'vendors', component: VendorsComponent, title: '廠商管理', canActivate: [authGuard, viewerRestrictedPagesGuard] },
  { path: 'purchase-orders', component: PurchaseOrdersComponent, title: '進貨單管理', canActivate: [authGuard, viewerRestrictedPagesGuard] },
  { path: 'events', component: EventsComponent, title: '活動管理', canActivate: [authGuard] },
  { path: 'reminders', component: RemindersComponent, title: '事項提醒', canActivate: [authGuard] },
  { path: 'reminders/new', component: ReminderFormComponent, title: '新增事項提醒', canActivate: [authGuard] },
  { path: 'events/new', component: EventFormComponent, title: '新增活動', canActivate: [authGuard] },
  { path: 'events/edit/:id', component: EventFormComponent, title: '編輯活動', canActivate: [authGuard] },
  { path: 'daily-revenue', component: DailyRevenueComponent, title: '當日營收', canActivate: [authGuard] },
  { path: 'daily-revenue/:date', component: DailyRevenueDetailComponent, title: '當日營收明細', canActivate: [authGuard] },
  { path: 'payroll', component: PayrollComponent, title: '薪資管理', canActivate: [authGuard] },
  { path: 'payroll/:employeeId/:year/:month', component: PayrollDetailComponent, title: '薪資明細', canActivate: [authGuard] },
  { path: 'shift-schedule', component: ShiftScheduleComponent, title: '排班表', canActivate: [authGuard] },
  { path: 'company-profile', component: CompanyProfileComponent, title: '公司個人資料', canActivate: [authGuard, viewerCompanyProfileGuard] },
  { path: 'shareholder-rebates', component: ShareholderRebatesComponent, title: '股東回饋金', canActivate: [authGuard] },
  { path: 'shareholding-ratio', component: ShareholdingRatioComponent, title: '股權比例', canActivate: [authGuard] },
  { path: 'shareholder-records', component: ShareholderRecordsComponent, title: '個人每周進度紀錄', canActivate: [authGuard] },
  { path: 'goal-setting', component: GoalSettingComponent, title: '團隊目標設定', canActivate: [authGuard, viewerRestrictedPagesGuard] },
  { path: 'future-plans', component: FuturePlansComponent, title: '未來計畫', canActivate: [authGuard, viewerRestrictedPagesGuard] },
  { path: 'monthly-targets', component: MonthlyTargetsComponent, title: '營收目標', canActivate: [authGuard, viewerRestrictedPagesGuard] },
  { path: 'decision-log', component: DecisionLogComponent, title: '重大事項佈達', canActivate: [authGuard] },
  { path: 'user-management', component: UserManagementComponent, title: '使用者管理', canActivate: [authGuard, viewerRestrictedPagesGuard, superAdminGuard] },
  { path: 'role-permissions', component: RolePermissionManagementComponent, title: '角色權限控管', canActivate: [authGuard, viewerRestrictedPagesGuard, superAdminGuard] },
  { path: 'account', component: AccountComponent, title: '帳號設定', canActivate: [authGuard] },

  // Default and catch-all routes
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  { path: '**', redirectTo: 'login' }
];