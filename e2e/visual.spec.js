import { test, expect } from '@playwright/test'

test('Admin dashboard 一屏展示真实项目配置并可直达管理页', async ({ page, request }) => {
  await page.addInitScript(() => globalThis.localStorage.setItem('adminActivity', JSON.stringify(Array.from({ length: 10 }, (_, index) => ({ at: `2026-08-23T10:${String(index).padStart(2, '0')}:00.000Z`, message: `变更 ${index}` })))))
  const site = await (await request.get('/api/site')).json()
  await page.goto('/admin/')
  await expect(page.locator('.view.active')).toHaveCSS('animation-name', 'motion-enter')
  await expect(page.locator('.view.active')).toHaveCSS('animation-duration', '0.3s')
  await expect(page.locator('.view.active')).toHaveCSS('animation-timing-function', 'cubic-bezier(0.2, 0, 0, 1)')
  await expect(page.locator('.admin-brand-mark .brand-symbol')).toHaveAttribute('src', '/favicon.svg')
  expect(await page.locator('.admin-brand-mark .brand-symbol').evaluate(image => image.naturalWidth)).toBeGreaterThan(0)
  await expect(page.locator('#app-version, #sidebar-version')).toHaveCount(0)
  await expect(page.locator('canvas.tech-field')).toBeVisible()
  await expect(page.locator('.tech-grid')).toHaveCSS('animation-name', 'tech-grid-drift')
  const kpi = page.locator('.dash-kpi').first()
  const kpiTransform = await kpi.evaluate(element => window.getComputedStyle(element).transform)
  await kpi.hover()
  await expect.poll(() => kpi.evaluate(element => window.getComputedStyle(element).transform)).not.toBe(kpiTransform)
  expect(await kpi.evaluate(element => window.getComputedStyle(element).transform)).not.toContain('matrix3d')
  await expect(page.locator('.admin-brand-mark')).toHaveCSS('transform', 'none')
  await expect(page.locator('.sidebar')).toBeVisible()
  await expect(page.locator('.dashboard-hero')).toBeVisible()
  await expect(page.locator('.dashboard-kpis .dash-kpi')).toHaveCount(7)
  await expect(page.locator('#stat-websites')).not.toHaveText('—')
  await expect(page.locator('#dashboard-inventory .dashboard-config-card')).toHaveCount(7)
  await expect(page.locator('#dashboard-inventory')).toContainText('GitHub')
  await expect(page.locator('#dashboard-inventory')).toContainText('Code Review')
  await expect(page.locator('#dashboard-inventory')).toContainText('JSON')
  for (const id of ['websites', 'library', 'ai-resources', 'notes', 'tools']) {
    const total = Number(await page.locator(`#stat-${id}`).textContent())
    const [active, disabled] = (await page.locator(`#stat-${id}-meta`).textContent()).match(/\d+/g).map(Number)
    expect(active + disabled).toBe(total)
  }
  for (const id of ['categories', 'tags']) {
    const total = await page.locator(`#stat-${id}`).textContent()
    await expect(page.locator(`#stat-${id}-meta`)).toContainText(total)
  }
  await expect(page.locator('#status-data')).toContainText('正常')
  await expect(page.locator('#status-index')).toContainText('已同步')
  await expect(page.locator('#status-admin')).toContainText('运行中')
  await expect(page.locator('#status-runtime')).toContainText('Ready')
  await expect(page.locator('#dashboard-runtime-mix')).toContainText('react')
  await expect(page.locator('#dashboard-runtime-mix')).toContainText('static')
  await expect(page.locator('#dashboard-site-config')).not.toContainText('v4.0.0')
  await expect(page.locator('#dashboard-site-config')).toContainText(site.publicUrl || '未配置')
  await expect(page.locator('#dashboard-site-config')).toContainText(site.basePath || './')
  await expect(page.locator('#dashboard-site-config')).toContainText(site.adminUrl || 'http://127.0.0.1:4174/admin/')
  await expect(page.locator('#activity-list li')).toHaveCount(6)
  await page.setViewportSize({ width: 2048, height: 1028 })
  expect(await page.locator('[data-view-panel="dashboard"]').evaluate(node => node.getBoundingClientRect().bottom <= innerHeight)).toBe(true)
  await page.locator('.dashboard-config-card[data-view="ai-resources"]').click()
  await expect(page.locator('[data-view-panel="ai-resources"]')).toBeVisible()
  await page.locator('.sidebar').screenshot({ path: 'e2e/screenshots/admin-sidebar.png' })
})

