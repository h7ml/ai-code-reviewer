import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import * as os from 'node:os'
import { existsSync } from 'node:fs'
import { consola } from 'consola'
import type { ReviewResult } from '../core/reviewer'

/**
 * 临时文件管理工具
 */
export class TempFileManager {
  private tempDir: string

  constructor() {
    // 使用系统临时目录下的ai-code-reviewer子目录
    this.tempDir = resolve(os.tmpdir(), 'ai-code-reviewer')
  }

  /**
   * 确保临时目录存在
   */
  private async ensureTempDir(): Promise<void> {
    if (!existsSync(this.tempDir)) {
      await mkdir(this.tempDir, { recursive: true })
    }
  }

  /**
   * 保存审查结果到临时文件
   */
  async saveReviewResults(results: ReviewResult[]): Promise<string> {
    await this.ensureTempDir()

    const timestamp = new Date().getTime()
    const filePath = resolve(this.tempDir, `review-results-${timestamp}.json`)

    await writeFile(filePath, JSON.stringify(results, null, 2), 'utf-8')
    consola.debug(`审查结果已保存到临时文件: ${filePath}`)

    return filePath
  }

  /**
   * 保存审查总结到临时文件
   */
  async saveSummary(summary: string): Promise<string> {
    await this.ensureTempDir()

    const timestamp = new Date().getTime()
    const filePath = resolve(this.tempDir, `review-summary-${timestamp}.md`)

    await writeFile(filePath, summary, 'utf-8')
    consola.debug(`审查总结已保存到临时文件: ${filePath}`)

    return filePath
  }

  /**
   * 从临时文件读取审查结果
   */
  async readReviewResults(filePath: string): Promise<ReviewResult[]> {
    const content = await readFile(filePath, 'utf-8')
    return JSON.parse(content) as ReviewResult[]
  }

  /**
   * 从临时文件读取审查总结
   */
  async readSummary(filePath: string): Promise<string> {
    return await readFile(filePath, 'utf-8')
  }
}
