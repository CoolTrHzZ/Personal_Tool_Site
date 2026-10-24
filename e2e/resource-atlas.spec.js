import { test, expect } from '@playwright/test'

const LOCAL_ORIGIN = 'http://127.0.0.1:5173'
const isLocalOrigin = url => new URL(url).origin === LOCAL_ORIGIN

test.beforeEach(async ({ page }) => {
  await page.goto('/#/')
  await expect(page.getByTestId('boot-layer')).toBeHidden({ timeout: 5_000 })
})

test('科幻首页保留资源目录和移动端章节导航', async ({ page }) => {
  await expect(page.getByRole('heading', { name: /开发者工作台/ })).toBeVisible()
  await expect(page.getByRole('navigation', { name: '章节目录' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '工具', exact: true })).toBeVisible()
  await expect(page.locator('body')).not.toContainText('SYSTEM ONLINE')
  await expect(page.locator('body')).not.toContainText('HEAP')
  await expect(page.locator('body')).not.toContainText('STORAGE')
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.locator('.manual-toc-toggle')).toBeVisible()
  await page.locator('.manual-toc-toggle').click()
  await expect(page.getByRole('navigation', { name: '章节目录' })).toBeHidden()
  await page.locator('.manual-toc-toggle').click()
  await expect(page.getByRole('navigation', { name: '章节目录' }).getByRole('link', { name: /精选工具/ })).toBeVisible()
  const nav = page.getByRole('navigation', { name: '主导航' })
  for (const name of ['首页', '桌面工具', 'AI Hub', '工具', 'CFG 库', '导航', '收藏', '笔记']) {
    const link = nav.getByRole('link', { name, exact: true })
    await expect(link).toBeVisible()
    const box = await link.boundingBox()
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(390)
  }
})

test('首页章节控制保持首页并滚动到真实章节', async ({ page }) => {
  const errors = []
  const failed = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('requestfailed', request => { if (isLocalOrigin(request.url())) failed.push(`${request.failure()?.errorText || 'request failed'} ${request.url()}`) })
  page.on('response', response => {
    const url = response.url()
    if (isLocalOrigin(url) && response.status() >= 400) failed.push(`${response.status()} ${url}`)
  })
  const chapters = [
    ['精选工具', 'today'],
    ['工具', 'tools'],
    ['网站', 'sites'],
    ['AI 资源', 'ai'],
    ['收藏', 'library'],
    ['笔记', 'notes'],
  ]

  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport)
    if (viewport.width < 768 && await page.locator('.manual-toc-wrap').getAttribute('open') === null) await page.locator('.manual-toc-toggle').click()
    for (const [label, id] of chapters) {
      const link = page.getByRole('navigation', { name: '章节目录' }).locator(`a[href="#${id}"]`)
      await expect(link).toContainText(label)
      await link.click()
      await expect(page).toHaveURL(/\/#\/$/)
      await expect(page.getByRole('heading', { name: '页面不存在' })).toHaveCount(0)
      await expect.poll(() => page.locator(`#${id} .manual-heading`).evaluate(element => {
        const { top, bottom } = element.getBoundingClientRect()
        return top >= 0 && bottom <= window.innerHeight
      })).toBeTruthy()
    }
  }
  expect(errors, errors.join('\n')).toEqual([])
  expect(failed, failed.join('\n')).toEqual([])
})

