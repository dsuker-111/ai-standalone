import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// 读取 VERSION 文件 → 嵌入 __APP_VERSION__
let version = 'unknown'
try {
  version = readFileSync(resolve(__dirname, 'VERSION'), 'utf-8').trim()
} catch { /* ignore */ }

export default defineConfig({
  base: './',
  plugins: [vue()],
  define: {
    __APP_VERSION__: JSON.stringify(version)
  }
})