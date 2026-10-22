import { cpSync, createReadStream, existsSync, statSync } from 'node:fs'
import { normalize, resolve } from 'node:path'
import type { Connect, Plugin } from 'vite'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

function dataFiles(): Plugin {
  const root = resolve('data')
  const serve: Connect.NextHandleFunction = (req, res, next) => {
    const raw = (req.url ?? '').split('?')[0]
    const marker = '/data/'
    const at = raw.indexOf(marker)
    if (at === -1) return next()
    const rel = decodeURIComponent(raw.slice(at + marker.length))
    const file = normalize(resolve(root, rel))
    if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) return next()
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    createReadStream(file).pipe(res)
  }
  return {
    name: 'data-files',
    configureServer(server) {
      server.middlewares.use(serve)
    },
    configurePreviewServer(server) {
      server.middlewares.use(serve)
    },
    closeBundle() {
      cpSync(root, resolve('dist/data'), { recursive: true })
    },
  }
}

export default defineConfig({
  base: '/hackathon2026/',
  plugins: [react(), dataFiles()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
