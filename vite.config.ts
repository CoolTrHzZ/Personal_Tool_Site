import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = dirname(fileURLToPath(import.meta.url))
const site = JSON.parse(readFileSync(resolve(root, 'src/data/site.json'), 'utf8')) as { publicUrl?: string; basePath?: string }

function publicHost() {
  try { return site.publicUrl ? new URL(site.publicUrl).host : '' } catch { return '' }
}

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'pages-cname',
      closeBundle() {
        const host = publicHost()
        if (!host) return
        writeFileSync(resolve(root, 'dist/CNAME'), `${host}\n`)
      },
    },
  ],
  base: process.env.BASE_URL || site.basePath || './',
  define: { __APP_VERSION__: JSON.stringify(process.env.npm_package_version || '3.1.0') },
})
