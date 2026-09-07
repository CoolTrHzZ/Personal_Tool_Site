import { test, expect } from '@playwright/test'

test('工具加载失败可返回原筛选，网络恢复后刷新按钮重新加载', async ({ page }) => {
  let offline = true
  await page.route('**/src/tools/packages/json/index.tsx*', route => offline ? route.abort() : route.continue())
  await page.goto('/#/tools?q=json')
  const listUrl = page.url()
  await page.getByRole('link', { name: '打开 JSON 格式化', exact: true }).click()
  await expect(page.getByRole('heading', { name: '工具加载失败', exact: true })).toBeVisible()
  await page.getByRole('link', { name: '返回工具中心', exact: true }).click()
  await expect(page).toHaveURL(listUrl)
  await expect(page.getByRole('textbox', { name: '搜索工具', exact: true })).toHaveValue('json')
  await page.getByRole('link', { name: '打开 JSON 格式化', exact: true }).click()
  offline = false
  await page.getByRole('button', { name: '刷新重试', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'JSON 格式化', exact: true })).toBeVisible()
  await page.getByRole('link', { name: '← 工具中心', exact: true }).click()
  await expect(page).toHaveURL(listUrl)
})
