import { consola } from 'consola'
import { loadConfig } from '../config/config'
import { CodeReviewer } from '../core/reviewer'
import { isNode } from '../utils/env'
import cli from './cli'

/**
 * 初始化CLI
 */
export function initCli(): void {
  if (!isNode) {
    console.warn('CLI功能仅在Node.js环境中可用')
    return
  }

  cli.run()
}

/**
 * 执行命令
 */
export function runCommand(command: string, options: Record<string, any> = {}): Promise<void> {
  if (!isNode) {
    console.warn('命令执行功能仅在Node.js环境中可用')
    return Promise.reject(new Error('不支持的环境'))
  }

  // 构造参数数组
  const args = [command]

  // 添加选项
  for (const [key, value] of Object.entries(options)) {
    if (value === true) {
      args.push(`--${key}`)
    }
    else if (value !== false && value != null) {
      args.push(`--${key}`, String(value))
    }
  }

  // 设置命令行参数并执行
  process.argv = [process.argv[0], process.argv[1], ...args]
  return new Promise<void>((resolve, reject) => {
    try {
      cli.run()
      resolve()
    }
    catch (error) {
      reject(error)
    }
  })
}

/**
 * 审查GitLab合并请求
 */
export async function reviewGitlabMR(projectId: string, mrId: string, configPath?: string): Promise<void> {
  try {
    consola.info(`开始审查GitLab项目 ${projectId} 的合并请求 ${mrId}`)

    const config = await loadConfig(configPath, {
      platform: {
        type: 'gitlab',
      },
    })

    const reviewer = new CodeReviewer({
      config,
      projectId,
      mergeRequestId: mrId,
    })

    await reviewer.review()
  }
  catch (error) {
    consola.error('审查GitLab合并请求时出错:', error)
    throw error
  }
}

/**
 * 审查本地代码
 */
export async function reviewLocalCode(path = process.cwd(), commitSha?: string, configPath?: string): Promise<void> {
  try {
    consola.info(`开始审查本地代码: ${path}${commitSha ? `, 提交: ${commitSha}` : ''}`)

    const config = await loadConfig(configPath, {
      platform: {
        type: 'local',
      },
    })

    const reviewer = new CodeReviewer({
      config,
      path,
      commitSha,
    })

    await reviewer.review()
  }
  catch (error) {
    consola.error('审查本地代码时出错:', error)
    throw error
  }
}
