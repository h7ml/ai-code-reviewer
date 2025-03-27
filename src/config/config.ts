import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as process from 'node:process'
import { consola } from 'consola'
import yaml from 'yaml'

/**
 * 配置格式接口
 */
export interface AiReviewerConfig {
  ai: {
    provider: 'openai' | 'ollama'
    model: string
    apiKey?: string
    baseUrl?: string
    temperature?: number
    maxTokens?: number
  }
  platform: {
    type: 'gitlab' | 'github' | 'local'
    token?: string
    url?: string
  }
  notifications: {
    gitlab_comment?: boolean
    wecom?: {
      enabled: boolean
      webhook?: string
    }
  }
  review: {
    ignoreFiles?: string[]
    ignorePaths?: string[]
    includePatterns?: string[]
    excludePatterns?: string[]
  }
}

// 默认配置
const defaultConfig: AiReviewerConfig = {
  ai: {
    provider: 'openai',
    model: 'deepseek-r1:1.5b',
    temperature: 0.1,
    maxTokens: 4000,
  },
  platform: {
    type: 'local',
  },
  notifications: {
    gitlab_comment: true,
    wecom: {
      enabled: false,
    },
  },
  review: {
    ignoreFiles: [
      '*.lock',
      'package-lock.json',
      'yarn.lock',
      'pnpm-lock.yaml',
      '*.min.js',
      '*.min.css',
    ],
    ignorePaths: [
      'node_modules/',
      'dist/',
      'build/',
      '.git/',
    ],
  },
}

/**
 * 从环境变量加载配置
 */
function loadEnvConfig(): Partial<AiReviewerConfig> {
  const config: Partial<AiReviewerConfig> = {
    ai: {
      provider: (process.env.AI_REVIEWER_PROVIDER as 'openai' | 'ollama') || undefined,
      model: process.env.AI_REVIEWER_MODEL || 'deepseek-r1:1.5b',
      apiKey: process.env.AI_REVIEWER_OPENAI_KEY,
      baseUrl: process.env.AI_REVIEWER_BASE_URL,
    },
    platform: {
      type: (process.env.AI_REVIEWER_PLATFORM as 'gitlab' | 'github' | 'local') || undefined,
      token: process.env.AI_REVIEWER_GITLAB_TOKEN || process.env.AI_REVIEWER_GITHUB_TOKEN,
      url: process.env.AI_REVIEWER_PLATFORM_URL,
    },
    notifications: {
      wecom: {
        enabled: process.env.AI_REVIEWER_WECOM_ENABLED === 'true',
        webhook: process.env.AI_REVIEWER_WECOM_WEBHOOK,
      },
    },
  }

  // 清理未定义的值
  return JSON.parse(JSON.stringify(config))
}

/**
 * 从配置文件加载配置
 */
async function loadConfigFile(configPath?: string): Promise<Partial<AiReviewerConfig>> {
  const configPaths = [
    configPath,
    '.aireviewrc.yml',
    '.aireviewrc.yaml',
    '.aireviewrc.json',
    '.aireview.config.js',
  ].filter(Boolean) as string[]

  for (const path of configPaths) {
    const fullPath = resolve(process.cwd(), path)
    if (existsSync(fullPath)) {
      try {
        const content = readFileSync(fullPath, 'utf-8')
        if (path.endsWith('.json')) {
          return JSON.parse(content)
        }
        else if (path.endsWith('.yml') || path.endsWith('.yaml')) {
          return yaml.parse(content)
        }
        else if (path.endsWith('.js')) {
          // 使用动态导入替代require
          try {
            // 使用动态导入替代require
            const config = await import(fullPath)
            return config.default || config
          }
          catch (e) {
            consola.error(`Failed to load JS config from ${fullPath}`, e)
            return {}
          }
        }
      }
      catch (error) {
        consola.error(`Failed to load config from ${fullPath}`, error)
      }
    }
  }

  return {}
}

/**
 * 合并配置
 */
function mergeConfig(
  defaultConfig: AiReviewerConfig,
  fileConfig: Partial<AiReviewerConfig>,
  envConfig: Partial<AiReviewerConfig>,
  cliConfig: Partial<AiReviewerConfig>,
): AiReviewerConfig {
  const merged = { ...defaultConfig }

  // 配置优先级: CLI参数 > 环境变量 > 配置文件 > 默认配置
  const configs = [fileConfig, envConfig, cliConfig]

  for (const config of configs) {
    if (!config)
      continue

    // 合并AI配置
    if (config.ai) {
      merged.ai = { ...merged.ai, ...config.ai }
    }

    // 合并平台配置
    if (config.platform) {
      merged.platform = { ...merged.platform, ...config.platform }
    }

    // 合并通知配置
    if (config.notifications) {
      merged.notifications = { ...merged.notifications }

      if (config.notifications.gitlab_comment !== undefined) {
        merged.notifications.gitlab_comment = config.notifications.gitlab_comment
      }

      if (config.notifications.wecom) {
        merged.notifications.wecom = {
          ...merged.notifications.wecom,
          ...config.notifications.wecom,
        }
      }
    }

    // 合并审查配置
    if (config.review) {
      merged.review = { ...merged.review }

      if (config.review.ignoreFiles) {
        merged.review.ignoreFiles = [
          ...(merged.review.ignoreFiles || []),
          ...config.review.ignoreFiles,
        ]
      }

      if (config.review.ignorePaths) {
        merged.review.ignorePaths = [
          ...(merged.review.ignorePaths || []),
          ...config.review.ignorePaths,
        ]
      }

      if (config.review.includePatterns) {
        merged.review.includePatterns = config.review.includePatterns
      }

      if (config.review.excludePatterns) {
        merged.review.excludePatterns = config.review.excludePatterns
      }
    }
  }

  return merged
}

/**
 * 加载和合并所有配置
 */
export async function loadConfig(
  configPath?: string,
  cliConfig: Partial<AiReviewerConfig> = {},
): Promise<AiReviewerConfig> {
  // 加载各种配置源
  const fileConfig = await loadConfigFile(configPath)
  const envConfig = loadEnvConfig()

  // 合并所有配置
  return mergeConfig(defaultConfig, fileConfig, envConfig, cliConfig)
}

/**
 * 验证配置是否有效
 */
export function validateConfig(config: AiReviewerConfig): boolean {
  // 验证AI配置
  if (config.ai.provider === 'openai' && !config.ai.apiKey) {
    consola.error('OpenAI API 密钥未配置，请设置 AI_REVIEWER_OPENAI_KEY 环境变量或在配置文件中指定')
    return false
  }

  // 验证平台配置
  if (config.platform.type !== 'local' && !config.platform.token) {
    consola.error(`${config.platform.type.toUpperCase()} 令牌未配置，请设置相应的环境变量或在配置文件中指定`)
    return false
  }

  // 验证通知配置
  if (config.notifications.wecom?.enabled && !config.notifications.wecom.webhook) {
    consola.warn('企业微信通知已启用，但未配置webhook URL')
  }

  return true
}
