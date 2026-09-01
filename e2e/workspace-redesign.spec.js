import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/#/')
  await expect(page.getByTestId('boot-layer')).toBeHidden({ timeout: 5_000 })
})

test('首页与 390px 导航完整可用', async ({ page }) => {
  await expect(page.getByRole('heading', { name: /开发者工作台/ })).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  const nav = page.getByRole('navigation', { name: '主导航' })
  for (const name of ['首页', 'AI Hub', '工具', '导航', '收藏', '笔记']) {
    const link = nav.getByRole('link', { name })
    await expect(link).toBeVisible()
    const box = await link.boundingBox()
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(390)
  }
})

test('命令面板与主题选择可用', async ({ page }) => {
  await expect(page.locator('.brand-mark .brand-symbol')).toHaveAttribute('src', '/favicon.svg')
  expect(await page.locator('.brand-mark .brand-symbol').evaluate(image => image.naturalWidth)).toBeGreaterThan(0)
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', '/favicon.svg')
  await expect(page.locator('footer')).toHaveText('DevOS · Personal Developer Workspace')
  await expect(page.locator('.letter-icon').first()).toHaveCSS('color', 'rgb(41, 151, 255)')
  await expect(page.locator('.letter-icon').first()).toHaveCSS('background-color', 'rgba(41, 151, 255, 0.14)')
  await page.getByRole('button', { name: '打开命令面板' }).first().click()
  await expect(page.getByRole('dialog', { name: '命令面板' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: '命令面板' })).toHaveCount(0)
  const theme = page.getByRole('combobox', { name: '选择主题' })
  await theme.selectOption('light')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await expect(page.locator('.brand-mark .brand-symbol')).toHaveAttribute('src', '/favicon.svg')
  await expect(page.locator('.letter-icon').first()).toHaveCSS('color', 'rgb(0, 113, 227)')
  await expect(page.locator('.letter-icon').first()).toHaveCSS('background-color', 'rgba(0, 113, 227, 0.12)')
  await theme.selectOption('dark')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})

test('首页工具收藏状态可持久化', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('favoriteTools', '[]'))
  await page.reload()
  await expect(page.getByTestId('boot-layer')).toBeHidden({ timeout: 5_000 })

  const firstToolCard = page.locator('.tool-card').first()
  const favoriteButton = firstToolCard.getByRole('button', { name: '收藏工具' })
  if (await favoriteButton.count()) {
    await favoriteButton.click()
  } else {
    await firstToolCard.getByRole('button', { name: '取消收藏' }).click()
    await firstToolCard.getByRole('button', { name: '收藏工具' }).click()
  }

  const toolPath = await firstToolCard.locator('a.tool-card-link').getAttribute('href')
  const toolId = toolPath?.split('/').filter(Boolean).pop()
  expect(toolId).toBeTruthy()
  await expect(firstToolCard.getByRole('button', { name: '取消收藏' })).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('favoriteTools') || '[]'))).toContain(toolId)

  await page.reload()
  await expect(page.getByTestId('boot-layer')).toBeHidden({ timeout: 5_000 })
  await expect(page.locator('.tool-card').first().getByRole('button', { name: '取消收藏' })).toHaveAttribute('aria-pressed', 'true')
})

test('收藏页面与 JSON 工具流程可用', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/#/library')
  await expect(page).toHaveURL(/#\/library/)
  await page.goto('/#/tools/json')
  await expect(page.getByRole('heading', { name: 'JSON 格式化' })).toBeVisible()
  await page.getByRole('button', { name: '格式化' }).click()
  await expect(page.locator('textarea').nth(1)).toHaveValue('{\n  "hello": "world"\n}')
  const copyButton = page.getByRole('button', { name: '复制结果' })
  await expect(copyButton).toBeVisible()
  await expect(copyButton).toBeEnabled()
  await copyButton.click()
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain('hello')

  await page.getByRole('button', { name: '压缩' }).click()
  await expect(page.locator('textarea').nth(1)).toHaveValue('{"hello":"world"}')
  await page.getByRole('button', { name: '清空' }).click()
  await expect(page.locator('textarea').first()).toHaveValue('')
  await expect(page.locator('textarea')).toHaveCount(1)
  await page.locator('textarea').first().fill('{invalid')
  await page.getByRole('button', { name: '格式化' }).click()
  await expect(page.locator('.error')).toBeVisible()
})
