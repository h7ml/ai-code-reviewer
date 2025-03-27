import { consola } from 'consola'
import fetch from 'cross-fetch'
import { detectLanguage, getDisplayLanguage } from '../utils/language'
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

      consola.debug(`使用Ollama审查文件: ${diff.newPath}, 模型: ${this.config.model}`)

      const systemPrompt = this.config.review?.prompts?.system || `你是一个专业的代码审查助手，擅长识别代码中的问题并提供改进建议。
请按照以下格式提供反馈:
1. 分析代码差异
2. 列出具体问题
3. 对每个问题提供改进建议
4. 提供总结`

      // Ollama API的新版本使用/api/chat，但不同模型对消息格式的支持不同
      // 首先尝试使用旧的generate API，这对所有模型都有效
      try {
        // 创建包含系统提示和用户提示的完整提示
        const fullPrompt = `${systemPrompt}\n\n${prompt}`
        const content = await this.generateCompletion(fullPrompt)
        return this.parseReviewResponse(content, diff.newPath)
      }
      catch (error) {
        consola.warn(`使用generate API失败，尝试使用chat API: ${error}`)

        // 如果generate失败，尝试使用chat API
        const response = await fetch(`${this.baseUrl}/api/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: this.config.model,
            messages: [
              {
                role: 'system',
                content: systemPrompt,
              },
              {
                role: 'user',
                content: prompt,
              },
            ],
          }),
        })

        if (!response.ok) {
          throw new Error(`Ollama API请求失败: ${response.status} ${response.statusText}`)
        }

        const data = await response.json()
        const content = data.message?.content

        if (!content) {
          throw new Error('Ollama响应内容为空')
        }

        return this.parseReviewResponse(content, diff.newPath)
      }
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
      const systemPrompt = this.config.review?.prompts?.system || `你是一个专业的代码审查助手，擅长总结代码审查结果并提供改进建议。
请按照以下格式提供完整的审查报告:
1. 总体概述 - 代码库整体质量评估
2. 按文件列出详细问题 - 每个文件的具体问题及建议
3. 通用改进建议 - 适用于整个代码库的改进建议
4. 优先修复项 - 需要优先处理的问题`

      consola.debug('使用Ollama生成审查总结')

      // 首先尝试旧的generate API
      try {
        const fullPrompt = `${systemPrompt}\n\n${prompt}`
        return await this.generateCompletion(fullPrompt)
      }
      catch (error) {
        consola.warn(`使用generate API生成总结失败，尝试使用chat API: ${error}`)

        // 如果失败，尝试使用chat API
        const response = await fetch(`${this.baseUrl}/api/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: this.config.model,
            messages: [
              {
                role: 'system',
                content: systemPrompt,
              },
              {
                role: 'user',
                content: prompt,
              },
            ],
          }),
        })

        if (!response.ok) {
          throw new Error(`Ollama API请求失败: ${response.status} ${response.statusText}`)
        }

        const data = await response.json()
        return data.message?.content || ''
      }
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
    const customPrompt = this.config.review?.prompts?.review

    if (customPrompt) {
      // 替换自定义提示中的占位符
      return customPrompt
        .replace('{{language}}', language)
        .replace('{{filePath}}', diff.newPath)
        .replace('{{diffContent}}', diff.diffContent)
    }

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

请提供具体的问题位置、严重程度和改进建议。返回JSON格式的审查结果。`
  }

  /**
   * 构建总结提示
   */
  private buildSummaryPrompt(results: ReviewResult[]): string {
    const filesCount = results.length
    const issuesCount = results.reduce((sum, result) => sum + result.issues.length, 0)

    // 为每个文件创建详细报告
    const detailedResults = results.map((result) => {
      const issuesByCategory = {
        error: result.issues.filter(issue => issue.severity === 'error'),
        warning: result.issues.filter(issue => issue.severity === 'warning'),
        info: result.issues.filter(issue => issue.severity === 'info'),
      }

      const errorCount = issuesByCategory.error.length
      const warningCount = issuesByCategory.warning.length
      const infoCount = issuesByCategory.info.length

      const severitySummary = `严重问题: ${errorCount}个, 警告: ${warningCount}个, 信息: ${infoCount}个`

      return `## 文件: ${result.file}
${severitySummary}
${result.summary ? `\n文件摘要: ${result.summary}\n` : ''}

详细问题:
${result.issues.map((issue) => {
  const lineInfo = issue.line ? `第${issue.line}行` : '通用'
  const suggestion = issue.suggestion ? `\n建议: ${issue.suggestion}` : ''
  return `- [${issue.severity.toUpperCase()}] ${lineInfo}: ${issue.message}${suggestion}`
}).join('\n')}
`
    }).join('\n\n')

    // 统计问题类型分布
    const allIssues = results.flatMap(r => r.issues)
    const errorCount = allIssues.filter(i => i.severity === 'error').length
    const warningCount = allIssues.filter(i => i.severity === 'warning').length
    const infoCount = allIssues.filter(i => i.severity === 'info').length

    const severityDistribution = `严重问题: ${errorCount}个 (${Math.round(errorCount / issuesCount * 100 || 0)}%)
警告: ${warningCount}个 (${Math.round(warningCount / issuesCount * 100 || 0)}%)
信息: ${infoCount}个 (${Math.round(infoCount / issuesCount * 100 || 0)}%)`

    const customPrompt = this.config.review?.prompts?.summary

    if (customPrompt) {
      // 替换自定义提示中的占位符
      return customPrompt
        .replace('{{filesCount}}', String(filesCount))
        .replace('{{issuesCount}}', String(issuesCount))
        .replace('{{resultsSummary}}', detailedResults)
        .replace('{{severityDistribution}}', severityDistribution)
    }

    return `请对以下代码审查结果进行全面总结，并提供详细的整体改进建议:

审查了 ${filesCount} 个文件，共发现 ${issuesCount} 个问题。

问题严重程度分布:
${severityDistribution}

详细审查结果:
${detailedResults}

请基于以上结果提供:
1. 代码库整体质量评估
2. 按文件列出关键问题及建议
3. 最常见的问题类型及改进方向
4. 优先修复的关键问题
5. 整体代码质量改进建议`
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
    // 使用共享的语言映射工具
    const lang = detectLanguage(filePath)

    // 如果能识别语言，使用更友好的显示名称
    if (lang) {
      return getDisplayLanguage(lang)
    }

    return '未知'
  }
}
