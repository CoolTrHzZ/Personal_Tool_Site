import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { Buffer } from 'node:buffer'

const first = { id: '11111111-1111-4111-8111-111111111111', name: '日常配置', filename: 'autoexec.cfg', category: '日常', description: '日常配置说明', tags: ['CS2'], updated: '2026-09-05', order: 1, version: 2, changelog: '更新绑定', history: [{ id: '22222222-2222-4222-8222-222222222222', version: 1, filename: 'autoexec.cfg', updated: '2026-09-04', changelog: '最初版本' }] }
const second = { id: '33333333-3333-4333-8333-333333333333', name: '训练配置', filename: 'training.cfg', category: '训练', description: '训练设置', tags: [], updated: '2026-09-05', order: 2, version: 1, history: [] }
const current = '\ufeff// 中文配置\r\nexec training\r\nexec missing\r\nbind SPACE +duck\r\nbind x say \u0006社区\u0007ffffff彩字\u000b保留\u000e原文\u0010\r\n'
const previous = '\ufeff// 旧版本\r\nbind SPACE +jump\r\nbind x say \u0010旧版\u000b\r\n'
test.beforeEach(async ({ page }) => {
  await page.route('**/src/data/cfgs.json*', route => route.fulfill({ contentType: 'text/javascript', body: `export default ${JSON.stringify([first, second])}` }))
  await page.route(`**/cfgs/${first.id}.cfg`, route => route.fulfill({ contentType: 'text/plain', body: current }))
  await page.route(`**/cfgs/${first.id}.${first.history[0].id}.cfg`, route => route.fulfill({ contentType: 'text/plain', body: previous }))
  await page.route(`**/cfgs/${second.id}.cfg`, route => route.fulfill({ contentType: 'text/plain', body: 'echo training\n' }))
})

test('CFG历史预览、对比和下载保留版本；返回列表保留筛选和排序', async ({ page }, testInfo) => {
  await page.goto('/#/cfg')
  await page.getByRole('textbox', { name: '搜索 CFG 配置' }).fill('日常')
  await page.getByRole('navigation', { name: 'CFG 分类' }).getByRole('button', { name: '日常', exact: true }).click()
  await page.getByRole('combobox', { name: 'CFG 排序' }).selectOption('updated')
  await page.getByRole('link', { name: '预览内容', exact: true }).click()
  await page.getByRole('combobox', { name: '预览 CFG 版本' }).selectOption(first.history[0].id)
  await expect(page.locator('.cfg-library-code')).toContainText('+jump')
  expect(await page.locator('.cfg-library-code code').textContent()).toBe(previous)
  await expect(page.locator('.cfg-changelog')).toHaveText('最初版本')
  await page.getByRole('combobox', { name: 'CFG 对比基准' }).selectOption('current')
  await expect(page.getByRole('region', { name: 'CFG 历史差异' })).toContainText('+duck')
  const downloadEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: '下载 CFG', exact: true }).click()
  expect(await readFile(await (await downloadEvent).path(), 'utf8')).toBe(previous)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: testInfo.outputPath('cfg-versions-desktop.png'), fullPage: true })
  await page.reload()
  await expect(page.locator('.cfg-library-code')).toContainText('+jump')
  await page.getByRole('link', { name: '返回 CFG 配置库' }).click()
  await expect(page.getByRole('textbox', { name: '搜索 CFG 配置' })).toHaveValue('日常')
  await expect(page.getByRole('combobox', { name: 'CFG 排序' })).toHaveValue('updated')
  await expect(page.getByRole('navigation', { name: 'CFG 分类' }).getByRole('button', { name: '日常', exact: true })).toHaveAttribute('aria-pressed', 'true')
})

test('手机配置包提示缺失exec子配置，下载ZIP保留选定CFG原文', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/#/cfg')
  await page.getByRole('checkbox', { name: '打包 日常配置' }).check()
  await page.getByRole('checkbox', { name: '打包 训练配置' }).check()
  await page.getByRole('button', { name: '预览配置包' }).click()
  await expect(page.getByRole('region', { name: '配置包预览' }).getByRole('alert')).toContainText('missing.cfg')
  await expect(page.getByRole('region', { name: '配置包预览' }).getByRole('alert')).not.toContainText('training.cfg')
  const downloadEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: '下载 ZIP 配置包' }).click()
  const download = await downloadEvent
  expect(download.suggestedFilename()).toBe('cs2-config-package.zip')
  const zip = await readFile(await download.path())
  expect(zip.readUInt32LE(0)).toBe(0x04034b50)
  expect(zip.includes(Buffer.from(current))).toBe(true)
  expect(zip.includes(Buffer.from('echo training\n'))).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: testInfo.outputPath('cfg-package-mobile.png'), fullPage: true })
})

test('不存在的历史版本不会静默显示当前版本', async ({ page }) => {
  await page.goto(`/#/cfg/${first.id}?version=missing`)
  await expect(page.getByRole('heading', { name: '这份 CFG 历史版本不存在' })).toBeVisible()
  await expect(page.locator('.cfg-library-code')).toHaveCount(0)
})
