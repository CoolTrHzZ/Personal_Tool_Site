import { defineConfig } from 'vitest/config'

// v3.0.1 四十一：jsdom 真实 DOM 单测 —— admin.js 是原生 JS，
// div.elements 这类问题只有真实 DOM 测试能兜住。
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.js'],
  },
})
