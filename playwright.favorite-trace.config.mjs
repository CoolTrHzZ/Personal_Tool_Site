import { defineConfig } from '@playwright/test'
import base from './playwright.config.mjs'

// Temporary diagnostic only; remove after the reviewed capture/fix.
if (process.env.DEVOS_FAVORITE_TRACE !== '1') throw new Error('Diagnostic marker required')
if (typeof process.getuid !== 'function' || typeof process.geteuid !== 'function' || process.getuid() === 0 || process.geteuid() === 0) throw new Error('Non-root UID and effective UID required for favorite trace')

const projects = base.projects.filter(project => project.name === 'workspace')
const servers = base.webServer.filter(server => server.url === 'http://127.0.0.1:5173/')
if (projects.length !== 1 || servers.length !== 1 || projects[0].use.baseURL !== 'http://127.0.0.1:5173') throw new Error('Expected the existing workspace project and Vite server')

export default defineConfig({
  ...base,
  webServer: servers[0],
  projects: [{
    ...projects[0],
    use: {
      ...projects[0].use,
      launchOptions: { ...base.use?.launchOptions, ...projects[0].use.launchOptions, chromiumSandbox: true },
      screenshot: 'on',
      video: 'on',
    },
  }],
})
