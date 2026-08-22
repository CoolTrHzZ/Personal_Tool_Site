import { defineConfig } from '@playwright/test'

// v3.0.1 四十二：E2E 走真实 admin server，覆盖 拖入 → 6 步 → 导入 全链路。
// 前台动效旅程走 Vite :5173。
// 首次运行前需执行：npx playwright install chromium
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  webServer: [
    {
      command: 'npm run admin',
      url: 'http://127.0.0.1:4174/admin/',
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command: 'npx vite --host 127.0.0.1 --port 5173 --strictPort',
      url: 'http://127.0.0.1:5173/',
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
  projects: [
    { name: 'admin', use: { browserName: 'chromium', baseURL: 'http://127.0.0.1:4174' }, testIgnore: /workspace-motion/ },
    { name: 'workspace', use: { browserName: 'chromium', baseURL: 'http://127.0.0.1:5173' }, testMatch: /workspace-motion/ },
  ],
})
