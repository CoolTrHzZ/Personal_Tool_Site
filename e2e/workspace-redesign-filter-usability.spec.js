import { test, expect } from '@playwright/test'

test.use({ reducedMotion: 'reduce' })
const common = { enabled: true, order: 10, tags: ['常用'], updated: '2026-09-08' }
const fixtures = {
  categories: [{ id: 'development', name: '开发', icon: 'Code2', order: 10 }],
  navigation: [{ ...common, id: 'docs', name: '示例文档', category: 'development', url: 'https://docs.example.com', description: '开发文档', icon: 'letter' }],
  library: [{ ...common, id: 'repo', name: '示例收藏', kind: 'repo', url: 'https://github.com/example/repo', description: '常用仓库', language: 'TypeScript' }],
  notes: [{ ...common, id: 'note', title: '示例笔记', summary: '配置说明', body: '# 示例笔记', kind: 'note', projectId: 'desktop', cfgIds: [] }],
  projects: [{ ...common, id: 'desktop', name: '示例桌面工具', description: '桌面工具说明', kind: 'desktop', status: 'active', cfgIds: [], version: '1.0.0', platform: 'windows-x64' }],
  cfgs: [{ ...common, id: 'cfg', name: '示例配置', filename: 'autoexec.cfg', category: '社区服', description: '社区服配置', version: 1 }],
}
const manifest = { ...common, id: 'json', name: '示例 JSON', description: '格式化与校验 JSON', type: 'react', entry: 'react', category: 'development', version: '1.0.0', icon: 'Code2', keywords: ['json'], status: 'active' }

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => sessionStorage.setItem('devos-boot', '1'))
  for (const [name, value] of Object.entries(fixtures)) {
    await context.route(`**/src/data/${name}.json*`, route => route.fulfill({ contentType: 'text/javascript', body: `export default ${JSON.stringify(value)}` }))
  }
  await context.route('**/tools-manifests.json', route => route.fulfill({ json: [manifest, { ...manifest, id: 'timestamp', name: '时间戳', description: 'Unix 时间戳互转', keywords: ['timestamp'], order: 20 }] }))
})

const cases = [
  { path: 'library', params: 'kind=removed&language=removed&tag=removed', fields: ['收藏语言', '收藏标签'], group: '收藏类型', search: '搜索收藏', cards: '.nav-card' },
  { path: 'notes', params: 'kind=removed&project=removed', fields: ['手册类型', '笔记关联项目'], search: '搜索笔记', cards: '.note-card' },
  { path: 'nav', params: 'category=removed&tag=removed', fields: ['网站分类', '网站标签'], search: '搜索网站', cards: '.nav-card' },
  { path: 'projects', params: 'kind=removed&status=removed', fields: ['项目类型', '维护状态'], search: '搜索桌面工具', cards: '.project-card' },
  { path: 'cfg', params: 'category=removed&sort=removed', fields: ['CFG 排序'], group: 'CFG 分类', search: '搜索 CFG 配置', cards: '.cfg-library-card' },
  { path: 'tools', params: 'category=removed&status=removed&sort=removed', fields: ['状态', '排序'], group: '工具类别', search: '搜索工具', cards: '.directory .tool-card' },
]
for (const entry of cases) {
  test(`${entry.path} 失效筛选明确显示，匹配结果也能一键清除`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`/#/${entry.path}?${entry.params}`)
    for (const name of entry.fields) {
      const field = page.getByRole('combobox', { name, exact: true })
      await expect(field).toHaveValue('removed')
      await expect(field.locator('option:checked')).toHaveText('已失效：removed')
    }
    if (entry.group) await expect(page.getByRole('navigation', { name: entry.group }).getByRole('button', { name: '已失效：removed' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator(entry.cards)).toHaveCount(0)
    await page.getByRole('button', { name: '清除筛选', exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`#/${entry.path}$`))
    await expect(page.locator(entry.cards)).toHaveCount(entry.path === 'tools' ? 2 : 1)
    await page.getByRole('textbox', { name: entry.search, exact: true }).fill('示例')
    await expect(page.locator(entry.cards)).toHaveCount(1)
    await expect(page.getByRole('button', { name: '清除筛选', exact: true })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('textbox', { name: entry.search, exact: true })).toHaveValue('示例')
    await expect(page.locator(entry.cards)).toHaveCount(1)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.getByRole('button', { name: '清除筛选', exact: true }).click()
    await expect(page.getByRole('textbox', { name: entry.search, exact: true })).toHaveValue('')
    const keyword = entry.path === 'cfg' ? 'default' : 'all'
    await page.getByRole('textbox', { name: entry.search, exact: true }).fill(keyword)
    await expect(page.getByRole('textbox', { name: entry.search, exact: true })).toHaveValue(keyword)
    await expect(page).toHaveURL(new RegExp(`[?&]q=${keyword}$`))
  })
}

