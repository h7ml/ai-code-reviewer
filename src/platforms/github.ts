import { consola } from 'consola'
import fetch from 'cross-fetch'
import type { CodeDiff } from '../core/reviewer'
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
      // 首先需要创建一个审查
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
            event: 'COMMENT',
          }),
        },
      )

      if (!reviewResponse.ok) {
        const errorText = await reviewResponse.text()
        throw new Error(`GitHub API创建审查失败: ${reviewResponse.status} ${errorText}`)
      }

      const reviewData = await reviewResponse.json()
      const reviewId = reviewData.id

      // 如果有具体行号，添加行注释
      if (line) {
        // 获取提交SHA
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

        // 添加审查评论
        const commentResponse = await fetch(
          `${this.baseUrl}/repos/${this.owner}/${this.repo}/pulls/${this.prId}/reviews/${reviewId}/comments`,
          {
            method: 'POST',
            headers: {
              'Authorization': `token ${this.token}`,
              'Accept': 'application/vnd.github.v3+json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              path: filePath,
              line,
              side: 'RIGHT',
              commit_id: commitId,
              body: comment,
            }),
          },
        )

        if (!commentResponse.ok) {
          const errorText = await commentResponse.text()
          throw new Error(`GitHub API添加评论失败: ${commentResponse.status} ${errorText}`)
        }

        consola.debug(`已向文件 ${filePath} 第 ${line} 行提交评论`)
      }
      else {
        // 提交审查评论
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
    const ext = filePath.split('.').pop()?.toLowerCase()
    if (!ext)
      return undefined

    const languageMap: Record<string, string> = {
      js: 'javascript',
      ts: 'typescript',
      jsx: 'javascript',
      tsx: 'typescript',
      py: 'python',
      rb: 'ruby',
      php: 'php',
      java: 'java',
      go: 'go',
      cs: 'csharp',
      cpp: 'cpp',
      c: 'c',
      h: 'c',
      hpp: 'cpp',
      rs: 'rust',
      swift: 'swift',
      kt: 'kotlin',
      scala: 'scala',
      md: 'markdown',
      html: 'html',
      css: 'css',
      scss: 'scss',
      sass: 'sass',
      less: 'less',
      json: 'json',
      yml: 'yaml',
      yaml: 'yaml',
      xml: 'xml',
      sql: 'sql',
      sh: 'shell',
      bash: 'shell',
    }

    return languageMap[ext]
  }
}
