import { consola } from 'consola'
import fetch from 'cross-fetch'
import type { CodeDiff, ReviewResult } from '../core/reviewer'
import type { AiProvider, AiProviderConfig } from './types'

/**
 * Ollama API接口
 */
interface OllamaCompletionResponse {
  model: string
  created_at: string
  response: string
  done: boolean
}

/**
 * Ollama提供者实现
 */
export class OllamaProvider implements AiProvider {
  private baseUrl: string
  private config: AiProviderConfig

  constructor(config: AiProviderConfig) {
    this.config = config
    this.baseUrl = config.baseUrl || 'http://localhost:11434'
  }

  /**
   * 审查代码差异
   */
  async reviewCode(diff: CodeDiff): Promise<ReviewResult> {
    try {
      const language = diff.language || this.detectLanguage(diff.newPath)
      const prompt = this.buildReviewPrompt(diff, language)

      consola.debug(`使用Ollama审查文件: ${diff.newPath}`)

      const response = await this.generateCompletion(prompt)

      if (!response) {
        throw new Error('Ollama响应内容为空')
      }

      return this.parseReviewResponse(response, diff.newPath)
    }
    catch (error) {
      consola.error(`Ollama审查代码时出错:`, error)
      throw error
    }
  }

  /**
   * 生成审查总结
   */
  async generateSummary(results: ReviewResult[]): Promise<string> {
    try {
      const prompt = this.buildSummaryPrompt(results)

      consola.debug('使用Ollama生成审查总结')

      return await this.generateCompletion(prompt)
    }
    catch (error) {
      consola.error(`Ollama生成总结时出错:`, error)
      throw error
    }
  }

  /**
   * 调用Ollama API生成完成
   */
  private async generateCompletion(prompt: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.config.model,
        prompt,
        temperature: this.config.temperature || 0.1,
        stream: false,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Ollama API请求失败: ${response.status} ${errorText}`)
    }

    const data = await response.json() as OllamaCompletionResponse
    return data.response
  }

  /**
   * 构建代码审查提示
   */
  private buildReviewPrompt(diff: CodeDiff, language: string): string {
    return `请审查以下${language}代码差异，并提供改进建议:

文件路径: ${diff.newPath}

代码差异:
\`\`\`diff
${diff.diffContent}
\`\`\`

请关注以下方面:
1. 代码质量问题
2. 潜在的错误和缺陷
3. 性能优化建议
4. 安全隐患
5. 可读性和维护性改进
6. 最佳实践建议

请提供具体的问题位置、严重程度和改进建议。`
  }

  /**
   * 构建总结提示
   */
  private buildSummaryPrompt(results: ReviewResult[]): string {
    const filesCount = results.length
    const issuesCount = results.reduce((sum, result) => sum + result.issues.length, 0)

    const resultsSummary = results.map((result) => {
      return `文件: ${result.file}
问题数: ${result.issues.length}
问题摘要: ${result.issues.map(issue => `- [${issue.severity}] ${issue.message}`).join('\n')}`
    }).join('\n\n')

    return `请总结以下代码审查结果，并提供整体改进建议:

审查了 ${filesCount} 个文件，共发现 ${issuesCount} 个问题。

审查结果摘要:
${resultsSummary}

请提供:
1. 代码库整体质量评估
2. 最常见的问题类型
3. 整体改进建议
4. 优先修复的关键问题`
  }

  /**
   * 解析审查响应
   */
  private parseReviewResponse(content: string, filePath: string): ReviewResult {
    try {
      // 文本解析
      const issues: Array<{
        line?: number
        severity: 'info' | 'warning' | 'error'
        message: string
        suggestion?: string
        code?: string
      }> = []

      // 修复正则表达式避免指数级回溯
      const problemRegex = /(\d+)?\s*[:：]\s*(?:\[(error|warning|info)\]\s*)?([^\n]+)/g
      let match = problemRegex.exec(content)

      // 使用while循环而非赋值条件
      while (match !== null) {
        const line = match[1] ? Number.parseInt(match[1], 10) : undefined
        const severity = (match[2] || 'info') as 'info' | 'warning' | 'error'
        const message = match[3].trim()

        issues.push({
          line,
          severity,
          message,
        })

        // 在循环体末尾执行下一次匹配
        match = problemRegex.exec(content)
      }

      // 如果没有找到问题，并且内容不为空，添加一个通用问题
      if (issues.length === 0 && content.trim()) {
        issues.push({
          severity: 'info',
          message: '审查反馈',
          suggestion: content.trim(),
        })
      }

      return {
        file: filePath,
        issues,
        summary: this.extractSummary(content),
      }
    }
    catch (error) {
      consola.error('解析审查响应时出错:', error)

      // 返回一个带有错误信息的结果
      return {
        file: filePath,
        issues: [
          {
            severity: 'error',
            message: '解析审查结果时出错',
            suggestion: String(error),
          },
        ],
        summary: '解析审查结果时出错',
      }
    }
  }

  /**
   * 提取总结
   */
  private extractSummary(content: string): string {
    // 修复正则表达式避免指数级回溯
    const summaryMatch = content.match(/(?:总结|总体评价|Summary)[:：]\s*([^\n]+)(?:\n\n|$)/i)

    if (summaryMatch && summaryMatch[1]) {
      return summaryMatch[1].trim()
    }

    // 如果没有明确的总结部分，取最后一段
    const paragraphs = content.split('\n\n')
    return paragraphs[paragraphs.length - 1].trim()
  }

  /**
   * 根据文件扩展名检测语言
   */
  private detectLanguage(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase() || ''

    const languageMap: Record<string, string> = {
      js: 'JavaScript',
      ts: 'TypeScript',
      jsx: 'React',
      tsx: 'React TypeScript',
      vue: 'Vue',
      py: 'Python',
      rb: 'Ruby',
      go: 'Go',
      java: 'Java',
      php: 'PHP',
      cs: 'C#',
      cpp: 'C++',
      c: 'C',
      swift: 'Swift',
      kt: 'Kotlin',
      rs: 'Rust',
      dart: 'Dart',
      sh: 'Shell',
      yml: 'YAML',
      yaml: 'YAML',
      json: 'JSON',
      md: 'Markdown',
      html: 'HTML',
      css: 'CSS',
      scss: 'SCSS',
      sass: 'Sass',
      less: 'Less',
      sql: 'SQL',
    }

    return languageMap[ext] || '未知'
  }
}
