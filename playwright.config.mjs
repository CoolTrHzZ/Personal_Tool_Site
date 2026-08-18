import { defineConfig } from '@playwright/test'

// v3.0.1 四十二：E2E 走真实 admin server，覆盖 拖入 → 6 步 → 导入 全链路。
// 首次运行前需执行：npx playwright install chromium
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4174' },
  webServer: {
    command: 'npm run admin',
    url: 'http://127.0.0.1:4174/admin/',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
})
