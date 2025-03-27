import { globSync } from 'fast-glob'
import { defineBuildConfig } from 'unbuild'

// 自动匹配 src 下所有入口文件（如 .ts、.vue 等）
const entries = globSync(['src/**/*.{ts,js,vue}'], {
  ignore: ['**/*.d.ts', '**/*.test.*'], // 忽略类型文件和测试文件
}).map(file => ({
  input: file.slice(0, -3), // 去掉 .ts/.js 后缀
  outDir: 'dist', // 输出到 dist，保持 src 的目录结构
}))

export default defineBuildConfig({
  entries, // 动态生成的入口
  declaration: true, // 生成 .d.ts
  rollup: {
    emitCJS: false,
  },
  failOnWarn: false,
})
