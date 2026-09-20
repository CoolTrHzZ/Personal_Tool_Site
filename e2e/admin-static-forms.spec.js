import { test, expect } from '@playwright/test'

for (const width of [1280, 390]) {
  test(`常用表单隐藏低频设置并保持保存可见（${width}px）`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: width === 390, isMobile: width === 390, reducedMotion: 'reduce' })
    const page = await context.newPage()
    const writes = [], errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/api/**', async route => {
      if (route.request().method() === 'GET') return route.continue()
      const data = route.request().postDataJSON()
      writes.push({ path: new URL(route.request().url()).pathname, data })
      await route.fulfill({ json: data })
    })
    try {
      for (const [view, add, id, path] of [
        ['websites', '[data-add-website]', 'nav-form', '/api/navigation'],
        ['library', '[data-add-library]', 'library-form', '/api/library'],
        ['ai-resources', '[data-add-ai-resource]', 'ai-resource-form', '/api/ai-resources'],
      ]) {
        await page.goto('http://127.0.0.1:4174/admin/')
        await expect(page.locator('#stat-websites')).not.toHaveText('—')
        await page.locator(`.dash-kpi[data-view="${view}"]`).click()
        await page.locator(add).click()
        const form = page.locator(`#${id}`), advanced = form.locator('.form-advanced')
        await expect(form.locator('[name="name"]')).toBeFocused()
        await expect(advanced).not.toHaveAttribute('open')
        await expect(form.locator('[name="id"]')).toBeHidden()
        await expect(form.locator('[name="order"]')).toBeHidden()
        await expect(form.locator('.ui-modal-actions')).toBeInViewport()
        expect(await page.locator('.editor-modal').evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true)
        await form.locator('[name="name"]').fill(`常用表单 ${view}`)
        await form.locator('[name="url"]').fill('https://example.com/start')
        await form.locator('[name="description"]').fill('记录用途，便于以后查找。')
        await page.locator('#editor-drawer-body').evaluate(node => { node.scrollTop = 0 })
        await page.screenshot({ path: `/tmp/devos-static-forms-${width}-${id}.png` })
        if (id === 'nav-form') {
          await advanced.locator('summary').press('Enter')
          await form.locator('[name="id"]').fill('Invalid ID')
          await advanced.locator('summary').click()
          await form.locator('[type="submit"]').click()
          await expect(advanced).toHaveAttribute('open', '')
          await expect(form.locator('[name="id"]')).toBeFocused()
          expect(await form.locator('[name="id"]').evaluate(node => node.getBoundingClientRect().bottom <= node.form.querySelector('.ui-modal-actions').getBoundingClientRect().top)).toBe(true)
          await expect(form.locator('.form-error')).toContainText('ID')
          expect(writes).toHaveLength(0)
          await form.locator('[name="id"]').fill('valid-website')
        }
        await form.locator('[type="submit"]').click()
        await expect(page.locator('#editor-drawer')).toBeHidden()
        expect(writes.find(write => write.path === path)?.data).toMatchObject({ description: '记录用途，便于以后查找。', order: 10, enabled: true })
        if (id === 'nav-form') {
          await page.locator(add).click()
          await expect(advanced).not.toHaveAttribute('open')
          await page.locator('#editor-drawer-close').click()
        }
      }
      expect(errors).toEqual([])
    } finally { await context.close() }
  })
}
