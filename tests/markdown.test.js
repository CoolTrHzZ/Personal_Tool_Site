import { describe, expect, it } from 'vitest'
import { renderMarkdown as renderWorkspaceMarkdown } from '../src/utils/markdown.ts'
import { renderMarkdown as renderAdminMarkdown } from '../admin/markdown.js'

describe.each([
  ['workspace', renderWorkspaceMarkdown],
  ['admin', renderAdminMarkdown],
])('%s markdown images', (_, renderMarkdown) => {
  it('renders safe remote and local images without turning them into links', () => {
    expect(renderMarkdown('![remote](https://example.com/a.png)')).toContain('<img src="https://example.com/a.png" alt="remote" loading="lazy">')
    expect(renderMarkdown('![local](/images/a.png)')).toContain('<img src="/images/a.png" alt="local" loading="lazy">')
    expect(renderMarkdown('![bad](javascript:alert(1))')).not.toContain('<img')
    expect(renderMarkdown('![" onerror="alert(1)](/images/a.png)')).not.toContain('alt="" onerror=')
  })
})
