import type { ReviewResult } from '../core/reviewer'
import type { Platform } from '../platforms/types'

/**
 * 通知配置
 */
export interface NotificationConfig {
  gitlab_comment?: boolean
  wecom?: {
    enabled: boolean
    webhook?: string
  }
}

/**
 * 通知管理器接口
 */
export interface NotificationManager {
  /**
   * 发送审查通知
   */
  sendReviewNotification: (
    filePath: string,
    result: ReviewResult,
    platform: Platform
  ) => Promise<void>

  /**
   * 发送审查总结通知
   */
  sendSummaryNotification: (
    summary: string,
    platform: Platform
  ) => Promise<void>
}
