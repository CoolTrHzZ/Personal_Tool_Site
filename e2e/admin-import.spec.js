import { test, expect } from '@playwright/test'

// v3.0.1 四十二/四十三：CS2 HTML 走完整 6 步导入 —— 以后再改 Wizard，这条链路坏了会立刻暴露。
const TOOL_ID = 'cs2-rainbow-e2e'

test('HTML 工具：拖入 → 识别 → 元数据 → 权限 → 兼容性 → 预览 → 导入', async ({ page, request }) => {
  // 清理上次运行残留（覆盖勾选兜底之外的双重保险）
  await request.delete(`/api/tools/${TOOL_ID}`).catch(() => {})

  await page.goto('/admin/')
  await page.click('.nav-item[data-view="tools"]')

  // Step 1 识别：上传 fixture HTML
  await page.setInputFiles('#tool-file-input', 'tests/fixtures/tools/cs2-rainbow.html')
  await expect(page.locator('#wizard')).toBeVisible()
  await expect(page.locator('#wizard-body')).toContainText('CS2 Rainbow Chat')
  await page.click('#wizard-next')

  // Step 2 元数据：固定 id 保证用例可重复执行
  await expect(page.locator('#wizard-body input[name="id"]')).toBeVisible()
  await page.fill('#wizard-body input[name="id"]', TOOL_ID)
  await page.click('#wizard-next')

  // Step 3 权限（P0 回归点：form 化后 .elements 可用，能正常进入下一步）
  const permForm = page.locator('#wizard-body form.perm-grid')
  await expect(permForm).toBeVisible()
  await expect(page.locator('#wizard-body .perm-group')).toHaveCount(3)
  await page.check('#wizard-body [name="perm.clipboard"]')
  await page.click('#wizard-next')

  // Step 4 兼容性：fixture 使用了 clipboard，应出现对应提示
  await expect(page.locator('#wizard-body')).toContainText('剪贴板')
  await page.click('#wizard-next')

  // Step 5 预览：选择全屏载入，必须写入即将导入的 manifest
  const frame = page.locator('.wizard-preview-frame iframe')
  await expect(frame).toBeVisible()
  await page.locator('#wizard-body select[name="display.mode"]').selectOption('fullscreen')
  await page.click('#wizard-next')

  // Step 6 确认导入
  await expect(page.locator('#wizard-body')).toContainText(TOOL_ID)
  await page.click('#wizard-next')

  // 导入成功：表格出现工具，manifest 静态可访问，API 可查
  await expect(page.locator('#tools')).toContainText(TOOL_ID, { timeout: 15_000 })
  const manifestResponse = await request.get(`/tools/${TOOL_ID}/manifest.json`)
  expect(manifestResponse.ok()).toBeTruthy()
  const manifest = await manifestResponse.json()
  expect(manifest.id).toBe(TOOL_ID)
  expect(manifest.permissions.clipboard).toBe(true)
  expect(manifest.display.mode).toBe('fullscreen')
  await expect(page.locator('#tools tr', { hasText: TOOL_ID }).getByRole('switch')).toHaveAttribute('aria-checked', 'true')

  const listResponse = await request.get('/api/tools')
  expect(listResponse.ok()).toBeTruthy()
  const tools = await listResponse.json()
  expect(Array.isArray(tools)).toBe(true)
  expect(tools.some(item => item.id === TOOL_ID)).toBe(true)
  await request.delete(`/api/tools/${TOOL_ID}`)
})

test('staging 目录不会出现在正式静态路径', async ({ request }) => {
  const staging = await request.get('/tools/.staging')
  expect(staging.status()).toBe(404)
})
