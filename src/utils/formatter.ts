import chalk from 'chalk'
import type { ReviewResult } from '../core/reviewer'

/**
 * 控制台输出格式化工具
 */
export class OutputFormatter {
  /**
   * 格式化整体的审查结果
   */
  static formatReviewResults(results: ReviewResult[]): string {
    // 计算问题统计
    const totalIssues = results.reduce((sum, result) => sum + result.issues.length, 0)
    const allIssues = results.flatMap(r => r.issues)
    const errorCount = allIssues.filter(i => i.severity === 'error').length
    const warningCount = allIssues.filter(i => i.severity === 'warning').length
    const infoCount = allIssues.filter(i => i.severity === 'info').length

    // 构建头部统计信息
    let output = '\n'
    output += this.formatHeader('代码审查报告')
    output += '\n\n'

    // 总体统计
    output += chalk.bold('总体统计：\n')
    output += `${chalk.cyan('•')} 审查了 ${chalk.bold(results.length)} 个文件，共发现 ${chalk.bold(totalIssues)} 个问题\n`
    output += `${chalk.cyan('•')} ${chalk.red(`错误: ${errorCount}个`)} | ${chalk.yellow(`警告: ${warningCount}个`)} | ${chalk.blue(`提示: ${infoCount}个`)}\n`
    output += this.formatDivider()

    // 格式化每个文件的详细问题
    for (const result of results) {
      output += this.formatFileResult(result)
    }

    // 添加结尾
    output += this.formatFooter('审查报告结束')
    output += '\n'

    return output
  }

  /**
   * 格式化单个文件的审查结果
   */
  static formatFileResult(result: ReviewResult): string {
    // 按严重程度分组
    const errorIssues = result.issues.filter(issue => issue.severity === 'error')
    const warningIssues = result.issues.filter(issue => issue.severity === 'warning')
    const infoIssues = result.issues.filter(issue => issue.severity === 'info')

    let output = ''

    // 文件标题
    output += `${chalk.bgBlue.white(` 文件: ${result.file} `)}\n`

    if (result.issues.length === 0) {
      output += chalk.green('  ✓ 没有发现问题\n')
      output += this.formatDivider()
      return output
    }

    // 问题统计
    output += `  ${chalk.red(`错误: ${errorIssues.length}个`)} | ${chalk.yellow(`警告: ${warningIssues.length}个`)} | ${chalk.blue(`提示: ${infoIssues.length}个`)}\n`

    // 文件摘要
    if (result.summary) {
      output += `\n  ${chalk.bold('摘要: ')}${result.summary.replace(/\n/g, '\n  ')}\n`
    }

    if (result.issues.length > 0) {
      output += `\n  ${chalk.bold('详细问题:')}\n`

      // 先处理错误
      if (errorIssues.length > 0) {
        output += this.formatIssuesByType(errorIssues, '错误', 'red')
      }

      // 然后是警告
      if (warningIssues.length > 0) {
        output += this.formatIssuesByType(warningIssues, '警告', 'yellow')
      }

      // 最后是提示
      if (infoIssues.length > 0) {
        output += this.formatIssuesByType(infoIssues, '提示', 'blue')
      }
    }

    output += this.formatDivider()
    return output
  }

  /**
   * 格式化按严重程度分组的问题
   */
  static formatIssuesByType(
    issues: ReviewResult['issues'],
    title: string,
    color: 'red' | 'yellow' | 'blue',
  ): string {
    const colorFn = chalk[color]
    let output = `  ${colorFn.bold(`■ ${title} (${issues.length}个)`)}\n`

    for (const issue of issues) {
      const lineInfo = issue.line ? `第${issue.line}行` : '通用'
      const severitySymbol = issue.severity === 'error'
        ? '❌'
        : issue.severity === 'warning' ? '⚠️' : 'ℹ️'

      output += `    ${severitySymbol} ${colorFn(`[${lineInfo}]`)} ${issue.message}\n`

      if (issue.suggestion) {
        output += `      ${chalk.green('✓')} ${chalk.italic('建议:')} ${issue.suggestion}\n`
      }

      if (issue.code) {
        output += `      ${chalk.dim('示例代码:')}\n`
        const codeLines = issue.code.split('\n')
        for (const line of codeLines) {
          output += `      ${chalk.dim('|')} ${line}\n`
        }
      }

      output += '\n'
    }

    return output
  }