test('首页资源行显示完整标识与 AI 类型图标', async ({ page }, testInfo) => {
  await expect(page.locator('#today .tool-card')).toHaveCount(3)
  await expect(page.locator('#today .tool-icon').first()).toBeVisible()
  for (const selector of ['#today .tool-icon', '#tools .tool-icon', '#sites .mark-tile', '#ai .mark-tile', '#library .mark-tile', '#notes .mark-tile']) {
    const marks = page.locator(selector)
    expect(await marks.count()).toBeGreaterThan(0)
    expect(await marks.evaluateAll(elements => elements.every(element => {
      const { width, height } = element.getBoundingClientRect()
      return width === height && width >= 32 && width <= 40 && element.getClientRects().length > 0
    }))).toBeTruthy()
  }
  const aiIcons = page.locator('#ai .resource-row .mark-tile svg')
  await expect(aiIcons).toHaveCount(4)
  expect(await aiIcons.evaluateAll(elements => elements.every(element => element.getClientRects().length > 0))).toBeTruthy()
  const favorite = page.locator('#today .favorite-button').first()
  // Observe actual pointer/DOM state without focusing, scrolling or moving anything.
  const diagnostics = await page.evaluateHandle(() => {
    const initial = document.querySelector('#today .favorite-button')
    const ids = new WeakMap()
    let nextId = 0
    let pointer = null
    const records = []
    const identify = element => {
      if (!element) return null
      if (!ids.has(element)) ids.set(element, ++nextId)
      return { node: ids.get(element), tag: element.localName, id: element.id, class: element.getAttribute?.('class'), connected: element.isConnected }
    }
    const geometry = element => {
      const { x, y, width, height } = element.getBoundingClientRect()
      const style = window.getComputedStyle(element)
      return { ...identify(element), rect: [x, y, width, height], transform: style.transform, scroll: [element.scrollLeft, element.scrollTop] }
    }
    const trackPointer = event => { pointer = { x: event.clientX, y: event.clientY, type: event.type, target: identify(event.target) } }
    const events = ['pointermove', 'pointerdown', 'pointerup']
    for (const event of events) document.addEventListener(event, trackPointer, { capture: true, passive: true })
    // Separate capped observations leave the existing diagnostic records intact.
    const activity = { events: [], samples: [], dropped: { events: 0, samples: 0 }, errors: 0, limits: { events: 96, samples: 16, ancestors: 4, animations: 8 }, frame: { scheduled: false, sampled: false, cancelled: false } }
    let observing = false
    let frame = null
    const current = () => document.querySelector('#today .favorite-button')
    const describe = element => {
      if (element === window) return { kind: 'window' }
      if (element === document) return { kind: 'document' }
      const identity = identify(element)
      return identity && { ...identity, id: identity.id?.slice(0, 80), class: identity.class?.slice(0, 160) }
    }
    const measured = element => ({ ...geometry(element), ...describe(element) })
    const number = value => typeof value === 'number' && Number.isFinite(value) ? value : null
    const animations = nodes => {
      const items = []
      let omitted = 0
      for (const node of nodes) {
        const list = node.getAnimations?.({ subtree: false }) || []
        const selected = list.slice(0, activity.limits.animations - items.length)
        omitted += list.length - selected.length
        for (const animation of selected) {
          const timing = animation.effect?.getComputedTiming()
          items.push({ target: describe(animation.effect?.target), type: animation.constructor.name.slice(0, 40), property: animation.transitionProperty?.slice(0, 80), name: animation.animationName?.slice(0, 80), playState: animation.playState, pending: animation.pending, currentTime: number(animation.currentTime), startTime: number(animation.startTime), playbackRate: number(animation.playbackRate), duration: number(timing?.duration), progress: number(timing?.progress), localTime: number(timing?.localTime) })
        }
      }
      return { items, omitted }
    }
    const observe = (bucket, phase, element = current(), detail = {}) => {
      if (!observing) return
      if (activity[bucket].length >= activity.limits[bucket]) { activity.dropped[bucket]++; return }
      try {
        const ancestors = []
        for (let parent = element?.parentElement; parent && ancestors.length < activity.limits.ancestors; parent = parent.parentElement) ancestors.push(parent)
        const hit = pointer ? document.elementFromPoint(pointer.x, pointer.y) : null
        const root = document.scrollingElement
        activity[bucket].push({
          phase, time: window.performance.now(), ...detail, initial: describe(initial), current: describe(element), sameNodeAsInitial: element === initial,
          button: element ? measured(element) : null, ancestors: ancestors.map(measured), activeElement: describe(document.activeElement), activeIsCurrent: document.activeElement === element,
          focus: element?.matches(':focus'), focusVisible: element?.matches(':focus-visible'), hover: element?.matches(':hover'), pressed: element?.getAttribute('aria-pressed'),
          pointer: pointer && { x: pointer.x, y: pointer.y, type: pointer.type }, hit: describe(hit), hitInsideCurrent: Boolean(element && hit && element.contains(hit)),
          scroll: [window.scrollX, window.scrollY], viewport: [innerWidth, innerHeight], root: root && { scroll: [root.scrollLeft, root.scrollTop], extent: [root.scrollWidth, root.scrollHeight], client: [root.clientWidth, root.clientHeight], behavior: window.getComputedStyle(root).scrollBehavior },
          animations: animations(element ? [element, ...ancestors] : []),
        })
      } catch { activity.errors++ }
    }
    const activityEvents = ['scroll', 'scrollend', 'focusin', 'focusout', 'keydown', 'keyup', 'transitionstart', 'transitioncancel', 'transitionend']
    const onActivity = event => {
      const element = current()
      const keyEvent = event.type === 'keydown' || event.type === 'keyup'
      if (keyEvent && !['Tab', ' ', 'Space', 'Spacebar'].includes(event.key)) return
      if (event.type.startsWith('transition') && event.target !== element && event.target !== initial) return
      observe('events', event.type, element, { eventTime: event.timeStamp, trusted: event.isTrusted, target: describe(event.target), relatedTarget: describe(event.relatedTarget), key: keyEvent ? (event.key === 'Tab' ? 'Tab' : 'Space') : undefined, shiftKey: keyEvent ? event.shiftKey : undefined, repeat: keyEvent ? event.repeat : undefined, defaultPrevented: event.defaultPrevented, property: event.propertyName?.slice(0, 80), elapsedTime: number(event.elapsedTime), pseudoElement: event.pseudoElement?.slice(0, 32) })
    }
    const stopActivity = () => {
      if (observing) observe('samples', 'activity-stop')
      observing = false
      for (const event of activityEvents) window.removeEventListener(event, onActivity, true)
      if (frame !== null) { window.cancelAnimationFrame(frame); frame = null; activity.frame.cancelled = true }
    }
    return {
      records,
      activity,
      startActivity() {
        if (observing) return
        observing = true
        for (const event of activityEvents) window.addEventListener(event, onActivity, { capture: true, passive: true })
        observe('samples', 'activity-start')
      },
      stopActivity,
      sample(phase, element) { observe('samples', phase, element) },
      sampleFirstFrame() {
        if (!observing || activity.frame.scheduled) return
        activity.frame.scheduled = true
        frame = window.requestAnimationFrame(() => { frame = null; activity.frame.sampled = true; observe('samples', 'instant-scroll-first-frame') })
      },
      capture(phase, element = document.querySelector('#today .favorite-button')) {
        const hit = pointer ? document.elementFromPoint(pointer.x, pointer.y) : null
        const ancestors = []
        for (let parent = element?.parentElement; parent && ancestors.length < 8; parent = parent.parentElement) ancestors.push(geometry(parent))
        const style = element && window.getComputedStyle(element)
        records.push({
          phase, time: window.performance.now(), initial: identify(initial), sameNodeAsInitial: element === initial,
          button: element ? geometry(element) : null, toolHref: element?.closest('.tool-card')?.querySelector('a[href]')?.getAttribute('href'),
          hover: element?.matches(':hover'), focus: element?.matches(':focus'), focusVisible: element?.matches(':focus-visible'),
          activeElement: identify(document.activeElement), activeIsCurrent: document.activeElement === element,
          pressed: element?.getAttribute('aria-pressed'), color: style?.color, background: style?.backgroundColor,
          outline: style?.outline, gap: style?.gap, children: element ? [...element.children].map(geometry) : [], ancestors,
          pointer, hit: identify(hit), hitInsideCurrent: Boolean(element && hit && element.contains(hit)),
          scroll: [window.scrollX, window.scrollY], viewport: [innerWidth, innerHeight],
        })
        if (['pre-space', 'space-deselected', 'space-post-hover', 'failure'].includes(phase)) observe('samples', phase, element)
      },
      dispose() { stopActivity(); for (const event of events) document.removeEventListener(event, trackPointer, true) },
    }
  })
  const capture = phase => diagnostics.evaluate((state, label) => state.capture(label), phase)
  try {
    if (await favorite.getAttribute('aria-pressed') === 'true') await favorite.click()
    await expect(favorite).toHaveAttribute('aria-pressed', 'false')
    await capture('pre-click')
    await favorite.click()
    await capture('post-click')
    await expect(favorite).toHaveAttribute('aria-pressed', 'true')
    await capture('post-click-selected')
    const selectedColor = await favorite.evaluate((element, state) => {
      state.capture('selected-probe-before', element)
      const probe = document.createElement('span')
      probe.style.color = 'var(--accent-secondary)'
      element.append(probe)
      state.capture('selected-probe-attached', element)
      const color = window.getComputedStyle(probe).color
      probe.remove()
      state.capture('selected-probe-after', element)
      return color
    }, diagnostics)
    const hoverColor = await favorite.evaluate((element, state) => {
      state.capture('hover-probe-before', element)
      const probe = document.createElement('span')
      probe.style.color = 'var(--text-primary)'
      element.append(probe)
      state.capture('hover-probe-attached', element)
      const color = window.getComputedStyle(probe).color
      probe.remove()
      state.capture('hover-probe-after', element)
      return color
    }, diagnostics)
    // Explicit test precondition: finish the color probes, then hover the current button.
    await favorite.hover()
    await capture('selected-post-hover')
    await expect(favorite).toHaveCSS('color', selectedColor)
    expect(await favorite.evaluate(element => element.matches(':hover'))).toBe(true)
    await expect(favorite.locator('svg')).toHaveAttribute('fill', 'currentColor')
    const selectedBackground = await favorite.evaluate(element => window.getComputedStyle(element).backgroundColor)
    await page.mouse.move(0, 0)
    expect(await favorite.evaluate(element => element.matches(':hover'))).toBe(false)
    await expect(favorite).toHaveCSS('color', selectedColor)
    await expect(favorite).toHaveCSS('background-color', selectedBackground)

    // Return with the keyboard so focus-visible is exercised, not just focus().
    await diagnostics.evaluate(state => state.startActivity())
    await favorite.press('Shift+Tab')
    await page.keyboard.press('Tab')
    await expect(favorite).toBeFocused()
    expect(await favorite.evaluate(element => element.matches(':focus-visible'))).toBe(true)
    await expect(favorite).toHaveCSS('color', selectedColor)
    await expect(favorite).toHaveCSS('outline-style', 'solid')
    await expect(favorite).toHaveCSS('outline-width', '2px')
    await favorite.hover()
    expect(await favorite.evaluate(element => element.matches(':hover:focus-visible'))).toBe(true)
    await expect(favorite).toHaveCSS('color', selectedColor)
    await expect(favorite).toHaveCSS('background-color', selectedBackground)

    await capture('pre-space')
    await favorite.press('Space')
    await expect(favorite).toHaveAttribute('aria-pressed', 'false')
    await expect(favorite.locator('svg')).toHaveAttribute('fill', 'none')
    await capture('space-deselected')
    // Explicit hover precondition after the keyboard update; no later color probe.
    await favorite.evaluate((element, state) => {
      state.sample('instant-scroll-before', element)
      element.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'nearest' })
      state.sample('instant-scroll-after', element)
      state.sampleFirstFrame() // Observe the next frame without awaiting it or settling scroll.
    }, diagnostics)
    await favorite.hover()
    await capture('space-post-hover')
    expect(await favorite.evaluate(element => element.matches(':hover'))).toBe(true)
    await expect(favorite).toHaveCSS('color', hoverColor)
    await diagnostics.evaluate(state => state.stopActivity())
    await favorite.press('Enter')
    await expect(favorite).toHaveAttribute('aria-pressed', 'true')
    await expect(favorite.locator('svg')).toHaveAttribute('fill', 'currentColor')
    await expect(favorite).toHaveCSS('color', selectedColor)
  } catch (error) {
    await capture('failure').catch(diagnosticError => console.warn('Favorite failure snapshot unavailable:', diagnosticError.message))
    throw error
  } finally {
    const { records, activity } = await diagnostics.evaluate(state => { state.dispose(); return { records: state.records, activity: state.activity } }).catch(error => ({ records: [{ diagnosticError: error.message }], activity: { unavailable: true } }))
    await diagnostics.dispose().catch(error => console.warn('Favorite diagnostic cleanup:', error.message))
    const evidence = JSON.stringify({ retry: testInfo.retry, records, activity })
    console.log('[favorite-pointer-diagnostics]', evidence)
    await testInfo.attach('favorite-pointer-diagnostics', { body: evidence, contentType: 'application/json' }).catch(error => console.warn('Favorite diagnostic attachment unavailable:', error.message))
  }
})

