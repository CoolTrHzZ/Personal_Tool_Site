// Run: node scripts/check-pages.mjs — builds and serves only temporary static files.
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, extname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'
import { chromium, expect } from '@playwright/test'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const temporary = await mkdtemp(join(tmpdir(), 'devos-pages-'))
const site = JSON.parse(await readFile(join(root, 'src/data/site.json'), 'utf8'))
const sdk = await readFile(join(root, 'public/tools/toolbox-bridge.js'), 'utf8')
const cfgIndexPath = join(root, 'src/data/cfgs.json')
const cfgs = JSON.parse(await readFile(cfgIndexPath, 'utf8'))
const cfgFixture = { id: '11111111-1111-4111-8111-111111111111', name: 'Pages 配置检查', filename: 'pages-test.cfg', description: '静态配置库回归', category: '测试', tags: [], updated: '2026-09-05', order: 9999 }
const cfgContent = '\ufeff// 跨机器原文\r\nbind "SPACE" "+jump"\r\nbind x say \u0006社区\u0007ffffff彩字\u000b保留\u000e原文\u0010\r\n'
const projectIndexPath = join(root, 'src/data/projects.json')
const noteIndexPath = join(root, 'src/data/notes.json')
const projectFixture = { id: 'pages-project-check', name: 'Pages 项目检查', kind: 'service', description: '静态服务档案', body: '# 项目说明\n\n项目、手册和配置的静态关联。', repository: '', docs: '', url: 'https://example.com', status: 'active', tags: ['静态测试'], cfgIds: [cfgFixture.id], enabled: true, order: 9999, updated: '2026-09-05' }
const noteFixture = { id: 'pages-runbook-check', title: 'Pages 部署手册', summary: '检查静态手册', body: '# Pages 部署手册\n\n## 验证\n\n确认配置可下载。', kind: 'deploy', projectId: projectFixture.id, cfgIds: [cfgFixture.id], tags: [], enabled: true, order: 9999, updated: '2026-09-05' }
const projectItems = JSON.parse(await readFile(projectIndexPath, 'utf8'))
const noteItems = JSON.parse(await readFile(noteIndexPath, 'utf8'))
const fixtureModules = new Map([[cfgIndexPath, [...cfgs.filter(item => item.id !== cfgFixture.id), cfgFixture]], [projectIndexPath, [...projectItems.filter(item => item.id !== projectFixture.id), projectFixture]], [noteIndexPath, [...noteItems.filter(item => item.id !== noteFixture.id), noteFixture]]])
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' }
const browser = await chromium.launch()

