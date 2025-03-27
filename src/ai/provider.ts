import { consola } from 'consola'
import type { AiProvider, AiProviderConfig } from './types'
import { OllamaProvider } from './ollama'
import { OpenAIProvider } from './openai'

/**
 * 创建AI提供者实例
 */
export function createAiProvider(config: AiProviderConfig): AiProvider {
  consola.debug(`创建AI提供者: ${config.provider}, 模型: ${config.model}`)

  switch (config.provider) {
    case 'openai':
      return new OpenAIProvider(config)
    case 'ollama':
      return new OllamaProvider(config)
    default:
      throw new Error(`不支持的AI提供者: ${config.provider}`)
  }
}
