import { Injectable, signal } from '@angular/core';
import { GoogleGenAI, GenerateContentResponse, Type } from '@google/genai';
import { FinancialSummary, MonthlyData, POSSale } from '../models/financial.model';

export type GeminiState = 'idle' | 'loading' | 'success' | 'error';

export interface FinancialInsight {
    positive_trends: string[];
    areas_for_improvement: string[];
    strategic_recommendations: string[];
}

export interface BasketAnalysis {
    frequently_bought_together: {
        items: string[];
        suggestion: string;
    }[];
    customer_behavior_insights: string[];
}


@Injectable({ providedIn: 'root' })
export class GeminiService {
  private ai: GoogleGenAI | null = null;

  // State for Financial Insights
  public financialInsightState = signal<GeminiState>('idle');
  public financialInsight = signal<FinancialInsight | null>(null);
  public financialInsightError = signal<string | null>(null);
  
  // State for Basket Analysis
  public basketAnalysisState = signal<GeminiState>('idle');
  public basketAnalysis = signal<BasketAnalysis | null>(null);
  public basketAnalysisError = signal<string | null>(null);

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

  async analyzeShoppingBaskets(sales: POSSale[]): Promise<void> {
     if (!this.ai) {
      this.basketAnalysisError.set('Gemini AI 客戶端未初始化。請檢查 API 金鑰。');
      this.basketAnalysisState.set('error');
      return;
    }
    this.basketAnalysisState.set('loading');
    this.basketAnalysisError.set(null);
    this.basketAnalysis.set(null);

    const transactions = sales.map(sale => sale.items.map(item => item.name));
    const prompt = `
      Perform a market basket analysis on the following list of customer transactions. Each inner list represents one transaction.
      Transactions: ${JSON.stringify(transactions)}

      IMPORTANT: All textual analysis, suggestions, and insights in the response must be in Traditional Chinese. The JSON keys must remain in English as specified in the schema.

      Identify up to 3 sets of items that are frequently bought together. For each set, provide a marketing or upselling suggestion.
      Also, provide 2 general insights into customer purchasing behavior based on this data.
    `;

    try {
        const response = await this.ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        frequently_bought_together: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    items: { type: Type.ARRAY, items: { type: Type.STRING }},
                                    suggestion: { type: Type.STRING }
                                }
                            }
                        },
                        customer_behavior_insights: {
                            type: Type.ARRAY,
                            items: { type: Type.STRING }
                        }
                    }
                }
            }
        });
        const analysis = JSON.parse(response.text);
        this.basketAnalysis.set(analysis);
        this.basketAnalysisState.set('success');
    } catch (e) {
        console.error(e);
        this.basketAnalysisError.set('從 AI 模型生成購物籃分析失敗。');
        this.basketAnalysisState.set('error');
    }
  }
}