test('Admin 减少动效时关闭视图和环境效果', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/admin/')
  const reduced = await page.evaluate(() => {
    const shell = document.querySelector('.admin-shell')
    return {
      viewAnimation: window.getComputedStyle(document.querySelector('.view.active')).animationName,
      progressAnimation: window.getComputedStyle(shell, '::after').animationName,
      progressOpacity: window.getComputedStyle(shell, '::after').opacity,
      ambientOpacity: window.getComputedStyle(shell, '::before').opacity,
      canvasVisible: Boolean(document.querySelector('canvas.tech-field') && window.getComputedStyle(document.querySelector('canvas.tech-field')).display !== 'none'),
    }
  })
  expect(reduced).toEqual({ viewAnimation: 'none', progressAnimation: 'none', progressOpacity: '0', ambientOpacity: '0', canvasVisible: false })
})

test('Admin light theme 使用浅色品牌标记', async ({ page }) => {
  await page.addInitScript(() => globalThis.localStorage.setItem('theme', 'light'))
  await page.goto('/admin/')
  await expect(page.locator('.admin-brand-mark .brand-symbol')).toHaveAttribute('src', '/favicon.svg')
})

test('Admin dashboard 明确显示运行时和配置接口异常', async ({ page }) => {
  await page.route('**/api/system', route => route.fulfill({ json: { version: '4.0.0', admin: 'running', index: 'synced', runtime: 'degraded' } }))
  await page.route('**/api/ai-resources', route => route.fulfill({ status: 500, json: { error: 'test failure' } }))
  await page.goto('/admin/')
  await expect(page.locator('#stat-ai-resources')).toHaveText('!')
  await expect(page.locator('#stat-ai-resources-meta')).toHaveText('读取失败')
  await expect(page.locator('#status-runtime')).toContainText('degraded')
  await expect(page.locator('#status-runtime')).toHaveClass(/is-error/)
  await expect(page.locator('#status-data')).toHaveClass(/is-error/)
  await expect(page.locator('#dashboard-health-title')).toContainText('配置问题')
})