test('工具目录筛选刷新和工具内返回保持一致，分类选择可读', async ({ page }) => {
  await page.goto('/#/tools')
  const category = page.getByRole('navigation', { name: '工具类别' }).getByRole('button', { name: /development/ })
  await category.click()
  await expect(category).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('textbox', { name: '搜索工具', exact: true }).fill('JSON')
  await page.getByRole('combobox', { name: '状态', exact: true }).selectOption('active')
  await page.getByRole('combobox', { name: '排序', exact: true }).selectOption('recommended')
  const url = page.url()
  await page.reload()
  await expect(category).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('textbox', { name: '搜索工具', exact: true })).toHaveValue('JSON')
  await page.keyboard.press('Control+k')
  const palette = page.getByRole('dialog', { name: '命令面板' })
  await palette.getByRole('combobox', { name: '命令面板搜索' }).fill('示例 JSON')
  await palette.getByRole('combobox', { name: '命令面板搜索' }).press('Enter')
  await expect(page).toHaveURL(/#\/tools\/json$/)
  await page.getByRole('link', { name: '← 工具中心', exact: true }).click()
  await expect(page).toHaveURL(url)
  await expect(page.getByRole('combobox', { name: '状态', exact: true })).toHaveValue('active')
  await expect(page.getByRole('combobox', { name: '排序', exact: true })).toHaveValue('recommended')
  await page.getByRole('link', { name: '打开 示例 JSON', exact: true }).click()
  await expect(page).toHaveURL(/#\/tools\/json$/)
  await page.getByRole('link', { name: '← 工具中心', exact: true }).click()
  await expect(page).toHaveURL(url)
  await expect(page.locator('.directory .tool-card')).toHaveCount(1)
  await page.getByRole('link', { name: '打开 示例 JSON', exact: true }).click()
  await page.goBack()
  await expect(page).toHaveURL(url)
  await expect(page.getByRole('textbox', { name: '搜索工具', exact: true })).toHaveValue('JSON')
})

test('名为 all 的自定义标签、语言、分类和项目不会被当成全部', async ({ page, context }) => {
  const customFixtures = {
    categories: [...fixtures.categories, { ...fixtures.categories[0], id: 'all', name: 'all' }],
    navigation: [...fixtures.navigation, { ...fixtures.navigation[0], id: 'all-site', name: 'all 专用网站', category: 'all', tags: ['all'] }],
    library: [...fixtures.library, { ...fixtures.library[0], id: 'all-repo', name: 'all 专用收藏', language: 'all', tags: ['all'] }],
    projects: [...fixtures.projects, { ...fixtures.projects[0], id: 'all', name: 'all 专用项目' }],
    notes: [...fixtures.notes, { ...fixtures.notes[0], id: 'all-note', title: 'all 专用笔记', projectId: 'all' }],
    cfgs: [...fixtures.cfgs, { ...fixtures.cfgs[0], id: 'all-cfg', name: 'all 专用配置', category: 'all' }],
  }
  for (const [name, value] of Object.entries(customFixtures)) {
    await context.route(`**/src/data/${name}.json*`, route => route.fulfill({ contentType: 'text/javascript', body: `export default ${JSON.stringify(value)}` }))
  }
  await context.route('**/tools-manifests.json', route => route.fulfill({ json: [manifest, { ...manifest, id: 'timestamp', name: 'all 专用工具', category: 'all' }] }))
  const pages = [
    { path: 'library', fields: ['收藏标签', '收藏语言'], cards: '.nav-card' },
    { path: 'nav', fields: ['网站标签', '网站分类'], cards: '.nav-card' },
    { path: 'notes', fields: ['笔记关联项目'], cards: '.note-card' },
    { path: 'cfg', fields: [], group: 'CFG 分类', cards: '.cfg-library-card' },
    { path: 'tools', fields: [], group: '工具类别', cards: '.directory .tool-card' },
  ]
  for (const entry of pages) {
    await page.goto(`/#/${entry.path}`)
    await expect(page.locator(entry.cards)).toHaveCount(2)
    for (const name of entry.fields) await page.getByRole('combobox', { name, exact: true }).selectOption('all')
    if (entry.group) await page.getByRole('navigation', { name: entry.group }).getByRole('button', { name: /^all/ }).click()
    await expect(page.locator(entry.cards)).toHaveCount(1)
    await expect(page.locator(entry.cards)).toContainText('all 专用')
    await page.reload()
    await expect(page.locator(entry.cards)).toHaveCount(1)
    for (const name of entry.fields) {
      await expect(page.getByRole('combobox', { name, exact: true })).toHaveValue('all')
      await page.getByRole('combobox', { name, exact: true }).selectOption('')
    }
    if (entry.group) await page.getByRole('navigation', { name: entry.group }).getByRole('button', { name: /^全部/ }).click()
    await expect(page.locator(entry.cards)).toHaveCount(2)
    await expect(page).toHaveURL(new RegExp(`#/${entry.path}$`))
  }
})