test('内容页说明和资源网格使用站点配置', async ({ page }) => {
  for (const [path, description] of [
    ['/tools', '集中查找、筛选并打开日常开发工具。'],
    ['/nav', '按开发场景整理常用网站与在线服务。'],
    ['/library', '收藏值得反复阅读的开源仓库与 Agent Skills。'],
    ['/notes', '记录工具用法、开发经验与值得保留的想法。'],
    ['/ai', '按用途标签和资源类型定位 Skill、Agent、Prompt、模型配置与产品。'],
  ]) {
    await page.goto(`/#${path}`)
    await expect(page.getByText(description, { exact: true })).toBeVisible()
  }

  await page.goto('/#/nav')
  const navCards = page.locator('.nav-grid .nav-card')
  const first = await navCards.nth(0).boundingBox()
  const second = await navCards.nth(1).boundingBox()
  expect(Math.abs(first.y - second.y)).toBeLessThan(2)

  await page.goto('/#/library')
  const libraryCards = page.locator('.library-card')
  const libraryFirst = await libraryCards.nth(0).boundingBox()
  const librarySecond = await libraryCards.nth(1).boundingBox()
  expect(Math.abs(libraryFirst.y - librarySecond.y)).toBeLessThan(2)
})

test('AI Hub 用类型章节展示资源', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/#/ai')
  await expect(page.getByRole('region', { name: '资源概览' })).toBeVisible()
  for (const label of ['Skills', 'Agents', 'Prompts', '模型', '应用 / 产品']) {
    await expect(page.getByRole('region', { name: '资源概览' }).getByText(label, { exact: true })).toBeVisible()
  }
  await page.locator('.ai-resource-card', { has: page.getByRole('heading', { name: 'Code Review' }) }).click()
  await expect(page.getByRole('dialog', { name: 'Code Review' })).toBeVisible()
})

test('工具页用类别路线和目录行', async ({ page }) => {
  await page.goto('/#/tools')
  await expect(page.getByRole('heading', { name: /全部工具/ })).toBeVisible()
  await expect(page.getByRole('navigation', { name: '工具类别' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: '工具类别' }).getByRole('button', { name: /开发/ })).toBeVisible()
  await expect(page.locator('.directory .tool-card').first()).toBeVisible()
})
