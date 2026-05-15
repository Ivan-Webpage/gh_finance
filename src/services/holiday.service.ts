import { Injectable } from '@angular/core';
import { Holiday } from '../models/financial.model';

@Injectable({ providedIn: 'root' })
export class HolidayService {
  private holidays2024: Holiday[] = [
    { date: '2024-01-01', name: '元旦' },
    { date: '2024-02-08', name: '農曆春節' },
    { date: '2024-02-09', name: '農曆春節' },
    { date: '2024-02-10', name: '農曆春節' },
    { date: '2024-02-11', name: '農曆春節' },
    { date: '2024-02-12', name: '農曆春節' },
    { date: '2024-02-13', name: '農曆春節' },
    { date: '2024-02-14', name: '農曆春節' },
    { date: '2024-02-28', name: '和平紀念日' },
    { date: '2024-04-04', name: '兒童節' },
    { date: '2024-04-05', name: '清明節' },
    { date: '2024-06-10', name: '端午節' },
    { date: '2024-09-17', name: '中秋節' },
    { date: '2024-10-10', name: '國慶日' },
  ];

  getHolidays(year: number): Holiday[] {
    if (year === 2024) {
      return this.holidays2024;
    }
    // In a real app, you might fetch this from an API for other years.
    return [];
  }
}