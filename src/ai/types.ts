import type { CodeDiff, ReviewResult } from '../core/reviewer'

/**
 * AI提供者配置
 */
export interface AiProviderConfig {
  provider: 'openai' | 'ollama'
  model: string
  apiKey?: string
  baseUrl?: string
  temperature?: number
  maxTokens?: number
  review?: {
    prompts?: {
      system?: string
      review?: string
      summary?: string
    }
  }
}

/**
 * AI提供者接口
 */
export interface AiProvider {
  /**
   * 审查代码差异
   */
  reviewCode: (diff: CodeDiff) => Promise<ReviewResult>

  /**
   * 生成审查总结
   */
  generateSummary: (results: ReviewResult[]) => Promise<string>
}
