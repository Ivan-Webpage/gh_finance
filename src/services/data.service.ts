
import { Injectable, inject, signal } from '@angular/core';
import { CigarCost, WineCost } from '../models/financial.model';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api.service';

@Injectable({ providedIn: 'root' })
export class DataService {
  private apiService = inject(ApiService);

  private mockWineCosts = signal<WineCost[]>([
    { id: 'W01', vendor: '尚德', productName: '告白', type: '白氣泡', cost: 280, sellingPrice: 1100 },
    { id: 'W02', vendor: '九樽', productName: 'Primo Amore Moscato Delle Venezie IGT 初戀', type: '甜白', cost: 450, sellingPrice: 1100 },
    { id: 'W03', vendor: '九樽', productName: 'Francois Confuron Gindre Bourgogne (2020)', type: '白酒', cost: 1150, sellingPrice: 2300 },
    { id: 'W04', vendor: '九樽', productName: 'Moet & Chandon', type: '香檳', cost: 1650, sellingPrice: 3500 },
    { id: 'W05', vendor: '九樽', productName: 'McManis Cab. Sau (2022)', type: '紅酒', cost: 550, sellingPrice: 1100 },
    { id: 'W06', vendor: '九樽', productName: 'Botter Cuvee16 Limited Edition Rosso Vino 16樂章', type: '紅酒', cost: 750, sellingPrice: 2200 },
    { id: 'W07', vendor: '九樽', productName: 'Saint-Estephe Calon Segur 卡隆賽格三軍 (2015)', type: '紅酒', cost: 1350, sellingPrice: 3000 },
    { id: 'W08', vendor: '酒鼎', productName: 'Adobe Reserva Sauvignon White (2018)', type: '白酒', cost: 550, sellingPrice: 1600 },
    { id: 'W09', vendor: '酒鼎', productName: 'De Martino Estate Cabernet Sauvignon (2022)', type: '紅酒', cost: 480, sellingPrice: 1800 },
    { id: 'W10', vendor: '酒鼎', productName: 'Adobe Reserva Sauvignon Red (2021)', type: '紅酒', cost: 550, sellingPrice: 1600 },
    { id: 'W11', vendor: '吉多利', productName: 'Santero Dile Moscato sweet天使之手', type: '白氣泡', cost: 285, sellingPrice: 1100 },
    { id: 'W12', vendor: '吉多利', productName: 'Louis Eschenauer 24K Carat Gold Muscat Sparkling', type: '白氣泡', cost: 520, sellingPrice: 1600 },
    { id: 'W13', vendor: '吉多利', productName: 'Joly de Trébuis Réserve Brut Champagne', type: '香檳', cost: 1100, sellingPrice: 2800 },
    { id: 'W14', vendor: '吉多利', productName: 'Dark Horse Cabernet Sauvignon', type: '紅酒', cost: 480, sellingPrice: 1450 },
    { id: 'W15', vendor: '吉多利', productName: 'Domaine Viticole de la Ville de Colmar Signature de Colmar Pinot Noir', type: '紅酒', cost: 630, sellingPrice: 1600 },
    { id: 'W16', vendor: '添潤', productName: 'Glendronach 格蘭多納12年', type: '單一麥芽威士忌', cost: 1150, sellingPrice: 3200 },
    { id: 'W17', vendor: '添潤', productName: 'Aberlour 亞伯樂12年', type: '單一麥芽威士忌', cost: 1100, sellingPrice: 3200 },
    { id: 'W18', vendor: '添潤', productName: 'Laphroaig 拉佛格10年', type: '單一麥芽威士忌', cost: 1050, sellingPrice: 3300 },
    { id: 'W19', vendor: '添潤', productName: 'Fettercairn 費特肯12年', type: '單一麥芽威士忌', cost: 1050, sellingPrice: 3300 },
    { id: 'W20', vendor: '添潤', productName: 'Glenfiddich 格蘭菲迪12年', type: '單一麥芽威士忌', cost: 950, sellingPrice: 3500 },
    { id: 'W21', vendor: '添潤', productName: 'Balvenie 百富12年', type: '單一麥芽威士忌', cost: 1350, sellingPrice: 3800 },
    { id: 'W22', vendor: '添潤', productName: 'Mortlach 慕赫12年', type: '單一麥芽威士忌', cost: 1350, sellingPrice: 3800 },
    { id: 'W23', vendor: '添潤', productName: 'Dalmore 大摩12年', type: '單一麥芽威士忌', cost: 1396, sellingPrice: 3900 },
    { id: 'W24', vendor: '添潤', productName: 'Ardbeg 雅柏10年', type: '單一麥芽威士忌', cost: 1350, sellingPrice: 3900 },
    { id: 'W25', vendor: '添潤', productName: 'Macallan 麥卡倫12年', type: '單一麥芽威士忌', cost: 1650, sellingPrice: 4200 },
    { id: 'W26', vendor: '添潤', productName: 'Hibiki 響', type: '調和威士忌', cost: 2300, sellingPrice: 4900 },
    { id: 'W27', vendor: '添潤', productName: 'Johnnie Walker 約翰走路 黑牌 12年', type: '調和威士忌', cost: 750, sellingPrice: 2100 },
    { id: 'W28', vendor: '添潤', productName: 'Johnnie Walker 約翰走路XR 21年', type: '調和威士忌', cost: 2390, sellingPrice: 4900 },
    { id: 'W29', vendor: '添潤', productName: 'Royal Salute 皇家禮炮', type: '調和威士忌', cost: 2500, sellingPrice: 4900 },
    { id: 'W30', vendor: '大摩', productName: '大摩15', type: '單一麥芽威士忌', cost: 2300, sellingPrice: 5200 },
    { id: 'W31', vendor: '百富', productName: '百富14', type: '單一麥芽威士忌', cost: 1850, sellingPrice: 4200 },
    { id: 'W32', vendor: '慕赫', productName: '慕赫16', type: '單一麥芽威士忌', cost: 2300, sellingPrice: 4900 },
    { id: 'W33', vendor: '百富', productName: '百齡罈30', type: '調和威士忌', cost: 7800, sellingPrice: 14000 },
  ]);

