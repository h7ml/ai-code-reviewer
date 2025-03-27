/**
 * 语言映射工具
 * 提供统一的文件扩展名到语言名称的映射
 */

/**
 * 文件扩展名到编程语言的映射
 * 按类别分组以提高可读性和维护性
 */
export const languageMap: Record<string, string> = {
  // JavaScript相关
  js: 'javascript',
  jsx: 'javascript',

  // TypeScript相关
  ts: 'typescript',
  tsx: 'typescript',

  // 其他前端技术
  vue: 'vue',
  html: 'html',
  css: 'css',
  scss: 'scss',
  sass: 'sass',
  less: 'less',

  // 后端语言
  py: 'python',
  rb: 'ruby',
  php: 'php',
  java: 'java',
  go: 'go',
  cs: 'csharp',

  // C/C++相关
  cpp: 'cpp',
  c: 'c',
  h: 'c',
  hpp: 'cpp',

  // 其他语言
  rs: 'rust',
  swift: 'swift',
  kt: 'kotlin',
  scala: 'scala',
  dart: 'dart',

  // 数据和配置文件
  md: 'markdown',
  json: 'json',
  yml: 'yaml',
  yaml: 'yaml',
  xml: 'xml',
  sql: 'sql',

  // Shell相关
  sh: 'shell',
  bash: 'shell',
}

/**
 * 用于UI显示的编程语言映射
 * 使用更友好的显示名称，首字母大写
 */
export const displayLanguageMap: Record<string, string> = {
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  vue: 'Vue',
  html: 'HTML',
  css: 'CSS',
  scss: 'SCSS',
  sass: 'Sass',
  less: 'Less',
  python: 'Python',
  ruby: 'Ruby',
  php: 'PHP',
  java: 'Java',
  go: 'Go',
  csharp: 'C#',
  cpp: 'C++',
  c: 'C',
  rust: 'Rust',
  swift: 'Swift',
  kotlin: 'Kotlin',
  scala: 'Scala',
  dart: 'Dart',
  markdown: 'Markdown',
  json: 'JSON',
  yaml: 'YAML',
  xml: 'XML',
  sql: 'SQL',
  shell: 'Shell',
}

/**
 * 根据文件路径检测编程语言
 * @param filePath 文件路径
 * @returns 检测到的语言标识符，如不能识别则返回undefined
 */
export function detectLanguage(filePath: string): string | undefined {
  const ext = filePath.split('.').pop()?.toLowerCase()
  if (!ext)
    return undefined
  return languageMap[ext]
}

/**
 * 获取语言的显示名称
 * @param language 语言标识符
 * @returns 用于显示的语言名称
 */
export function getDisplayLanguage(language: string): string {
  return displayLanguageMap[language] || language
}
