import { test, expect } from '@playwright/test'
import { Buffer } from 'node:buffer'

const URL = '/#/tools/ai-context'
const STORAGE_KEY = 'devos.ai-context.tasks.v1'
async function storedDraft(page) {
  return page.evaluate(key => { const store = JSON.parse(localStorage.getItem(key)); return store.tasks.find(task => task.id === store.activeId).draft }, STORAGE_KEY)
}
async function downloadContents(download) {
  const stream = await download.createReadStream()
  const chunks = []
  for await (const chunk of stream) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

test('AI 上下文包保留代码原文，恢复草稿，并可复制、下载和迁移', async ({ page, context }, testInfo) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto(URL)
  await page.getByLabel('项目名称', { exact: true }).fill('个人工作站')
  await page.getByLabel('技术栈', { exact: true }).fill('React / TypeScript')
  await page.getByLabel('任务目标', { exact: true }).fill('修复构建失败，保留现有功能。')
  const source = '\uFEFF// 原始代码\r\nconst demo = "```";\r\n'
  await page.getByLabel('添加文本文件', { exact: true }).setInputFiles({ name: 'example.ts', mimeType: 'text/plain', buffer: Buffer.from(source) })
  await expect(page.getByRole('status').filter({ hasText: '已添加 1 份材料' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Markdown 任务包', exact: true })).toHaveValue(new RegExp('const demo = "```";'))
  const saved = await storedDraft(page)
  expect(saved.materials[0].content).toBe(source)
  await page.reload()
  await expect(page.getByLabel('项目名称', { exact: true })).toHaveValue('个人工作站')
  await expect(page.getByLabel('材料名称 1', { exact: true })).toHaveValue('example.ts')
  await page.getByRole('button', { name: '添加文字片段', exact: true }).click()
  await page.getByRole('textbox', { name: '材料内容 2', exact: true }).fill('不能新增运行时依赖。')
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  await page.screenshot({ path: testInfo.outputPath('desktop.png'), fullPage: true })
  await page.getByRole('button', { name: '复制 Markdown', exact: true }).click()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('不能新增运行时依赖。')

  const markdownEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: '下载 Markdown', exact: true }).click()
  const markdown = await downloadContents(await markdownEvent)
  expect(markdown).toContain(source)
  expect(markdown).toContain('# 个人工作站')
  const jsonEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出任务包 JSON', exact: true }).click()
  const json = await downloadContents(await jsonEvent)
  expect(JSON.parse(json).materials[0].content).toBe(source)

  await page.getByLabel('项目名称', { exact: true }).fill('当前草稿')
  await page.getByLabel('导入任务包 JSON', { exact: true }).setInputFiles({ name: 'task.json', mimeType: 'application/json', buffer: Buffer.from(json) })
  await expect(page.getByRole('region', { name: '任务包导入预览' })).toBeVisible()
  await expect(page.getByLabel('项目名称', { exact: true })).toHaveValue('当前草稿')
  await page.getByRole('button', { name: '导入并替换当前内容', exact: true }).click()
  await expect(page.getByLabel('项目名称', { exact: true })).toHaveValue('个人工作站')
  await page.getByRole('button', { name: '删除材料：example.ts', exact: true }).click()
  await expect(page.getByLabel('材料名称 1', { exact: true })).toHaveValue('文字片段 2')

  await page.evaluate(() => {
    const read = window.File.prototype.arrayBuffer
    window.finishAiReads = {}
    window.File.prototype.arrayBuffer = function () {
      if (['slow-task.json', 'stale-source.ts'].includes(this.name)) return new Promise((resolve, reject) => {
        window.finishAiReads[this.name] = () => read.call(this).then(resolve, reject)
      })
      return read.call(this)
    }
  })
  await page.getByLabel('添加文本文件', { exact: true }).setInputFiles({ name: 'stale-source.ts', mimeType: 'text/plain', buffer: Buffer.from('old task material') })
  await page.getByLabel('导入任务包 JSON', { exact: true }).setInputFiles({ name: 'slow-task.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ ...JSON.parse(json), project: '过时任务' })) })
  await page.getByLabel('导入任务包 JSON', { exact: true }).setInputFiles({ name: 'latest.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ ...JSON.parse(json), project: '最新任务' })) })
  await expect(page.getByRole('region', { name: '任务包导入预览' })).toContainText('最新任务')
  await page.evaluate(() => window.finishAiReads['slow-task.json']())
  await expect(page.getByRole('region', { name: '任务包导入预览' })).toContainText('最新任务')
  await page.getByRole('button', { name: '导入并替换当前内容', exact: true }).click()
  await page.evaluate(() => window.finishAiReads['stale-source.ts']())
  await expect(page.getByLabel('项目名称', { exact: true })).toHaveValue('最新任务')
  expect((await storedDraft(page)).materials.map(item => item.name)).toEqual(['example.ts', '文字片段 2'])
})

test('无效文件、超限文件及损坏草稿不会覆盖重要数据', async ({ page }) => {
  await page.goto(URL)
  await page.getByLabel('项目名称', { exact: true }).fill('保留此任务')
  await page.getByRole('textbox', { name: '任务目标', exact: true }).fill('保留完整旧目标')
  await page.getByRole('textbox', { name: '任务目标', exact: true }).fill('x'.repeat(20001))
  await expect(page.getByRole('alert')).toContainText('超出长度限制')
  await expect(page.getByRole('textbox', { name: '任务目标', exact: true })).toHaveValue('保留完整旧目标')
  expect((await storedDraft(page)).goal).toBe('保留完整旧目标')
  await page.getByLabel('添加文本文件', { exact: true }).setInputFiles({ name: 'binary.dat', mimeType: 'application/octet-stream', buffer: Buffer.from([0, 1, 2, 3]) })
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByRole('textbox', { name: '材料内容 1', exact: true })).toHaveCount(0)
  await page.getByLabel('添加文本文件', { exact: true }).setInputFiles({ name: 'large.log', mimeType: 'text/plain', buffer: Buffer.alloc(256 * 1024 + 1, 65) })
  await expect(page.getByRole('alert')).toContainText(/大小|超过|过大/)
  await page.getByLabel('导入任务包 JSON', { exact: true }).setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{broken') })
  await expect(page.getByRole('alert')).toContainText('JSON')
  await expect(page.getByLabel('项目名称', { exact: true })).toHaveValue('保留此任务')

  await page.evaluate(key => localStorage.setItem(key, '{recover-this-original'), STORAGE_KEY)
  await page.reload()
  await expect(page.getByRole('status').filter({ hasText: '原记录暂未覆盖' })).toBeVisible()
  await page.getByLabel('项目名称', { exact: true }).fill('新内容')
  expect(await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY)).toBe('{recover-this-original')
  const backupEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: '下载已有草稿备份', exact: true }).click()
  expect(await downloadContents(await backupEvent)).toBe('{recover-this-original')
  await page.getByRole('button', { name: '保存当前草稿并替换本地记录', exact: true }).click()
  expect((await storedDraft(page)).project).toBe('新内容')
  await page.evaluate(key => {
    const setItem = window.Storage.prototype.setItem
    window.Storage.prototype.setItem = function (name, value) {
      if (name === key) throw new Error('Quota exceeded')
      return setItem.call(this, name, value)
    }
  }, STORAGE_KEY)
  await page.getByLabel('项目名称', { exact: true }).fill('存储失败时仍可导出')
  await expect(page.getByRole('status').filter({ hasText: '草稿保存失败' })).toBeVisible()
  expect((await storedDraft(page)).project).toBe('新内容')
  const unsavedEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出任务包 JSON', exact: true }).click()
  expect(JSON.parse(await downloadContents(await unsavedEvent)).project).toBe('存储失败时仍可导出')
})

test('拖入材料在手机宽度可用，跨标签页更新不会覆盖当前任务', async ({ page, context }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(URL)
  await page.getByLabel('项目名称', { exact: true }).fill('手机任务')
  const transfer = await page.evaluateHandle(() => {
    const data = new window.DataTransfer()
    data.items.add(new window.File(['build completed\n'], 'build.log', { type: 'text/plain' }))
    return data
  })
  await page.locator('.workbench-dropzone').dispatchEvent('drop', { dataTransfer: transfer })
  await expect(page.getByRole('textbox', { name: '材料内容 1', exact: true })).toHaveValue('build completed\n')
  await page.screenshot({ path: testInfo.outputPath('mobile.png'), fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const second = await context.newPage()
  await second.goto(URL)
  await second.getByLabel('项目名称', { exact: true }).fill('另一标签页任务')
  await expect(page.getByRole('status').filter({ hasText: '其他标签页更改' })).toBeVisible()
  await page.getByLabel('任务目标', { exact: true }).fill('本页继续编辑')
  expect((await storedDraft(page)).project).toBe('另一标签页任务')
  await expect(page.getByLabel('项目名称', { exact: true })).toHaveValue('手机任务')
  await second.close()
})

test('旧草稿迁移为命名任务，复制切换保留内容并取消过时文件读取', async ({ page }) => {
  await page.goto(URL)
  await page.getByLabel('项目名称', { exact: true }).fill('旧版本项目')
  const legacy = await storedDraft(page)
  await page.evaluate(({ key, legacy }) => { localStorage.removeItem(key); localStorage.setItem('devos.ai-context.draft.v1', JSON.stringify(legacy)) }, { key: STORAGE_KEY, legacy })
  await page.reload()
  await expect(page.getByLabel('项目名称', { exact: true })).toHaveValue('旧版本项目')
  await page.getByLabel('任务名称', { exact: true }).fill('项目 A / 构建修复')
  await page.getByLabel('任务名称', { exact: true }).press('Tab')
  await page.getByRole('button', { name: '复制当前任务', exact: true }).click()
  await expect(page.getByLabel('任务名称', { exact: true })).toHaveValue('项目 A / 构建修复 副本')
  await page.getByLabel('任务目标', { exact: true }).fill('只修改副本')
  await page.getByLabel('当前 AI 任务', { exact: true }).selectOption({ label: '项目 A / 构建修复' })
  await expect(page.getByLabel('任务目标', { exact: true })).toHaveValue('')
  await page.evaluate(() => {
    const read = window.File.prototype.arrayBuffer
    window.File.prototype.arrayBuffer = function () { return new Promise((resolve, reject) => { window.finishTaskRead = () => read.call(this).then(resolve, reject) }) }
  })
  await page.getByLabel('添加文本文件', { exact: true }).setInputFiles({ name: 'old.log', mimeType: 'text/plain', buffer: Buffer.from('属于旧任务') })
  await page.getByLabel('当前 AI 任务', { exact: true }).selectOption({ label: '项目 A / 构建修复 副本' })
  await page.evaluate(() => window.finishTaskRead())
  await expect(page.getByLabel('任务目标', { exact: true })).toHaveValue('只修改副本')
  await expect(page.getByLabel('材料内容 1', { exact: true })).toHaveCount(0)
  await page.reload()
  await expect(page.getByLabel('任务目标', { exact: true })).toHaveValue('只修改副本')
  await expect(page.getByLabel('当前 AI 任务', { exact: true }).locator('option')).toHaveCount(2)
})