test('Admin dashboard 窄屏保持单列且不横向溢出', async ({ page }) => {
  await page.setViewportSize({ width: 760, height: 900 })
  await page.goto('/admin/')
  await expect(page.locator('.dashboard-inventory')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
})

test('Admin websites 使用居中编辑弹窗和遮罩', async ({ page }) => {
  await page.goto('/admin/')
  await page.click('.nav-item[data-view="websites"]')
  await expect(page.locator('#nav-form')).toBeHidden()
  await page.click('[data-add-website]')
  await expect(page.locator('#editor-drawer')).toBeVisible()
  const popup = await page.locator('#editor-drawer').evaluate(node => {
    const box = node.querySelector('.editor-modal').getBoundingClientRect()
    const style = node.ownerDocument.defaultView.getComputedStyle(node)
    return {
      position: style.position,
      display: style.display,
      backdrop: style.backdropFilter,
      background: style.backgroundColor,
      centered: Math.abs(box.left + box.width / 2 - innerWidth / 2) < 2 && Math.abs(box.top + box.height / 2 - innerHeight / 2) < 2,
    }
  })
  expect(popup.position).toBe('fixed')
  expect(popup.display).toBe('grid')
  expect(popup.backdrop).toContain('blur')
  expect(popup.background).not.toBe('rgba(0, 0, 0, 0)')
  expect(popup.centered).toBe(true)
  await page.locator('#editor-drawer').screenshot({ path: 'e2e/screenshots/admin-editor-modal.png' })
  await page.mouse.click(3, 3)
  await expect(page.locator('#editor-drawer')).toBeHidden()
  await expect(page.locator('[data-view-panel="websites"]')).toBeVisible()
  await page.click('[data-add-website]')
  await expect(page.locator('#nav-form [name="name"]')).toBeFocused()
  await page.locator('#editor-drawer-close').focus()
  await page.keyboard.press('Shift+Tab')
  await expect(page.locator('#nav-form .ui-modal-actions .ui-button-primary')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.locator('#editor-drawer')).toBeHidden()
})

test('Admin 配置表单互斥且操作菜单不残留', async ({ page }) => {
  await page.goto('/admin/')
  const forms = ['#nav-form', '#library-form', '#ai-resource-form', '#category-form']
  const editors = [
    ['websites', '#navigation', '[data-edit]', '#nav-form'],
    ['library', '#library', '[data-edit-library]', '#library-form'],
    ['ai-resources', '#ai-resources', '[data-edit-ai-resource]', '#ai-resource-form'],
    ['categories', '#categories', '[data-edit-category]', '#category-form'],
  ]

  for (const [view, table, action, activeForm] of editors) {
    await page.click(`.nav-item[data-view="${view}"]`)
    const row = page.locator(`${table} tr`).first()
    await expect(row).toBeVisible()
    await row.locator('.kebab-toggle').click()
    await page.locator(`.kebab-menu:not([hidden]) ${action}`).click()
    await expect(page.locator('.kebab-menu:not([hidden])')).toHaveCount(0)
    await expect(page.locator('#editor-drawer')).toBeVisible()
    for (const form of forms) await expect(page.locator(form))[form === activeForm ? 'toBeVisible' : 'toBeHidden']()
    expect(await page.locator('[hidden]').evaluateAll(nodes => nodes.every(node => node.ownerDocument.defaultView.getComputedStyle(node).display === 'none'))).toBe(true)
    await page.click('#editor-drawer-close')
  }

  await page.click('.nav-item[data-view="settings"]')
  for (const tab of ['general', 'appearance', 'deploy']) {
    await page.click(`[data-settings-tab="${tab}"]`)
    await expect(page.locator('#site')).toBeVisible()
  }
  for (const tab of ['data', 'backup', 'about']) {
    await page.click(`[data-settings-tab="${tab}"]`)
    await expect(page.locator('#site')).toBeHidden()
    await expect(page.locator('#settings-extra')).not.toBeEmpty()
  }

  await page.click('.nav-item[data-view="tags"]')
  await page.locator('[data-view-tag]').first().click()
  await expect(page.locator('#tag-drawer')).toBeVisible()
  await expect(page.locator('#editor-drawer')).toBeHidden()
  await page.click('#tag-drawer-close')

  await page.click('.nav-item[data-view="tools"]')
  let row = page.locator('#tools tr').filter({ hasText: 'static' }).first()
  await row.locator('.kebab-toggle').click()
  await page.locator('.kebab-menu:not([hidden]) [data-edit-tool]').click()
  await expect(page.locator('.kebab-menu:not([hidden])')).toHaveCount(0)
  await expect(page.locator('#tool-edit')).toBeVisible()
  await page.click('#tool-edit-cancel')
  await row.locator('.kebab-toggle').click()
  await page.locator('.kebab-menu:not([hidden]) [data-inspect]').click()
  await expect(page.locator('.kebab-menu:not([hidden])')).toHaveCount(0)
  await expect(page.locator('#modal')).toBeVisible()
  await page.click('#modal-cancel')

  await page.click('.nav-item[data-view="websites"]')
  row = page.locator('#navigation tr').first()
  await row.locator('.kebab-toggle').click()
  await page.locator('.kebab-menu:not([hidden]) [data-delete]').click()
  await expect(page.locator('.kebab-menu:not([hidden])')).toHaveCount(0)
  await expect(page.locator('#modal')).toBeVisible()
  await page.click('#modal-cancel')

  await page.click('.nav-item[data-view="notes"]')
  await page.click('[data-add-note]')
  await expect(page.locator('#note-tab-write')).toBeVisible()
  await expect(page.locator('#note-tab-json')).toBeHidden()
  await page.click('[data-note-tab="json"]')
  await expect(page.locator('#note-tab-write')).toBeHidden()
  await expect(page.locator('#note-tab-json')).toBeVisible()
})
