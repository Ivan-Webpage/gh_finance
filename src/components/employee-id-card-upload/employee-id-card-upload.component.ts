import {
  Component,
  computed,
  inject,
  signal,
  OnInit,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ApiService } from '../../services/api.service';

interface EmployeeInfo {
  id: number;
  employee_number: number;
  employee_name: string;
  position: string;
  id_number: string;
  phone: string;
  email: string;
  bank: string;
  branch: string;
  account_number: string;
  id_card_front?: string;
  id_card_back?: string;
  is_active: boolean;
  created_at: string;
}

@Component({
  selector: 'app-employee-id-card-upload',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-4">
      <!-- 員工列表 -->
      <div class="rounded-lg border border-gray-200 overflow-hidden">
        <table class="w-full text-sm">
          <thead class="bg-gray-50 border-b border-gray-200">
            <tr>
              <th class="px-4 py-3 text-left font-medium">姓名</th>
              <th class="px-4 py-3 text-left font-medium">職稱</th>
              <th class="px-4 py-3 text-left font-medium">身份證</th>
              <th class="px-4 py-3 text-center font-medium">正面圖片</th>
              <th class="px-4 py-3 text-center font-medium">反面圖片</th>
              <th class="px-4 py-3 text-center font-medium">操作</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200">
            <tr *ngFor="let emp of employees()" [class.opacity-50]="!emp.is_active">
              <td class="px-4 py-3">{{ emp.employee_name }}</td>
              <td class="px-4 py-3">{{ emp.position || '-' }}</td>
              <td class="px-4 py-3 text-xs font-mono">{{ emp.id_number || '-' }}</td>
              <td class="px-4 py-3 text-center">
                <div *ngIf="emp.id_card_front" class="text-green-600 text-sm">
                  ✓ 已上傳
                  <br/>
                  <a [href]="emp.id_card_front" target="_blank" class="text-blue-500 hover:underline text-xs">預覽</a>
                </div>
                <div *ngIf="!emp.id_card_front" class="text-gray-400 text-sm">未上傳</div>
              </td>
              <td class="px-4 py-3 text-center">
                <div *ngIf="emp.id_card_back" class="text-green-600 text-sm">
                  ✓ 已上傳
                  <br/>
                  <a [href]="emp.id_card_back" target="_blank" class="text-blue-500 hover:underline text-xs">預覽</a>
                </div>
                <div *ngIf="!emp.id_card_back" class="text-gray-400 text-sm">未上傳</div>
              </td>
              <td class="px-4 py-3 text-center">
                <button
                  (click)="openUploadModal(emp)"
                  class="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600"
                >
                  上傳
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 上傳 Modal -->
      <div
        *ngIf="uploadModalOpen()"
        class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      >
        <div class="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
          <!-- Header -->
          <div class="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
            <h3 class="text-lg font-semibold">上傳 {{ selectedEmployee()?.employee_name }} 的身份證</h3>
            <button
              (click)="closeUploadModal()"
              class="text-gray-400 hover:text-gray-600 text-2xl"
            >
              ×
            </button>
          </div>

          <!-- Content -->
          <div class="p-6 space-y-6">
            <!-- 正面圖片 -->
            <div class="border-2 border-dashed border-gray-300 rounded-lg p-6">
              <h4 class="font-semibold mb-4">身份證正面</h4>
              <div *ngIf="selectedEmployee()?.id_card_front" class="mb-4">
                <p class="text-sm text-green-600 mb-2">✓ 已上傳</p>
                <img
                  [src]="selectedEmployee()?.id_card_front"
                  alt="身份證正面"
                  class="max-w-full h-auto rounded border border-gray-200"
                />
              </div>
              <div class="space-y-3">
                <label class="block">
                  <input
                    type="file"
                    accept="image/jpeg,image/png"
                    #frontFileInput
                    (change)="onFrontFileSelected($event)"
                    class="hidden"
                  />
                  <div
                    (click)="frontFileInput.click()"
                    class="border-2 border-dashed border-blue-300 rounded-lg p-4 text-center cursor-pointer hover:bg-blue-50"
                  >
                    <p class="text-blue-600">點擊上傳或拖放圖片</p>
                    <p class="text-xs text-gray-500">支援 JPG, PNG (最大 5MB)</p>
                  </div>
                </label>
                <button
                  *ngIf="selectedFrontFile()"
                  (click)="uploadFront()"
                  [disabled]="uploadingFront()"
                  class="w-full px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
                >
                  {{ uploadingFront() ? '上傳中...' : '確認上傳正面' }}
                </button>
                <p *ngIf="selectedFrontFile()" class="text-sm text-gray-600">
                  已選擇: {{ selectedFrontFile()?.name }}
                </p>
                <p *ngIf="uploadErrorFront()" class="text-sm text-red-600">
                  {{ uploadErrorFront() }}
                </p>
                <p *ngIf="uploadSuccessFront()" class="text-sm text-green-600">
                  ✓ {{ uploadSuccessFront() }}
                </p>
              </div>
            </div>

            <!-- 反面圖片 -->
            <div class="border-2 border-dashed border-gray-300 rounded-lg p-6">
              <h4 class="font-semibold mb-4">身份證反面</h4>
              <div *ngIf="selectedEmployee()?.id_card_back" class="mb-4">
                <p class="text-sm text-green-600 mb-2">✓ 已上傳</p>
                <img
                  [src]="selectedEmployee()?.id_card_back"
                  alt="身份證反面"
                  class="max-w-full h-auto rounded border border-gray-200"
                />
              </div>
              <div class="space-y-3">
                <label class="block">
                  <input
                    type="file"
                    accept="image/jpeg,image/png"
                    #backFileInput
                    (change)="onBackFileSelected($event)"
                    class="hidden"
                  />
                  <div
                    (click)="backFileInput.click()"
                    class="border-2 border-dashed border-blue-300 rounded-lg p-4 text-center cursor-pointer hover:bg-blue-50"
                  >
                    <p class="text-blue-600">點擊上傳或拖放圖片</p>
                    <p class="text-xs text-gray-500">支援 JPG, PNG (最大 5MB)</p>
                  </div>
                </label>
                <button
                  *ngIf="selectedBackFile()"
                  (click)="uploadBack()"
                  [disabled]="uploadingBack()"
                  class="w-full px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
                >
                  {{ uploadingBack() ? '上傳中...' : '確認上傳反面' }}
                </button>
                <p *ngIf="selectedBackFile()" class="text-sm text-gray-600">
                  已選擇: {{ selectedBackFile()?.name }}
                </p>
                <p *ngIf="uploadErrorBack()" class="text-sm text-red-600">
                  {{ uploadErrorBack() }}
                </p>
                <p *ngIf="uploadSuccessBack()" class="text-sm text-green-600">
                  ✓ {{ uploadSuccessBack() }}
                </p>
              </div>
            </div>
          </div>

          <!-- Footer -->
          <div class="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4 flex justify-end gap-3">
            <button
              (click)="closeUploadModal()"
              class="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50"
            >
              關閉
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [],
})
export class EmployeeIdCardUploadComponent implements OnInit {
  private apiService = inject(ApiService);

