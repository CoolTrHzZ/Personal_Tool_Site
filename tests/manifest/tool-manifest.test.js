import { describe, it, expect } from 'vitest'
import {
  validateManifest,
  migrateManifest,
  normalizeManifest,
  runtimeToLegacyType,
  validateEntryPath,
  validateZipEntries,
  detectFormat,
  scanHtmlCompat,
  suggestPermissionsFromHtml,
  slugifyId,
  uniqueToolId,
  extractHtmlMeta,
  buildSandbox,
  DEFAULT_PERMISSIONS,
} from '../../scripts/tool-manifest.mjs'

const htmlTool = { id: 'demo-tool', name: 'Demo', version: '1.0.0', type: 'html', entry: 'index.html' }

describe('validateManifest', () => {
  it('合法 manifest 无错误', () => {
    expect(validateManifest(htmlTool)).toEqual([])
  })

  it('非法 id / 缺 name / 非 semver version 各自报错', () => {
    const errors = validateManifest({ ...htmlTool, id: 'Bad Id', name: '', version: 'v1' })
    expect(errors.some(error => error.includes('id'))).toBe(true)
    expect(errors.some(error => error.includes('name'))).toBe(true)
    expect(errors.some(error => error.includes('version'))).toBe(true)
  })

  it('上传通道拒绝 react 工具', () => {
    expect(validateManifest({ ...htmlTool, type: 'react', entry: 'react' }, { upload: true })).toContain('上传通道不接受 react 工具')
  })

  it('iframe 工具 entry 必须是 http(s) URL', () => {
    expect(validateManifest({ ...htmlTool, type: 'iframe', entry: 'not-a-url' })).toContain('iframe 工具的 entry 必须是 http(s) URL')
    expect(validateManifest({ ...htmlTool, type: 'iframe', entry: 'https://example.com' })).toEqual([])
  })

  it('entry 路径穿越 / 反斜杠非法', () => {
    expect(validateManifest({ ...htmlTool, entry: '../evil.html' })).toContain('entry 路径无效')
    expect(validateManifest({ ...htmlTool, entry: 'a\\b.html' })).toContain('entry 路径无效')
  })

  it('hasEntry=false 时报文件不存在', () => {
    expect(validateManifest(htmlTool, { hasEntry: false })).toContain('manifest.entry 文件不存在')
  })

  it('非法 manifest 直接返回整体错误', () => {
    expect(validateManifest(null)).toEqual(['manifest 无效'])
  })
})

describe('migrateManifest（legacy type → runtime/format）', () => {
  it('type html → static / html-bundle', () => {
    expect(migrateManifest({ type: 'html' })).toMatchObject({ runtime: 'static', format: 'html-bundle' })
  })

  it('type react → react / react-package，type iframe → iframe / external-url', () => {
    expect(migrateManifest({ type: 'react' })).toMatchObject({ runtime: 'react', format: 'react-package' })
    expect(migrateManifest({ type: 'iframe' })).toMatchObject({ runtime: 'iframe', format: 'external-url' })
  })

  it('已具备 v2 字段时不被 legacy 覆盖', () => {
    expect(migrateManifest({ type: 'html', runtime: 'static', format: 'single-html' })).toMatchObject({ runtime: 'static', format: 'single-html' })
  })

  it('display 高度归一：非法值/auto → auto，超大值收敛到 5000', () => {
    expect(migrateManifest({ type: 'html', display: { height: 'abc' } }).display.height).toBe('auto')
    expect(migrateManifest({ type: 'html', display: { height: 99999 } }).display.height).toBe(5000)
  })

  it('permissions 与默认值合并', () => {
    const migrated = migrateManifest({ type: 'html', permissions: { clipboard: false } })
    expect(migrated.permissions.clipboard).toBe(false)
    expect(migrated.permissions.storage).toBe(DEFAULT_PERMISSIONS.storage)
  })

  it('runtimeToLegacyType 双向兼容', () => {
    expect(runtimeToLegacyType('react')).toBe('react')
    expect(runtimeToLegacyType('iframe')).toBe('iframe')
    expect(runtimeToLegacyType('static')).toBe('html')
  })
})

describe('normalizeManifest', () => {
  it('补全 v2 字段并保留 legacy type', () => {
    const normalized = normalizeManifest({ id: 'x', name: 'X', version: '1.0.0', type: 'html', entry: 'index.html' })
    expect(normalized.runtime).toBe('static')
    expect(normalized.type).toBe('html')
    expect(normalized.author).toBe('local')
    expect(normalized.enabled).toBe(true)
    expect(normalized.tags).toEqual([])
  })

  it('tags 缺失时回退 keywords；enabled=false 时 status=disabled', () => {
    const normalized = normalizeManifest({ id: 'x', name: 'X', version: '1.0.0', type: 'html', entry: 'index.html', keywords: ['a'], enabled: false })
    expect(normalized.tags).toEqual(['a'])
    expect(normalized.status).toBe('disabled')
    expect(normalized.enabled).toBe(false)
  })
})

