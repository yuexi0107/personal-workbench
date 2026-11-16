// 生活看板存储层：wb:board:<boardId> 按看板实例隔离数据；自定义看板登记在 wb:custom-modules。
// 复用外壳的 useLocalState（wb:ls-change 事件即时同步），与 iw:/fp: 前缀互不干扰。
import { useMemo, useCallback, useEffect, useReducer } from 'react'
import { useLocalState, readLS, writeLS, WB } from '../app/store.js'
import { defaultBoardData } from './seed.js'

export const uid = () => `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`

export const boardKey = (boardId) => `wb:board:${boardId}`

// 一次性数据修复（2026-11-15）：早期版本的种子把首周 start 写死成了 2025-11-09（周日锚定），
// 用户在当周录入的真实记录因此全落进错误年份的周里。本应用所有周均由实时时钟生成、恒锚定周一，
// 2026 上线（2026-11-14）之前的年份只可能是脏数据：这里在读入前把 2025 周整体 +1 年平移回 2026
// （平移后非周一则吸附回所在周一；与已有周撞车时空格并入、已有内容优先），幂等可重复执行。
const WEEK_ERA_CUTOFF = 2026
const weeklyDateOk = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''))
function fixWeeklyEraLS(key) {
  let raw
  try { raw = JSON.parse(localStorage.getItem(key) || 'null') } catch { return }
  const weeks = raw && Array.isArray(raw.weeks) ? raw.weeks : null
  if (!weeks || !weeks.length) return
  const isDirty = (w) => w && weeklyDateOk(w.start) && Number(w.start.slice(0, 4)) < WEEK_ERA_CUTOFF
  if (!weeks.some(isDirty)) return
  const snapMonday = (s) => {
    const d = new Date(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)))
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  // 撞周合并：以已有周为主，脏周只填补空格，避免覆盖已有内容
  const mergeCells = (base, donor) => {
    const out = { ...(base || {}) }
    for (const rowId of Object.keys(donor || {})) {
      const dst = Array.isArray(out[rowId]) ? out[rowId] : []
      out[rowId] = (donor[rowId] || []).map((c, i) =>
        (dst[i] && String(dst[i].text || '').trim()) ? dst[i] : (c || { text: '', mark: 0 }))
    }
    return out
  }
  const next = []
  let current = raw.current
  for (const w of weeks) {
    const start = isDirty(w)
      ? snapMonday(`${Number(w.start.slice(0, 4)) + 1}${w.start.slice(4)}`)
      : w.start
    // 撞周（含与本来就干净的周撞）一律并入先到者，避免同起点周成对出现
    const exist = next.find((x) => x && x.start === start)
    if (exist) {
      exist.cells = mergeCells(exist.cells, w.cells)
      if (current === w.id) current = exist.id
      console.warn(`[weekly] 脏周 ${w.start}（${w.id}）已平移并入 ${exist.start}（${exist.id}）`)
      continue
    }
    next.push(isDirty(w) ? { ...w, start } : w)
  }
  if (!next.some((w) => w && w.id === current)) {
    const today = todayStr()
    const hit = next.find((w) => w && w.start <= today && today <= addDaysStr(w.start, 6))
    current = (hit || next[next.length - 1]).id
  }
  writeLS(key, { ...raw, weeks: next, current })
}

// 当前看板数据 hook：initial 仅在本地无数据时生效（种子），之后完全以持久化为准
export function useBoardData(boardId, type) {
  const key = boardKey(boardId)
  if (type === 'weekly') fixWeeklyEraLS(key) // 渲染前同步修一次 localStorage，避免脏周先入 state
  const initial = useMemo(() => defaultBoardData(type), [type])
  return useLocalState(key, initial)
}

/** 不可变更新看板数据的快捷方式：patch(d => ({...d, ...})) 已由 useLocalState 支持 */

/* ---------- 自定义看板（wb:custom-modules） ---------- */

