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
      const response = await fetch(this.config.wecom.webhook, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          msgtype: 'markdown',
          markdown: {
            content: `### ${title}\n\n${content}`,
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
}
