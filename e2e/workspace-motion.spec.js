import { test, expect } from '@playwright/test'

const LOCAL_ORIGIN = 'http://127.0.0.1:5173'
const isLocalOrigin = url => new URL(url).origin === LOCAL_ORIGIN

test('首屏载入后可切换菜单并开关命令面板', async ({ page }) => {
  const errors = []
  const failed = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('requestfailed', request => { if (isLocalOrigin(request.url())) failed.push(`${request.failure()?.errorText || 'request failed'} ${request.url()}`) })
  page.on('response', response => {
    const url = response.url()
    if (isLocalOrigin(url) && response.status() >= 400) failed.push(`${response.status()} ${url}`)
  })
  await page.goto('/#/')
  const boot = page.getByTestId('boot-layer')
  await expect(boot).toBeVisible()
  await expect(boot).toBeHidden({ timeout: 5_000 })
  await expect(page.getByRole('heading', { name: /开发者工作台/ })).toBeVisible()
  await expect(page.locator('.route-stage')).toHaveCSS('animation-name', 'motion-enter')
  await expect(page.locator('.route-stage')).toHaveCSS('animation-duration', '0.3s')
  await expect(page.locator('.route-stage')).toHaveCSS('animation-timing-function', 'cubic-bezier(0.2, 0, 0, 1)')
  await expect(page.locator('canvas.tech-field')).toBeVisible()
  expect(await page.locator('canvas.tech-field').evaluate(canvas => canvas.width)).toBeGreaterThan(100)
  await expect(page.locator('.tech-grid')).toHaveCSS('animation-name', 'tech-grid-drift')
  await page.evaluate(async () => {
    const rail = document.getAnimations().find(animation => animation.animationName === 'rail-scan-x')
    if (rail) rail.currentTime = 4_900
    await new Promise(requestAnimationFrame)
  })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(await page.evaluate(() => document.documentElement.clientWidth))
  const effects = () => page.evaluate(() => {
    const shell = document.querySelector('.carbon-fx')
    const progress = window.getComputedStyle(shell, '::after')
    const ambient = window.getComputedStyle(shell, '::before')
    return { progressPosition: progress.position, progressWidth: progress.width, progressTransform: progress.transform, ambientOpacity: ambient.opacity, mx: window.getComputedStyle(shell).getPropertyValue('--mx') }
  })
  const topEffects = await effects()
  expect(topEffects).toMatchObject({ progressPosition: 'fixed', progressWidth: '2px' })
  await page.mouse.move(120, 180)
  await expect.poll(() => page.evaluate(() => window.getComputedStyle(document.querySelector('.carbon-fx')).getPropertyValue('--mx'))).not.toBe(topEffects.mx)
  const toolCard = page.locator('#today .tool-card').first()
  const toolIcon = toolCard.locator('.tool-icon')
  const iconTransform = await toolIcon.evaluate(element => window.getComputedStyle(element).transform)
  const cardTransform = await toolCard.evaluate(element => window.getComputedStyle(element).transform)
  await toolCard.hover()
  await expect.poll(() => toolIcon.evaluate(element => window.getComputedStyle(element).transform)).not.toBe(iconTransform)
  await expect.poll(() => toolCard.evaluate(element => window.getComputedStyle(element).transform)).not.toBe(cardTransform)
  expect(await toolCard.evaluate(element => window.getComputedStyle(element).transform)).not.toContain('matrix3d')
  const rails = await page.locator('.manual-toc-wrap, .manual-notes').evaluateAll(elements =>
    elements.map(element => ({ position: window.getComputedStyle(element).position, y: element.getBoundingClientRect().y })),
  )
  expect(rails.length).toBe(2)
  expect(rails.every(rail => rail.position === 'sticky')).toBeTruthy()
  expect(rails.every(rail => rail.y >= 0 && rail.y < 800)).toBeTruthy()
  const toc = page.locator('.manual-toc-wrap')
  await toc.getByRole('link', { name: /今天继续/ }).hover()
  expect(await toc.evaluate(element => element.scrollWidth <= element.clientWidth)).toBeTruthy()
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  await expect.poll(() => effects().then(result => result.progressTransform)).not.toBe(topEffects.progressTransform)
  const scrolledRails = await page.locator('.manual-toc-wrap, .manual-notes').evaluateAll(elements =>
    elements.map(element => ({ y: element.getBoundingClientRect().y })),
  )
  expect(scrolledRails.every(rail => rail.y >= 64 && rail.y <= 120)).toBeTruthy()
  const favicon = page.locator('.resource-row .mark-tile:has(.favicon)').first()
  await expect(favicon).toBeVisible()
  expect(await favicon.evaluate(element => ({ outer: element.getBoundingClientRect().width, inner: element.querySelector('.favicon').getBoundingClientRect().width }))).toEqual({ outer: 32, inner: 20 })
  const openWidths = await page.locator('.product-stage .tool-open').evaluateAll(elements => elements.map(element => Math.round(element.getBoundingClientRect().width)))
  expect(new Set(openWidths).size).toBe(1)
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

test('减少动效时关闭进度、环境光和位移动画', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/#/')
  await expect(page.getByTestId('boot-layer')).toBeHidden({ timeout: 5_000 })
  const reduced = await page.evaluate(() => {
    const shell = document.querySelector('.carbon-fx')
    return {
      routeAnimation: window.getComputedStyle(document.querySelector('.route-stage')).animationName,
      progressAnimation: window.getComputedStyle(shell, '::after').animationName,
      progressOpacity: window.getComputedStyle(shell, '::after').opacity,
      ambientOpacity: window.getComputedStyle(shell, '::before').opacity,
      canvasVisible: Boolean(document.querySelector('canvas.tech-field') && window.getComputedStyle(document.querySelector('canvas.tech-field')).display !== 'none'),
      gridDisplay: window.getComputedStyle(document.querySelector('.tech-grid')).display,
    }
  })
  expect(reduced).toEqual({ routeAnimation: 'none', progressAnimation: 'none', progressOpacity: '0', ambientOpacity: '0', canvasVisible: false, gridDisplay: 'none' })
})
