# AI Code Reviewer

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![License][license-src]][license-href]

一个用于GitLab/GitHub或通用代码托管平台的自动化代码审查工具，旨在提升代码质量，提供智能反馈，并通过灵活配置实现高效的审查流程。

## 特性

- 🤖 **自动代码审查**: 对合并请求和提交进行自动化审查，提供差异分析
- 🧠 **智能反馈**: 通过AI模型提供代码质量评估、最佳实践建议和性能优化建议
- 🔔 **通知集成**: 支持通过GitLab评论和企业微信进行通知
- ⚙️ **灵活配置**: 支持多种AI模型和自定义审查规则，管理配置优先级

## 安装

```bash
# 全局安装
npm install -g ai-code-reviewer

# 或使用pnpm
pnpm add -g ai-code-reviewer

# 或使用yarn
yarn global add ai-code-reviewer
```

## 配置

在项目根目录创建 `.aireviewrc.yml` 文件：

```yaml
# AI模型配置
ai:
  provider: openai # 或 ollama
  model: gpt-4 # 或其他模型

# 平台配置
platform:
  type: gitlab # 或 github
  token: YOUR_TOKEN

# 通知配置
notifications:
  gitlab_comment: true
  wecom:
    enabled: false
    webhook: YOUR_WEBHOOK_URL
```

或使用环境变量：

```bash
export AI_REVIEWER_OPENAI_KEY=your_openai_key
export AI_REVIEWER_GITLAB_TOKEN=your_gitlab_token
```

## 使用方法

### CLI命令

```bash
# 审查GitLab合并请求
ai-review gitlab-mr --project-id 123 --mr-id 456

# 审查GitHub拉取请求
ai-review github-pr --owner user --repo project --pr-id 123

# 审查本地代码
ai-review local --path ./src
```

## 许可证

[MIT](./LICENSE) License

<!-- Badges -->
[npm-version-src]: https://img.shields.io/npm/v/ai-code-reviewer?style=flat&colorA=080f12&colorB=1fa669
[npm-version-href]: https://npmjs.com/package/ai-code-reviewer
[npm-downloads-src]: https://img.shields.io/npm/dm/ai-code-reviewer?style=flat&colorA=080f12&colorB=1fa669
[npm-downloads-href]: https://npmjs.com/package/ai-code-reviewer
[license-src]: https://img.shields.io/github/license/ai-code-reviewer/ai-code-reviewer.svg?style=flat&colorA=080f12&colorB=1fa669
[license-href]: https://github.com/ai-code-reviewer/ai-code-reviewer/blob/main/LICENSE
