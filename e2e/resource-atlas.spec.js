import { test, expect } from '@playwright/test'

const LOCAL_ORIGIN = 'http://127.0.0.1:5173'
const isLocalOrigin = url => new URL(url).origin === LOCAL_ORIGIN

test.beforeEach(async ({ page }) => {
  await page.goto('/#/')
  await expect(page.getByTestId('boot-layer')).toBeHidden({ timeout: 5_000 })
})

test('首页是工作手册而不是仪表盘', async ({ page }) => {
  await expect(page.getByRole('heading', { name: /开发者工作台/ })).toBeVisible()
  await expect(page.getByRole('navigation', { name: '章节目录' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '工具', exact: true })).toBeVisible()
  await expect(page.locator('body')).not.toContainText('SYSTEM ONLINE')
  await expect(page.locator('body')).not.toContainText('HEAP')
  await expect(page.locator('body')).not.toContainText('STORAGE')
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.locator('.manual-toc-toggle')).toBeVisible()
  await page.locator('.manual-toc-toggle').click()
  await expect(page.getByRole('navigation', { name: '章节目录' })).toBeHidden()
  await page.locator('.manual-toc-toggle').click()
  await expect(page.getByRole('navigation', { name: '章节目录' }).getByRole('link', { name: /今天继续/ })).toBeVisible()
  const nav = page.getByRole('navigation', { name: '主导航' })
  for (const name of ['首页', 'AI Hub', '工具', '导航', '收藏', '笔记']) {
    const link = nav.getByRole('link', { name })
    await expect(link).toBeVisible()
    const box = await link.boundingBox()
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(390)
  }
})

test('首页章节控制保持首页并滚动到真实章节', async ({ page }) => {
  const errors = []
  const failed = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('requestfailed', request => { if (isLocalOrigin(request.url())) failed.push(`${request.failure()?.errorText || 'request failed'} ${request.url()}`) })
  page.on('response', response => {
    const url = response.url()
    if (isLocalOrigin(url) && response.status() >= 400) failed.push(`${response.status()} ${url}`)
  })
  const chapters = [
    ['今天继续', 'today'],
    ['工具', 'tools'],
    ['网站', 'sites'],
    ['AI 资源', 'ai'],
    ['收藏', 'library'],
    ['笔记', 'notes'],
  ]

  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport)
    if (viewport.width < 768 && await page.locator('.manual-toc-wrap').getAttribute('open') === null) await page.locator('.manual-toc-toggle').click()
    for (const [label, id] of chapters) {
      await page.getByRole('navigation', { name: '章节目录' }).getByRole('link', { name: new RegExp(label) }).click()
      await expect(page).toHaveURL(/\/#\/$/)
      await expect(page.getByRole('heading', { name: '页面不存在' })).toHaveCount(0)
      await expect.poll(() => page.locator(`#${id} .manual-heading`).evaluate(element => {
        const { top, bottom } = element.getBoundingClientRect()
        return top >= 0 && bottom <= window.innerHeight
      })).toBeTruthy()
    }
  }
  expect(errors, errors.join('\n')).toEqual([])
  expect(failed, failed.join('\n')).toEqual([])
})

test('首页资源行显示 32px 标识与 AI 类型图标', async ({ page }) => {
  await expect(page.locator('#today .tool-card')).toHaveCount(3)
  await expect(page.locator('#today .tool-icon').first()).toBeVisible()
  for (const selector of ['#today .tool-icon', '#tools .tool-icon', '#sites .mark-tile', '#ai .mark-tile', '#library .mark-tile', '#notes .mark-tile']) {
    const marks = page.locator(selector)
    expect(await marks.count()).toBeGreaterThan(0)
    expect(await marks.evaluateAll(elements => elements.every(element => {
      const { width, height } = element.getBoundingClientRect()
      return width === 32 && height === 32 && element.getClientRects().length > 0
    }))).toBeTruthy()
  }
  const aiIcons = page.locator('#ai .resource-row .mark-tile svg')
  await expect(aiIcons).toHaveCount(4)
  expect(await aiIcons.evaluateAll(elements => elements.every(element => element.getClientRects().length > 0))).toBeTruthy()
  const favorite = page.locator('#today .favorite-button').first()
  if (await favorite.getAttribute('aria-pressed') === 'true') await favorite.click()
  await expect(favorite).toHaveAttribute('aria-pressed', 'false')
  await favorite.click()
  await expect(favorite).toHaveAttribute('aria-pressed', 'true')
  await expect(favorite).toHaveCSS('color', 'rgb(41, 151, 255)')
})

test('内容页说明和资源网格使用站点配置', async ({ page }) => {
  for (const [path, description] of [
    ['/tools', '集中查找、筛选并打开日常开发工具。'],
    ['/nav', '按开发场景整理常用网站与在线服务。'],
    ['/library', 'GitHub 仓库与 Agent Skill，链接在 Admin 里配置。'],
    ['/notes', '本地 Markdown 说明，在 Admin 里编辑后随站点发布。'],
    ['/ai', '按用途标签和资源类型定位 Skill、Agent、Prompt、模型配置与产品。'],
  ]) {
    await page.goto(`/#${path}`)
    await expect(page.getByText(description, { exact: true })).toBeVisible()
  }

  await page.goto('/#/nav')
  const navCards = page.locator('.nav-grid .nav-card')
  const first = await navCards.nth(0).boundingBox()
  const second = await navCards.nth(1).boundingBox()
  expect(Math.abs(first.y - second.y)).toBeLessThan(2)

  await page.goto('/#/library')
  const libraryCards = page.locator('.library-card')
  const libraryFirst = await libraryCards.nth(0).boundingBox()
  const librarySecond = await libraryCards.nth(1).boundingBox()
  expect(Math.abs(libraryFirst.y - librarySecond.y)).toBeLessThan(2)
})

test('AI Hub 用类型章节展示资源', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/#/ai')
  await expect(page.getByRole('region', { name: '资源概览' })).toBeVisible()
  for (const label of ['Skills', 'Agents', 'Prompts', '模型', '应用 / 产品']) {
    await expect(page.getByRole('region', { name: '资源概览' }).getByText(label, { exact: true })).toBeVisible()
  }
  await page.locator('.ai-resource-card', { has: page.getByRole('heading', { name: 'Code Review' }) }).click()
  await expect(page.getByRole('dialog', { name: 'Code Review' })).toBeVisible()
})

test('工具页用类别路线和目录行', async ({ page }) => {
  await page.goto('/#/tools')
  await expect(page.getByRole('heading', { name: /全部工具/ })).toBeVisible()
  await expect(page.getByRole('navigation', { name: '工具类别' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: '工具类别' }).getByRole('button', { name: /development/ })).toBeVisible()
  await expect(page.locator('.directory .tool-card').first()).toBeVisible()
})
