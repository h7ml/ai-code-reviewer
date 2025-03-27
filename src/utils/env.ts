/**
 * 判断当前是否在Node.js环境
 */
export const isNode = typeof process !== 'undefined'
  && process.versions != null
  && process.versions.node != null

/**
 * 判断当前是否在浏览器环境
 */
export const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined'

/**
 * 判断当前是否在Web Worker环境
 */
export const isWebWorker = typeof self === 'object' && self.constructor && self.constructor.name === 'DedicatedWorkerGlobalScope'
