// 全局主题机制（浅色 / 深色）说明：
// 1. 用户偏好保存在 localStorage 键 'wb:theme'，取值 'auto' | 'light' | 'dark'，缺省 'auto'；
// 2. JS 统一负责解析：'auto' 时用 matchMedia('(prefers-color-scheme: dark)') 跟随系统，
//    解析结果总是具体值（'light' 或 'dark'），写到 document.documentElement.dataset.theme；
// 3. CSS 侧只在 src/styles/wb-theme.css 按 [data-theme="dark"] 写覆盖，不写 auto 媒体查询；
// 4. index.html 的 <head> 内联引导脚本与本文件 applyTheme 逻辑一致（防首帧闪白 FOUC），
//    main.jsx 模块顶层再调用一次 initTheme() 兜底，并监听系统主题变化。

const THEME_KEY = 'wb:theme'

// 读取用户偏好（'auto' | 'light' | 'dark'），storage 不可用（隐私模式等）时回退 'auto'
export function getThemeMode() {
  try {
    const v = localStorage.getItem(THEME_KEY)
    return v === 'light' || v === 'dark' ? v : 'auto'
  } catch (e) {
    return 'auto'
  }
}

// 按当前偏好解析并把具体主题写到 <html data-theme="...">（总是 'light' 或 'dark'）
export function applyTheme() {
  const mode = getThemeMode()
  let dark = mode === 'dark'
  if (mode === 'auto') {
    try {
      dark = !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)
    } catch (e) {
      dark = false
    }
  }
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
}

// 写入偏好并立即生效
export function setThemeMode(mode) {
  const next = mode === 'light' || mode === 'dark' ? mode : 'auto'
  try {
    localStorage.setItem(THEME_KEY, next)
  } catch (e) {
    // 写入失败不阻断：本次会话内主题仍会切换，只是刷新后不记忆
  }
  applyTheme()
}

// 应用入口调用：立即应用一次 + 监听系统主题变化（仅当前偏好为 'auto' 时跟随切换）
export function initTheme() {
  applyTheme()
  try {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => { if (getThemeMode() === 'auto') applyTheme() }
    if (media) {
      if (typeof media.addEventListener === 'function') {
        media.addEventListener('change', onChange)
      } else if (typeof media.addListener === 'function') {
        media.addListener(onChange) // 旧版 Safari 兼容
      }
    }
  } catch (e) {
    // matchMedia 不可用时忽略，保持首次 applyTheme 的结果
  }
}
