// hash 路由：统一路径 + 旧路径兼容重定向（旧应用无路由，#/iw/*、#/fp/* 与旧页签 key 对应）
// 路由组成：外壳固定页（控制台/设置）+ 扩展模块路由（modules/index.js 注册）+ 生活看板动态路由；
// 生活看板：/workbench/life/<boardId> 为动态路由（内置 4 看板 + 自定义看板共用一个页面容器）
import { useEffect, useState, lazy } from 'react'
import HomePage from './HomePage.jsx'
import SettingsPage from './SettingsPage.jsx'
import { findBoardLS } from '../boards/registry.js'
import { MODULE_MANIFESTS } from '../modules/index.js'

const BoardPage = lazy(() => import('../boards/BoardPage.jsx'))

// 模块路由展开：module / crumb 由清单统一补齐（crumb = [模块名, 页面名]，重定向路由无需面包屑）
const MODULE_ROUTES = MODULE_MANIFESTS.flatMap((m) =>
  m.routes.map((r) => (r.redirect ? r : { ...r, module: m.id, crumb: [m.name, r.title] }))
)

export const ROUTES = [
  { path: '/workbench', el: HomePage, crumb: ['控制台'], module: 'workbench', title: '控制台' },
  ...MODULE_ROUTES,
  { path: '/workbench/settings', el: SettingsPage, crumb: ['设置'], module: 'workbench', title: '设置' },
  // 生活看板：组根路径重定向到第一个内置看板；具体看板走动态路由（见 resolve）
  { path: '/workbench/life', redirect: '/workbench/life/week' }
]

// 动态看板路由：内置（weekly/skincare/anniversary/todo）与自定义（cm-*）看板共用
function resolveBoardRoute(p) {
  const m = p.match(/^\/workbench\/life\/([\w-]+)$/)
  if (!m) return null
  const board = findBoardLS(m[1])
  if (!board) return null
  return {
    route: {
      path: p, el: BoardPage, props: { boardId: board.id },
      crumb: ['生活看板', board.name], module: 'life', title: board.name,
      permission: `life.${board.id}.view`
    }
  }
}

// 旧链接兼容：旧应用根路径 → 统一路由；模块前缀（#/iw/*、#/fp/*）由各清单声明
const LEGACY = {
  '/': '/workbench',
  '/console': '/workbench',
  '/home': '/workbench',
  ...Object.fromEntries(MODULE_MANIFESTS.map((m) => [`/${m.id}`, m.legacy.fallback]))
}

export function currentPath() {
  const h = window.location.hash.replace(/^#/, '')
  return h || '/'
}

export function resolve(path) {
  const p = path.replace(/\/+$/, '') || '/'
  if (LEGACY[p]) return { redirect: LEGACY[p] }
  for (const m of MODULE_MANIFESTS) {
    const { prefix, tabs, fallback } = m.legacy
    const match = p.match(new RegExp(`^${prefix}/([\\w-]+)$`))
    if (match) {
      return { redirect: tabs.includes(match[1]) ? `/workbench/${m.id}/${match[1]}` : fallback }
    }
  }
  const board = resolveBoardRoute(p)
  if (board) return board
  const route = ROUTES.find((r) => r.path === p)
  if (!route) return null
  return route.redirect ? { redirect: route.redirect } : { route }
}

export function useRoute() {
  const [path, setPath] = useState(currentPath)
  useEffect(() => {
    const onChange = () => setPath(currentPath())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return path
}
