import { consola } from 'consola'
import type { AiProvider } from '../ai/types'
import type { AiReviewerConfig } from '../config/config'
import type { NotificationManager } from '../notifications/types'
import type { Platform } from '../platforms/types'
import { createAiProvider } from '../ai/provider'
import { validateConfig } from '../config/config'
import { createNotificationManager } from '../notifications/index'
import { createPlatform } from '../platforms/index'
import { TempFileManager } from '../utils/file'
import { OutputFormatter } from '../utils/formatter'

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
  private fileManager: TempFileManager

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

    // 初始化文件管理器
    this.fileManager = new TempFileManager()
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

          // 判断是否只审查一个文件，如果是则直接输出结果
          if (filteredDiffs.length === 1) {
            // 使用格式化工具输出单个文件的详细结果
            const formattedResult = OutputFormatter.formatSingleFileReview(reviewResult)
            // eslint-disable-next-line no-console
            console.log(formattedResult)
          }
          else {
            // 多文件情况下只输出简单信息
            consola.debug(`已审查文件 ${diff.newPath}，发现 ${reviewResult.issues.length} 个问题`)
          }
        }
      }

      // 将审查结果保存到临时文件
      const resultsFilePath = await this.fileManager.saveReviewResults(results)
      consola.info(`所有审查结果已保存到临时文件：${resultsFilePath}`)

      // 如果有多个文件，生成总结报告
      let summary = ''
      if (results.length > 1 && results.length > 0) {
        summary = await this.aiProvider.generateSummary(results)

        if (summary) {
          // 将总结保存到临时文件
          const summaryFilePath = await this.fileManager.saveSummary(summary)
          consola.info(`审查总结已保存到临时文件：${summaryFilePath}`)
        }
      }

      // 如果是多文件，批量发送所有文件的审查结果
      if (results.length > 1) {
        consola.info('开始发送审查结果通知...')
        await this.notificationManager.sendBatchReviewNotifications(results, this.platform)

        // 发送总结通知
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

  /**
   * 审查单个文件并提交评论（用于GitHub PR文件审查）
   * @param targetFile 目标文件的路径
   */
  async reviewSingleFile(targetFile: string): Promise<ReviewResult | null> {
    consola.info(`开始审查单个文件: ${targetFile}`)

    try {
      // 获取所有代码差异
      const diffs = await this.platform.getCodeDiffs()
      consola.info(`获取到 ${diffs.length} 个文件差异`)

      if (diffs.length === 0) {
        consola.warn('没有发现代码差异，审查结束')
        return null
      }

      // 查找目标文件的差异
      const targetDiff = diffs.find(diff => diff.newPath === targetFile)
      
      if (!targetDiff) {
        consola.warn(`未找到目标文件 ${targetFile} 的差异`)
        return null
      }

      consola.info(`找到目标文件: ${targetDiff.newPath}`)

      // 调用AI进行代码审查
      const reviewResult = await this.aiProvider.reviewCode(targetDiff)
      
      if (!reviewResult) {
        consola.warn('审查结果为空')
        return null
      }

      // 将结果格式化输出
      const formattedResult = OutputFormatter.formatSingleFileReview(reviewResult)
      // eslint-disable-next-line no-console
      console.log(formattedResult)

      // 对每个问题提交评论
      for (const issue of reviewResult.issues) {
        const message = this.formatIssueComment(issue)
        await this.platform.submitReviewComment(targetFile, issue.line, message)
      }

      consola.success(`文件 ${targetFile} 审查完成，已添加 ${reviewResult.issues.length} 条评论`)
      return reviewResult
    }
    catch (error) {
      consola.error(`审查文件 ${targetFile} 时出错:`, error)
      throw error
    }
  }

  /**
   * 格式化问题评论
   */
  private formatIssueComment(issue: ReviewResult['issues'][0]): string {
    const severityEmoji = {
      error: '❌',
      warning: '⚠️',
      info: 'ℹ️',
    }[issue.severity]

    let comment = `${severityEmoji} **${issue.message}**\n\n`

    if (issue.suggestion) {
      comment += `建议: ${issue.suggestion}\n\n`
    }

    if (issue.code) {
      comment += `示例代码:\n\`\`\`\n${issue.code}\n\`\`\`\n`
    }

    return comment
  }
}
