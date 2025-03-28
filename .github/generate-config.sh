#!/bin/bash

# AI代码审查配置文件生成脚本
# 用法: ./generate-config.sh [--output <配置文件路径>]

set -e

# 默认配置文件路径
OUTPUT_FILE=".aireviewrc.yml"

# 解析命令行参数
while [[ $# -gt 0 ]]; do
  case $1 in
    --output)
      OUTPUT_FILE="$2"
      shift 2
      ;;
    *)
      echo "未知参数: $1"
      echo "用法: ./generate-config.sh [--output <配置文件路径>]"
      exit 1
      ;;
  esac
done

echo "正在生成配置文件: $OUTPUT_FILE"

# 验证API密钥
if [ -z "$AI_REVIEWER_OPENAI_KEY" ]; then
  echo "错误: AI_REVIEWER_OPENAI_KEY 环境变量未设置"
  exit 1
fi

# 验证API密钥格式
if [[ ! "$AI_REVIEWER_OPENAI_KEY" =~ ^(sk-|sk-or-) ]]; then
  echo "错误: AI_REVIEWER_OPENAI_KEY 格式不正确"
  echo "API密钥应以sk-或sk-or-开头"
  echo "当前密钥前缀: ${AI_REVIEWER_OPENAI_KEY:0:5}..."
  exit 1
fi

# 创建配置文件
cat > "$OUTPUT_FILE" << EOF
ai:
  provider: 'openai'
  model: 'deepseek/deepseek-chat-v3-0324:free'
  apiKey: '${AI_REVIEWER_OPENAI_KEY}'
  baseUrl: 'https://openrouter.ai'
  temperature: '0.1'
  maxTokens: '4000'

platform:
  type: 'github'
  token: '${AI_REVIEWER_GITHUB_TOKEN}'
  url: 'https://api.github.com'

notifications:
  gitlab_comment: 'false'
  wecom:
    enabled: 'false'
    webhook: ''

review:
  prompts:
    system: |
      ${AI_REVIEWER_PROMPT_SYSTEM:-你是一个代码审查助手，擅长识别代码中的问题并提供改进建议。审核报告最后需要加上审核平台来自：https://github.com/h7ml/ai-code-reviewer AI Code Reviewer 的 workflow工作流}
    review: |
      ${AI_REVIEWER_PROMPT_REVIEW:-请审查此代码: {{filePath}}}
    summary: |
      ${AI_REVIEWER_PROMPT_SUMMARY:-请总结代码审查结果}
  ignoreFiles:
    - '*.lock'
    - 'package-lock.json'
    - '*.min.js'
  ignorePaths:
    - 'node_modules/'
    - 'dist/'
EOF

# 验证配置文件是否生成成功
if [ ! -f "$OUTPUT_FILE" ]; then
  echo "错误: 配置文件 $OUTPUT_FILE 未成功创建"
  exit 1
fi

# 检查文件大小确保有内容
file_size=$(stat -c%s "$OUTPUT_FILE" 2>/dev/null || stat -f%z "$OUTPUT_FILE")
if [ "$file_size" -lt 10 ]; then
  echo "错误: 配置文件 $OUTPUT_FILE 为空或几乎为空"
  exit 1
fi

# 验证API密钥是否正确写入
if ! grep -q "apiKey: '${AI_REVIEWER_OPENAI_KEY}'" "$OUTPUT_FILE"; then
  echo "错误: API密钥未正确写入配置文件"
  exit 1
fi

echo "配置文件 $OUTPUT_FILE 创建成功，大小: $file_size 字节"

# 可选: 输出配置文件前5行进行检查
# head -n 5 "$OUTPUT_FILE"

exit 0 