  private mockCigarCosts = signal<CigarCost[]>([
    { id: 'C01', brand: 'Allados', productName: 'Robusto', size: '5*50', quantityPerBox: 20, lishengCost: 340, baijiaCost: 370, sellingPrice: 560 },
    { id: 'C02', brand: 'Allados', productName: 'Toro', size: '6*52', quantityPerBox: 20, lishengCost: 370, baijiaCost: 390, sellingPrice: 780 },
    { id: 'C03', brand: 'Oliva', productName: 'Flor De Oliva Robusto', size: '5*50', quantityPerBox: 25, lishengCost: 255, baijiaCost: 285, sellingPrice: 520 },
    { id: 'C04', brand: 'Oliva', productName: 'Flor De Oliva Toro', size: '6*50', quantityPerBox: 25, lishengCost: 270, baijiaCost: 300, sellingPrice: 580 },
    { id: 'C05', brand: 'Oliva', productName: 'Serie O Robusto', size: '5*50', quantityPerBox: 20, lishengCost: 375, baijiaCost: 405, sellingPrice: 750 },
    { id: 'C06', brand: 'Oliva', productName: 'Serie O Corona', size: '6*46', quantityPerBox: 20, lishengCost: 335, baijiaCost: 365, sellingPrice: 700 },
    { id: 'C07', brand: 'Oliva', productName: 'Serie V Lancero', size: '7*38', quantityPerBox: 24, lishengCost: 415, baijiaCost: 430, sellingPrice: 790 },
    { id: 'C08', brand: 'Oliva', productName: 'Serie V Belicoso', size: '5*54', quantityPerBox: 24, lishengCost: 415, baijiaCost: 445, sellingPrice: 800 },
    { id: 'C09', brand: 'Oliva', productName: 'Serie V DBL.Robusto', size: '5*54', quantityPerBox: 24, lishengCost: 450, baijiaCost: 480, sellingPrice: 820 },
    { id: 'C10', brand: 'Oliva', productName: 'Serie V DBL. Toro', size: '6*60', quantityPerBox: 24, lishengCost: 520, baijiaCost: 550, sellingPrice: 1100 },
    { id: 'C11', brand: 'Oliva', productName: 'Serie V Melanio Figurado', size: '6.5*52', quantityPerBox: 10, lishengCost: 570, baijiaCost: 670, sellingPrice: 1480 },
    { id: 'C12', brand: 'Oliva', productName: 'Serie V Melanio Toro', size: '6.5*52', quantityPerBox: 10, lishengCost: 690, baijiaCost: 790, sellingPrice: 1600 },
    { id: 'C13', brand: 'Oliva', productName: 'Connecticut Res.PETIT Corona', size: '4*38', quantityPerBox: 30, lishengCost: 270, baijiaCost: 300, sellingPrice: 540 },
    { id: 'C14', brand: 'Oliva', productName: 'Master Blender 3 Robusto', size: '5*50', quantityPerBox: 20, lishengCost: 440, baijiaCost: 470, sellingPrice: 950 },
    { id: 'C15', brand: 'Oliva', productName: 'Master Blender 3 Torpedo', size: '6.5*52', quantityPerBox: 10, lishengCost: 490, baijiaCost: 520, sellingPrice: 1000 },
    { id: 'C16', brand: 'Oliva', productName: 'Oliva 135週年紀念', size: '5.5*54', quantityPerBox: 12, lishengCost: 900, baijiaCost: 1000, sellingPrice: 2000 },
    { id: 'C17', brand: 'Oliva', productName: 'Oliva 2024龍年系列', size: '5.5*60', quantityPerBox: 10, lishengCost: 900, baijiaCost: 1000, sellingPrice: 2000 },
    { id: 'C18', brand: 'Oliva', productName: 'Serie V Melanio Torpedo', size: '6.5*52', quantityPerBox: 10, lishengCost: 690, baijiaCost: 790, sellingPrice: 1600 },
  ]);

