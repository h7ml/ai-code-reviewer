#!/usr/bin/env node
import { initCli } from './cli/commands'
import { version } from '../package.json'

// 设置进程标题
process.title = 'ai-review'

// 输出版本信息到调试日志
console.debug(`AI Code Reviewer v${version}`)

// 执行CLI
initCli() 
