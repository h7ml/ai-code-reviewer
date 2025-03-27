import type { NotificationConfig, NotificationManager } from './types'
import { consola } from 'consola'
import { DefaultNotificationManager } from './default'

/**
 * 创建通知管理器实例
 */
export function createNotificationManager(config: NotificationConfig): NotificationManager {
  consola.debug('创建通知管理器')

  return new DefaultNotificationManager(config)
}
