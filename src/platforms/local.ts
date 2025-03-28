import { exec } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import * as process from 'node:process'
import { promisify } from 'node:util'
import { consola } from 'consola'
import chalk from 'chalk'
import type { CodeDiff, ReviewResult } from '../core/reviewer'
import { isNode } from '../utils/env'
import { OutputFormatter } from '../utils/formatter'
import { detectLanguage } from '../utils/language'
import type { Platform, PlatformOptions } from './types'

const execAsync = promisify(exec)

/**
 * 本地平台实现
 */
export class LocalPlatform implements Platform {
  private path: string
  private commitSha?: string

  constructor(options: PlatformOptions) {
    if (!isNode) {
      consola.warn('本地平台审查功能仅在Node.js环境中可用')
    }

    this.path = options.path || (isNode ? process.cwd() : '.')
    this.commitSha = options.commitSha
  }

  /**
   * 获取代码差异
   */
  async getCodeDiffs(): Promise<CodeDiff[]> {
    try {
      if (!isNode) {
        consola.error('本地平台仅在Node.js环境中支持获取代码差异')
        return []
      }

      consola.info(`获取本地路径 ${this.path} 的代码差异`)

      let command: string

      if (this.commitSha) {
        // 获取特定提交的差异
        command = `git show --name-status ${this.commitSha}`
      }
      else {
        // 获取工作目录的差异（包括暂存区）
        command = 'git diff --name-status HEAD'
      }

      const { stdout } = await execAsync(command, { cwd: this.path })

      // 解析git输出获取修改的文件
      const files: { status: string, file: string }[] = []

      const lines = stdout.trim().split('\n')
      for (const line of lines) {
        // 修复正则表达式避免指数级回溯

        const match = line.match(/^([AMDRT])\s+(\S+)$/)
        if (match) {
          const [, status, file] = match
          files.push({ status, file })
        }
      }

      const diffs: CodeDiff[] = []

      for (const { status, file } of files) {
        // 跳过删除的文件
        if (status === 'D') {
          continue
        }

        try {
          let diffCommand: string

          if (this.commitSha) {
            diffCommand = `git show ${this.commitSha} -- ${file}`
          }
          else {
            diffCommand = `git diff HEAD -- ${file}`
          }

          const { stdout: diffOutput } = await execAsync(diffCommand, { cwd: this.path })

          // 获取文件内容
          const oldContent = ''
          const newContent = await this.getFileContent(file)

          diffs.push({
            oldPath: file,
            newPath: file,
            oldContent,
            newContent,
            diffContent: diffOutput,
            language: this.detectLanguage(file),
          })
        }
        catch (error) {
          consola.warn(`获取文件 ${file} 的差异时出错:`, error)
        }
      }

      return diffs
    }
    catch (error) {
      consola.error('获取本地代码差异时出错:', error)
      throw error
    }
  }

  /**
   * 提交审查评论
   * 在本地平台中，只是将评论输出到控制台
   */
  async submitReviewComment(filePath: string, line: number | undefined, comment: string): Promise<void> {
    // 使用更好的格式化输出单个文件的评论
    console.log(`\n${chalk.bgBlue.white(` 文件评论: ${filePath} `)}\n`)

    const lineInfo = line ? chalk.cyan(`[第 ${line} 行]`) : chalk.gray('[文件级评论]')
    console.log(`${lineInfo} ${comment}`)

    // 添加分隔线使输出更清晰
    console.log(`${chalk.dim('─'.repeat(80))}\n`)
  }

  /**
   * 提交审查总结
   * 在本地平台中，只是将总结输出到控制台
   */
  async submitReviewSummary(summary: string): Promise<void> {
    // 使用格式化工具美化总结输出
    const formattedSummary = OutputFormatter.formatSummary(summary)
    console.log(formattedSummary)
  }

  /**
   * 获取文件内容
   */
  private async getFileContent(filePath: string): Promise<string> {
    try {
      if (!isNode) {
        return ''
      }

      // 首先尝试从根目录读取文件
      const rootPath = process.cwd()
      const fullPath = resolve(this.path, filePath)

      try {
        return await readFile(fullPath, 'utf-8')
      }
      catch (error) {
        // 如果在指定目录下找不到文件，尝试从项目根目录读取
        if (this.path !== rootPath) {
          try {
            const rootFilePath = resolve(rootPath, filePath)
            return await readFile(rootFilePath, 'utf-8')
          }
          // eslint-disable-next-line unused-imports/no-unused-vars
          catch (innerError) {
            // 如果仍然找不到，抛出原始错误
            throw error
          }
        }
        else {
          throw error
        }
      }
    }
    catch (error) {
      consola.warn(`获取文件内容时出错: ${filePath}`, error)
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
      // 使用格式化工具美化输出结果
      const formattedOutput = OutputFormatter.formatReviewResults(results)
      console.log(formattedOutput)

      // 如果有单个文件的详细评论，也单独展示
      for (const result of results) {
        // 只有当问题数量大于0才输出单个文件的详细信息
        if (result.issues.length > 0) {
          consola.debug(`可以使用以下命令查看 ${result.file} 的详细问题：`)
          consola.debug(`ai-reviewer local --path ./${result.file}`)
        }
      }
    }
    catch (error) {
      consola.error('输出本地审查结果时出错:', error)
    }
  }
}
