import fetch from 'cross-fetch'
import { consola } from 'consola'
import type { Platform, PlatformConfig, PlatformOptions } from './types'
import type { CodeDiff } from '../core/reviewer'

/**
 * GitLab平台实现
 */
export class GitLabPlatform implements Platform {
  private token: string
  private baseUrl: string
  private projectId: string | number
  private mergeRequestId: string | number

  constructor(config: PlatformConfig, options: PlatformOptions) {
    if (!config.token) {
      throw new Error('GitLab令牌未提供')
    }
    
    if (!options.projectId || !options.mergeRequestId) {
      throw new Error('GitLab项目ID和合并请求ID是必需的')
    }
    
    this.token = config.token
    this.baseUrl = config.url || 'https://gitlab.com/api/v4'
    this.projectId = options.projectId
    this.mergeRequestId = options.mergeRequestId
  }

  /**
   * 获取代码差异
   */
  async getCodeDiffs(): Promise<CodeDiff[]> {
    try {
      consola.debug(`获取GitLab项目 ${this.projectId} 合并请求 ${this.mergeRequestId} 的变更`)
      
      const response = await fetch(
        `${this.baseUrl}/projects/${encodeURIComponent(String(this.projectId))}/merge_requests/${this.mergeRequestId}/changes`,
        {
          headers: {
            'PRIVATE-TOKEN': this.token,
          },
        },
      )
      
      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`GitLab API请求失败: ${response.status} ${errorText}`)
      }
      
      const data = await response.json() as any
      
      if (!data.changes || !Array.isArray(data.changes)) {
        throw new Error('无效的GitLab API响应格式')
      }
      
      const diffs: CodeDiff[] = []
      
      for (const change of data.changes) {
        if (change.new_path && change.diff) {
          const oldPath = change.old_path || change.new_path
          const newPath = change.new_path
          
          // 获取文件内容
          const oldContent = await this.getFileContent(oldPath, 'old')
          const newContent = await this.getFileContent(newPath, 'new')
          
          diffs.push({
            oldPath,
            newPath,
            oldContent,
            newContent,
            diffContent: change.diff,
            language: this.detectLanguage(newPath),
          })
        }
      }
      
      return diffs
    }
    catch (error) {
      consola.error('获取GitLab代码差异时出错:', error)
      throw error
    }
  }

  /**
   * 提交审查评论
   */
  async submitReviewComment(filePath: string, line: number | undefined, comment: string): Promise<void> {
    try {
      const position = {
        position_type: 'text',
        new_path: filePath,
        new_line: line,
      }
      
      const response = await fetch(
        `${this.baseUrl}/projects/${encodeURIComponent(String(this.projectId))}/merge_requests/${this.mergeRequestId}/discussions`,
        {
          method: 'POST',
          headers: {
            'PRIVATE-TOKEN': this.token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            body: comment,
            position,
          }),
        },
      )
      
      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`GitLab API提交评论失败: ${response.status} ${errorText}`)
      }
      
      consola.debug(`已向文件 ${filePath} ${line ? `第 ${line} 行` : ''} 提交评论`)
    }
    catch (error) {
      consola.error('提交GitLab评论时出错:', error)
      throw error
    }
  }

  /**
   * 提交审查总结
   */
  async submitReviewSummary(summary: string): Promise<void> {
    try {
      const response = await fetch(
        `${this.baseUrl}/projects/${encodeURIComponent(String(this.projectId))}/merge_requests/${this.mergeRequestId}/notes`,
        {
          method: 'POST',
          headers: {
            'PRIVATE-TOKEN': this.token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            body: `## AI代码审查总结\n\n${summary}`,
          }),
        },
      )
      
      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`GitLab API提交总结失败: ${response.status} ${errorText}`)
      }
      
      consola.debug('已提交代码审查总结')
    }
    catch (error) {
      consola.error('提交GitLab审查总结时出错:', error)
      throw error
    }
  }

  /**
   * 获取文件内容
   */
  private async getFileContent(path: string, ref: 'old' | 'new'): Promise<string> {
    try {
      const mrInfo = await this.getMergeRequestInfo()
      const branch = ref === 'old' ? mrInfo.source_branch : mrInfo.target_branch
      
      const response = await fetch(
        `${this.baseUrl}/projects/${encodeURIComponent(String(this.projectId))}/repository/files/${encodeURIComponent(path)}/raw?ref=${branch}`,
        {
          headers: {
            'PRIVATE-TOKEN': this.token,
          },
        },
      )
      
      if (!response.ok) {
        // 如果文件不存在，返回空字符串
        if (response.status === 404) {
          return ''
        }
        
        const errorText = await response.text()
        throw new Error(`GitLab API获取文件内容失败: ${response.status} ${errorText}`)
      }
      
      return await response.text()
    }
    catch (error) {
      consola.warn(`获取GitLab文件内容时出错: ${path}`, error)
      return '' // 返回空字符串表示文件不存在或无法访问
    }
  }

  /**
   * 获取合并请求信息
   */
  private async getMergeRequestInfo(): Promise<any> {
    const response = await fetch(
      `${this.baseUrl}/projects/${encodeURIComponent(String(this.projectId))}/merge_requests/${this.mergeRequestId}`,
      {
        headers: {
          'PRIVATE-TOKEN': this.token,
        },
      },
    )
    
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`GitLab API获取合并请求信息失败: ${response.status} ${errorText}`)
    }
    
    return await response.json()
  }

  /**
   * 检测文件语言
   */
  private detectLanguage(filePath: string): string | undefined {
    const ext = filePath.split('.').pop()?.toLowerCase()
    if (!ext) return undefined
    
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
