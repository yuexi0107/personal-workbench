// ============================================================
// 菜单树：侧栏/显隐/排序的唯一真实来源
// 结构为嵌套数组，渲染顺序完全由持久化的 order 决定：
//   node = { id, name, icon, path, permission, fixed, visible, children }
// 组成：控制台/设置为外壳固定节点；扩展模块（面试/资金…）的组节点
//      来自 modules/index.js 注册的清单；生活看板组含内置看板 + 自定义看板。
// 持久化：
//   wb:menu-order        { roots: [id...], children: { [parentId]: [id...] } }
//   wb:module-visibility { [nodeId]: boolean }（父级隐藏→子级连带隐藏）
//   wb:custom-modules    [{ id, type, name, icon, createdAt }]（自定义看板，挂在「生活看板」组）
// ============================================================
import { useMemo } from 'react'
import { useLocalState, WB } from './store.js'
import { MODULE_MANIFESTS } from '../modules/index.js'

// 静态菜单定义（id=稳定键；新登记的 id 会被 normalizeOrder 自动追加到已存顺序末尾）
export const MENU_NODES = [
  {
    id: 'workbench', name: '控制台', icon: '🏠', path: '/workbench',
    permission: 'workbench.view', fixed: true, children: []
  },
  // 扩展模块组：节点定义随各模块 manifest.js 自动注册（新增模块无需改此文件）
  ...MODULE_MANIFESTS.map(({ id, name, icon, tone, permission, children }) => ({ id, name, icon, tone, permission, children })),
  {
    id: 'life', name: '生活看板', icon: '🌿', permission: 'life.view', tone: 'green',
    children: [
      // id 必须全局唯一（与其他组的子节点不冲突，如 fund 组的 weekly=周汇总）
      { id: 'week', name: '每周数据', icon: '📅', desc: '一周记录表格', path: '/workbench/life/week', permission: 'life.week.view' },
      { id: 'skincare', name: '护肤打卡', icon: '🧴', desc: '早晚分步打卡', path: '/workbench/life/skincare', permission: 'life.skincare.view' },
      { id: 'anniversary', name: '纪念日', icon: '💞', desc: '累计天数清单', path: '/workbench/life/anniversary', permission: 'life.anniversary.view' },
      { id: 'todo', name: '任务队列', icon: '✅', desc: '常规/周末队列与待办', path: '/workbench/life/todo', permission: 'life.todo.view' },
      { id: 'habit', name: '习惯打卡', icon: '🔥', desc: '连续天数与热力图', path: '/workbench/life/habit', permission: 'life.habit.view' }
    ]
  },
  {
    id: 'settings', name: '设置', icon: '⚙️', path: '/workbench/settings',
    permission: 'workbench.view', fixed: true, children: []
  }
]

export const NODE_BY_KEY = {}
export const PARENT_OF = {}

// ---- 动态自定义看板节点（wb:custom-modules）----
// 自定义看板统一挂在「生活看板」组下；登记表变化时经 syncCustomNodes 重建索引，
// 排序/显隐沿用同一套 wb:menu-order / wb:module-visibility（新 id 由 normalizeOrder 自动追加）。
let EXTRA_CHILDREN = [] // [{ id, name, icon, desc, path, permission }]

/** 由 boards/store.js 在新增/删除自定义看板后调用；useCustomBoards 在渲染期同步 */
export function syncCustomNodes(list) {
  const nodes = (Array.isArray(list) ? list : [])
    .filter((b) => b && b.id && b.type)
    .map((b) => ({
      id: b.id, name: b.name, icon: b.icon || '🧩',
      desc: '自定义看板', path: `/workbench/life/${b.id}`,
      permission: `life.${b.id}.view`
    }))
  // 签名含全量内容（id/名称/图标）：改名/换图标后也要重建索引，不能只比 id
  const sig = JSON.stringify(nodes)
  if (sig === JSON.stringify(EXTRA_CHILDREN)) return
  EXTRA_CHILDREN = nodes
  rebuildIndexes()
}

/** 全量组定义 = 静态菜单 + 自定义看板（life 组子级合并） */
function allGroups() {
  if (!EXTRA_CHILDREN.length) return MENU_NODES
  return MENU_NODES.map((n) =>
    n.id === 'life' ? { ...n, children: [...n.children, ...EXTRA_CHILDREN] } : n
  )
}

function rebuildIndexes() {
  for (const k of Object.keys(NODE_BY_KEY)) delete NODE_BY_KEY[k]
  for (const k of Object.keys(PARENT_OF)) delete PARENT_OF[k]
  for (const n of allGroups()) {
    NODE_BY_KEY[n.id] = n
    for (const c of n.children || []) {
      NODE_BY_KEY[c.id] = c
      PARENT_OF[c.id] = n.id
    }
  }
  for (const k of Object.keys(PATH_PERMISSION)) delete PATH_PERMISSION[k]
  for (const n of allGroups()) {
    if (n.path) PATH_PERMISSION[n.path] = n.permission
    for (const c of n.children || []) PATH_PERMISSION[c.path] = c.permission
  }
}

export const PATH_PERMISSION = {}
rebuildIndexes()

// 默认顺序（顶层与各组内部；自定义看板后续由 normalizeOrder 追加）
export const DEFAULT_ORDER = {
  roots: MENU_NODES.map((n) => n.id),
  children: MENU_NODES.reduce((acc, n) => {
    if (n.children && n.children.length) acc[n.id] = n.children.map((c) => c.id)
    return acc
  }, {})
}

// 兼容旧键名：外部仍以 MODULES 引用节点数组
export const MODULES = MENU_NODES
export const moduleByKey = (key) => NODE_BY_KEY[key]

