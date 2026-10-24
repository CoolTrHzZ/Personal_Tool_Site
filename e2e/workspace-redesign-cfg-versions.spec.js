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

// Keep native fetch/AbortController and the actual app; hold only synthetic asset replies.
async function holdPackageAssets(page) {
  const pending = []
  for (const entry of [first, second]) {
    await page.route(`**/cfgs/${entry.id}.cfg`, route => {
      let finish, replying
      const finished = new Promise(resolve => { finish = resolve })
      pending.push({
        entry, request: route.request(),
        reply(options = { contentType: 'text/plain', body: 'echo synthetic cleanup\n' }) {
          replying ||= route.fulfill(options).catch(error => {
            // Chromium may reject a late fulfill after native cancellation. Other errors fail.
            if (route.request().failure()?.errorText !== 'net::ERR_ABORTED') throw error
          }).finally(finish)
          return replying
        },
      })
      return finished
    })
  }
  return {
    pending,
    async releaseRemaining() { await Promise.all(pending.map(item => item.reply())) },
  }
}

const packagePreview = page => page.getByRole('region', { name: '配置包预览', exact: true })
const packageChoice = (page, entry) => page.getByRole('checkbox', { name: `打包 ${entry.name}`, exact: true })
async function expectPackageFiles(page, filenames) {
  await expect(packagePreview(page).getByRole('listitem')).toHaveText(filenames)
  await expect(packagePreview(page).getByRole('alert')).toHaveCount(0)
  await expect(page.locator('.cfg-package-error')).toHaveCount(0)
}

test('CFG 配置包取消待处理读取后保留勾选，可立即重试且旧回复不覆盖新预览', async ({ page }) => {
  const held = await holdPackageAssets(page)
  try {
    await page.goto('/#/cfg')
    await packageChoice(page, first).check()
    await packageChoice(page, second).check()
    await page.getByRole('button', { name: '预览配置包', exact: true }).click()
    await expect.poll(() => held.pending.length).toBe(2)
    const obsolete = held.pending.slice()
    await expect(page.getByRole('button', { name: '正在读取…', exact: true })).toBeDisabled()
    await expect(page.getByRole('button', { name: '清空选择', exact: true })).toBeDisabled()
    await expect(packageChoice(page, first)).toBeDisabled()
    await expect(packageChoice(page, second)).toBeDisabled()

    await page.getByRole('button', { name: '取消本次预览', exact: true }).click()
    for (const entry of [first, second]) {
      await expect(packageChoice(page, entry)).toBeChecked()
      await expect(packageChoice(page, entry)).toBeEnabled()
    }
    await expect(page.getByRole('button', { name: '清空选择', exact: true })).toBeEnabled()
    await expect(page.getByRole('button', { name: '预览配置包', exact: true })).toBeEnabled()
    await expect(page.getByRole('button', { name: '取消本次预览', exact: true })).toHaveCount(0)
    await expect(packagePreview(page)).toHaveCount(0)
    await expect(page.locator('.cfg-package-error')).toHaveCount(0)

    // Retry before releasing either old response: cancellation must not await them.
    await page.getByRole('button', { name: '预览配置包', exact: true }).click()
    await expect.poll(() => held.pending.length).toBe(4)
    await Promise.all(held.pending.slice(2).map(item => item.reply({ contentType: 'text/plain', body: 'echo current retry\n' })))
    await expectPackageFiles(page, [first.filename, second.filename])
    await expect.poll(() => obsolete.map(item => item.request.failure()?.errorText)).toEqual(['net::ERR_ABORTED', 'net::ERR_ABORTED'])
    await Promise.all(obsolete.map(item => item.reply({ contentType: 'text/plain', body: 'exec obsolete-cancelled\n' })))
    await expectPackageFiles(page, [first.filename, second.filename])
    await expect(packagePreview(page)).not.toContainText('obsolete-cancelled.cfg')
    expect(held.pending.every(item => item.request.method() === 'GET')).toBe(true)
  } finally { await held.releaseRemaining() }
})