  /**
   * 格式化审查总结
   */
  static formatSummary(summary: string): string {
    let output = '\n'
    output += this.formatHeader('代码审查总结')
    output += '\n\n'

    // 将总结内容格式化，增加缩进
    const lines = summary.split('\n')
    for (const line of lines) {
      if (line.startsWith('#')) {
        // 标题
        output += `${chalk.bold.green(line)}\n`
      }
      else if (line.startsWith('*') || line.startsWith('-')) {
        // 列表项
        output += `${chalk.cyan(line)}\n`
      }
      else if (line.trim() === '') {
        // 空行
        output += '\n'
      }
      else {
        // 普通文本
        output += `${line}\n`
      }
    }

    output += '\n'
    output += this.formatFooter('总结结束')
    output += '\n'

    return output
  }

  /**
   * 格式化分隔线
   */
  private static formatDivider(): string {
    return `${chalk.dim('─'.repeat(80))}\n`
  }

  /**
   * 格式化标题
   */
  private static formatHeader(title: string): string {
    const padding = ' '.repeat(Math.max(0, (76 - title.length) / 2))
    return chalk.bgGreen.black(`\n${padding} ${title} ${padding}\n`)
  }

  /**
   * 格式化页脚
   */
  private static formatFooter(text: string): string {
    const padding = ' '.repeat(Math.max(0, (76 - text.length) / 2))
    return chalk.bgBlue.black(`\n${padding} ${text} ${padding}\n`)
  }

  /**
   * 格式化单个文件的评论
   * 当用户要求查看单个文件的详细评论时使用
   */
  static formatSingleFileReview(result: ReviewResult): string {
    let output = '\n'
    output += this.formatHeader(`文件: ${result.file} 审查结果`)
    output += '\n\n'

    // 按严重程度分组
    const errorIssues = result.issues.filter(issue => issue.severity === 'error')
    const warningIssues = result.issues.filter(issue => issue.severity === 'warning')
    const infoIssues = result.issues.filter(issue => issue.severity === 'info')

    if (result.issues.length === 0) {
      output += chalk.green('  ✓ 没有发现问题\n')
      output += this.formatDivider()
      return output
    }

    // 问题统计
    output += `${chalk.red(`错误: ${errorIssues.length}个`)} | ${chalk.yellow(`警告: ${warningIssues.length}个`)} | ${chalk.blue(`提示: ${infoIssues.length}个`)}\n\n`

    // 文件摘要
    if (result.summary) {
      output += `${chalk.bold('摘要: ') + result.summary.replace(/\n/g, '\n  ')}\n\n`
    }

    if (result.issues.length > 0) {
      output += `${chalk.bold('详细问题:')}\n\n`

      // 按行号排序问题
      const sortedIssues = [...result.issues].sort((a, b) => {
        // 无行号的问题排在最前面
        if (!a.line)
          return -1
        if (!b.line)
          return 1
        return (a.line || 0) - (b.line || 0)
      })

      // 输出排序后的问题
      for (const issue of sortedIssues) {
        const lineInfo = issue.line ? `第${issue.line}行` : '文件级问题'
        const severityColor
          = issue.severity === 'error'
            ? chalk.red
            : issue.severity === 'warning'
              ? chalk.yellow
              : chalk.blue
        const severitySymbol
          = issue.severity === 'error'
            ? '❌'
            : issue.severity === 'warning'
              ? '⚠️'
              : 'ℹ️'

        output += `${severitySymbol} ${severityColor(`[${lineInfo}]`)} ${issue.message}\n`

        if (issue.suggestion) {
          output += `  ${chalk.green('✓')} ${chalk.italic('建议:')} ${issue.suggestion}\n`
        }

        if (issue.code) {
          output += `  ${chalk.dim('示例代码:')}\n`
          const codeLines = issue.code.split('\n')
          for (const line of codeLines) {
            output += `  ${chalk.dim('|')} ${line}\n`
          }
        }

        output += '\n'
      }
    }

    output += this.formatFooter('文件审查结束')
    output += '\n'

    return output
  }
}
