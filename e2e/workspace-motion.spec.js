import { test, expect } from '@playwright/test'

test('首屏载入后可切换菜单并开关命令面板', async ({ page }) => {
  const errors = []
  const failed = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('response', response => {
    const url = response.url()
    if (url.startsWith('http://127.0.0.1:5173/') && response.status() >= 400) failed.push(`${response.status()} ${url}`)
  })
  await page.goto('/#/')
  const boot = page.getByTestId('boot-layer')
  await expect(boot).toBeVisible()
  await expect(boot).toBeHidden({ timeout: 5_000 })
  await expect(page.getByRole('heading', { name: /开发者工作台/ })).toBeVisible()
  await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: '工具' }).click()
  await expect(page).toHaveURL(/#\/tools/)
  await expect(page.getByRole('heading', { name: /全部工具/ })).toBeVisible()
  await page.getByRole('button', { name: '打开命令面板' }).first().click()
  await expect(page.getByRole('dialog', { name: '命令面板' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: '命令面板' })).toHaveCount(0)
  expect(errors, errors.join('\n')).toEqual([])
  expect(failed, failed.join('\n')).toEqual([])
})
