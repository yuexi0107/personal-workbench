// 个人工作台 · 统一外壳：侧边栏分组菜单（可折叠）+ 面包屑 + 权限守卫 + 统一加载/错误状态
// 子模块（面试/资金）以路由子页挂载，旧全局跳转钩子经 navigate.js 垫片映射；
// 侧栏不提供拖拽/显隐入口，模块的排序与显隐统一在「设置 → 模块显示与排序」管理（ModuleManager），
// 侧栏只按 wb:menu-order 的顺序渲染结果
import React, { Suspense, useEffect, useState } from 'react'
import { useRoute, resolve } from './router.js'
import { navigate, installNavShims } from './navigate.js'
import { usePermissions, hiddenNodeName } from './permissions.js'
import { useMenuConfig, PATH_PERMISSION } from './menu.js'
import { useLocalState, WB } from './store.js'
import Breadcrumb from '../components/Breadcrumb.jsx'
import ErrorBoundary from '../components/ErrorBoundary.jsx'
import PageState from '../components/PageState.jsx'
import { aiAvailable } from '../modules/interview/ai.js'

function AiStatus({ compact }) {
  const on = aiAvailable()
  return (
    <span className="topbar-right" title={on ? 'AI 已启用' : 'AI 未配置，可在设置中开启'}>
      <span className={`ai-dot ${on ? 'on' : 'off'}`} />
      {!compact && <span>{on ? 'AI 已启用' : 'AI 未配置'}</span>}
    </span>
  )
}

function NotFound() {
  return (
    <div className="module">
      <PageState
        status="error"
        icon="🧭"
        title="页面不存在"
        desc="链接可能已随旧版应用升级而变化。"
        action={<button className="btn btn-primary" onClick={() => navigate('/workbench')}>返回工作台</button>}
      />
    </div>
  )
}

// 侧栏导航按钮：直接渲染菜单树节点（排序结果来自设置页，不在此提供拖拽）
function NavItem({ item, isActive, onNavigate }) {
  return (
    <button
      className={`nav-item ${isActive ? 'active' : ''}`}
      onClick={() => onNavigate(item.path)}
    >
      <span className="nav-icon">{item.icon}</span>
      <span className="nav-body">
        <span className="nav-label">{item.name}</span>
        {item.desc && <span className="nav-desc">{item.desc}</span>}
      </span>
    </button>
  )
}

