import { Injectable, signal } from '@angular/core';
import { GoogleGenAI, GenerateContentResponse, Type } from '@google/genai';
import { FinancialSummary, MonthlyData } from '../models/financial.model';

export type GeminiState = 'idle' | 'loading' | 'success' | 'error';

export interface FinancialInsight {
    positive_trends: string[];
    areas_for_improvement: string[];
    strategic_recommendations: string[];
}

@Injectable({ providedIn: 'root' })
export class GeminiService {
  private ai: GoogleGenAI | null = null;

  // State for Financial Insights
  public financialInsightState = signal<GeminiState>('idle');
  public financialInsight = signal<FinancialInsight | null>(null);
  public financialInsightError = signal<string | null>(null);

  constructor() {
    // IMPORTANT: The API key is sourced from environment variables.
    // Do not expose this key in the frontend code.
    // We check if `process` is defined to avoid ReferenceError in browser environments
    // where environment variables are not shimmed.
    const apiKey = (typeof process !== 'undefined' && process.env) ? process.env.API_KEY : undefined;
    if (apiKey) {
      this.ai = new GoogleGenAI({ apiKey });
    } else {
      console.error('API_KEY environment variable not set. AI features will not be available.');
    }
  }

  async generateFinancialInsights(summary: FinancialSummary, monthlyData: MonthlyData[]): Promise<void> {
    if (!this.ai) {
      this.financialInsightError.set('Gemini AI 客戶端未初始化。請檢查 API 金鑰。');
      this.financialInsightState.set('error');
      return;
    }

    this.financialInsightState.set('loading');
    this.financialInsightError.set(null);
    this.financialInsight.set(null);

    const prompt = `
      Analyze the following financial data for a small business.
      IMPORTANT: All textual analysis and recommendations in the response must be in Traditional Chinese. The JSON keys must remain in English as specified in the schema.

      Financial Summary:
      - Total Revenue: ${Math.round(summary.totalRevenue)}
      - Total Expenses: ${Math.round(summary.totalExpenses)}
      - Net Income: ${Math.round(summary.netIncome)}

      Monthly Performance (Revenue vs Expenses):
      ${monthlyData.map(d => `- ${d.month}: Revenue ${Math.round(d.revenue)}, Expenses ${Math.round(d.expenses)}`).join('\n')}

      Based on this data, provide:
      1. Two key positive trends.
      2. Two potential areas for improvement or concern.
      3. Two actionable strategic recommendations.
    `;

    try {
      const response: GenerateContentResponse = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
            responseMimeType: 'application/json',
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    positive_trends: { type: Type.ARRAY, items: { type: Type.STRING } },
                    areas_for_improvement: { type: Type.ARRAY, items: { type: Type.STRING } },
                    strategic_recommendations: { type: Type.ARRAY, items: { type: Type.STRING } }
                }
            }
        }
      });
      const insight = JSON.parse(response.text);
      this.financialInsight.set(insight);
      this.financialInsightState.set('success');
    } catch (e) {
      console.error(e);
      this.financialInsightError.set('從 AI 模型生成財務洞察失敗。');
      this.financialInsightState.set('error');
    }
  }

}