test('CFG 配置包读取中导航卸载后，迟到回复不会污染返回后的新预览', async ({ page }) => {
  const held = await holdPackageAssets(page)
  try {
    await page.goto('/#/cfg')
    await packageChoice(page, first).check()
    await packageChoice(page, second).check()
    await page.getByRole('button', { name: '预览配置包', exact: true }).click()
    await expect.poll(() => held.pending.length).toBe(2)
    const obsolete = held.pending.slice()
    await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: '首页', exact: true }).click()
    await expect(page).toHaveURL(/\/#\/$/)
    await expect(page.locator('.cfg-library-page')).toHaveCount(0)
    await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: 'CFG 库', exact: true }).click()
    await expect(page).toHaveURL(/\/#\/cfg$/)
    // A new mounted page has the existing empty-selection contract, not restored preview.
    await expect(packageChoice(page, first)).not.toBeChecked()
    await expect(packageChoice(page, second)).not.toBeChecked()
    await expect(packagePreview(page)).toHaveCount(0)
    await packageChoice(page, second).check()
    await page.getByRole('button', { name: '预览配置包', exact: true }).click()
    await expect.poll(() => held.pending.length).toBe(3)
    await held.pending[2].reply({ contentType: 'text/plain', body: 'echo current page\n' })
    await expectPackageFiles(page, [second.filename])
    await expect.poll(() => obsolete.map(item => item.request.failure()?.errorText)).toEqual(['net::ERR_ABORTED', 'net::ERR_ABORTED'])
    await Promise.all(obsolete.map(item => item.reply({ contentType: 'text/plain', body: 'exec obsolete-navigation\n' })))
    await expect(page).toHaveURL(/\/#\/cfg$/)
    await expectPackageFiles(page, [second.filename])
    await expect(packagePreview(page)).not.toContainText('obsolete-navigation.cfg')
  } finally { await held.releaseRemaining() }
})

test('CFG 配置包部分读取失败保留错误与勾选，取消其余读取并可重试', async ({ page }) => {
  const held = await holdPackageAssets(page)
  try {
    await page.goto('/#/cfg')
    await packageChoice(page, first).check()
    await packageChoice(page, second).check()
    await page.getByRole('button', { name: '预览配置包', exact: true }).click()
    await expect.poll(() => held.pending.length).toBe(2)
    const failed = held.pending.find(item => item.entry.id === first.id)
    const obsolete = held.pending.find(item => item.entry.id === second.id)
    await failed.reply({ status: 503, contentType: 'text/plain', body: 'synthetic asset unavailable' })
    await expect(page.locator('.cfg-package-error')).toHaveText('CFG 文件暂时无法读取，请刷新或稍后重试。')
    await expect(packagePreview(page)).toHaveCount(0)
    for (const entry of [first, second]) {
      await expect(packageChoice(page, entry)).toBeChecked()
      await expect(packageChoice(page, entry)).toBeEnabled()
    }
    await expect(page.getByRole('button', { name: '清空选择', exact: true })).toBeEnabled()
    await expect(page.getByRole('button', { name: '取消本次预览', exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: '预览配置包', exact: true }).click()
    await expect.poll(() => held.pending.length).toBe(4)
    await expect(page.locator('.cfg-package-error')).toHaveCount(0)
    await Promise.all(held.pending.slice(2).map(item => item.reply({ contentType: 'text/plain', body: 'echo recovered retry\n' })))
    await expectPackageFiles(page, [first.filename, second.filename])
    await expect.poll(() => obsolete.request.failure()?.errorText).toBe('net::ERR_ABORTED')
    await obsolete.reply({ contentType: 'text/plain', body: 'exec obsolete-partial\n' })
    await expectPackageFiles(page, [first.filename, second.filename])
    await expect(packagePreview(page)).not.toContainText('obsolete-partial.cfg')
  } finally { await held.releaseRemaining() }
})