export default function App() {
  const path = useRoute()
  const { can, visibility } = usePermissions()
  const { tree } = useMenuConfig()
  const [navOpen, setNavOpen] = useState(false)

  // 分组折叠状态持久化（true=折叠）；当前路由落在组内时自动展开显示
  const [collapsed, setCollapsed] = useLocalState(WB.sidebarCollapsed, {})
  const toggleGroup = (key) => setCollapsed((c) => ({ ...(c || {}), [key]: !(c && c[key]) }))
  // 深链/快捷入口进入子页时，自动展开所在分组，避免当前页在折叠组里不可见
  useEffect(() => {
    const resolved = resolve(path)
    const modKey = resolved && resolved.route && resolved.route.module
    if (modKey && modKey !== 'workbench' && collapsed && collapsed[modKey]) {
      setCollapsed((c) => ({ ...(c || {}), [modKey]: false }))
    }
  }, [path, collapsed, setCollapsed])

  // 挂载旧应用导航垫片：__iwNavigate / __fpNavigate
  useEffect(() => { installNavShims() }, [])

  const resolved = resolve(path)
  const redirect = resolved && resolved.redirect
  useEffect(() => {
    if (redirect) navigate(redirect)
  }, [redirect])

  if (redirect) return null
  if (!resolved) return <NotFound />

  const route = resolved.route
  // 路由守卫按菜单节点判定：父级或子级被隐藏都拦截（动态看板路由自带 permission）
  const nodePerm = route.permission || PATH_PERMISSION[route.path] || 'workbench.view'
  const moduleAllowed = can(nodePerm)
  const hiddenName = hiddenNodeName(nodePerm, visibility)

  if (!moduleAllowed) {
    return (
      <div className="app">
        <div className="main">
          <header className="topbar">
            <Breadcrumb items={route.crumb} />
          </header>
          <div className="module">
            <PageState
              status="error"
              icon="🔒"
              title="该模块已隐藏"
              desc={`${hiddenName || route.title || '该页面'} 已在设置中关闭可见性，可在设置里重新开启。`}
              action={<button className="btn btn-primary" onClick={() => navigate('/workbench/settings')}>前往设置</button>}
            />
          </div>
        </div>
      </div>
    )
  }

  const aiOn = aiAvailable()
  const gotoNav = (p) => { navigate(p); setNavOpen(false) }

  return (
    <div className="app">
      <aside className={`sidebar ${navOpen ? 'open' : ''}`}>
        <div className="logo">
          {/* 侧栏 Logo：与 public/favicon.svg 同款（渐变 id 用 wb-logo-g，避免与页面内其他 SVG 冲突） */}
          <svg viewBox="0 0 48 48" width={38} height={38} aria-hidden="true">
            <defs>
              <linearGradient id="wb-logo-g" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#3b6ef5" />
                <stop offset="1" stopColor="#7a5cf0" />
              </linearGradient>
            </defs>
            <rect x="0" y="0" width="48" height="48" rx="11" fill="url(#wb-logo-g)" />
            <rect x="10" y="10" width="12.5" height="12.5" rx="3.5" fill="#ffffff" opacity="0.95" />
            <rect x="25.5" y="10" width="12.5" height="12.5" rx="3.5" fill="#ffffff" opacity="0.5" />
            <rect x="10" y="25.5" width="12.5" height="12.5" rx="3.5" fill="#ffffff" opacity="0.5" />
            <rect x="25.5" y="25.5" width="12.5" height="12.5" rx="3.5" fill="#ffb648" />
          </svg>
          <div>
            <div className="logo-title">个人工作台</div>
            <div className="logo-sub">Personal Workbench</div>
          </div>
        </div>
        <nav>
          {tree.filter((m) => m.visible).map((m) => (
            !m.children.length ? (
              <NavItem key={m.id} item={{ name: m.name, icon: m.icon, path: m.path }} isActive={path === m.path} onNavigate={gotoNav} />
            ) : (
              <div className="nav-group" key={m.id}>
                {(() => {
                  const visibleChildren = m.children.filter((c) => c.visible)
                  const hasActive = visibleChildren.some((c) => path === c.path)
                  const open = !(collapsed && collapsed[m.id])
                  return (
                    <>
                      <button
                        className={`nav-group-btn tone-${m.tone || 'none'} ${hasActive ? 'has-active' : ''}`}
                        onClick={() => toggleGroup(m.id)}
                        aria-expanded={open}
                        title={open ? '点击折叠' : '点击展开'}
                      >
                        <span className="nav-icon">{m.icon}</span>
                        <span className="nav-body"><span className="nav-label">{m.name}</span></span>
                        <span className={`nav-chevron ${open ? 'open' : ''}`} aria-hidden="true">▾</span>
                      </button>
                      <div className={`wb-collapse ${open ? 'open' : ''}`}>
                        <div className="wb-collapse-inner">
                          {visibleChildren.map((c) => (
                            <NavItem key={c.id} item={c} isActive={path === c.path} onNavigate={gotoNav} />
                          ))}
                        </div>
                      </div>
                    </>
                  )
                })()}
              </div>
            )
          ))}
        </nav>
        <div className="sidebar-foot">
          <span className={`ai-dot ${aiOn ? 'on' : 'off'}`} />
          {aiOn ? 'AI 已启用' : 'AI 未配置（离线模式）'}
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <button className="menu-btn" onClick={() => setNavOpen(!navOpen)}>☰</button>
          <Breadcrumb items={route.crumb} />
          <AiStatus />
        </header>
        <section className="content">
          <ErrorBoundary key={route.path}>
            <Suspense fallback={<div className="module"><PageState status="loading" title="模块加载中…" /></div>}>
              <route.el {...(route.props || {})} />
            </Suspense>
          </ErrorBoundary>
        </section>
      </div>
    </div>
  )
}
