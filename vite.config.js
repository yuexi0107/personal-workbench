import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 个人工作台：统一入口（控制台 + 面试 + 资金）
// 端口 5177（5178/5179 为旧面试/资金应用预留，旧应用退役后由本应用接管个人入口）
export default defineConfig({
  plugins: [react()],
  base: './',
  build: { outDir: 'dist', assetsDir: 'assets' },
  server: { host: true, port: 5177, strictPort: true }
})
