import { test, expect } from '@playwright/test'
import { Buffer } from 'node:buffer'

test('配置对比对齐插入、检查重复键并导出报告，输入不持久化', async ({ page }) => {
  await page.goto('/#/tools/config-diff')
  await expect(page.getByRole('heading', { name: '配置差异对比', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '开始对比', exact: true })).toBeInViewport()
  await page.getByRole('combobox', { name: '配置格式', exact: true }).selectOption('env')
  await page.getByLabel('修改前', { exact: true }).fill('PORT=8080\nNAME=app\nMODE=dev')
  await page.getByLabel('修改后', { exact: true }).fill('PORT=8080\nLOG=debug\nNAME=app\nMODE=dev\nPORT=9090')
  await page.getByRole('button', { name: '开始对比', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: '新增' })).toHaveText('新增 2 行删除 0 行未变 3 行')
  await expect(page.getByText('重复键 PORT', { exact: false })).toBeVisible()
  const diff = page.getByRole('region', { name: '逐行差异' })
  await expect(diff.locator('tr.diff-equal')).toHaveCount(3)
  await page.getByLabel('只显示变更', { exact: true }).check()
  await expect(diff.locator('tbody tr')).toHaveCount(2)
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '下载变更报告', exact: true }).click()
  expect((await downloadPromise).suggestedFilename()).toBe('config-diff-report.md')
  await page.getByRole('button', { name: '左右交换', exact: true }).click()
  await expect(page.getByLabel('修改前', { exact: true })).toHaveValue(/LOG=debug/)
  await expect(diff).toHaveCount(0)
  await page.reload()
  await expect(page.getByLabel('修改前', { exact: true })).toHaveValue('')
  await expect(page.getByLabel('修改后', { exact: true })).toHaveValue('')
})

test('手机导入 JSON 后提示格式问题并保持可操作布局', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/#/tools/config-diff')
  await page.getByLabel('导入修改前文件', { exact: true }).setInputFiles({ name: 'before.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":"世界"}') })
  await page.getByLabel('导入修改后文件', { exact: true }).setInputFiles({ name: 'after.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":"世界", "hello":"new"}') })
  await expect(page.getByLabel('修改前', { exact: true })).toHaveValue('{"hello":"世界"}')
  await page.getByRole('button', { name: '开始对比', exact: true }).click()
  await expect(page.getByText('存在重复键，可能覆盖之前的值。')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
  await page.getByRole('button', { name: '清空内容', exact: true }).click()
  await expect(page.getByLabel('修改前', { exact: true })).toHaveValue('')
  await expect(page.getByRole('region', { name: '逐行差异' })).toHaveCount(0)
  await page.evaluate(() => {
    const read = window.File.prototype.arrayBuffer
    window.File.prototype.arrayBuffer = function () {
      return new Promise((resolve, reject) => { window.finishConfigFileRead = () => read.call(this).then(resolve, reject) })
    }
  })
  await page.getByLabel('导入修改前文件', { exact: true }).setInputFiles({ name: 'slow.json', mimeType: 'application/json', buffer: Buffer.from('{"old":true}') })
  await page.getByLabel('修改前', { exact: true }).fill('{"newerEdit":true}')
  await page.evaluate(() => window.finishConfigFileRead())
  await expect(page.getByLabel('修改前', { exact: true })).toHaveValue('{"newerEdit":true}')
})

const cfgColorLine = 'bind x "say \u0004绿色\u0001默认\u000b亮色\u000c蓝色"'
const cfgBefore = '\ufeff// synthetic CFG\r\n' + cfgColorLine + '\r\nsensitivity 1.25\r\n'
const cfgAfter = '\ufeff// synthetic CFG\r\n' + cfgColorLine + '\r\nsensitivity 2.5\r\n'

test('CFG 原生文件输入保留颜色控制符，两侧导入后显示有用的精确差异', async ({ page }) => {
  await page.goto('/#/tools/config-diff')
  await page.getByRole('combobox', { name: '配置格式', exact: true }).selectOption('cfg')
  await page.getByLabel('导入修改前文件', { exact: true }).setInputFiles({ name: 'before.cfg', mimeType: 'text/plain', buffer: Buffer.from(cfgBefore, 'utf8') })
  await page.getByLabel('导入修改后文件', { exact: true }).setInputFiles({ name: 'after.cfg', mimeType: 'text/plain', buffer: Buffer.from(cfgAfter, 'utf8') })
  // Native textareas normalize CRLF to LF; BOM and supported color controls remain.
  await expect(page.getByLabel('修改前', { exact: true })).toHaveValue(cfgBefore.replaceAll('\r\n', '\n'))
  await expect(page.getByLabel('修改后', { exact: true })).toHaveValue(cfgAfter.replaceAll('\r\n', '\n'))
  await expect(page.getByRole('alert')).toHaveCount(0)
  await page.getByRole('button', { name: '开始对比', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: '新增' })).toHaveText('新增 1 行删除 1 行未变 3 行')
  const diff = page.getByRole('region', { name: '逐行差异', exact: true })
  await expect(diff.locator('tr.diff-remove .diff-code')).toHaveText('sensitivity 1.25')
  await expect(diff.locator('tr.diff-add .diff-code')).toHaveText('sensitivity 2.5')
  await expect(diff.locator('tr.diff-equal')).toHaveCount(3)
  // Exact textContent avoids a text matcher's VT/FF whitespace normalization.
  await expect(diff.locator('tr.diff-equal .diff-code').nth(1)).toHaveJSProperty('textContent', cfgColorLine)
  await expect(page.locator('.issue-error')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '复制变更报告', exact: true })).toBeEnabled()
})

test('纯文本拒绝 CFG 控制符时保留原输入，选择 CFG 后可明确重试同一文件', async ({ page }) => {
  await page.goto('/#/tools/config-diff')
  const format = page.getByRole('combobox', { name: '配置格式', exact: true })
  const before = page.getByLabel('修改前', { exact: true })
  const after = page.getByLabel('修改后', { exact: true })
  const beforeFile = page.getByLabel('导入修改前文件', { exact: true })
  await format.selectOption('text')
  await beforeFile.setInputFiles({ name: 'previous-before.txt', mimeType: 'text/plain', buffer: Buffer.from('echo previous-before\r\n', 'utf8') })
  await page.getByLabel('导入修改后文件', { exact: true }).setInputFiles({ name: 'previous-after.txt', mimeType: 'text/plain', buffer: Buffer.from('echo previous-after\r\n', 'utf8') })
  await expect(before).toHaveValue('echo previous-before\n')
  await expect(after).toHaveValue('echo previous-after\n')
  await expect(page.getByRole('alert')).toHaveCount(0)

  const retryFile = { name: 'retry.cfg', mimeType: 'text/plain', buffer: Buffer.from(cfgAfter, 'utf8') }
  await beforeFile.setInputFiles(retryFile)
  await expect(page.getByRole('alert')).toHaveText('检测到二进制或控制字符，请选择文本文件。')
  await expect(before).toHaveValue('echo previous-before\n')
  await expect(after).toHaveValue('echo previous-after\n')
  await format.selectOption('cfg')
  await expect(before).toHaveValue('echo previous-before\n')
  await beforeFile.setInputFiles(retryFile)
  await expect(before).toHaveValue(cfgAfter.replaceAll('\r\n', '\n'))
  await expect(after).toHaveValue('echo previous-after\n')
  await expect(page.getByRole('alert')).toHaveCount(0)
})
