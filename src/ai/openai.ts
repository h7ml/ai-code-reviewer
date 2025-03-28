import { consola } from 'consola'
import { OpenAI } from 'openai'
import type { CodeDiff, ReviewResult } from '../core/reviewer'
import { detectLanguage, getDisplayLanguage } from '../utils/language'
import type { AiProvider, AiProviderConfig } from './types'

/**
 * OpenAI提供者实现
 */
export class OpenAIProvider implements AiProvider {
  private client: OpenAI
  private config: AiProviderConfig

  constructor(config: AiProviderConfig) {
    if (!config.apiKey) {
      throw new Error('OpenAI API密钥未提供')
    }

    // 记录传入的配置
    consola.info(`OpenAI/OpenRouter初始配置: provider=${config.provider}, model=${config.model}, baseUrl=${config.baseUrl || '默认'}`)

    this.config = config

    // 检查是否使用OpenRouter
    const isOpenRouter = config.baseUrl?.includes('openrouter.ai')

    const clientOptions: any = {
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
    }

    // 为OpenRouter添加必要的请求头
    if (isOpenRouter) {
      consola.info('检测到使用OpenRouter API，添加相应配置')
      clientOptions.defaultHeaders = {
        'HTTP-Referer': 'https://github.com/h7ml/ai-code-reviewer',
        'X-Title': 'AI Code Reviewer',
      }

      // 确保API路径正确
      if (!clientOptions.baseURL.endsWith('/api/v1')) {
        clientOptions.baseURL = `${clientOptions.baseURL.replace(/\/$/, '')}/api/v1`
        consola.info(`OpenRouter API URL已调整为: ${clientOptions.baseURL}`)
      }
    }

    consola.debug(`OpenAI/OpenRouter客户端初始化配置: ${JSON.stringify({
      baseURL: clientOptions.baseURL,
      hasApiKey: !!clientOptions.apiKey,
      model: clientOptions.model || this.config.model,
      hasDefaultHeaders: !!clientOptions.defaultHeaders,
    })}`)

    try {
      this.client = new OpenAI(clientOptions)
      consola.success('OpenAI/OpenRouter客户端初始化成功')
    }
    catch (error) {
      consola.error('OpenAI/OpenRouter客户端初始化失败:', error)
      throw error
    }
  }

  /**
   * 审查代码差异
   */
  async reviewCode(diff: CodeDiff): Promise<ReviewResult> {
    try {
      const language = diff.language || this.detectLanguage(diff.newPath)
      const prompt = this.buildReviewPrompt(diff, language)

      consola.debug(`使用OpenAI审查文件: ${diff.newPath}`)

      const systemPrompt = this.config.review?.prompts?.system || `你是一个专业的代码审查助手，擅长识别代码中的问题并提供改进建议。
请按照以下格式提供反馈:
1. 分析代码差异
2. 列出具体问题
3. 对每个问题提供改进建议
4. 提供总结`

      try {
        consola.debug('准备发送API请求...')
        const response = await this.client.chat.completions.create({
          model: this.config.model,
          temperature: this.config.temperature || 0.1,
          max_tokens: this.config.maxTokens || 4000,
          top_p: 1,
          frequency_penalty: 0,
          presence_penalty: 0,
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
        })

        consola.debug(`API响应: ${JSON.stringify({
          id: response.id,
          model: response.model,
          object: response.object,
          created: response.created,
          choices_length: response.choices?.length || 0,
          has_choices: !!response.choices && response.choices.length > 0,
        }, null, 2)}`)

        if (!response.choices || response.choices.length === 0) {
          consola.error('API响应中choices数组为空或不存在')
          throw new Error('API响应返回的choices为空')
        }

        if (!response.choices[0]) {
          consola.error('API响应中choices[0]为空')
          throw new Error('API响应返回的第一个选择为空')
        }

        if (!response.choices[0].message) {
          consola.error('API响应中choices[0].message为空')
          throw new Error('API响应返回的消息对象为空')
        }

        const content = response.choices[0].message.content

        if (!content) {
          throw new Error('API响应内容为空')
        }

        return this.parseReviewResponse(content, diff.newPath)
      }
      catch (error: any) {
        consola.error(`调用API时出错: ${error.message}`)
        if (error.response) {
          consola.error(`API错误响应: ${JSON.stringify({
            status: error.response.status,
            statusText: error.response.statusText,
            data: error.response.data,
          })}`)
        }
        throw error
      }
    }
    catch (error) {
      consola.error(`OpenAI审查代码时出错:`, error)
      throw error
    }
  }

