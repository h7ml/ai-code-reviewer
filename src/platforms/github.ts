import { consola } from 'consola'
import fetch from 'cross-fetch'
import type { CodeDiff, ReviewResult } from '../core/reviewer'
import { detectLanguage } from '../utils/language'
import type { Platform, PlatformConfig, PlatformOptions } from './types'

/**
 * GitHub平台实现
 */
export class GitHubPlatform implements Platform {
  private token: string
  private baseUrl: string
  private owner: string
  private repo: string
  private prId: string | number

  constructor(config: PlatformConfig, options: PlatformOptions) {
    if (!config.token) {
      throw new Error('GitHub令牌未提供')
    }

    if (!options.owner || !options.repo || !options.prId) {
      throw new Error('GitHub仓库所有者、仓库名和PR ID是必需的')
    }

    this.token = config.token
    this.baseUrl = config.url || 'https://api.github.com'
    this.owner = options.owner
    this.repo = options.repo
    this.prId = options.prId
  }

  /**
   * 获取代码差异
   */
  async getCodeDiffs(): Promise<CodeDiff[]> {
    try {
      consola.debug(`获取GitHub仓库 ${this.owner}/${this.repo} PR #${this.prId} 的变更`)

      // 获取PR的文件列表
      const filesResponse = await fetch(
        `${this.baseUrl}/repos/${this.owner}/${this.repo}/pulls/${this.prId}/files`,
        {
          headers: {
            Authorization: `token ${this.token}`,
            Accept: 'application/vnd.github.v3+json',
          },
        },
      )

      if (!filesResponse.ok) {
        const errorText = await filesResponse.text()
        throw new Error(`GitHub API请求失败: ${filesResponse.status} ${errorText}`)
      }

      const files = await filesResponse.json() as any[]

      const diffs: CodeDiff[] = []

      for (const file of files) {
        if (file.filename) {
          const oldPath = file.previous_filename || file.filename
          const newPath = file.filename

          // 获取文件内容
          const [oldContent, newContent] = await Promise.all([
            this.getFileContent(file.contents_url, 'old'),
            this.getFileContent(file.contents_url, 'new'),
          ])

          diffs.push({
            oldPath,
            newPath,
            oldContent,
            newContent,
            diffContent: file.patch || '',
            language: this.detectLanguage(newPath),
          })
        }
      }

      return diffs
    }
    catch (error) {
      consola.error('获取GitHub代码差异时出错:', error)
      throw error
    }
  }