  // 雪茄成本 API
  async getCigarCosts(): Promise<CigarCost[]> {
    try {
      const response = await firstValueFrom(
        this.apiService.get('/product-cost?type=cigars')
      ) as any;
      if (response.success && Array.isArray(response.data)) {
        const mapped = response.data.map((row: any) => ({
          id: String(row.id),
          brand: row.brand ?? '',
          productName: row.productName ?? row.product_name ?? '',
          size: row.size ?? '',
          quantityPerBox: Number(row.quantityPerBox ?? row.quantity_per_box ?? 0),
          lishengCost: Number(row.lishengCost ?? row.lisheng_cost ?? 0),
          baijiaCost: Number(row.baijiaCost ?? row.baijia_cost ?? 0),
          sellingPrice: Number(row.sellingPrice ?? row.selling_price ?? 0),
          flavorNotes: row.flavorNotes ?? row.flavor_notes ?? '',
          fillerOrigin: row.fillerOrigin ?? row.filler_origin ?? [],
          binderOrigin: row.binderOrigin ?? row.binder_origin ?? [],
          wrapperOrigin: row.wrapperOrigin ?? row.wrapper_origin ?? [],
          strength: row.strength !== null && row.strength !== undefined ? Number(row.strength) : undefined,
        })) as CigarCost[];
        this.mockCigarCosts.set(mapped);
        return mapped;
      }
      return this.mockCigarCosts();
    } catch (error) {
      console.error('Failed to fetch cigar costs:', error);
      return this.mockCigarCosts();
    }
  }

  async addCigarCost(costData: Omit<CigarCost, 'id'>): Promise<void> {
    const response = await firstValueFrom(
      this.apiService.post('/product-cost', {
        recordType: 'cigars',
        product_name: costData.productName,
        brand: costData.brand,
        size: costData.size,
        quantity_per_box: costData.quantityPerBox,
        lisheng_cost: costData.lishengCost,
        baijia_cost: costData.baijiaCost,
        selling_price: costData.sellingPrice,
        flavor_notes: costData.flavorNotes || null,
        filler_origin: costData.fillerOrigin || null,
        binder_origin: costData.binderOrigin || null,
        wrapper_origin: costData.wrapperOrigin || null,
        strength: costData.strength ?? null,
      })
    ) as any;

    if (!response?.success) {
      throw new Error(response?.error || '新增雪茄資料失敗');
    }

    await this.getCigarCosts();
  }

