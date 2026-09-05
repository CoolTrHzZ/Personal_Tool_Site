import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { Buffer } from 'node:buffer'

const path = '/#/tools/cs2-cfg'
const key = 'devos.cfg.workbench.v1'
const colorMessage = '\u0006社区\u0007ffffff彩字\u000b保留\u000e原文\u0010'

test('CFG 检查、按键预览、版本恢复与原文下载', async ({ page }) => {
  await page.goto(path)
  const editor = page.getByRole('textbox', { name: 'CFG 编辑器', exact: true })
  await editor.fill('bind "SPACE" "+jump"\nbind "SPACE" "+duck"\nbind "=" "say hello"\nsensitivity "1.2"\n')
  await expect(page.locator('.workbench-issues')).toContainText('覆盖')
  await page.getByRole('button', { name: '绑定预览', exact: true }).click()
  await page.getByLabel('预览按键', { exact: true }).selectOption('SPACE')
  await expect(page.locator('.cfg-binding-output')).toContainText('+duck')
  await page.getByRole('button', { name: /聚焦这里后按键预览/ }).focus()
  await page.keyboard.press('Equal')
  await expect(page.locator('.cfg-binding-output')).toContainText('say hello')
  await page.getByLabel('绑定按键', { exact: true }).fill('MOUSE4')
  await page.getByLabel('绑定命令', { exact: true }).fill(`say ${colorMessage}`)
  await page.getByRole('button', { name: '追加绑定到文件末尾' }).click()
  expect(await editor.inputValue()).toContain(`bind "MOUSE4" "say ${colorMessage}"`)
  await page.getByLabel('预览按键', { exact: true }).selectOption('MOUSE4')
  expect(await page.locator('.cfg-binding-output').textContent()).toContain(`say ${colorMessage}`)
  const source = await editor.inputValue()
  await page.locator('.cfg-file-toolbar').getByRole('button', { name: '保存版本', exact: true }).click()
  await expect(page.locator('.cfg-version-list li')).toHaveCount(1)
  await editor.fill('echo changed')
  await page.reload()
  await expect(editor).toHaveValue('echo changed')
  await page.getByRole('group', { name: 'CFG 检查视图' }).getByRole('button', { name: '保存版本' }).click()
  await page.getByRole('button', { name: '预览 / 恢复' }).click()
  await expect(editor).toHaveValue('echo changed')
  await page.getByRole('button', { name: '载入到编辑器', exact: true }).click()
  await expect(editor).toHaveValue(source)
  const downloadEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: '下载 CFG', exact: true }).click()
  const download = await downloadEvent
  expect(download.suggestedFilename()).toBe('autoexec.cfg')
  expect(await readFile(await download.path(), 'utf8')).toBe(source)
})

