import { test, expect } from '@playwright/test'

const TOOL_ID = 'community-rainbow-chat-generator-v4-unicode-fix'

test('静态工具全屏后 iframe 铺满视口剩余区域', async ({ page }) => {
  const errors = []
  const failed = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('response', response => {
    const url = response.url()
    if (url.startsWith('http://127.0.0.1:5173/') && response.status() >= 400) failed.push(`${response.status()} ${url}`)
  })
  await page.goto(`/#/tools/${TOOL_ID}`)
  await expect.poll(async () => {
    const response = await page.request.get('/tools-manifests.json')
    if (!response.ok()) return false
    const list = await response.json()
    return Array.isArray(list) && list.some(item => item.id === TOOL_ID)
  }).toBe(true)
  const boot = page.getByTestId('boot-layer')
  if (await boot.count()) await expect(boot).toBeHidden({ timeout: 5_000 })
  const overlay = page.getByTestId('tool-fullscreen')
  const heading = page.getByRole('heading', { name: /彩虹聊天/ })
  await expect(heading.or(overlay)).toBeVisible({ timeout: 15_000 })
  if (!(await overlay.isVisible())) {
    await page.getByRole('button', { name: '全屏模式' }).click()
  }
  await expect(overlay).toBeVisible()
  const viewport = page.viewportSize()
  const overlayBox = await overlay.boundingBox()
  const frameBox = await overlay.getByTestId('tool-frame').boundingBox()
  expect(overlayBox, 'fullscreen overlay missing box').toBeTruthy()
  expect(frameBox, 'tool iframe missing box').toBeTruthy()
  expect(overlayBox.y).toBeLessThanOrEqual(1)
  expect(overlayBox.height).toBeGreaterThan((viewport?.height || 720) - 8)
  expect(frameBox.height).toBeGreaterThan(400)
  expect(frameBox.y + frameBox.height).toBeGreaterThan((viewport?.height || 720) - 8)
  expect(errors, errors.join('\n')).toEqual([])
  expect(failed, failed.join('\n')).toEqual([])
})
