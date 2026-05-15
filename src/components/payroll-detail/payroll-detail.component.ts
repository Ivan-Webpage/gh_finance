import { ChangeDetectionStrategy, Component, computed, inject, signal, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormBuilder, FormArray, FormGroup, ReactiveFormsModule, AbstractControl } from '@angular/forms';
// FIX: Import `ParamMap` for explicit typing.
import { ActivatedRoute, Router, ParamMap } from '@angular/router';
import { DataService } from '../../services/data.service';
import { Employee, PunchRecord } from '../../models/financial.model';
import { map, tap } from 'rxjs/operators';

@Component({
  selector: 'app-payroll-detail',
  templateUrl: './payroll-detail.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule, DecimalPipe],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class PayrollDetailComponent {
  private fb = inject(FormBuilder);
  private dataService = inject(DataService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  employee = signal<Employee | null>(null);
  year = signal<number>(0);
  month = signal<number>(0);

  payrollForm = this.fb.group({
    records: this.fb.array([]),
  });

  private initialFormValue: string = '';

  constructor() {
    this.route.paramMap.pipe(
      // FIX: Explicitly type `params` to resolve type inference issue.
      tap((params: ParamMap) => {
        const employeeId = params.get('employeeId');
        const year = Number(params.get('year'));
        const month = Number(params.get('month'));

        if (!employeeId || !year || !month) {
          alert('無效的網址參數');
          this.router.navigate(['/payroll']);
          return;
        }

        const emp = this.dataService.getEmployeeById(employeeId);
        if (!emp) {
          alert('找不到員工');
          this.router.navigate(['/payroll']);
          return;
        }

        this.employee.set(emp);
        this.year.set(year);
        this.month.set(month);
        this.buildForm(employeeId, year, month);
      })
    ).subscribe();
  }

  get records(): FormArray {
    return this.payrollForm.get('records') as FormArray;
  }

  private buildForm(employeeId: string, year: number, month: number): void {
    const recordsArray = this.records;
    recordsArray.clear();

    const existingRecords = this.dataService.getPunchRecordsForMonth(employeeId, year, month);
    const daysInMonth = new Date(year, month, 0).getDate();

    for (let day = 1; day <= daysInMonth; day++) {
      const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const record = existingRecords.find(r => r.date === date);

      const recordGroup = this.fb.group({
        date: [date],
        clockIn: [record?.clockIn || null],
        clockOut: [record?.clockOut || null],
        isDoublePay: [record?.isDoublePay || false],
      });
      
      recordsArray.push(recordGroup);
    }
    
    this.initialFormValue = JSON.stringify(this.payrollForm.value);
  }

  getWeekday(dateStr: string | null | undefined): string {
    if (!dateStr) return '';
    // Appending T00:00:00 ensures the date is parsed in the local timezone,
    // avoiding potential off-by-one day errors due to UTC conversion.
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('zh-TW', { weekday: 'short' }).replace('週', '');
  }

  calculateWorkHours(recordGroup: AbstractControl): number {
    const { clockIn, clockOut } = recordGroup.value;
    if (!clockIn || !clockOut) return 0;

    const [inHours, inMinutes, inSeconds] = clockIn.split(':').map(Number);
    const [outHours, outMinutes, outSeconds] = clockOut.split(':').map(Number);

    const start = new Date(0, 0, 0, inHours, inMinutes, inSeconds || 0);
    const end = new Date(0, 0, 0, outHours, outMinutes, outSeconds || 0);
    
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return 0;

    const diffMs = end.getTime() - start.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    
    // 無條件捨去到小數點第二位
    return Math.floor(diffHours * 100) / 100;
  }

  calculateSalary(recordGroup: AbstractControl): number {
    const hours = this.calculateWorkHours(recordGroup);
    const hourlyRate = this.employee()?.hourlyRate || 0;
    const isDoublePay = recordGroup.get('isDoublePay')?.value;
    let salary = hours * hourlyRate;
    if (isDoublePay) {
      salary *= 2;
    }
    return salary;
  }
  
  totalHours = computed(() => {
    return this.records.controls.reduce((sum, control) => {
        return sum + this.calculateWorkHours(control);
    }, 0);
  });

  totalSalary = computed(() => {
    return this.records.controls.reduce((sum, control) => {
        return sum + this.calculateSalary(control);
    }, 0);
  });
  
  onSave(): void {
    const employeeId = this.employee()?.id;
    if (!employeeId) return;

    const formValues = this.payrollForm.value.records || [];
    const recordsToSave: PunchRecord[] = formValues.map((rec: any) => ({
        employeeId,
        date: rec.date,
        clockIn: rec.clockIn || null,
        clockOut: rec.clockOut || null,
        isDoublePay: rec.isDoublePay || false,
    }));

    this.dataService.updatePunchRecords(employeeId, this.year(), this.month(), recordsToSave);
    this.initialFormValue = JSON.stringify(this.payrollForm.value);
    alert('打卡紀錄已儲存！');
    this.router.navigate(['/payroll']);
  }

  goBack(): void {
    this.router.navigate(['/payroll']);
  }
  
  onCancel(): void {
    const currentFormValue = JSON.stringify(this.payrollForm.value);
    if (this.initialFormValue === currentFormValue) {
      this.router.navigate(['/payroll']);
    } else {
      if (confirm('您有未儲存的變更，確定要離開嗎？')) {
        this.router.navigate(['/payroll']);
      }
    }
  }

  clearRecord(index: number): void {
    if (confirm('是否清除當天打卡資料？')) {
      const record = this.records.at(index);
      record.patchValue({
        clockIn: null,
        clockOut: null,
        isDoublePay: false
      });
    }
  }
}