  /**
   * 提交审查评论
   */
  async submitReviewComment(filePath: string, line: number | undefined, comment: string): Promise<void> {
    try {
      // 获取提交SHA，用于添加评论
      const pullResponse = await fetch(
        `${this.baseUrl}/repos/${this.owner}/${this.repo}/pulls/${this.prId}`,
        {
          headers: {
            Authorization: `token ${this.token}`,
            Accept: 'application/vnd.github.v3+json',
          },
        },
      )

      if (!pullResponse.ok) {
        const errorText = await pullResponse.text()
        throw new Error(`GitHub API获取PR信息失败: ${pullResponse.status} ${errorText}`)
      }

      const pullData = await pullResponse.json()
      const commitId = pullData.head.sha

      // 如果有具体行号，添加行注释
      if (line) {
        // 创建一个审查并添加评论
        const reviewResponse = await fetch(
          `${this.baseUrl}/repos/${this.owner}/${this.repo}/pulls/${this.prId}/reviews`,
          {
            method: 'POST',
            headers: {
              'Authorization': `token ${this.token}`,
              'Accept': 'application/vnd.github.v3+json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              commit_id: commitId,
              event: 'COMMENT',
              comments: [
                {
                  path: filePath,
                  position: line,
                  body: comment,
                },
              ],
            }),
          },
        )

        if (!reviewResponse.ok) {
          const errorText = await reviewResponse.text()
          throw new Error(`GitHub API创建审查失败: ${reviewResponse.status} ${errorText}`)
        }

        consola.debug(`已向文件 ${filePath} 第 ${line} 行提交评论`)
      }
      else {
        // 提交PR级别的评论
        await this.submitReviewSummary(comment)
      }
    }
    catch (error) {
      consola.error('提交GitHub评论时出错:', error)
      throw error
    }
  }

  /**
   * 提交审查总结
   */
  async submitReviewSummary(summary: string): Promise<void> {
    try {
      const response = await fetch(
        `${this.baseUrl}/repos/${this.owner}/${this.repo}/issues/${this.prId}/comments`,
        {
          method: 'POST',
          headers: {
            'Authorization': `token ${this.token}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            body: `## AI代码审查总结\n\n${summary}`,
          }),
        },
      )

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`GitHub API提交总结失败: ${response.status} ${errorText}`)
      }

      consola.debug('已提交代码审查总结')
    }
    catch (error) {
      consola.error('提交GitHub审查总结时出错:', error)
      throw error
    }
  }

  /**
   * 获取文件内容
   */
  private async getFileContent(contentsUrl: string, _ref: 'old' | 'new'): Promise<string> {
    try {
      const response = await fetch(contentsUrl, {
        headers: {
          Authorization: `token ${this.token}`,
          Accept: 'application/vnd.github.v3.raw',
        },
      })

      if (!response.ok) {
        // 如果文件不存在，返回空字符串
        if (response.status === 404) {
          return ''
        }

        const errorText = await response.text()
        throw new Error(`GitHub API获取文件内容失败: ${response.status} ${errorText}`)
      }

      return await response.text()
    }
    catch (error) {
      consola.warn(`获取GitHub文件内容时出错: ${contentsUrl}`, error)
      return '' // 返回空字符串表示文件不存在或无法访问
    }
  }

  /**
   * 检测文件语言
   */
  private detectLanguage(filePath: string): string | undefined {
    // 使用共享的语言映射工具
    return detectLanguage(filePath)
  }

  /**
   * 批量提交审查评论
   */
  async submitBatchReviewComments(results: ReviewResult[]): Promise<void> {
    try {
      // 获取提交SHA，用于添加评论
      const pullResponse = await fetch(
        `${this.baseUrl}/repos/${this.owner}/${this.repo}/pulls/${this.prId}`,
        {
          headers: {
            Authorization: `token ${this.token}`,
            Accept: 'application/vnd.github.v3+json',
          },
        },
      )

      if (!pullResponse.ok) {
        const errorText = await pullResponse.text()
        throw new Error(`GitHub API获取PR信息失败: ${pullResponse.status} ${errorText}`)
      }

      const pullData = await pullResponse.json()
      const commitId = pullData.head.sha

      // 准备所有评论
      const comments = []

      // 收集每个文件的所有行评论
      for (const result of results) {
        for (const issue of result.issues) {
          if (issue.line) { // 只收集有行号的评论
            const message = this.formatIssueComment(issue)
            comments.push({
              path: result.file,
              position: issue.line,
              body: message,
            })
          }
        }
      }

      // 如果有行评论，创建一个批量审查
      if (comments.length > 0) {
        const reviewResponse = await fetch(
          `${this.baseUrl}/repos/${this.owner}/${this.repo}/pulls/${this.prId}/reviews`,
          {
            method: 'POST',
            headers: {
              'Authorization': `token ${this.token}`,
              'Accept': 'application/vnd.github.v3+json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              commit_id: commitId,
              event: 'COMMENT',
              comments,
            }),
          },
        )

        if (!reviewResponse.ok) {
          const errorText = await reviewResponse.text()
          throw new Error(`GitHub API批量创建评论失败: ${reviewResponse.status} ${errorText}`)
        }

        consola.debug(`已批量提交 ${comments.length} 条行评论`)
      }

      // 对于没有行号的评论，添加到问题评论中
      for (const result of results) {
        const generalIssues = result.issues.filter(issue => !issue.line)

        if (generalIssues.length > 0) {
          // 将一个文件的所有通用评论合并成一条
          const fileComment = `## 文件: ${result.file}\n\n${
            generalIssues.map(issue => this.formatIssueComment(issue)).join('\n\n')}`

          // 提交文件级评论
          await this.submitReviewComment(result.file, undefined, fileComment)
        }
      }
    }
    catch (error) {
      consola.error('批量提交GitHub评论时出错:', error)
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