describe('路径与 ZIP 安全', () => {
  it('validateEntryPath 拒绝绝对路径 / 穿越 / 隐藏段', () => {
    expect(validateEntryPath('index.html')).toBe(true)
    expect(validateEntryPath('a/b/c.js')).toBe(true)
    expect(validateEntryPath('/abs.html')).toBe(false)
    expect(validateEntryPath('../up.html')).toBe(false)
    expect(validateEntryPath('.hidden/x.js')).toBe(false)
    expect(validateEntryPath('a//b.js')).toBe(false)
  })

  it('validateZipEntries 拦截 ../、隐藏文件、__MACOSX、Thumbs.db', () => {
    expect(validateZipEntries(['index.html', 'assets/app.js'])).toEqual([])
    const errors = validateZipEntries(['../evil.js', '.DS_Store', '__MACOSX/x', 'Thumbs.db', 'ok.js'])
    expect(errors).toHaveLength(4)
  })
})

describe('格式识别 / 兼容性扫描', () => {
  it('detectFormat：单文件 → single-html；wasm 优先；构建产物 → webapp-build', () => {
    expect(detectFormat('index.html', ['index.html'])).toBe('single-html')
    expect(detectFormat('index.html', ['index.html', 'app.wasm'])).toBe('wasm')
    expect(detectFormat('index.html', ['index.html', 'assets/app.js', 'assets/style.css'])).toBe('webapp-build')
    expect(detectFormat('index.html', ['index.html', 'lib/x.js', 'lib/y.css'])).toBe('html-bundle')
  })

  it('scanHtmlCompat：缺 title/charset 警告、clipboard 提示', () => {
    const issues = scanHtmlCompat('<html><body>hi</body></html>', [])
    expect(issues.some(issue => issue.level === 'warn' && issue.message.includes('title'))).toBe(true)
    expect(issues.some(issue => issue.message.includes('charset'))).toBe(true)

    const clipboard = scanHtmlCompat('<html><head><meta charset="UTF-8"><title>t</title></head><body><script>navigator.clipboard.writeText("x")</script></body></html>', [])
    expect(clipboard.some(issue => issue.message.includes('剪贴板'))).toBe(true)
  })

  it('suggestPermissionsFromHtml：clipboard / localStorage→sameOrigin / wasm→sameOrigin', () => {
    const permissions = suggestPermissionsFromHtml('<script>navigator.clipboard.writeText(1)</script>', [])
    expect(permissions.clipboard).toBe(true)

    const storage = suggestPermissionsFromHtml('<script>localStorage.setItem("a", 1)</script>', [])
    expect(storage.sameOrigin).toBe(true)

    const wasm = suggestPermissionsFromHtml('<html></html>', ['app.wasm'])
    expect(wasm.sameOrigin).toBe(true)

    const blank = suggestPermissionsFromHtml('<html></html>', [])
    expect(blank.clipboard).toBe(false)
    expect(blank.storage).toBe(false)
  })
})

describe('id 生成', () => {
  it('slugifyId：中文/大写/空格 归一为短横线小写', () => {
    expect(slugifyId('CS2 Rainbow Generator')).toBe('cs2-rainbow-generator')
    expect(slugifyId('彩色字体')).toBe('imported-tool')  // 纯中文无 ascii → 默认 fallback
  })

  it('slugifyId：纯中文回退 fallback，保留字加 -tool 后缀', () => {
    expect(slugifyId('彩色字体', 'fallback-id')).toBe('fallback-id')
    expect(slugifyId('admin')).toBe('admin-tool')
    expect(slugifyId('manifest')).toBe('manifest-tool')
  })

  it('uniqueToolId：冲突时追加 -2/-3 序号', () => {
    expect(uniqueToolId('new-tool', new Set())).toBe('new-tool')
    expect(uniqueToolId('demo', new Set(['demo']))).toBe('demo-2')
    expect(uniqueToolId('demo', new Set(['demo', 'demo-2']))).toBe('demo-3')
  })
})

describe('extractHtmlMeta / buildSandbox', () => {
  it('extractHtmlMeta 提取 title / description / lang', () => {
    const meta = extractHtmlMeta('<html lang="zh-CN"><head><meta charset="UTF-8"><title> CS2  彩色 </title><meta name="description" content="生成彩虹文字"></head></html>')
    expect(meta).toEqual({ title: 'CS2 彩色', description: '生成彩虹文字', lang: 'zh-CN' })
  })

  it('buildSandbox 与权限一一对应', () => {
    const off = buildSandbox({ ...DEFAULT_PERMISSIONS, clipboard: false, storage: false })
    expect(off).toBe('allow-scripts allow-forms')
    const on = buildSandbox({ ...DEFAULT_PERMISSIONS, modals: true, download: true, externalLinks: true, sameOrigin: true })
    expect(on).toContain('allow-modals')
    expect(on).toContain('allow-downloads')
    expect(on).toContain('allow-popups')
    expect(on).toContain('allow-same-origin')
  })
})