export function readCustomBoards() {
  const list = readLS(WB.customModules, [])
  return Array.isArray(list) ? list.filter((b) => b && b.id && b.type) : []
}

export function addCustomBoard({ type, name, icon }) {
  const board = {
    id: `cm-${uid()}`,
    type,
    name: (name || '').trim() || '未命名看板',
    icon: icon || '🧩',
    createdAt: new Date().toISOString()
  }
  writeLS(WB.customModules, [...readCustomBoards(), board])
  return board
}

export function renameCustomBoard(boardId, name) {
  const trimmed = (name || '').trim()
  if (!trimmed) return false
  writeLS(WB.customModules, readCustomBoards().map((b) => (b.id === boardId ? { ...b, name: trimmed } : b)))
  return true
}

export function removeCustomBoard(boardId) {
  writeLS(WB.customModules, readCustomBoards().filter((b) => b.id !== boardId))
  try { localStorage.removeItem(boardKey(boardId)) } catch { /* ignore */ }
  // 清理该节点的显隐记录与菜单排序记录（顺序缺失项会被 normalizeOrder 自动过滤）
  const vis = readLS(WB.visibility, {})
  if (vis && vis[boardId] !== undefined) {
    const next = { ...vis }
    delete next[boardId]
    writeLS(WB.visibility, next)
  }
  const order = readLS(WB.menuOrder, null)
  if (order && order.children && Array.isArray(order.children.life)) {
    writeLS(WB.menuOrder, { ...order, children: { ...order.children, life: order.children.life.filter((k) => k !== boardId) } })
  }
}

/* ---------- 日期工具（纪念日计算用，全部走本地时区） ---------- */

const pad2 = (n) => String(n).padStart(2, '0')
const parseYMD = (s) => {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(s || ''))
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null
}

export const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/** 跨天挂着的标签页（后台冻结不重渲染）里「今天」会过期：恢复可见/聚焦时强制刷一次，避免打卡落到昨天 */
export function useRefreshOnVisible() {
  const [, bump] = useReducer((x) => x + 1, 0)
  useEffect(() => {
    const h = () => bump()
    document.addEventListener('visibilitychange', h)
    window.addEventListener('focus', h)
    return () => {
      document.removeEventListener('visibilitychange', h)
      window.removeEventListener('focus', h)
    }
  }, [])
}

/** 起始日期到今天的整天数（未来日期记 0） */
export function daysSince(dateStr) {
  const start = parseYMD(dateStr)
  if (!start) return 0
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.max(0, Math.round((today - start) / 86400000))
}

/** 折合「X个月Y天」（日历精确：先算整月，再算余下天数） */
export function monthDayText(dateStr) {
  const start = parseYMD(dateStr)
  if (!start) return '—'
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (today <= start) return '0天'
  let months = (today.getFullYear() - start.getFullYear()) * 12 + (today.getMonth() - start.getMonth())
  if (today.getDate() < start.getDate()) months -= 1
  if (months < 0) months = 0
  const anchor = new Date(start.getFullYear(), start.getMonth() + months, start.getDate())
  const rest = Math.round((today - anchor) / 86400000)
  return months === 0 ? `${rest}天` : `${months}个月${rest}天`
}

export function addDaysStr(dateStr, n) {
  const d = parseYMD(dateStr) || new Date()
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

export const fmtShort = (dateStr) => {
  const d = parseYMD(dateStr)
  return d ? `${pad2(d.getMonth() + 1)}.${pad2(d.getDate())}` : '--.--'
}

/** 所在周的周一（ISO：周一为一周起点），用于「本周」锚定 */
export function mondayOf(dateStr) {
  const d = parseYMD(dateStr)
  if (!d) return dateStr
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/** 按类型生成看板数据的便捷 setter（供各看板组件消缺省结构） */
export function useBoardPatch(setData) {
  return useCallback((patch) => setData((d) => ({ ...(d || {}), ...(typeof patch === 'function' ? patch(d) : patch) })), [setData])
}
