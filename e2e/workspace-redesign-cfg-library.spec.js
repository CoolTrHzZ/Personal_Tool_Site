import { test, expect } from '@playwright/test'
import { Buffer } from 'node:buffer'
import { readFile } from 'node:fs/promises'

const first = { id: '11111111-1111-4111-8111-111111111111', name: '日常手感', filename: '我的日常.cfg', description: '灵敏度、语音与常用按键。', category: '日常', tags: ['常用', '语音'], updated: '2026-09-05', order: 10 }
const second = { id: '22222222-2222-4222-8222-222222222222', name: '社区服配置', filename: 'community.cfg', description: '社区服常用操作。', category: '社区服', tags: ['社区服'], updated: '2026-09-01', order: 20 }
const content = '\ufeff// 中文 🎯\r\nbind "SPACE" "+jump"\r\nbind x say \u0006社区\u0007ffffff彩字\u000b保留\u000e原文\u0010\r\necho "<script>window.pwned=1</script>"\r\n'

test.beforeEach(async ({ context }) => {
  await context.route('**/src/data/cfgs.json*', route => route.fulfill({ contentType: 'text/javascript', body: `export default ${JSON.stringify([first, second])}` }))
  await context.route(`**/cfgs/${first.id}.cfg`, route => route.fulfill({ contentType: 'text/plain;charset=utf-8', body: Buffer.from(content) }))
  await context.route(`**/cfgs/${second.id}.cfg`, route => route.fulfill({ contentType: 'text/plain;charset=utf-8', body: 'echo community\n' }))
})

test('CFG 配置库有独立导航，支持筛选、原文预览、复制页面链接和精确下载', async ({ page, context }, testInfo) => {
  await page.goto('/#/cfg')
  await expect(page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: 'CFG 库', exact: true })).toHaveClass(/active/)
  await expect(page.locator('.cfg-library-card')).toHaveCount(2)
  await page.getByRole('textbox', { name: '搜索 CFG 配置' }).fill('语音')
  await expect(page.locator('.cfg-library-card')).toHaveCount(1)
  await page.getByRole('textbox', { name: '搜索 CFG 配置' }).fill('')
  await page.getByRole('navigation', { name: 'CFG 分类' }).getByRole('button', { name: '社区服', exact: true }).click()
  await expect(page.locator('.cfg-library-card')).toHaveCount(1)
  await expect(page.locator('.cfg-library-card')).toContainText(second.name)
  await page.getByRole('navigation', { name: 'CFG 分类' }).getByRole('button', { name: /全部/ }).click()
  await page.getByRole('combobox', { name: 'CFG 排序' }).selectOption('updated')
  await expect(page.locator('.route-stage')).toHaveCSS('opacity', '1')
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: testInfo.outputPath('cfg-library-desktop.png'), fullPage: true })
  await page.locator('.cfg-library-card').filter({ hasText: first.name }).getByRole('link', { name: /预览内容/ }).click()
  await expect(page).toHaveURL(new RegExp(`/#/cfg/${first.id}\\?sort=updated$`))
  await expect(page.locator('.cfg-library-code')).toContainText('中文 🎯')
  expect(await page.locator('.cfg-library-code code').textContent()).toBe(content)
  expect(await page.evaluate(() => window.pwned)).toBeUndefined()
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.getByRole('button', { name: '复制页面链接' }).click()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`${page.url().split('#')[0]}#/cfg/${first.id}`)
  const downloadEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: '下载 CFG', exact: true }).click()
  const download = await downloadEvent
  expect(download.suggestedFilename()).toBe(first.filename)
  expect(await readFile(await download.path(), 'utf8')).toBe(content)
  await page.reload()
  await expect(page.locator('.cfg-library-code')).toContainText('中文 🎯')
  await page.getByRole('link', { name: '返回 CFG 配置库' }).click()
  await expect(page.getByRole('combobox', { name: 'CFG 排序' })).toHaveValue('updated')
  await page.getByRole('button', { name: '打开命令面板', exact: true }).click()
  await page.getByRole('combobox', { name: '命令面板搜索' }).fill(first.name)
  await page.getByRole('option', { name: new RegExp(first.name) }).click()
  await expect(page.getByRole('heading', { name: first.name, exact: true })).toBeVisible()
})

test('CFG 库在手机可浏览和下载，空结果、缺失详情与文件失败有反馈', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/#/cfg')
  await expect(page.locator('.cfg-library-card')).toHaveCount(2)
  await page.getByRole('textbox', { name: '搜索 CFG 配置' }).fill('no-result-123')
  await expect(page.getByRole('heading', { name: '没有找到匹配的配置' })).toBeVisible()
  await page.getByRole('button', { name: '查看全部配置' }).click()
  await expect(page.locator('.cfg-library-card')).toHaveCount(2)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await expect(page.locator('.route-stage')).toHaveCSS('opacity', '1')
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: testInfo.outputPath('cfg-library-mobile.png'), fullPage: true })
  let attempt = 0
  await page.route(`**/cfgs/${first.id}.cfg`, route => route.fulfill(++attempt === 1 ? { status: 404, body: 'missing' } : { contentType: 'text/plain', body: Buffer.from(content) }))
  await page.getByRole('link', { name: new RegExp(first.name) }).click()
  await expect(page.getByRole('alert')).toContainText('暂时无法读取')
  await expect(page.getByRole('button', { name: '下载 CFG', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: '重新读取' }).click()
  await expect(page.locator('.cfg-library-code')).toContainText('中文 🎯')
  await expect(page.getByRole('button', { name: '下载 CFG', exact: true })).toBeEnabled()
  await expect(page.locator('.route-stage')).toHaveCSS('opacity', '1')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('cfg-detail-mobile.png'), fullPage: true })
  await page.goto('/#/cfg/not-a-file')
  await expect(page.getByRole('heading', { name: '这份 CFG 已移除或不存在' })).toBeVisible()
  await expect(page.getByRole('link', { name: '返回 CFG 配置库' })).toBeVisible()
})
