import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ApiService } from '../../services/api.service';

interface EmployeeInfo {
  id: number;
  employee_number: string;
  employee_name: string;
  schedule_name?: string;
  position?: string;
  id_number?: string;
  phone?: string;
  email?: string;
  registered_address?: string;
  mailing_address?: string;
  job_description?: string;
  payment_method?: string;
  bank?: string;
  branch?: string;
  account_number?: string;
  account_holder?: string;
  id_card_front?: string;
  id_card_back?: string;
  notes?: string;
  is_active: boolean;
  agent_id?: number;
  created_at: string;
  updated_at: string;
}

@Component({
  selector: 'app-company-profile',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="p-6 space-y-6">
      <!-- 頁面標題 -->
      <div class="flex justify-between items-center">
        <h2 class="text-2xl font-bold text-gray-800">公司個人資料</h2>
        <div class="flex items-center gap-3">
          <div class="text-sm text-gray-500">
            顯示 {{ filteredEmployees().length }} / {{ employees().length }} 位員工
          </div>
          <button
            type="button"
            (click)="openCreateModal()"
            class="px-4 py-2 bg-green-500 text-white text-sm rounded-lg hover:bg-green-600 transition-colors"
          >
            新增員工
          </button>
        </div>
      </div>

      <!-- 篩選器 -->
      <div class="bg-white rounded-lg shadow p-4">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">搜尋 ID / 姓名</label>
            <input
              type="text"
              [ngModel]="searchKeyword()"
              (ngModelChange)="searchKeyword.set($event)"
              placeholder="輸入 ID 或姓名"
              class="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">職稱篩選</label>
            <select
              [ngModel]="selectedPosition()"
              (ngModelChange)="selectedPosition.set($event)"
              class="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">全部職稱</option>
              <option *ngFor="let position of positionOptions(); trackBy: trackByPosition" [value]="position">
                {{ position }}
              </option>
            </select>
          </div>
          <div class="flex items-end">
            <button
              type="button"
              (click)="resetFilters()"
              class="px-4 py-2 border border-gray-300 rounded text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              清除篩選
            </button>
          </div>
        </div>
      </div>

      <!-- 載入中狀態 -->
      <div *ngIf="loading()" class="flex justify-center items-center py-12">
        <div class="text-gray-500">載入中...</div>
      </div>

      <!-- 錯誤訊息 -->
      <div *ngIf="error()" class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
        {{ error() }}
      </div>

      <!-- 員工列表表格 -->
      <div *ngIf="!loading()" class="bg-white rounded-lg shadow overflow-hidden">
        <table class="w-full">
          <thead class="bg-gray-50 border-b-2 border-gray-200">
            <tr>
              <th class="px-6 py-4 text-left text-sm font-semibold text-gray-700">ID</th>
              <th class="px-6 py-4 text-left text-sm font-semibold text-gray-700">員工姓名</th>
              <th class="px-6 py-4 text-left text-sm font-semibold text-gray-700">職稱</th>
              <th class="px-6 py-4 text-center text-sm font-semibold text-gray-700">操作</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200">
            <tr 
              *ngFor="let emp of filteredEmployees()"
              class="hover:bg-gray-50 transition-colors cursor-pointer"
              (click)="openEditModal(emp)"
            >
              <td class="px-6 py-4 text-sm text-gray-900">{{ emp.id }}</td>
              <td class="px-6 py-4">
                <div class="flex items-center">
                  <div class="text-sm font-medium text-gray-900">{{ emp.employee_name }}</div>
                </div>
              </td>
              <td class="px-6 py-4 text-sm text-gray-600">{{ emp.position || '-' }}</td>
              <td class="px-6 py-4 text-center">
                <button
                  (click)="openEditModal(emp); $event.stopPropagation()"
                  class="px-3 py-1 bg-blue-500 text-white text-sm rounded hover:bg-blue-600 transition-colors"
                >
                  編輯
                </button>
              </td>
            </tr>
            <tr *ngIf="filteredEmployees().length === 0">
              <td colspan="4" class="px-6 py-12 text-center text-gray-500">
                目前沒有員工資料
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 編輯 Modal -->
      <div
        *ngIf="editModalOpen()"
        class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
        (click)="closeEditModal()"
      >
        <div
          class="bg-white rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col"
          (click)="$event.stopPropagation()"
        >
          <!-- Modal Header -->
          <div class="bg-gradient-to-r from-blue-500 to-blue-600 px-6 py-4 flex justify-between items-center text-white">
            <h3 class="text-xl font-bold">
              {{ isCreateMode() ? '新增員工資料' : ('編輯員工資料 - ' + selectedEmployee()?.employee_name) }}
            </h3>
            <button
              (click)="closeEditModal()"
              class="text-white hover:text-gray-200 text-3xl leading-none"
            >
              ×
            </button>
          </div>

          <!-- Modal Content -->
          <div class="flex-1 overflow-y-auto p-6">
            <form [formGroup]="employeeForm" class="space-y-6">
              <!-- 基本資訊 -->
              <div class="bg-gray-50 p-4 rounded-lg">
                <h4 class="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                  <span class="bg-blue-500 text-white rounded-full w-8 h-8 flex items-center justify-center mr-2 text-sm">1</span>
                  基本資訊
                </h4>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">員工編號</label>
                    <input
                      type="text"
                      formControlName="employee_number"
                      [disabled]="!isCreateMode()"
                      class="w-full px-3 py-2 border border-gray-300 rounded"
                      [class.bg-gray-100]="!isCreateMode()"
                      [class.text-gray-600]="!isCreateMode()"
                      [class.cursor-not-allowed]="!isCreateMode()"
                      placeholder="請輸入員工編號"
                    />
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">員工姓名 <span class="text-red-500">*</span></label>
                    <input
                      type="text"
                      formControlName="employee_name"
                      [disabled]="!isCreateMode()"
                      class="w-full px-3 py-2 border border-gray-300 rounded"
                      [class.bg-gray-100]="!isCreateMode()"
                      [class.text-gray-600]="!isCreateMode()"
                      [class.cursor-not-allowed]="!isCreateMode()"
                      placeholder="請輸入員工姓名"
                    />
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">班表名稱</label>
                    <input
                      type="text"
                      formControlName="schedule_name"
                      class="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="請輸入班表名稱"
                    />
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">職稱</label>
                    <input
                      type="text"
                      formControlName="position"
                      class="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="請輸入職稱"
                    />
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">身份證字號</label>
                    <input
                      type="text"
                      formControlName="id_number"
                      class="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="請輸入身份證字號"
                    />
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">代理人</label>
                    <select
                      formControlName="agent_id"
                      class="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option [ngValue]="null">無代理人</option>
                      <option 
                        *ngFor="let emp of employees()" 
                        [ngValue]="emp.id"
                        [disabled]="selectedEmployee()?.id === emp.id"
                      >
                        {{ emp.employee_name }} (ID: {{ emp.id }})
                      </option>
                    </select>
                  </div>
                </div>
              </div>

              <!-- 聯絡方式 -->
              <div class="bg-gray-50 p-4 rounded-lg">
                <h4 class="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                  <span class="bg-blue-500 text-white rounded-full w-8 h-8 flex items-center justify-center mr-2 text-sm">2</span>
                  聯絡方式
                </h4>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">聯絡電話</label>
                    <input
                      type="tel"
                      formControlName="phone"
                      class="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="請輸入聯絡電話"
                    />
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <input
                      type="email"
                      formControlName="email"
                      class="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="請輸入 Email"
                    />
                  </div>
                  <div class="md:col-span-2">
                    <label class="block text-sm font-medium text-gray-700 mb-1">戶籍地址</label>
                    <input
                      type="text"
                      formControlName="registered_address"
                      class="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="請輸入戶籍地址"
                    />
                  </div>
                  <div class="md:col-span-2">
                    <label class="block text-sm font-medium text-gray-700 mb-1">通訊地址</label>
                    <input
                      type="text"
                      formControlName="mailing_address"
                      class="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="請輸入通訊地址（同戶籍地址可留空）"
                    />
                  </div>
                </div>
              </div>

              <!-- 銀行資訊 -->
              <div class="bg-gray-50 p-4 rounded-lg">
                <h4 class="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                  <span class="bg-blue-500 text-white rounded-full w-8 h-8 flex items-center justify-center mr-2 text-sm">3</span>
                  銀行資訊
                </h4>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">付款方式</label>
                    <select
                      formControlName="payment_method"
                      class="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="">請選擇</option>
                      <option value="現金">現金</option>
                      <option value="轉帳">轉帳</option>
                      <option value="支票">支票</option>
                    </select>
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">銀行</label>
                    <input
                      type="text"
                      formControlName="bank"
                      class="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="請輸入銀行名稱"
                    />
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">分行</label>
                    <input
                      type="text"
                      formControlName="branch"
                      class="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="請輸入分行名稱"
                    />
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">銀行帳號</label>
                    <input
                      type="text"
                      formControlName="account_number"
                      class="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="請輸入銀行帳號"
                    />
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">戶名</label>
                    <input
                      type="text"
                      formControlName="account_holder"
                      class="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="請輸入戶名"
                    />
                  </div>
                </div>
              </div>

              <!-- 身份證圖片 -->
              <div *ngIf="!isCreateMode()" class="bg-gray-50 p-4 rounded-lg">
                <h4 class="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                  <span class="bg-blue-500 text-white rounded-full w-8 h-8 flex items-center justify-center mr-2 text-sm">4</span>
                  身份證圖片
                </h4>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <!-- 正面 -->
                  <div class="space-y-3">
                    <label class="block text-sm font-medium text-gray-700">身份證正面</label>
                    <div *ngIf="selectedEmployee()?.id_card_front" class="mb-3">
                      <img
                        [src]="getImageUrl(selectedEmployee()?.id_card_front)"
                        alt="身份證正面"
                        class="w-full h-48 object-contain border-2 border-gray-200 rounded bg-gray-100"
                        (error)="onImageLoadError('front')"
                      />
                      <a
                        [href]="getImageUrl(selectedEmployee()?.id_card_front)"
                        target="_blank"
                        class="text-xs text-blue-500 hover:underline mt-1 inline-block"
                      >
                        預覽大圖
                      </a>
                    </div>
                    <input
                      type="file"
                      accept="image/jpeg,image/png"
                      #frontFileInput
                      (change)="onFrontFileSelected($event)"
                      class="hidden"
                    />
                    <button
                      type="button"
                      (click)="frontFileInput.click()"
                      class="w-full px-4 py-2 border-2 border-dashed border-blue-300 text-blue-600 rounded hover:bg-blue-50 transition-colors"
                    >
                      {{ selectedEmployee()?.id_card_front ? '重新上傳正面' : '上傳正面' }}
                    </button>
                    <p *ngIf="selectedFrontFile()" class="text-sm text-gray-600">
                      已選擇: {{ selectedFrontFile()?.name }}
                    </p>
                    <button
                      *ngIf="selectedFrontFile()"
                      type="button"
                      (click)="uploadFront()"
                      [disabled]="uploadingFront()"
                      class="w-full px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
                    >
                      {{ uploadingFront() ? '上傳中...' : '確認上傳正面' }}
                    </button>
                    <p *ngIf="uploadSuccessFront()" class="text-sm text-green-600">✓ {{ uploadSuccessFront() }}</p>
                    <p *ngIf="uploadErrorFront()" class="text-sm text-red-600">{{ uploadErrorFront() }}</p>
                  </div>

                  <!-- 反面 -->
                  <div class="space-y-3">
                    <label class="block text-sm font-medium text-gray-700">身份證反面</label>
                    <div *ngIf="selectedEmployee()?.id_card_back" class="mb-3">
                      <img
                        [src]="getImageUrl(selectedEmployee()?.id_card_back)"
                        alt="身份證反面"
                        class="w-full h-48 object-contain border-2 border-gray-200 rounded bg-gray-100"
                        (error)="onImageLoadError('back')"
                      />
                      <a
                        [href]="getImageUrl(selectedEmployee()?.id_card_back)"
                        target="_blank"
                        class="text-xs text-blue-500 hover:underline mt-1 inline-block"
                      >
                        預覽大圖
                      </a>
                    </div>
                    <input
                      type="file"
                      accept="image/jpeg,image/png"
                      #backFileInput
                      (change)="onBackFileSelected($event)"
                      class="hidden"
                    />
                    <button
                      type="button"
                      (click)="backFileInput.click()"
                      class="w-full px-4 py-2 border-2 border-dashed border-blue-300 text-blue-600 rounded hover:bg-blue-50 transition-colors"
                    >
                      {{ selectedEmployee()?.id_card_back ? '重新上傳反面' : '上傳反面' }}
                    </button>
                    <p *ngIf="selectedBackFile()" class="text-sm text-gray-600">
                      已選擇: {{ selectedBackFile()?.name }}
                    </p>
                    <button
                      *ngIf="selectedBackFile()"
                      type="button"
                      (click)="uploadBack()"
                      [disabled]="uploadingBack()"
                      class="w-full px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
                    >
                      {{ uploadingBack() ? '上傳中...' : '確認上傳反面' }}
                    </button>
                    <p *ngIf="uploadSuccessBack()" class="text-sm text-green-600">✓ {{ uploadSuccessBack() }}</p>
                    <p *ngIf="uploadErrorBack()" class="text-sm text-red-600">{{ uploadErrorBack() }}</p>
                  </div>
                </div>
              </div>

              <div *ngIf="isCreateMode()" class="bg-blue-50 border border-blue-100 p-4 rounded-lg text-sm text-blue-700">
                新增完成後，可在「編輯」模式上傳身份證圖片。
              </div>

              <!-- 其他資訊 -->
              <div class="bg-gray-50 p-4 rounded-lg">
                <h4 class="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                  <span class="bg-blue-500 text-white rounded-full w-8 h-8 flex items-center justify-center mr-2 text-sm">5</span>
                  其他資訊
                </h4>
                <div class="space-y-4">
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">職務內容</label>
                    <textarea
                      formControlName="job_description"
                      rows="3"
                      class="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="請輸入職務內容描述"
                    ></textarea>
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">備註</label>
                    <textarea
                      formControlName="notes"
                      rows="3"
                      class="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="請輸入備註"
                    ></textarea>
                  </div>
                </div>
              </div>
            </form>
          </div>

          <!-- Modal Footer -->
          <div class="bg-gray-50 border-t border-gray-200 px-6 py-4 flex justify-between items-center">
            <div *ngIf="!isCreateMode()" class="text-sm text-gray-500">
              最後更新: {{ selectedEmployee()?.updated_at | date:'yyyy-MM-dd HH:mm' }}
            </div>
            <div class="flex gap-3">
              <button
                type="button"
                (click)="closeEditModal()"
                class="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                (click)="submitEmployee()"
                [disabled]="saving() || !employeeForm.valid"
                class="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {{ saving() ? '處理中...' : (isCreateMode() ? '新增' : '儲存') }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- 儲存成功提示 -->
      <div
        *ngIf="saveSuccess()"
        class="fixed bottom-4 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-50 animate-fade-in"
      >
        ✓ 儲存成功！
      </div>
    </div>
  `,
  styles: [`
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .animate-fade-in {
      animation: fadeIn 0.3s ease-out;
    }
  `],
})
export class CompanyProfileComponent implements OnInit {
  private apiService = inject(ApiService);
  private fb = inject(FormBuilder);

  // 狀態管理
  employees = signal<EmployeeInfo[]>([]);
  loading = signal<boolean>(false);
  error = signal<string>('');

  // 篩選狀態
  searchKeyword = signal<string>('');
  selectedPosition = signal<string>('');
  positionOptions = computed(() => {
    return [...new Set(
      this.employees()
        .map(employee => (employee.position || '').trim())
        .filter(position => !!position)
    )].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
  });
  filteredEmployees = computed(() => {
    const keyword = this.searchKeyword().trim().toLowerCase();
    const selectedPosition = this.selectedPosition().trim();

    return this.employees().filter(employee => {
      const matchedKeyword = !keyword
        || String(employee.id).includes(keyword)
        || String(employee.employee_number || '').toLowerCase().includes(keyword)
        || String(employee.employee_name || '').toLowerCase().includes(keyword);

      const matchedPosition = !selectedPosition
        || (employee.position || '') === selectedPosition;

      return matchedKeyword && matchedPosition;
    });
  });
  
  // Modal 狀態
  editModalOpen = signal<boolean>(false);
  selectedEmployee = signal<EmployeeInfo | null>(null);
  isCreateMode = signal<boolean>(false);
  saving = signal<boolean>(false);
  saveSuccess = signal<boolean>(false);

  // 圖片上傳狀態
  selectedFrontFile = signal<File | null>(null);
  selectedBackFile = signal<File | null>(null);
  uploadingFront = signal<boolean>(false);
  uploadingBack = signal<boolean>(false);
  uploadErrorFront = signal<string>('');
  uploadErrorBack = signal<string>('');
  uploadSuccessFront = signal<string>('');
  uploadSuccessBack = signal<string>('');

  // 表單
  employeeForm: FormGroup = this.fb.group({
    employee_number: ['', Validators.required],
    employee_name: ['', Validators.required],
    schedule_name: [''],
    position: [''],
    id_number: [''],
    phone: [''],
    email: ['', Validators.email],
    registered_address: [''],
    mailing_address: [''],
    job_description: [''],
    payment_method: [''],
    bank: [''],
    branch: [''],
    account_number: [''],
    account_holder: [''],
    notes: [''],
    agent_id: [null],
  });

  ngOnInit() {
    this.loadEmployees();
  }

  trackByPosition(_index: number, position: string): string {
    return position;
  }

  resetFilters() {
    this.searchKeyword.set('');
    this.selectedPosition.set('');
  }

  async loadEmployees() {
    this.loading.set(true);
    this.error.set('');

    try {
      const response = await this.apiService.getEmployeeInfo();
      if (response.success && response.data) {
        this.employees.set(response.data);
      } else {
        this.error.set('載入員工資料失敗');
      }
    } catch (err: any) {
      console.error('Error loading employees:', err);
      this.error.set('無法載入員工資料，請檢查網路連線');
    } finally {
      this.loading.set(false);
    }
  }

  openEditModal(employee: EmployeeInfo) {
    this.selectedEmployee.set(employee);
    this.employeeForm.patchValue(employee);
    this.editModalOpen.set(true);
    this.isCreateMode.set(false);
    this.employeeForm.get('employee_number')?.disable();
    this.employeeForm.get('employee_name')?.disable();
    
    // 重置上傳狀態
    this.selectedFrontFile.set(null);
    this.selectedBackFile.set(null);
    this.uploadErrorFront.set('');
    this.uploadErrorBack.set('');
    this.uploadSuccessFront.set('');
    this.uploadSuccessBack.set('');
  }

  closeEditModal() {
    this.editModalOpen.set(false);
    this.selectedEmployee.set(null);
    this.isCreateMode.set(false);
    this.employeeForm.reset();
  }

  openCreateModal() {
    this.isCreateMode.set(true);
    this.selectedEmployee.set(null);
    this.employeeForm.reset({
      employee_number: '',
      employee_name: '',
      schedule_name: '',
      position: '',
      id_number: '',
      phone: '',
      email: '',
      registered_address: '',
      mailing_address: '',
      job_description: '',
      payment_method: '',
      bank: '',
      branch: '',
      account_number: '',
      account_holder: '',
      notes: '',
      agent_id: null,
    });
    this.employeeForm.get('employee_number')?.enable();
    this.employeeForm.get('employee_name')?.enable();
    this.editModalOpen.set(true);

    // 重置上傳狀態
    this.selectedFrontFile.set(null);
    this.selectedBackFile.set(null);
    this.uploadErrorFront.set('');
    this.uploadErrorBack.set('');
    this.uploadSuccessFront.set('');
    this.uploadSuccessBack.set('');
  }

  submitEmployee() {
    if (this.isCreateMode()) {
      this.createEmployee();
    } else {
      this.saveEmployee();
    }
  }

  async createEmployee() {
    if (!this.employeeForm.valid) return;

    this.saving.set(true);
    this.error.set('');

    try {
      const formData = this.employeeForm.getRawValue();
      const response = await this.apiService.createEmployeeInfo(formData);

      if (response.success) {
        this.saveSuccess.set(true);
        setTimeout(() => this.saveSuccess.set(false), 3000);
        this.closeEditModal();
        await this.loadEmployees();
      } else {
        this.error.set(response.error || '新增失敗，請重試');
      }
    } catch (err: any) {
      console.error('Error creating employee:', err);
      this.error.set(err?.error?.error || '新增失敗，請重試');
    } finally {
      this.saving.set(false);
    }
  }

  async saveEmployee() {
    if (!this.employeeForm.valid || !this.selectedEmployee()) return;

    this.saving.set(true);
    
    try {
      const formData = this.employeeForm.value;
      const employee = this.selectedEmployee()!;

      const response = await this.apiService.updateEmployeeInfo(
        employee.employee_number,
        formData
      );

      if (response.success) {
        // 更新本地員工列表
        const updatedEmployees = this.employees().map((e) =>
          e.id === employee.id ? { ...e, ...formData, updated_at: new Date().toISOString() } : e
        );
        this.employees.set(updatedEmployees);

        // 顯示成功訊息
        this.saveSuccess.set(true);
        setTimeout(() => this.saveSuccess.set(false), 3000);

        // 關閉 Modal
        this.closeEditModal();
        
        // 重新載入以獲取最新資料
        await this.loadEmployees();
      }
    } catch (err: any) {
      console.error('Error saving employee:', err);
      this.error.set('儲存失敗，請重試');
    } finally {
      this.saving.set(false);
    }
  }

  onFrontFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      this.selectedFrontFile.set(input.files[0]);
      this.uploadErrorFront.set('');
      this.uploadSuccessFront.set('');
    }
  }

  onBackFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      this.selectedBackFile.set(input.files[0]);
      this.uploadErrorBack.set('');
      this.uploadSuccessBack.set('');
    }
  }

  /**
   * 圖片加載失敗處理
   */
  onImageLoadError(side: 'front' | 'back') {
    console.error(`Failed to load ID card ${side} image`);
    // 可選：在這裡添加重試邏輯或用戶提示
  }

  async uploadFront() {
    const file = this.selectedFrontFile();
    const employee = this.selectedEmployee();

    if (!file || !employee) return;

    this.uploadingFront.set(true);
    this.uploadErrorFront.set('');

    try {
      const response = await this.apiService.uploadIdCardImage(
        file,
        employee.employee_number,
        'front'
      );

      if (response.success) {
        // 1. 先更新資料庫
        await this.apiService.updateEmployeeIdCardPath(
          Number(employee.employee_number),
          'front',
          response.filepath
        );

        // 2. 重新載入完整的員工資料（確保前端資料與後端一致）
        const updatedResponse = await this.apiService.getEmployeeInfo();
        if (updatedResponse.success && updatedResponse.data) {
          this.employees.set(updatedResponse.data);
          // 3. 更新當前選中員工
          const updatedEmployee = updatedResponse.data.find((e: any) => e.id === employee.id);
          if (updatedEmployee) {
            this.selectedEmployee.set(updatedEmployee);
          }
        }

        this.uploadSuccessFront.set('正面圖片上傳成功！');
        
        // 清除選擇
        this.selectedFrontFile.set(null);

        setTimeout(() => this.uploadSuccessFront.set(''), 3000);
      }
    } catch (err: any) {
      this.uploadErrorFront.set(err?.error?.error || '上傳失敗，請重試');
      console.error('Upload error:', err);
    } finally {
      this.uploadingFront.set(false);
    }
  }

  async uploadBack() {
    const file = this.selectedBackFile();
    const employee = this.selectedEmployee();

    if (!file || !employee) return;

    this.uploadingBack.set(true);
    this.uploadErrorBack.set('');

    try {
      const response = await this.apiService.uploadIdCardImage(
        file,
        employee.employee_number,
        'back'
      );

      if (response.success) {
        // 1. 先更新資料庫
        await this.apiService.updateEmployeeIdCardPath(
          Number(employee.employee_number),
          'back',
          response.filepath
        );

        // 2. 重新載入完整的員工資料（確保前端資料與後端一致）
        const updatedResponse = await this.apiService.getEmployeeInfo();
        if (updatedResponse.success && updatedResponse.data) {
          this.employees.set(updatedResponse.data);
          // 3. 更新當前選中員工
          const updatedEmployee = updatedResponse.data.find((e: any) => e.id === employee.id);
          if (updatedEmployee) {
            this.selectedEmployee.set(updatedEmployee);
          }
        }

        this.uploadSuccessBack.set('反面圖片上傳成功！');
        
        // 清除選擇
        this.selectedBackFile.set(null);

        setTimeout(() => this.uploadSuccessBack.set(''), 3000);
      }
    } catch (err: any) {
      this.uploadErrorBack.set(err?.error?.error || '上傳失敗，請重試');
      console.error('Upload error:', err);
    } finally {
      this.uploadingBack.set(false);
    }
  }

  /**
   * 構建完整的圖片 URL
   * 如果路徑是相對路徑（/api/payroll/...），則附加後端基礎 URL
   * 如果已是完整 URL，則直接返回
   */
  getImageUrl(imagePath: string | undefined): string | null {
    if (!imagePath) return null;
    
    // 如果已經是完整 URL，直接返回
    if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
      return imagePath;
    }
    
    // 如果是相對路徑，附加後端基礎 URL
    if (imagePath.startsWith('/')) {
      // 後端 URL 通常是 http://localhost:3000（開發環境）
      const backendBaseUrl = 'http://localhost:3000';
      return backendBaseUrl + imagePath;
    }
    
    return imagePath;
  }
}