  // 狀態管理
  employees = signal<EmployeeInfo[]>([]);
  loading = signal<boolean>(false);
  error = signal<string>('');

  // 上傳 Modal 狀態
  uploadModalOpen = signal<boolean>(false);
  selectedEmployee = signal<EmployeeInfo | null>(null);

  // 正面圖片上傳狀態
  selectedFrontFile = signal<File | null>(null);
  uploadingFront = signal<boolean>(false);
  uploadErrorFront = signal<string>('');
  uploadSuccessFront = signal<string>('');

  // 反面圖片上傳狀態
  selectedBackFile = signal<File | null>(null);
  uploadingBack = signal<boolean>(false);
  uploadErrorBack = signal<string>('');
  uploadSuccessBack = signal<string>('');

  ngOnInit() {
    this.loadEmployees();
  }

  /**
   * 加載所有員工資料
   */
  async loadEmployees() {
    this.loading.set(true);
    this.error.set('');

    try {
      const response = await this.apiService.getEmployeeInfo();
      if (response.success && response.data) {
        this.employees.set(response.data);
      } else {
        this.error.set('加載員工資料失敗');
      }
    } catch (err) {
      console.error('Error loading employees:', err);
      this.error.set('無法加載員工資料');
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * 開啟上傳 Modal
   */
  openUploadModal(employee: EmployeeInfo) {
    this.selectedEmployee.set(employee);
    this.selectedFrontFile.set(null);
    this.selectedBackFile.set(null);
    this.uploadErrorFront.set('');
    this.uploadErrorBack.set('');
    this.uploadSuccessFront.set('');
    this.uploadSuccessBack.set('');
    this.uploadModalOpen.set(true);
  }

  /**
   * 關閉上傳 Modal
   */
  closeUploadModal() {
    this.uploadModalOpen.set(false);
    this.selectedEmployee.set(null);
  }

  /**
   * 正面圖片選擇
   */
  onFrontFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      this.selectedFrontFile.set(input.files[0]);
      this.uploadErrorFront.set('');
    }
  }

