import type { CodeDiff, ReviewResult } from '../core/reviewer'

/**
 * 平台配置
 */
export interface PlatformConfig {
  type: 'gitlab' | 'github' | 'local'
  token?: string
  url?: string
}

/**
 * 平台选项
 */
export interface PlatformOptions {
  projectId?: string | number
  mergeRequestId?: string | number
  owner?: string
  repo?: string
  prId?: string | number
  path?: string
  commitSha?: string
}

/**
 * 平台接口
 */
export interface Platform {
  /**
   * 获取代码差异
   */
  getCodeDiffs: () => Promise<CodeDiff[]>

  /**
   * 提交审查评论
   */
  submitReviewComment: (filePath: string, line: number | undefined, comment: string) => Promise<void>

  /**
   * 提交审查总结
   */
  submitReviewSummary: (summary: string) => Promise<void>

  /**
   * 批量提交审查评论
   * @param results 所有文件的审查结果
   */
  submitBatchReviewComments?: (results: ReviewResult[]) => Promise<void>
}
