// 看板类型与实例注册表：内置 4 看板固定登记，自定义看板来自 wb:custom-modules。
// 路由解析（router.js）在 React 之外同步调用 findBoardLS，因此这里直接读 localStorage。
import { readLS, WB } from '../app/store.js'
import { readCustomBoards } from './store.js'

// 可添加的看板类型（设置「+ 添加新模块」的选择范围；weekly 仅作为内置看板存在）
export const BOARD_TYPES = {
  todo: { label: '任务队列', icon: '✅', desc: '待办事项，拖拽调整优先级', defaultName: '任务队列', icons: ['✅', '📝', '🎯', '🚀', '🧠', '⏰'] },
  table: { label: '自定义表格', icon: '🗂', desc: '自定义行列的通用表格', defaultName: '自定义表格', icons: ['🗂', '📊', '📒', '🧾', '📅', '💪'] },
  anniversary: { label: '纪念日', icon: '💞', desc: '累计天数与月份折算', defaultName: '纪念日', icons: ['💞', '🌟', '🎈', '🏆', '🌱', '🧭'] },
  checklist: { label: '护肤打卡', icon: '🧴', desc: '分步勾选，每日自动重置', defaultName: '护肤打卡', icons: ['🧴', '☀️', '🌙', '🧘', '🥗', '💪'] },
  habit: { label: '习惯打卡', icon: '🔥', desc: '连续天数 streak 与热力图', defaultName: '习惯打卡', icons: ['🔥', '🌱', '💪', '🏃', '📚', '💧'] }
}

// 内置看板：与 menu.js 的「生活看板」组子节点一一对应（id 即菜单节点 id，须全局唯一）
export const BUILTIN_BOARDS = [
  { id: 'week', type: 'weekly', name: '每周数据', icon: '📅' },
  { id: 'skincare', type: 'checklist', name: '护肤打卡', icon: '🧴' },
  { id: 'anniversary', type: 'anniversary', name: '纪念日', icon: '💞' },
  { id: 'todo', type: 'todo', name: '任务队列', icon: '✅' },
  { id: 'habit', type: 'habit', name: '习惯打卡', icon: '🔥' }
]

export const isCustomId = (id) => typeof id === 'string' && id.startsWith('cm-')

/** 同步查找看板定义（内置优先）；找不到返回 null */
export function findBoardLS(boardId) {
  const b = BUILTIN_BOARDS.find((x) => x.id === boardId)
  if (b) return b
  return readCustomBoards().find((x) => x.id === boardId) || null
}

/** 响应式版本：传入 useCustomBoards() 的列表 */
export function findBoard(boardId, customs) {
  const b = BUILTIN_BOARDS.find((x) => x.id === boardId)
  if (b) return b
  return (customs || []).find((x) => x.id === boardId) || null
}

/** 设置页「数据管理」用：收集全部看板相关键（自定义模块登记 + 各看板数据） */
export function collectBoardKeys() {
  const keys = [WB.customModules]
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith('wb:board:')) keys.push(k)
    }
  } catch { /* ignore */ }
  return keys
}
