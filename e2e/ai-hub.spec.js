import { test, expect } from '@playwright/test'

test('AI Hub 只读展示资源并支持复制配置和打开产品', async ({ page, context }) => {
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
  await page.getByRole('tab', { name: '全部' }).click()

  const review = page.locator('.ai-resource-card', { has: page.getByRole('heading', { name: 'Code Review' }) })
  await review.getByRole('button', { name: '复制配置' }).click()
  await expect(review.getByRole('button', { name: '已复制' })).toBeVisible()
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain('Prioritize bugs')

  await page.getByRole('tab', { name: '应用 / 产品' }).click()
  const product = page.locator('.ai-resource-card', { has: page.getByRole('heading', { name: 'OpenAI Codex' }) })
  const popupPromise = page.waitForEvent('popup')
  await product.getByRole('link', { name: '打开使用' }).click()
  await expect(await popupPromise).toHaveURL('https://openai.com/codex/')

  await page.setViewportSize({ width: 375, height: 760 })
  await expect(page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: 'AI Hub' })).toBeVisible()
  expect(errors, errors.join('\n')).toEqual([])
  expect(failed, failed.join('\n')).toEqual([])
})
