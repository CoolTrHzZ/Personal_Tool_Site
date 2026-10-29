import { test, expect } from '@playwright/test'

test.use({ timezoneId: 'America/New_York' })

test('时间戳保留 DST 两次重复时刻，编辑后明确选择偏移并拒绝春季缺口', async ({ page }) => {
  await page.goto('/#/tools/timestamp')
  const input = page.getByLabel('时间戳', { exact: true })
  const local = page.getByLabel('本地时间', { exact: true })
  const status = page.getByRole('status').filter({ hasText: '时区：' })
  for (const [value, offset, iso] of [
    ['1793511000.123', 'UTC-04:00', '2026-11-01T05:30:00.123Z'],
    ['1793514600.123', 'UTC-05:00', '2026-11-01T06:30:00.123Z'],
  ]) {
    await input.fill(value)
    await page.getByRole('button', { name: '时间戳转时间', exact: true }).click()
    await expect(local).toHaveValue('2026-11-01T01:30:00.123')
    await expect(status).toContainText('America/New_York')
    await expect(status).toContainText(offset)
    await expect(status).toContainText(iso)
    await page.getByRole('button', { name: '时间转时间戳', exact: true }).click()
    await expect(input).toHaveValue(value)
  }
  await page.getByRole('combobox', { name: '单位', exact: true }).selectOption('milliseconds')
  await page.getByRole('button', { name: '时间转时间戳', exact: true }).click()
  await expect(input).toHaveValue('1793514600123')
  await local.fill('2026-11-01T01:31:00.123')
  await local.fill('2026-11-01T01:30:00.123')
  await expect(page.getByRole('combobox', { name: '重复时间的 UTC 偏移', exact: true })).toHaveValue('')
  await page.getByRole('button', { name: '时间转时间戳', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('出现多次')
  await expect(input).toHaveValue('1793514600123')
  await page.getByRole('combobox', { name: '重复时间的 UTC 偏移', exact: true }).selectOption('1793511000123')
  await page.getByRole('button', { name: '时间转时间戳', exact: true }).click()
  await expect(input).toHaveValue('1793511000123')
  await local.fill('2026-03-08T02:30')
  await page.getByRole('button', { name: '时间转时间戳', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('不存在')
  await expect(local).toHaveValue('2026-03-08T02:30')
  await expect(input).toHaveValue('1793511000123')
  await expect(status).toContainText('偏移：尚未确定')
})