  /**
   * 反面圖片選擇
   */
  onBackFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      this.selectedBackFile.set(input.files[0]);
      this.uploadErrorBack.set('');
    }
  }

  /**
   * 上傳正面圖片
   */
  async uploadFront() {
    const file = this.selectedFrontFile();
    const employee = this.selectedEmployee();

    if (!file || !employee) return;

    this.uploadingFront.set(true);
    this.uploadErrorFront.set('');

    try {
      const response = await this.apiService.uploadIdCardImage(file, employee.employee_number, 'front');

      if (response.success) {
        this.uploadSuccessFront.set('正面圖片上傳成功！');

        // 更新資料庫中的路徑
        await this.apiService.updateEmployeeIdCardPath(employee.employee_number, 'front', response.filepath);

        // 更新本地員工資料
        const updatedEmployees = this.employees().map((e) =>
          e.id === employee.id ? { ...e, id_card_front: response.filepath } : e
        );
        this.employees.set(updatedEmployees);

        // 清除已選擇的文件
        this.selectedFrontFile.set(null);

        // 3秒後清除成功訊息
        setTimeout(() => this.uploadSuccessFront.set(''), 3000);
      }
    } catch (err: any) {
      this.uploadErrorFront.set(err?.error?.error || '上傳失敗，請重試');
    } finally {
      this.uploadingFront.set(false);
    }
  }

  /**
   * 上傳反面圖片
   */
  async uploadBack() {
    const file = this.selectedBackFile();
    const employee = this.selectedEmployee();

    if (!file || !employee) return;

    this.uploadingBack.set(true);
    this.uploadErrorBack.set('');

    try {
      const response = await this.apiService.uploadIdCardImage(file, employee.employee_number, 'back');

      if (response.success) {
        this.uploadSuccessBack.set('反面圖片上傳成功！');

        // 更新資料庫中的路徑
        await this.apiService.updateEmployeeIdCardPath(employee.employee_number, 'back', response.filepath);

        // 更新本地員工資料
        const updatedEmployees = this.employees().map((e) =>
          e.id === employee.id ? { ...e, id_card_back: response.filepath } : e
        );
        this.employees.set(updatedEmployees);

        // 清除已選擇的文件
        this.selectedBackFile.set(null);

        // 3秒後清除成功訊息
        setTimeout(() => this.uploadSuccessBack.set(''), 3000);
      }
    } catch (err: any) {
      this.uploadErrorBack.set(err?.error?.error || '上傳失敗，請重試');
    } finally {
      this.uploadingBack.set(false);
    }
  }
}
