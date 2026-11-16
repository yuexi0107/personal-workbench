// 全量导出共享层：设置页「导出全部数据」与首页「备份提醒」widget 共用同一套导出逻辑，
// 保证两处生成的备份文件结构完全一致；每次成功导出都写 wb:last-export 时间戳（供提醒判定）。
import { readLS, writeLS, WB } from './store.js'
import { KEYS as IW_KEYS } from '../modules/interview/store.js'
import { KEYS as FP_KEYS } from '../modules/fund/store.js'

// 导出覆盖的数据键（与设置页导入校验一一对应；生活看板 wb:board:* 动态收集）
const IW_EXPORT_KEYS = ['resumes', 'jobs', 'predictions', 'interviews', 'pipeline', 'favorites', 'bankDone', 'practiceStats']
const FP_EXPORT_KEYS = ['modules', 'items', 'snapshots', 'investments', 'expenses', 'budget',
  'catOrder', 'threeOrder', 'weeklyOrder', 'assetsOrder', 'catGroups', 'assetsExpanded', 'shopping']

export const LAST_EXPORT_KEY = WB.lastExport

/** 标记"刚刚完成一次导出"（设置页与一键导出共用） */
export const markExported = () => writeLS(WB.lastExport, new Date().toISOString())

/** 全量数据快照：对应设置页「工作台全量」导入格式（app=personal-workbench, version=1） */
export function collectAllData() {
  const data = {}
  for (const k of IW_EXPORT_KEYS) data[IW_KEYS[k]] = readLS(IW_KEYS[k], k === 'bankDone' || k === 'practiceStats' ? {} : [])
  data[IW_KEYS.aiConfig] = readLS(IW_KEYS.aiConfig, {})
  for (const k of FP_EXPORT_KEYS) data[FP_KEYS[k]] = readLS(FP_KEYS[k], k === 'budget' ? 0 : [])
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && (key === WB.customModules || key.startsWith('wb:board:')) && localStorage.getItem(key) !== null) {
        data[key] = readLS(key, null)
      }
    }
  } catch { /* ignore */ }
  return data
}

const dateTag = () => {
  const d = new Date()
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}

/** 一键导出全量备份文件，成功后写入 wb:last-export；返回 payload 供调用方提示 */
export function downloadAllData() {
  const payload = {
    app: 'personal-workbench',
    version: 1,
    exportedAt: new Date().toISOString(),
    data: collectAllData()
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `personal-workbench-${dateTag()}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  markExported()
  return payload
}

/** 是否有值得备份的数据（任一业务键非空即为有；AI 配置仅含 Key 时才算） */
export function hasAnyData() {
  let data
  try { data = collectAllData() } catch { return false }
  return Object.entries(data).some(([k, v]) => {
    if (k === IW_KEYS.aiConfig) return !!(v && typeof v === 'object' && v.apiKey)
    if (Array.isArray(v)) return v.length > 0
    if (v && typeof v === 'object') return Object.keys(v).length > 0
    if (typeof v === 'number') return v > 0
    return false
  })
}
