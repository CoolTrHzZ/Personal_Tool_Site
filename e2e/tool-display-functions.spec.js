import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'

const cs2Manifest = JSON.parse(readFileSync(new URL('../src/tools/packages/cs2-color/manifest.json', import.meta.url), 'utf8'))

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('devos-boot', '1'))
  // 内置 CS2 包可能被用户从目录中移除；只在测试响应中注册它。
  await page.route('**/tools-manifests.json', async route => {
    const response = await route.fetch()
    const tools = await response.json()
    await route.fulfill({ response, json: tools.some(tool => tool.id === cs2Manifest.id) ? tools : [...tools, cs2Manifest] })
  })
})

test('JSON 支持 Unicode、标量、压缩和错误恢复', async ({ page }) => {
  await page.goto('/#/tools/json')
  const input = page.getByLabel('JSON 输入')
  await input.fill('{"名字":"工作站 🚀","items":[1,true,null]}')
  await page.getByRole('button', { name: '格式化', exact: true }).click()
  await expect(page.getByLabel('结果')).toHaveValue('{\n  "名字": "工作站 🚀",\n  "items": [\n    1,\n    true,\n    null\n  ]\n}')
  await page.getByRole('button', { name: '压缩', exact: true }).click()
  await expect(page.getByLabel('结果')).toHaveValue('{"名字":"工作站 🚀","items":[1,true,null]}')
  await input.fill('{invalid')
  await page.getByRole('button', { name: '格式化', exact: true }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByLabel('结果')).toHaveCount(0)
  await input.fill('false')
  await page.getByRole('button', { name: '格式化', exact: true }).click()
  await expect(page.getByLabel('结果')).toHaveValue('false')
  await expect(page.getByRole('alert')).toHaveCount(0)
  for (const unsafe of ['{"id":9007199254740993}', '1e400']) {
    await input.fill(unsafe)
    await page.getByRole('button', { name: '格式化', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('数值超出安全精度')
    await expect(page.getByLabel('结果')).toHaveCount(0)
  }
  await input.fill('{"id":"9007199254740993"}')
  await page.getByRole('button', { name: '压缩', exact: true }).click()
  await expect(page.getByLabel('结果')).toHaveValue('{"id":"9007199254740993"}')
  await page.getByRole('button', { name: '清空', exact: true }).click()
  await expect(input).toHaveValue('')
})

test('Base64 Unicode 往返、无效 UTF-8 与非法编码', async ({ page }) => {
  await page.goto('/#/tools/base64')
  const input = page.getByLabel('输入')
  const result = page.getByLabel('结果')
  await input.fill('你好 👩‍💻\n工作站')
  await page.getByRole('button', { name: '编码', exact: true }).click()
  await expect(result).toHaveValue('5L2g5aW9IPCfkanigI3wn5K7CuW3peS9nOermQ==')
  await page.getByRole('button', { name: '交换', exact: true }).click()
  await page.getByRole('button', { name: '解码', exact: true }).click()
  await expect(result).toHaveValue('你好 👩‍💻\n工作站')
  await input.fill('77u/aGVsbG8=')
  await page.getByRole('button', { name: '解码', exact: true }).click()
  await expect(result).toHaveValue('\uFEFFhello')
  for (const invalid of ['/w==', '%%%']) {
    await input.fill(invalid)
    await page.getByRole('button', { name: '解码', exact: true }).click()
    await expect(page.getByRole('alert')).toBeVisible()
    await expect(result).toHaveValue('')
  }
  await page.getByRole('button', { name: '清空', exact: true }).click()
  await expect(input).toHaveValue('')
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('URL 编解码保留查询值并区分错误与结果', async ({ page }) => {
  await page.goto('/#/tools/url')
  const input = page.getByLabel('文本')
  const result = page.getByLabel('结果')
  await input.fill('工作站 & a+b/🚀')
  await page.getByRole('button', { name: 'Encode', exact: true }).click()
  await expect(result).toHaveValue('%E5%B7%A5%E4%BD%9C%E7%AB%99%20%26%20a%2Bb%2F%F0%9F%9A%80')
  await input.fill(await result.inputValue())
  await page.getByRole('button', { name: 'Decode', exact: true }).click()
  await expect(result).toHaveValue('工作站 & a+b/🚀')
  await input.fill('%E0%A4%A')
  await page.getByRole('button', { name: 'Decode', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('无效的 URL 编码')
  await expect(result).toHaveValue('')
})

test('时间戳保留毫秒、支持负值并拒绝空输入', async ({ page }) => {
  await page.goto('/#/tools/timestamp')
  const input = page.getByLabel('时间戳')
  await page.getByLabel('单位').selectOption('milliseconds')
  for (const value of ['1723987654321', '-12345', '0']) {
    await input.fill(value)
    await page.getByRole('button', { name: '时间戳转时间', exact: true }).click()
    await page.getByRole('button', { name: '时间转时间戳', exact: true }).click()
    await expect(input).toHaveValue(value)
  }
  await input.fill('1723987654321')
  await page.getByLabel('单位').selectOption('seconds')
  await expect(input).toHaveValue('1723987654.321')
  for (const value of ['1723987654.321', '1.001', '-1.001', '0.001']) {
    await input.fill(value)
    await page.getByRole('button', { name: '时间戳转时间', exact: true }).click()
    await page.getByRole('button', { name: '时间转时间戳', exact: true }).click()
    await expect(input).toHaveValue(value)
  }
  for (const value of ['', ' ', 'not-a-timestamp', '1e100']) {
    await input.fill(value)
    await page.getByRole('button', { name: '时间戳转时间', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('请输入有效时间戳')
  }
})

test('CS2 渐变保持完整字形并让预览与输出一致', async ({ page }) => {
  await page.goto('/#/tools/cs2-color-text')
  await page.getByLabel('输入文本').fill('👩‍💻A\n')
  await page.getByLabel('模式').selectOption('gradient')
  await page.getByLabel('起始颜色').fill('#112233')
  await page.getByLabel('结束颜色').fill('#445566')
  await expect(page.getByLabel('输出（含不可见控制字符）')).toHaveValue('\x07112233👩‍💻\x07445566A\n')
  const preview = page.locator('.color-preview span')
  await expect(preview).toHaveCount(3)
  await expect(preview.nth(0)).toHaveText('👩‍💻')
  await expect(preview.nth(0)).toHaveCSS('color', 'rgb(17, 34, 51)')
  await expect(preview.nth(1)).toHaveCSS('color', 'rgb(68, 85, 102)')
})

test('所有原生复制按钮处理剪贴板拒绝且不丢失结果', async ({ page }) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async () => { throw new Error('permission denied') } },
    })
  })
  for (const id of ['json', 'base64', 'url', 'cs2-color-text']) {
    await page.goto(`/#/tools/${id}`)
    if (id === 'json') await page.getByRole('button', { name: '格式化', exact: true }).click()
    if (id === 'base64') {
      await page.getByLabel('输入').fill('hello')
      await page.getByRole('button', { name: '编码', exact: true }).click()
    }
    if (id === 'url') {
      await page.getByLabel('文本').fill('hello world')
      await page.getByRole('button', { name: 'Encode', exact: true }).click()
    }
    const result = page.locator('textarea[readonly]')
    const original = await result.inputValue()
    await page.getByRole('button', { name: /复制结果|复制输出/ }).click()
    await expect(page.getByRole('alert')).toContainText('复制失败')
    await expect(result).toHaveValue(original)
  }
  expect(errors).toEqual([])
})

for (const disabled of [{ enabled: false }, { status: 'disabled' }]) {
  test(`禁用工具直接访问被拦截：${JSON.stringify(disabled)}`, async ({ page }) => {
    await page.route('**/tools-manifests.json', async route => {
      const response = await route.fetch()
      const tools = await response.json()
      await route.fulfill({ response, json: tools.map(tool => tool.id === 'json' ? { ...tool, ...disabled } : tool) })
    })
    await page.goto('/#/tools/json')
    await expect(page.getByRole('heading', { name: '工具已停用', exact: true })).toBeVisible()
    await expect(page.getByLabel('JSON 输入')).toHaveCount(0)
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('recentTools') || '[]'))).not.toContain('json')
  })
}

test('工具直达也记录最近使用', async ({ page }) => {
  await page.goto('/#/tools/json')
  await expect(page.getByLabel('JSON 输入')).toBeVisible()
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('recentTools') || '[]'))).toContain('json')
})

test('空工具目录结束加载并显示缺失工具页', async ({ page }) => {
  await page.route('**/tools-manifests.json', route => route.fulfill({ json: [] }))
  await page.goto('/#/tools')
  await expect(page.getByText('暂无可用工具', { exact: true })).toBeVisible()
  await expect(page.getByTestId('tools-skeleton')).toHaveCount(0)
  await page.goto('/#/tools/missing')
  await expect(page.getByText('加载工具中…', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: /404|页面/ })).toBeVisible()
})