  async updateCigarCost(updatedCost: CigarCost): Promise<void> {
    const response = await firstValueFrom(
      this.apiService.put('/product-cost', {
        recordType: 'cigars',
        id: updatedCost.id,
        product_name: updatedCost.productName,
        brand: updatedCost.brand,
        size: updatedCost.size,
        quantity_per_box: updatedCost.quantityPerBox,
        lisheng_cost: updatedCost.lishengCost,
        baijia_cost: updatedCost.baijiaCost,
        selling_price: updatedCost.sellingPrice,
        flavor_notes: updatedCost.flavorNotes || null,
        filler_origin: updatedCost.fillerOrigin || null,
        binder_origin: updatedCost.binderOrigin || null,
        wrapper_origin: updatedCost.wrapperOrigin || null,
        strength: updatedCost.strength ?? null,
      })
    ) as any;

    if (!response?.success) {
      throw new Error(response?.error || '更新雪茄資料失敗');
    }

    await this.getCigarCosts();
  }

  async deleteCigarCost(id: string): Promise<void> {
    const response = await firstValueFrom(
      this.apiService.delete(`/product-cost?type=cigars&id=${id}`)
    ) as any;

    if (!response?.success) {
      throw new Error(response?.error || '刪除雪茄資料失敗');
    }

    this.mockCigarCosts.update(costs => costs.filter(c => c.id !== id));
  }

  // 紅白酒成本 API
  async getWineCosts(): Promise<WineCost[]> {
    try {
      const response = await firstValueFrom(
        this.apiService.get('/product-cost?type=wines')
      ) as any;
      if (response.success && Array.isArray(response.data)) {
        const mapped = response.data.map((row: any) => ({
          id: String(row.id),
          vendorId: row.vendorId !== undefined && row.vendorId !== null ? Number(row.vendorId) : (row.vendor_id !== undefined && row.vendor_id !== null ? Number(row.vendor_id) : null),
          vendor: row.vendor ?? row.vendor_name ?? '',
          productName: row.productName ?? row.product_name ?? '',
          type: row.type ?? '',
          cost: Number(row.cost ?? 0),
          sellingPrice: Number(row.sellingPrice ?? row.selling_price ?? 0),
        })) as WineCost[];
        this.mockWineCosts.set(mapped);
        return mapped;
      }
      return this.mockWineCosts();
    } catch (error) {
      console.error('Failed to fetch wine costs:', error);
      return this.mockWineCosts();
    }
  }

  async addWineCost(costData: Omit<WineCost, 'id'>): Promise<void> {
    const response = await firstValueFrom(
      this.apiService.post('/product-cost', {
        recordType: 'wines',
        vendor_id: costData.vendorId,
        product_name: costData.productName,
        type: costData.type,
        cost: costData.cost,
        selling_price: costData.sellingPrice,
      })
    ) as any;

    if (!response?.success) {
      throw new Error(response?.error || '新增酒類資料失敗');
    }

    await this.getWineCosts();
  }

  async updateWineCost(updatedCost: WineCost): Promise<void> {
    const response = await firstValueFrom(
      this.apiService.put('/product-cost', {
        recordType: 'wines',
        id: updatedCost.id,
        vendor_id: updatedCost.vendorId,
        product_name: updatedCost.productName,
        type: updatedCost.type,
        cost: updatedCost.cost,
        selling_price: updatedCost.sellingPrice,
      })
    ) as any;

    if (!response?.success) {
      throw new Error(response?.error || '更新酒類資料失敗');
    }

    await this.getWineCosts();
  }

  async deleteWineCost(id: string): Promise<void> {
    const response = await firstValueFrom(
      this.apiService.delete(`/product-cost?type=wines&id=${id}`)
    ) as any;

    if (!response?.success) {
      throw new Error(response?.error || '刪除酒類資料失敗');
    }

    this.mockWineCosts.update(costs => costs.filter(c => c.id !== id));
  }
}
