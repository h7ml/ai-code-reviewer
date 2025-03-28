#!/usr/bin/env node
/* eslint-disable node/prefer-global/process */
/* eslint-disable no-console */
/**
 * AI代码审查配置文件生成脚本 (Node.js版本)
 *
 * 用法:
 * node generate-config.js [--output <配置文件路径>]
 */

const fs = require('node:fs')
const path = require('node:path')
const yaml = require('yaml')

// 解析命令行参数
function parseArgs() {
  const args = process.argv.slice(2)
  const params = { output: '.aireviewrc.yml' }

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--output' && i + 1 < args.length) {
      params.output = args[i + 1]
      i++
    }
  }

  return params
}

// 构建配置对象
function buildConfig() {
  return {
    ai: {
      provider: process.env.AI_REVIEWER_PROVIDER || 'openai',
      model: process.env.AI_REVIEWER_MODEL || 'gpt-3.5-turbo',
      apiKey: process.env.AI_REVIEWER_OPENAI_KEY || '',
      baseUrl: process.env.AI_REVIEWER_BASE_URL || 'https://api.openai.com/v1',
      temperature: Number.parseFloat(process.env.AI_REVIEWER_TEMPERATURE || '0.1'),
      maxTokens: Number.parseInt(process.env.AI_REVIEWER_MAX_TOKENS || '4000', 10),
    },
    platform: {
      type: process.env.AI_REVIEWER_PLATFORM_TYPE || 'github',
      token: process.env.GITHUB_TOKEN || process.env.AI_REVIEWER_PLATFORM_TOKEN || '',
      url: process.env.AI_REVIEWER_PLATFORM_URL || '',
    },
    notifications: {
      gitlab_comment: process.env.AI_REVIEWER_GITLAB_COMMENT === 'true',
      wecom: {
        enabled: process.env.WECOM_ENABLED === 'true',
        webhook: process.env.WECOM_WEBHOOK || '',
      },
    },
    review: {
      prompts: {
        system: process.env.AI_REVIEWER_PROMPT_SYSTEM
          || '你是一个代码审查助手，擅长识别代码中的问题并提供改进建议。审核报告最后需要加上审核平台来自：https://github.com/h7ml/ai-code-reviewer AI Code Reviewer 的 workflow工作流',
        review: process.env.AI_REVIEWER_PROMPT_REVIEW
          || '请审查此代码: {{filePath}}',
        summary: process.env.AI_REVIEWER_PROMPT_SUMMARY
          || '请总结代码审查结果',
      },
      ignoreFiles: [
        '*.lock',
        'package-lock.json',
        '*.min.js',
      ],
      ignorePaths: [
        'node_modules/',
        'dist/',
      ],
    },
  }
}

// 生成配置文件
function generateConfig() {
  const args = parseArgs()
  const outputFile = args.output

  console.log(`正在生成配置文件: ${outputFile}`)

  try {
    // 构建配置对象
    const config = buildConfig()

    // 转换为YAML格式
    const yamlContent = yaml.stringify(config)

    // 确保输出目录存在
    const outputDir = path.dirname(outputFile)
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true })
    }

    // 写入文件
    fs.writeFileSync(outputFile, yamlContent, 'utf8')

    // 验证文件是否写入成功
    if (!fs.existsSync(outputFile)) {
      console.error(`错误: 配置文件 ${outputFile} 未成功创建`)
      process.exit(1)
    }

    const stats = fs.statSync(outputFile)
    if (stats.size < 10) {
      console.error(`错误: 配置文件 ${outputFile} 为空或几乎为空`)
      process.exit(1)
    }

    console.log(`配置文件 ${outputFile} 创建成功，大小: ${stats.size} 字节`)

    // 可选: 输出配置文件内容
    // console.log('配置内容预览:');
    // console.log(yamlContent.split('\n').slice(0, 5).join('\n'));
  }
  catch (error) {
    console.error(`生成配置文件时出错: ${error.message}`)
    process.exit(1)
  }
}

// 执行主函数
generateConfig()
