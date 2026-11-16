// 个人工作台外壳的本地存储层（wb: 前缀；子模块沿用各自的 iw: / fp: 前缀，互不干扰）
// 读写模式与两个子模块的 store 保持一致：useLocalState(key, initial) → [value, set, reset]
import { useState, useEffect, useCallback } from 'react'

const LS_EVENT = 'wb:ls-change'

export function readLS(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return fallback
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

export function writeLS(key, value) {
  localStorage.setItem(key, JSON.stringify(value))
  window.dispatchEvent(new CustomEvent(LS_EVENT, { detail: { key } }))
}

export function useLocalState(key, initial) {
  const [value, setValue] = useState(() => readLS(key, initial))

  useEffect(() => {
    const onChange = (e) => {
      if (e.detail && e.detail.key === key) setValue(readLS(key, initial))
    }
    window.addEventListener(LS_EVENT, onChange)
    return () => window.removeEventListener(LS_EVENT, onChange)
  }, [key])

  const set = useCallback((v) => {
    setValue((prev) => {
      const next = typeof v === 'function' ? v(prev) : v
      writeLS(key, next)
      return next
    })
  }, [key])

  const reset = useCallback(() => {
    localStorage.removeItem(key)
    setValue(initial)
    window.dispatchEvent(new CustomEvent(LS_EVENT, { detail: { key } }))
  }, [key])

  return [value, set, reset]
}

// 外壳存储键约定
export const WB = {
  profile: 'wb:profile',                   // 当前使用者标识，默认 'local'（预留多用户/角色扩展）
  visibility: 'wb:module-visibility',      // { [nodeId]: boolean } 模块/子页可见性（轻量权限）
  menuOrder: 'wb:menu-order',              // { roots: [...], children: {...} } 菜单顺序
  sidebarCollapsed: 'wb:sidebar-collapsed',// { interview: true } 侧栏分组折叠状态（true=折叠）
  mgrCollapsed: 'wb:mgr-collapsed',        // { life: true } 设置页「模块显示与排序」的分组折叠状态
  customModules: 'wb:custom-modules',      // [{ id, type, name, icon, createdAt }] 自定义看板登记表
  settingsOrder: 'wb:settings-card-order', // 设置页大模块卡片顺序 ['theme','ai','presets','data','modules','about']
  lastExport: 'wb:last-export'             // 上次全量导出时间（ISO 字符串），备份提醒用
}

// 当前使用者（默认 local；后续接账号体系时改这里即可让布局/可见性按人隔离）
export function getProfile() {
  return readLS(WB.profile, 'local') || 'local'
}

// 首页布局键：按使用者隔离（wb:layout:<profile>）
export function layoutKey(profile = getProfile()) {
  return `wb:layout:${profile}`
}

// 模块页面布局键：任意页面可申请自己的拖拽布局命名空间（wb:layout:<page>:<profile>）
export function pageLayoutKey(page, profile = getProfile()) {
  return `wb:layout:${page}:${profile}`
}

/**
 * 通用可拖拽布局 hook：{ order, hidden } 的归一化与增量操作，首页与各模块页面共用。
 * allIds 为该页面的完整条目注册表；存储中缺少/多余的 id 会被自动补齐或过滤，
 * 因此注册表后续新增条目时无需迁移旧数据。reset() 清空存储即回到默认顺序。
 */
export function useDragLayout(storageKey, allIds) {
  const [layout, setLayout] = useLocalState(storageKey, { order: [], hidden: [] })
  const stored = layout && typeof layout === 'object' ? layout : {}
  const savedOrder = (Array.isArray(stored.order) ? stored.order : []).filter((id) => allIds.includes(id))
  const order = [...savedOrder, ...allIds.filter((id) => !savedOrder.includes(id))]
  const hidden = (Array.isArray(stored.hidden) ? stored.hidden : []).filter((id) => allIds.includes(id))

  const patch = (p) => setLayout((prev) => ({ ...(prev && typeof prev === 'object' ? prev : {}), ...p }))
  const setOrder = (next) => patch({ order: next })
  const hide = (id) => patch({ hidden: [...new Set([...hidden, id])] })
  const show = (id) => patch({ hidden: hidden.filter((h) => h !== id) })
  const reset = () => setLayout({ order: [], hidden: [] })

  return { order, hidden, setOrder, hide, show, reset, customized: savedOrder.length > 0 || hidden.length > 0 }
}
