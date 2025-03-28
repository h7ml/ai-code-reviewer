import { consola } from 'consola'
import fetch from 'cross-fetch'
import type { ReviewResult } from '../core/reviewer'
import type { Platform } from '../platforms/types'
import type { NotificationConfig, NotificationManager } from './types'

/**
 * 默认通知管理器实现
 */
export class DefaultNotificationManager implements NotificationManager {
  private config: NotificationConfig

  constructor(config: NotificationConfig) {
    this.config = config
  }

  /**
   * 发送审查通知
   */
  async sendReviewNotification(
    filePath: string,
    result: ReviewResult,
    platform: Platform,
  ): Promise<void> {
    try {
      // 通过平台评论通知
      if (this.config.gitlab_comment) {
        for (const issue of result.issues) {
          const message = this.formatIssueComment(issue)
          await platform.submitReviewComment(filePath, issue.line, message)
        }
      }

      // 企业微信通知
      if (this.config.wecom?.enabled && this.config.wecom.webhook) {
        await this.sendWecomNotification(
          `🔍 文件 ${filePath} 代码审查结果`,
          `发现 ${result.issues.length} 个问题\n\n${result.summary}`,
        )
      }
    }
    catch (error) {
      consola.error('发送审查通知时出错:', error)
    }
  }

  /**
   * 发送审查总结通知
   */
  async sendSummaryNotification(
    summary: string,
    platform: Platform,
  ): Promise<void> {
    try {
      // 通过平台评论通知
      await platform.submitReviewSummary(summary)

      // 企业微信通知
      if (this.config.wecom?.enabled && this.config.wecom.webhook) {
        await this.sendWecomNotification(
          '📊 代码审查总结',
          summary,
        )
      }
    }
    catch (error) {
      consola.error('发送审查总结通知时出错:', error)
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

  /**
   * 发送企业微信通知
   */
  private async sendWecomNotification(title: string, content: string): Promise<void> {
    if (!this.config.wecom?.webhook) {
      return
    }

    try {
      // 注意：企业微信Markdown有长度限制，需要适当缩减内容
      // 最大支持4096个字节，我们这里只进行基本内容裁剪，不做复杂处理
      const maxLength = 4000
      const truncatedContent = content.length > maxLength
        ? `${content.substring(0, maxLength)}...(内容过长已截断)`
        : content

      const response = await fetch(this.config.wecom.webhook, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          msgtype: 'markdown',
          markdown: {
            content: `### ${title}\n\n${truncatedContent}`,
          },
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`企业微信API请求失败: ${response.status} ${errorText}`)
      }

      consola.debug('已发送企业微信通知')
    }
    catch (error) {
      consola.error('发送企业微信通知时出错:', error)
    }
  }

  /**
   * 批量发送审查通知
   */
  async sendBatchReviewNotifications(
    results: ReviewResult[],
    platform: Platform,
  ): Promise<void> {
    try {
      // 检查平台是否支持批量提交
      if (platform.submitBatchReviewComments) {
        // 使用平台的批量提交功能
        await platform.submitBatchReviewComments(results)
      }
      else {
        // 不支持批量提交时，逐个提交
        for (const result of results) {
          for (const issue of result.issues) {
            const message = this.formatIssueComment(issue)
            await platform.submitReviewComment(result.file, issue.line, message)
          }
        }
      }

      // 企业微信通知
      if (this.config.wecom?.enabled && this.config.wecom.webhook) {
        // 计算问题统计
        const filesCount = results.length
        const allIssues = results.flatMap(r => r.issues)
        const issuesCount = allIssues.length
        const errorCount = allIssues.filter(i => i.severity === 'error').length
        const warningCount = allIssues.filter(i => i.severity === 'warning').length
        const infoCount = allIssues.filter(i => i.severity === 'info').length

        // 使用更简洁的格式生成企业微信通知内容
        let summaryText = `审查了 **${filesCount}** 个文件，发现 **${issuesCount}** 个问题\n\n`
        summaryText += `- 🔴 错误: ${errorCount}个\n- 🟡 警告: ${warningCount}个\n- 🔵 提示: ${infoCount}个\n\n`

        // 添加每个文件的简短摘要，按问题数量排序
        summaryText += results
          .sort((a, b) => b.issues.length - a.issues.length)
          .map((result) => {
            const fileIssues = result.issues
            const fileErrors = fileIssues.filter(i => i.severity === 'error').length
            const fileWarnings = fileIssues.filter(i => i.severity === 'warning').length
            const fileInfos = fileIssues.filter(i => i.severity === 'info').length

            let severity = '🟢'
            if (fileErrors > 0)
              severity = '🔴'
            else if (fileWarnings > 0)
              severity = '🟡'
            else if (fileInfos > 0)
              severity = '🔵'

            return `${severity} **${result.file}**: ${fileIssues.length}个问题`
          })
          .join('\n')

        await this.sendWecomNotification(
          `🔍 代码审查结果汇总`,
          summaryText,
        )
      }
    }
    catch (error) {
      consola.error('发送批量审查通知时出错:', error)
    }
  }
}
