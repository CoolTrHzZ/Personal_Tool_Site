// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createAiService } from '../../scripts/admin-ai.mjs'

const directories = []
afterEach(async () => { vi.unstubAllGlobals(); await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive:true, force:true }))) })

it.each([
  ['provider HTTP rejection', 'AI_PROVIDER_HTTP', () => Promise.resolve(new globalThis.Response('synthetic-provider-body-must-not-be-exposed', { status:401 })), 401],
  ['timeout', 'AI_TIMEOUT', () => Promise.reject(new globalThis.DOMException('synthetic-provider-detail-must-not-be-exposed', 'TimeoutError')), undefined],
  ['response format', 'AI_RESPONSE_FORMAT', () => Promise.resolve(new globalThis.Response(JSON.stringify({ choices:[{ message:{ content:'synthetic-invalid-json' } }] }), { status:200 })), undefined],
])('reports only a safe reason for %s and preserves the synthetic form', async (_name, code, reply, providerStatus) => {
  const directory = await mkdtemp(join(tmpdir(), 'devos-ai-errors-')); directories.push(directory)
  await writeFile(join(directory, 'ai-provider.json'), JSON.stringify({ version:1, baseUrl:'https://provider.invalid/v1', model:'synthetic-model', apiKey:'synthetic-api-key', timeoutMs:1000 }), { mode:0o600 })
  const fetchMock = vi.fn(reply); vi.stubGlobal('fetch', fetchMock)
  const current = { name:'手写合成标题', url:'', description:'', tags:'' }
  const error = await createAiService({ directory }).suggest({ target:'navigation', source:'URL：https://example.invalid/test', current }).catch(value => value)
  expect(error).toMatchObject({ statusCode:503, code })
  expect(error.providerStatus).toBe(providerStatus)
  expect(error.message).toContain('已填写内容保留')
  expect(error.message).not.toContain('synthetic-')
  expect(current).toEqual({ name:'手写合成标题', url:'', description:'', tags:'' })
  expect(fetchMock).toHaveBeenCalledTimes(1)
})
