import cli from './cli'
import { isNode } from '../utils/env'

/**
 * 初始化CLI
 */
export function initCli() {
  if (!isNode) {
    console.warn('CLI功能仅在Node.js环境中可用')
    return
  }
  
  cli.run()
}

/**
 * 执行命令
 */
export function runCommand(command: string, options: Record<string, any> = {}) {
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