try {
  for (const [name, base, mount] of [['relative', './', '/'], ['root', '/', '/'], ['repository', '/Personal_Tool_Site/', '/Personal_Tool_Site/']]) {
    const outDir = join(temporary, name)
    await build({ root, base, logLevel: 'error', plugins: [{ name: 'pages-content-fixtures', enforce: 'pre', load(id) { const value = fixtureModules.get(id.split('?')[0]); if (value) return JSON.stringify(value) } }], build: { outDir, emptyOutDir: true } })
    await mkdir(join(outDir, 'cfgs'), { recursive: true })
    await writeFile(join(outDir, 'cfgs', `${cfgFixture.id}.cfg`), cfgContent)
    const cname = await readFile(join(outDir, 'CNAME'), 'utf8').catch(() => '')
    const publicUrl = site.publicUrl ? new URL(site.publicUrl) : null
    const customDomain = publicUrl && !publicUrl.hostname.endsWith('.github.io') && !publicUrl.port && publicUrl.hostname !== 'localhost'
    assert.equal(cname.trim(), name !== 'repository' && customDomain ? publicUrl.hostname : '', 'CNAME must match the deployment destination')
    assert.equal(await readFile(join(outDir, 'toolbox-bridge.js'), 'utf8'), sdk, 'Pages must include the SDK URL provided by local Admin')
    assert.equal(await readFile(join(outDir, 'tools/toolbox-bridge.js'), 'utf8'), sdk)
    const index = await readFile(join(outDir, 'index.html'), 'utf8')
    assert(!index.includes('/src/main.tsx'), 'The artifact must contain compiled assets')

    const manifests = JSON.parse(await readFile(join(outDir, 'tools-manifests.json'), 'utf8'))
    const staticTools = manifests.filter(tool => tool.enabled && (tool.runtime === 'static' || tool.type === 'html'))
    // Exercise the documented SDK import without changing the user's tool catalog.
    const fixture = { id: 'pages-bridge-check', name: 'Pages Bridge Check', type: 'html', entry: 'index.html', category: 'test', version: '1.0.0', enabled: true, icon: 'Code2', keywords: [], order: 9999, permissions: { storage: true } }
    await mkdir(join(outDir, 'tools', fixture.id), { recursive: true })
    await writeFile(join(outDir, 'tools', fixture.id, 'index.html'), `<!doctype html><meta charset="utf-8"><title>Pages Bridge Check</title><script src="../../toolbox-bridge.js"></script><button>Check bridge</button><output></output><script>
      document.querySelector('button').onclick = async () => {
        try {
          await Toolbox.storage.set('check', 'ready');
          const value = await Toolbox.storage.get('check');
          const theme = await Toolbox.theme.get();
          document.querySelector('output').textContent = value + ':' + theme.mode;
        } catch (error) { document.querySelector('output').textContent = error.message; }
      };
    </script>`)
    await writeFile(join(outDir, 'tools-manifests.json'), JSON.stringify([...manifests, fixture]))

    // Deliberately no API handlers and no SPA fallback: GitHub Pages serves files.
    const server = createServer(async (request, response) => {
      try {
        const pathname = decodeURIComponent(new URL(request.url, 'http://static.test').pathname)
        const file = resolve(outDir, pathname.slice(mount.length) || 'index.html')
        if (!pathname.startsWith(mount) || !file.startsWith(`${outDir}${sep}`)) throw new Error('outside artifact')
        response.setHeader('Content-Type', mime[extname(file)] || 'application/octet-stream')
        response.end(await readFile(file))
      } catch { response.writeHead(404).end('Not found') }
    })
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    const origin = `http://127.0.0.1:${server.address().port}`
    const context = await browser.newContext({ reducedMotion: 'reduce' })
    const page = await context.newPage()
    const failures = []
    const paths = new Set()
    page.on('pageerror', error => failures.push(error.message))
    page.on('response', response => { if (response.url().startsWith(origin) && response.status() >= 400) failures.push(`${response.status()} ${response.url()}`) })
    await page.route('**/*', route => {
      const url = new URL(route.request().url())
      if (url.origin === origin) {
        paths.add(url.pathname)
        if (!url.pathname.startsWith(mount) || /\/(?:api|admin)(?:\/|$)/.test(url.pathname)) failures.push(`Unexpected backend or root request: ${url.pathname}`)
        return route.continue()
      }
      if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') failures.push(`Unexpected local service: ${url.href}`)
      return route.abort() // Fonts and external favicons must be optional.
    })
    try {
      await page.goto(`${origin}${mount}#/tools/json`)
      await expect(page.getByLabel('JSON 输入')).toBeVisible()
      await page.getByRole('button', { name: '格式化', exact: true }).click()
      await expect(page.locator('textarea[readonly]')).toHaveValue('{\n  "hello": "world"\n}')
      await page.reload()
      await expect(page.getByLabel('JSON 输入')).toBeVisible()
      assert.equal(await page.locator('link[rel="icon"]').evaluate(link => link.href), `${origin}${mount}favicon.svg`)
      await expect.poll(() => page.locator('.brand-symbol').evaluate(image => image.naturalWidth)).toBeGreaterThan(0)
      assert.equal(await page.locator('a[href*="127.0.0.1:4174"], a[href*="localhost"]').count(), 0, 'Production must not expose local Admin')
      for (const path of ['/tools', '/nav', '/library', '/notes', '/ai', '/cfg', '/projects', '/']) {
        await page.goto(`${origin}${mount}#${path}`)
        await expect(page.locator('main h1')).toBeVisible()
      }
      await page.goto(`${origin}${mount}#/projects/${projectFixture.id}`)
      await page.reload()
      await expect(page.getByRole('heading', { name: projectFixture.name, exact: true })).toBeVisible()
      await page.getByRole('link', { name: /Pages 部署手册/ }).click()
      await expect(page.getByRole('heading', { name: noteFixture.title, exact: true })).toBeVisible()
      await page.getByRole('navigation', { name: '手册关联资料' }).getByRole('link', { name: /CFG/ }).click()
      await expect(page.locator('.cfg-library-code')).toContainText('跨机器原文')
      for (const [id, name] of [['ai-context', 'AI 任务上下文包'], ['config-diff', '配置差异对比'], ['cs2-cfg', 'CS2 CFG 工作台']]) {
        await page.goto(`${origin}${mount}#/tools/${id}`)
        await expect(page.getByRole('heading', { name, exact: true })).toBeVisible()
      }
      await page.getByRole('textbox', { name: 'CFG 编辑器', exact: true }).fill('// 跨机器\nbind "SPACE" "+jump"')
      await page.getByRole('button', { name: '生成分享链接' }).click()
      const share = page.getByRole('textbox', { name: 'CFG 分享链接', exact: true })
      await expect(share).toHaveValue(/#\/tools\/cs2-cfg\?cfg=/)
      const sharedUrl = await share.inputValue()
      assert(sharedUrl.startsWith(`${origin}${mount}#/`), 'CFG sharing must preserve the static deployment base')
      await page.goto(sharedUrl)
      await expect(page.getByRole('region', { name: 'CFG 导入预览' })).toContainText('跨机器')
      await page.goto(`${origin}${mount}#/cfg`)
      await page.getByRole('link', { name: cfgFixture.name, exact: true }).click()
      await expect(page.locator('.cfg-library-code')).toContainText('跨机器原文')
      await page.reload()
      await expect(page.locator('.cfg-library-code')).toContainText('跨机器原文')
      const cfgDownloadEvent = page.waitForEvent('download')
      await page.getByRole('button', { name: '下载 CFG', exact: true }).click()
      const cfgDownload = await cfgDownloadEvent
      assert.equal(cfgDownload.suggestedFilename(), cfgFixture.filename)
      assert.equal(await readFile(await cfgDownload.path(), 'utf8'), cfgContent)
      assert(paths.has(`${mount}cfgs/${cfgFixture.id}.cfg`), 'CFG library assets must stay below the deployment base')
      for (const tool of staticTools) {
        await page.goto(`${origin}${mount}#/tools/${tool.id}`)
        const entry = tool.entry.split('/').map(encodeURIComponent).join('/')
        await expect(page.getByTestId('tool-frame')).toHaveAttribute('src', `${base}tools/${encodeURIComponent(tool.id)}/${entry}`)
        await expect(page.frameLocator('[data-testid="tool-frame"]').locator('body')).not.toHaveText('')
      }
      await page.goto(`${origin}${mount}#/tools/${fixture.id}`)
      const frame = page.frameLocator('[data-testid="tool-frame"]')
      await frame.getByRole('button', { name: 'Check bridge' }).click()
      await expect(frame.locator('output')).toHaveText('ready:dark')
      assert(paths.has(`${mount}tools-manifests.json`), 'Tool manifests must load below the deployment base')
      assert(paths.has(`${mount}toolbox-bridge.js`), 'The SDK must load below the deployment base')
      assert.deepEqual(failures, [])
      console.log(`PASS ${name}: build, hash reload, eight pages, project/runbook relations, CFG preview/download, ${staticTools.length} static tools, bridge, no backend`)
    } finally {
      await context.close()
      await new Promise(resolve => server.close(resolve))
    }
  }
} finally {
  await browser.close()
  await rm(temporary, { recursive: true, force: true })
}
