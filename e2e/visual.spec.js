import { test, expect } from '@playwright/test'

test('Admin dashboard 关键区域可见', async ({ page }) => {
  await page.goto('/admin/')
  await expect(page.locator('.sidebar')).toBeVisible()
  await expect(page.locator('.stats-grid')).toBeVisible()
  await page.locator('.sidebar').screenshot({ path: 'e2e/screenshots/admin-sidebar.png' })
})

test('Admin websites 使用 Drawer 而不是顶部长表单', async ({ page }) => {
  await page.goto('/admin/')
  await page.click('.nav-item[data-view="websites"]')
  await expect(page.locator('#nav-form')).toBeHidden()
  await page.click('[data-add-website]')
  await expect(page.locator('#editor-drawer')).toBeVisible()
  await page.locator('#editor-drawer').screenshot({ path: 'e2e/screenshots/admin-drawer.png' })
})
