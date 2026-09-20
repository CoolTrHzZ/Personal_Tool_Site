import { test, expect } from '@playwright/test'

test('静态工具切换显示模式保留运行实例与输入，只有重新加载才重置', async ({ page }) => {
  let loads = 0
  await page.route('**/tools-manifests.json', route => route.fulfill({ json: [{ id: 'runtime-state-fixture', name: '运行状态检查', runtime: 'static', format: 'single-html', entry: 'index.html', version: '1.0.0', category: 'development', description: '模式切换检查', keywords: [], enabled: true, display: { mode: 'embedded', height: 480 }, permissions: {} }] }))
  await page.route('**/tools/runtime-state-fixture/index.html', route => {
    loads++
    return route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><label>草稿<input aria-label="草稿"></label>' })
  })
  await page.goto('/#/tools/runtime-state-fixture')
  const input = page.frameLocator('[data-testid="tool-frame"]').getByRole('textbox', { name: '草稿' })
  await input.fill('切换模式不能丢失的内容')
  for (const mode of ['工作区模式', '全屏模式', '嵌入模式', '全屏模式']) {
    await page.getByRole('button', { name: mode, exact: true }).click()
    await expect(input).toHaveValue('切换模式不能丢失的内容')
    expect(loads).toBe(1)
  }
  const fullscreen = page.getByTestId('tool-fullscreen')
  const box = await fullscreen.boundingBox()
  expect(box.y).toBe(0)
  expect(box.height).toBe(page.viewportSize().height)
  await page.getByRole('button', { name: '退出全屏 (Esc)', exact: true }).click()
  await expect(input).toHaveValue('切换模式不能丢失的内容')
  await page.getByRole('button', { name: '重新加载', exact: true }).click()
  await expect(input).toHaveValue('')
  expect(loads).toBe(2)
})