/** 校验并补全持久化顺序：过滤未知 id，追加新登记的 id（新顶层组插在「设置」之前） */
export function normalizeOrder(order) {
  const saved = order || {}
  const roots = (Array.isArray(saved.roots) ? saved.roots : []).filter((k) => NODE_BY_KEY[k] && !(PARENT_OF[k]))
  for (const n of allGroups()) {
    if (roots.includes(n.id)) continue
    const at = roots.indexOf('settings')
    if (at >= 0) roots.splice(at, 0, n.id)
    else roots.push(n.id)
  }
  const children = {}
  for (const n of allGroups()) {
    if (!n.children || !n.children.length) continue
    const known = n.children.map((c) => c.id)
    const list = ((saved.children && saved.children[n.id]) || []).filter((k) => known.includes(k))
    for (const k of known) if (!list.includes(k)) list.push(k)
    children[n.id] = list
  }
  return { roots, children }
}

/**
 * 构建渲染用菜单树：顺序取自 order，visible 取自 visibility 并叠加祖先链
 * 组的可见性 = 自身可见 && 至少一个子级可见（全隐藏子级时父级一并隐藏）
 */
export function buildMenuTree(order, visibility) {
  const ord = normalizeOrder(order)
  const vis = visibility || {}
  const groups = allGroups()
  return ord.roots.map((rootId) => {
    const def = NODE_BY_KEY[rootId]
    const groupDef = groups.find((g) => g.id === rootId)
    const childIds = ord.children[rootId] || []
    const children = childIds.map((cid) => {
      const cdef = NODE_BY_KEY[cid]
      return {
        id: cid, name: cdef.name, icon: cdef.icon, desc: cdef.desc,
        path: cdef.path, permission: cdef.permission, fixed: false,
        visible: vis[cid] !== false, children: []
      }
    })
    const selfVisible = vis[rootId] !== false
    const anyChild = !children.length || children.some((c) => c.visible)
    return {
      id: rootId, name: def.name, icon: def.icon, desc: groupDef && groupDef.desc,
      tone: groupDef && groupDef.tone, // 分组色（侧栏区分模块归属用）
      path: def.path, permission: def.permission, fixed: !!def.fixed,
      visible: selfVisible && anyChild, children
    }
  })
}

/** 权限判定：节点自身与祖先均未被隐藏才可见 */
export function nodeAllowed(permission, visibility) {
  const node = NODE_BY_PERMISSION(permission)
  if (!node) return true
  const vis = visibility || {}
  if (vis[node.id] === false) return false
  const parent = PARENT_OF[node.id]
  if (parent && vis[parent] === false) return false
  return true
}

function NODE_BY_PERMISSION(permission) {
  if (!permission || permission === 'workbench.view') return null // 控制台/设置固定可见
  for (const n of allGroups()) {
    if (n.permission === permission) return { ...n, parent: null }
    for (const c of n.children || []) if (c.permission === permission) return { ...c, parent: n.id }
  }
  return null
}

/** 被隐藏时给出节点名（用于守卫提示文案） */
export function hiddenNodeName(permission, visibility) {
  const node = NODE_BY_PERMISSION(permission)
  if (!node) return null
  const vis = visibility || {}
  if (vis[node.id] === false) return node.name
  if (node.parent && vis[node.parent] === false) return NODE_BY_KEY[node.parent].name
  return null
}

/**
 * 自定义看板登记表 hook（wb:custom-modules）。
 * 渲染期同步自定义节点到菜单索引（幂等），保证守卫/排序在当轮就认识新看板。
 */
export function useCustomBoards() {
  const [customs, setCustoms] = useLocalState(WB.customModules, [])
  const list = Array.isArray(customs) ? customs : []
  syncCustomNodes(list)
  return [list, setCustoms]
}

/** 菜单配置 hook：侧栏与配置抽屉共用，经 wb:ls-change 事件即时同步 */
export function useMenuConfig() {
  const [customs] = useCustomBoards() // 自定义看板节点注册（副作用仅是幂等索引重建）
  const [order, setOrder] = useLocalState(WB.menuOrder, DEFAULT_ORDER)
  const [visibility, setVisibility] = useLocalState(WB.visibility, {})
  // customs 必须参与依赖：新增/删除自定义看板时 order/visibility 引用不变，需强制重算
  const tree = useMemo(() => buildMenuTree(order, visibility), [order, visibility, customs])

  const moveRoot = (fromId, toId) =>
    setOrder((o) => {
      const n = normalizeOrder(o)
      const from = n.roots.indexOf(fromId)
      const to = n.roots.indexOf(toId)
      if (from < 0 || to < 0 || from === to) return n
      n.roots = arrayMove(n.roots, from, to)
      return n
    })
  const moveChild = (parentId, fromId, toId) =>
    setOrder((o) => {
      const n = normalizeOrder(o)
      const list = n.children[parentId] || []
      const from = list.indexOf(fromId.replace(`${parentId}:`, ''))
      const to = list.indexOf(toId.replace(`${parentId}:`, ''))
      if (from < 0 || to < 0 || from === to) return n
      n.children = { ...n.children, [parentId]: arrayMove(list, from, to) }
      return n
    })
  const setNodeVisible = (id, visible) => setVisibility((v) => ({ ...(v || {}), [id]: visible }))
  const resetMenu = () => { setOrder(DEFAULT_ORDER); setVisibility({}) }

  return { tree, order, moveRoot, moveChild, setNodeVisible, resetMenu }
}

// dnd-kit 的 arrayMove（就地引一份，避免仅为此引入运行时依赖到非拖拽场景）
function arrayMove(list, from, to) {
  const next = list.slice()
  next.splice(to, 0, next.splice(from, 1)[0])
  return next
}