test('分享链接跨浏览器恢复完整 Unicode 配置，预览不覆盖已有草稿', async ({ page, browser }) => {
  await page.goto(path)
  const source = `// 中文 🎯\nbind "f" "+lookatweapon"\nbind x say ${colorMessage}\necho "<script>window.pwned=1</script>"\n`
  await page.getByRole('textbox', { name: '配置名称', exact: true }).fill('我的社区服')
  await page.getByRole('textbox', { name: 'CFG 编辑器', exact: true }).fill(source)
  await page.getByRole('button', { name: '生成分享链接' }).click()
  const link = page.getByRole('textbox', { name: 'CFG 分享链接', exact: true })
  await expect(link).toHaveValue(/#\/tools\/cs2-cfg\?cfg=/)
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await context.addInitScript(({ key }) => localStorage.setItem(key, JSON.stringify({ draft: { name: 'existing', content: 'echo keep-me' }, versions: [] })), { key })
  const receiver = await context.newPage()
  try {
    await receiver.goto(await link.inputValue())
    const editor = receiver.getByRole('textbox', { name: 'CFG 编辑器', exact: true })
    await expect(receiver.getByRole('region', { name: 'CFG 导入预览' })).toBeVisible()
    await expect(editor).toHaveValue('echo keep-me')
    expect(await receiver.evaluate(() => window.pwned)).toBeUndefined()
    await receiver.getByRole('button', { name: '载入到编辑器', exact: true }).click()
    await expect(editor).toHaveValue(source)
    await expect(receiver.getByRole('textbox', { name: '配置名称', exact: true })).toHaveValue('我的社区服')
    expect(await receiver.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
    const downloadEvent = receiver.waitForEvent('download')
    await receiver.getByRole('button', { name: '下载 CFG', exact: true }).click()
    const download = await downloadEvent
    expect(download.suggestedFilename()).toBe('我的社区服.cfg')
    expect(await readFile(await download.path(), 'utf8')).toBe(source)
  } finally { await context.close() }
})

test('CFG 文件预览、无效链接和损坏存储不会清空已有记录', async ({ page }) => {
  await page.addInitScript(({ key }) => localStorage.setItem(key, '{broken'), { key })
  await page.goto(path + '?cfg=z1.aaaa')
  const editor = page.getByRole('textbox', { name: 'CFG 编辑器', exact: true })
  await expect(page.getByRole('alert').filter({ hasText: '分享内容' })).toBeVisible()
  await expect(page.getByRole('alert').filter({ hasText: '本地 CFG 记录' })).toBeVisible()
  await editor.fill('echo session-only')
  expect(await page.evaluate(key => localStorage.getItem(key), key)).toBe('{broken')
  const uploaded = `\ufeff// 测试\r\nbind "SPACE" "+jump"\r\nbind x say ${colorMessage}\r\n`
  await page.getByLabel('导入 CFG 文件', { exact: true }).setInputFiles({ name: 'test.cfg', mimeType: 'text/plain', buffer: Buffer.from(uploaded) })
  await expect(editor).toHaveValue('echo session-only')
  const downloadEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: '直接下载此 CFG' }).click()
  const download = await downloadEvent
  expect(await readFile(await download.path(), 'utf8')).toBe(uploaded)
  await page.getByRole('button', { name: '取消载入' }).click()
  await expect(editor).toHaveValue('echo session-only')
})

test('超限粘贴和绑定追加整体拒绝，保留原文与待添加命令', async ({ page }) => {
  await page.goto(path)
  const editor = page.getByRole('textbox', { name: 'CFG 编辑器', exact: true })
  await editor.fill('echo keep')
  await editor.fill('x'.repeat(256 * 1024 + 1))
  await expect(editor).toHaveValue('echo keep')
  await expect(page.getByRole('alert')).toContainText('本次修改未应用')
  const full = '// ' + 'x'.repeat(256 * 1024 - 3)
  await editor.fill(full)
  await page.getByRole('button', { name: '绑定预览', exact: true }).click()
  await page.getByLabel('绑定按键', { exact: true }).fill('f')
  await page.getByLabel('绑定命令', { exact: true }).fill('+lookatweapon')
  await page.getByRole('button', { name: '追加绑定到文件末尾' }).click()
  await expect(editor).toHaveValue(full)
  await expect(page.getByLabel('绑定命令', { exact: true })).toHaveValue('+lookatweapon')
  await expect(page.getByRole('alert')).toContainText('本次修改未应用')
})

test('延迟读取的旧文件不会替换更新的导入或已取消的预览', async ({ page }) => {
  await page.addInitScript(() => {
    const read = window.File.prototype.arrayBuffer
    window.File.prototype.arrayBuffer = async function () {
      if (this.name === 'slow.cfg') await new Promise(resolve => { window.releaseCfgRead = resolve })
      return read.call(this)
    }
  })
  await page.goto(path)
  const file = page.getByLabel('导入 CFG 文件', { exact: true })
  const slow = { name: 'slow.cfg', mimeType: 'text/plain', buffer: Buffer.from('echo old') }
  await file.setInputFiles(slow)
  await expect.poll(() => page.evaluate(() => typeof window.releaseCfgRead)).toBe('function')
  await file.setInputFiles({ name: 'new.cfg', mimeType: 'text/plain', buffer: Buffer.from('echo newest') })
  const preview = page.getByRole('region', { name: 'CFG 导入预览' })
  await expect(preview).toContainText('echo newest')
  await page.evaluate(() => window.releaseCfgRead())
  await page.getByRole('button', { name: '载入到编辑器', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'CFG 编辑器', exact: true })).toHaveValue('echo newest')
  await file.setInputFiles(slow)
  await page.getByRole('button', { name: '载入示例', exact: true }).click()
  await page.getByRole('button', { name: '取消载入', exact: true }).click()
  await page.evaluate(() => window.releaseCfgRead())
  await expect(preview).toHaveCount(0)
})