  /**
   * 生成审查总结
   */
  async generateSummary(results: ReviewResult[]): Promise<string> {
    try {
      const prompt = this.buildSummaryPrompt(results)

      consola.debug('使用API生成审查总结')

      const systemPrompt = this.config.review?.prompts?.system || `你是一个专业的代码审查助手，擅长总结代码审查结果并提供改进建议。
请按照以下格式提供完整的审查报告:
1. 总体概述 - 代码库整体质量评估
2. 按文件列出详细问题 - 每个文件的具体问题及建议
3. 通用改进建议 - 适用于整个代码库的改进建议
4. 优先修复项 - 需要优先处理的问题`

      try {
        const response = await this.client.chat.completions.create({
          model: this.config.model,
          temperature: this.config.temperature || 0.1,
          max_tokens: this.config.maxTokens || 4000,
          top_p: 1,
          frequency_penalty: 0,
          presence_penalty: 0,
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
        })

        consola.debug(`API总结响应: ${JSON.stringify({
          id: response.id,
          model: response.model,
          object: response.object,
          created: response.created,
          choices_length: response.choices?.length || 0,
          has_choices: !!response.choices && response.choices.length > 0,
        }, null, 2)}`)

        if (!response.choices || response.choices.length === 0) {
          consola.error('API总结响应中choices数组为空或不存在')
          throw new Error('API响应返回的choices为空')
        }

        if (!response.choices[0]) {
          consola.error('API总结响应中choices[0]为空')
          throw new Error('API响应返回的第一个选择为空')
        }

        if (!response.choices[0].message) {
          consola.error('API总结响应中choices[0].message为空')
          throw new Error('API响应返回的消息对象为空')
        }

        const content = response.choices[0].message.content

        if (!content) {
          throw new Error('API响应内容为空')
        }

        return content
      }
      catch (error: any) {
        consola.error(`调用API生成总结时出错: ${error.message}`)
        if (error.response) {
          consola.error(`API错误响应: ${JSON.stringify({
            status: error.response.status,
            statusText: error.response.statusText,
            data: error.response.data,
          })}`)
        }
        throw error
      }
    }
    catch (error) {
      consola.error(`生成总结时出错:`, error)
      throw error
    }
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

    return `请以专业代码审查者的身份审查以下${language}代码差异。

文件路径: ${diff.newPath}

代码差异:
\`\`\`diff
${diff.diffContent}
\`\`\`

请按照以下结构提供评论：

1. **总体评价**: 简要总结代码质量，包括积极方面和需要改进的地方
2. **关键发现**: 按优先级列出最重要的问题
3. **详细分析**: 对每个问题进行详细说明，每个问题包含：
   - 严重性: 低(info) | 中(warning) | 高(error)
   - 问题位置: 具体到行号
   - 问题描述: 清晰说明问题所在
   - 改进建议: 提供具体的改进方法，可能包含代码示例
   - 解释理由: 简要解释为什么这是一个问题或为什么建议的改进是有益的
4. **最佳实践**: 指出代码中遵循或违反的最佳实践
5. **学习资源**: 酌情提供相关文档或学习资源链接

请以JSON格式返回响应，包含以下字段:
1. file: 文件路径
2. summary: 总体评价摘要
3. issues: 问题数组，每个问题包含:
   - severity: 'info' | 'warning' | 'error'
   - line: 行号(可选)
   - message: 问题描述
   - suggestion: 改进建议(可选)
   - code: 示例代码(可选)

确保分析全面且具有建设性，重点关注可行的改进而不仅仅是指出问题。`
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
      // 尝试直接解析JSON响应
      const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || content.match(/```([\s\S]*?)```/)

      if (jsonMatch && jsonMatch[1]) {
        try {
          const parsed = JSON.parse(jsonMatch[1])
          if (parsed.issues && Array.isArray(parsed.issues)) {
            return {
              file: filePath,
              issues: parsed.issues,
              summary: parsed.summary || '',
            }
          }
        }
        catch (e) {
          consola.warn('无法解析JSON响应，将使用文本解析', e)
        }
      }

      // 文本解析
      const issues: Array<{
        line?: number
        severity: 'info' | 'warning' | 'error'
        message: string
        suggestion?: string
        code?: string
      }> = []

      // 尝试提取总体评价
      const summary = this.extractSummary(content)

      // 提取关键问题
      // 尝试匹配问题部分，支持CodeRabbitAI风格的问题格式
      const problemSections = content.split(/###\s+/).filter(Boolean)

      for (const section of problemSections) {
        // 跳过不是问题描述的部分
        if (!/🔴|🟠|🔵|严重问题|警告|建议|error|warning|info/i.test(section)) {
          continue
        }

        let severity: 'error' | 'warning' | 'info' = 'info'

        if (/🔴|严重问题|error/i.test(section)) {
          severity = 'error'
        }
        else if (/🟠|警告|warning/i.test(section)) {
          severity = 'warning'
        }

        // 提取每个问题
        const problemMatches = section.match(/####\s+(.+?):(.+?)(?=####|$)/gs)

        if (problemMatches) {
          for (const problemMatch of problemMatches) {
            // 提取行号
            const lineMatch = problemMatch.match(/####\s+第(\d+)行:/)
            const line = lineMatch ? Number.parseInt(lineMatch[1], 10) : undefined

            // 提取消息
            const messageMatch = problemMatch.match(/####\s+(?:第\d+行|整体):\s*(.+)(?:\n|$)/)
            const message = messageMatch ? messageMatch[1].trim() : '未知问题'

            // 提取建议
            const suggestionMatch = problemMatch.match(/\*\*💡 改进建议:\*\*\n([\s\S]*?)(?=\*\*|$)/)
            const suggestion = suggestionMatch ? suggestionMatch[1].trim() : undefined

            // 提取代码示例
            const codeMatch = problemMatch.match(/```\n([\s\S]*?)\n```/)
            const code = codeMatch ? codeMatch[1] : undefined

            issues.push({
              line,
              severity,
              message,
              suggestion,
              code,
            })
          }
        }
      }

      // 如果上面的方法没有提取到问题，使用旧的方法进行提取
      if (issues.length === 0) {
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
        summary,
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
    // 尝试提取"总体评价"部分
    const overallMatch = content.match(/##\s*📝\s*总体评价\s*\n([^#]+)/)
    if (overallMatch && overallMatch[1]) {
      return overallMatch[1].trim()
    }

    // 尝试匹配其他可能的总结格式
    const summaryMatch = content.match(/(?:总结|总体评价|总体评估|总览|Summary)[:：]\s*([^\n]+)(?:\n\n|$)/i)
    if (summaryMatch && summaryMatch[1]) {
      return summaryMatch[1].trim()
    }

    // 尝试提取第一段作为总结
    const firstParagraph = content.split('\n\n')[0]
    if (firstParagraph && firstParagraph.length < 200) {
      return firstParagraph.trim()
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
