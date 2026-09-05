import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = dirname(fileURLToPath(import.meta.url))
const site = JSON.parse(readFileSync(resolve(root, 'src/data/site.json'), 'utf8')) as { publicUrl?: string; basePath?: string }
let deploymentBase = process.env.BASE_URL || site.basePath || './'

function publicHost() {
  try {
    const url = new URL(site.publicUrl || '')
    return /^https?:$/.test(url.protocol) && !url.port && !/(^|\.)github\.io$/.test(url.hostname) && url.hostname !== 'localhost' ? url.hostname : ''
  } catch { return '' }
}

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'pages-static-assets',
      configResolved(config) { deploymentBase = config.base },
      configureServer(server) {
        server.middlewares.use((request, _response, next) => {
          // Admin writes atomically; a new visitor can arrive before the file watcher invalidates JSON.
          const dataFile = request.url?.split('?')[0].match(/\/src\/data\/([a-z0-9-]+\.json)$/)?.[1]
          if (dataFile) {
            server.moduleGraph.getModulesByFile(resolve(root, 'src/data', dataFile))?.forEach(module => server.moduleGraph.invalidateModule(module))
          }
          if (request.url?.split('?')[0] === `${server.config.base}toolbox-bridge.js`) {
            request.url = request.url.replace('toolbox-bridge.js', 'tools/toolbox-bridge.js')
          }
          next()
        })
      },
      generateBundle() {
        // Admin serves this legacy SDK URL; Pages needs a real file at the same path.
        this.emitFile({ type: 'asset', fileName: 'toolbox-bridge.js', source: readFileSync(resolve(root, 'public/tools/toolbox-bridge.js')) })
        const host = publicHost()
        if (host && ['/', './', ''].includes(deploymentBase)) this.emitFile({ type: 'asset', fileName: 'CNAME', source: `${host}\n` })
      },
    },
  ],
  base: deploymentBase,
})
