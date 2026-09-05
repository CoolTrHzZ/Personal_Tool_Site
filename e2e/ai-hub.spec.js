import { test, expect } from '@playwright/test'

test('AI Hub 支持类型筛选、详情、复制和打开产品', async ({ page, context }) => {
  const errors = []
  const failed = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('response', response => { if (response.url().startsWith('http://127.0.0.1:5173/') && response.status() >= 400) failed.push(`${response.status()} ${response.url()}`) })
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await context.route('https://openai.com/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Codex</title>' }))
  await page.goto('/#/ai')
  await expect(page.getByRole('heading', { name: 'AI Hub' })).toBeVisible()
  for (const label of ['Skills', 'Agents', 'Prompts', '模型', '应用 / 产品']) await expect(page.getByRole('region', { name: '资源概览' }).getByText(label)).toBeVisible()
  await expect(page.getByRole('button', { name: /添加|编辑|删除/ })).toHaveCount(0)

  const search = page.getByLabel('搜索 AI 资源')
  await search.fill('private')
  await expect(page.getByRole('heading', { name: 'Local Model' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Code Review' })).toHaveCount(0)
  await search.fill('')
  await page.getByRole('tab', { name: 'Agents' }).click()
  await expect(page.getByRole('heading', { name: 'Frontend Builder' })).toBeVisible()
  for (const label of ['Skills', 'Prompts', '模型', '应用 / 产品']) await expect(page.getByRole('heading', { name: label, exact: true })).toHaveCount(0)
  await page.getByRole('tab', { name: '全部' }).click()

  const review = page.locator('.ai-resource-card', { has: page.getByRole('heading', { name: 'Code Review' }) })
  await page.evaluate(() => document.fonts.ready)
  const hoverBackground = await review.evaluate(card => {
    const probe = document.createElement('span')
    probe.style.color = 'var(--surface-overlay)'
    card.append(probe)
    const color = window.getComputedStyle(probe).color
    probe.remove()
    return color
  })
  await review.hover()
  await expect.poll(() => review.evaluate(card => window.getComputedStyle(card).backgroundColor)).toBe(hoverBackground)
  await review.click()
  const dialog = page.getByRole('dialog', { name: 'Code Review' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('heading', { name: 'Code Review' })).toBeVisible()
  await expect(dialog).toContainText(/暂无说明|Prioritize bugs/)
  await expect(dialog.locator('pre').first()).toBeVisible()
  const assertDialogViewport = async () => {
    const bounds = await dialog.boundingBox()
    const header = await page.locator('header.topbar').boundingBox()
    expect(bounds).toBeTruthy()
    expect(bounds.x).toBeGreaterThanOrEqual(0)
    expect(bounds.y).toBeGreaterThanOrEqual(header.y + header.height)
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(page.viewportSize().width)
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(page.viewportSize().height)
  }
  await assertDialogViewport()
  await page.evaluate(() => window.scrollTo(0, 400))
  await assertDialogViewport()
  await expect(dialog.getByRole('heading', { name: 'Code Review' })).toBeVisible()
  const detailText = await dialog.locator('pre').first().textContent()
  await dialog.getByRole('button', { name: '复制安装方式' }).click()
  await expect(dialog.getByRole('button', { name: '已复制', exact: true })).toBeVisible()
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(detailText || '')
  await page.setViewportSize({ width: 390, height: 760 })
  await assertDialogViewport()
  await expect(dialog.getByRole('heading', { name: 'Code Review' })).toBeVisible()
  await page.setViewportSize({ width: 1280, height: 720 })
  await assertDialogViewport()
  await expect(dialog.getByRole('heading', { name: 'Code Review' })).toBeVisible()
  await dialog.getByRole('button', { name: '关闭' }).click()

  await page.getByRole('tab', { name: '应用 / 产品' }).click()
  const product = page.locator('.ai-resource-card', { has: page.getByRole('heading', { name: 'OpenAI Codex' }) })
  const popupPromise = page.waitForEvent('popup')
  await product.getByRole('link', { name: '打开使用' }).click()
  await expect(await popupPromise).toHaveURL('https://openai.com/codex/')

  await page.setViewportSize({ width: 390, height: 760 })
  await expect(page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: 'AI Hub' })).toBeVisible()
  expect(errors, errors.join('\n')).toEqual([])
  expect(failed, failed.join('\n')).toEqual([])
})
