import { createRoot } from 'react-dom/client'
import { initTheme } from './app/theme.js'
import App from './app/App.jsx'
import './styles/wb-shell.css'
import './styles/wb-interview.css'
import './styles/wb-fund.css'
import './styles/wb-boards.css'
import './styles/wb-theme.css'

// 模块顶层即应用主题（index.html 引导脚本已先行设置，这里兜底并监听系统主题切换）
initTheme()

createRoot(document.getElementById('root')).render(<App />)
