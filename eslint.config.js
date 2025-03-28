// @ts-check
import antfu from '@antfu/eslint-config'

export default antfu(
  {
    type: 'lib',
    pnpm: true,
    // 启用缓存，加快lint速度
    cache: true,
    cacheLocation: '.eslintcache', // 缓存文件位置
    cacheStrategy: 'content', // 使用内容缓存策略，更准确
    rules: {
      // 禁用超线性回溯检查
      'regexp/no-super-linear-backtracking': 'off',

      // 允许直接使用process而不是require("process")
      'node/prefer-global/process': 'off',

      // 允许未使用的变量（特别是函数参数）
      'unused-imports/no-unused-vars': 'warn',

      // 允许使用self
      'no-restricted-globals': 'off',

      // 导入问题
      'import/no-duplicates': 'warn',

      // 允许缺少函数返回类型
      'ts/explicit-function-return-type': 'warn',

      // 允许console
      'no-console': 'off',
    },
    ignores: [
      // 忽略YAML文件
      '**/*.yml',
      '**/*.yaml',
      'pnpm-workspace.yaml',

      // 忽略特定目录
      '.specstory',
      '.specstory/**',
      'dist',
      'dist/**',
      'node_modules',
      'node_modules/**',

      // 忽略项目历史文件
      '.git/**',
      '.github/**',
      '.vscode/**',

      // 忽略构建产物
      'build/**',
      'coverage/**',
    ],
  },
)
