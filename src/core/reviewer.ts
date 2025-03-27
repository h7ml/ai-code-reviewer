import { consola } from 'consola'
import type { AiProvider } from '../ai/types'
import type { AiReviewerConfig } from '../config/config'
import type { NotificationManager } from '../notifications/types'
import type { Platform } from '../platforms/types'
import { createAiProvider } from '../ai/provider'
import { validateConfig } from '../config/config'
import { createNotificationManager } from '../notifications/index'
import { createPlatform } from '../platforms/index'

export interface CodeReviewOptions {
  config: AiReviewerConfig
  projectId?: string | number
  mergeRequestId?: string | number
  owner?: string
  repo?: string
  prId?: string | number
  path?: string
  commitSha?: string
}

export interface CodeDiff {
  oldPath: string
  newPath: string
  oldContent: string
  newContent: string
  diffContent: string
  language?: string
}

export interface ReviewResult {
  file: string
  issues: Array<{
    line?: number
    severity: 'info' | 'warning' | 'error'
    message: string
    suggestion?: string
    code?: string
  }>
  summary: string
}

/**
 * 代码审查器类
 */
export class CodeReviewer {
  private config: AiReviewerConfig
  private aiProvider: AiProvider
  private platform: Platform
  private notificationManager: NotificationManager

  constructor(options: CodeReviewOptions) {
    this.config = options.config

    // 验证配置
    if (!validateConfig(this.config)) {
      throw new Error('无效配置，请检查配置和环境变量')
    }

    // 初始化AI提供者
    this.aiProvider = createAiProvider(this.config.ai)

    // 初始化平台
    this.platform = createPlatform(this.config.platform, {
      projectId: options.projectId,
      mergeRequestId: options.mergeRequestId,
      owner: options.owner,
      repo: options.repo,
      prId: options.prId,
      path: options.path,
      commitSha: options.commitSha,
    })

    // 初始化通知管理器
    this.notificationManager = createNotificationManager(this.config.notifications)
  }

  /**
   * 运行代码审查
   */
  async review(): Promise<ReviewResult[]> {
    consola.info('开始代码审查...')

    try {
      // 获取代码差异
      const diffs = await this.platform.getCodeDiffs()
      consola.info(`获取到 ${diffs.length} 个文件差异`)

      if (diffs.length === 0) {
        consola.warn('没有发现代码差异，审查结束')
        return []
      }

      // 过滤文件
      const filteredDiffs = this.filterDiffs(diffs)
      consola.info(`过滤后剩余 ${filteredDiffs.length} 个文件需要审查`)

      // 审查每个文件
      const results: ReviewResult[] = []

      for (const diff of filteredDiffs) {
        consola.info(`审查文件: ${diff.newPath}`)

        // 调用AI进行代码审查
        const reviewResult = await this.aiProvider.reviewCode(diff)

        if (reviewResult) {
          results.push(reviewResult)

          // 发送通知
          await this.notificationManager.sendReviewNotification(
            diff.newPath,
            reviewResult,
            this.platform,
          )
        }
      }

      // 生成总结报告
      if (results.length > 0) {
        const summary = await this.aiProvider.generateSummary(results)

        if (summary) {
          await this.notificationManager.sendSummaryNotification(
            summary,
            this.platform,
          )
        }
      }

      consola.success('代码审查完成')
      return results
    }
    catch (error) {
      consola.error('代码审查过程中出错:', error)
      throw error
    }
  }

  /**
   * 根据配置过滤差异文件
   */
  private filterDiffs(diffs: CodeDiff[]): CodeDiff[] {
    const { ignoreFiles, ignorePaths, includePatterns, excludePatterns } = this.config.review

    return diffs.filter((diff) => {
      const filePath = diff.newPath

      // 检查忽略的文件
      if (ignoreFiles && this.matchPatterns(filePath, ignoreFiles)) {
        consola.debug(`忽略文件: ${filePath}`)
        return false
      }

      // 检查忽略的路径
      if (ignorePaths && ignorePaths.some(path => filePath.startsWith(path))) {
        consola.debug(`忽略路径: ${filePath}`)
        return false
      }

      // 检查包含的模式
      if (includePatterns && includePatterns.length > 0) {
        if (!this.matchPatterns(filePath, includePatterns)) {
          consola.debug(`文件不匹配包含模式: ${filePath}`)
          return false
        }
      }

      // 检查排除的模式
      if (excludePatterns && this.matchPatterns(filePath, excludePatterns)) {
        consola.debug(`文件匹配排除模式: ${filePath}`)
        return false
      }

      return true
    })
  }

  /**
   * 检查文件路径是否匹配模式
   */
  private matchPatterns(filePath: string, patterns: string[]): boolean {
    return patterns.some((pattern) => {
      // 简单的通配符匹配
      if (pattern.includes('*')) {
        const regexPattern = pattern
          .replace(/\./g, '\\.')
          .replace(/\*/g, '.*')

        return new RegExp(`^${regexPattern}$`).test(filePath)
      }

      // 精确匹配
      return filePath === pattern
    })
  }
}
