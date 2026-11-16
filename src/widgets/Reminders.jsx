// 待办提醒：投递跟进到期、本周资金快照、AI 未配置、数据备份（超 7 天/从未导出）
import React from 'react'
import { useLocalState, readLS, WB } from '../app/store.js'
import { KEYS as IW_KEYS } from '../modules/interview/store.js'
import { KEYS as FP_KEYS, currentWeekLabel } from '../modules/fund/store.js'
import { aiAvailable } from '../modules/interview/ai.js'
import { downloadAllData, hasAnyData } from '../app/export-data.js'
import { navigate } from '../app/navigate.js'

const TERMINAL = ['Offer', '已拒绝/流程终止']
const BACKUP_INTERVAL_DAYS = 7

export default function Reminders() {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // lastExport 参与 state：一键导出后时间戳变化即重渲染，提醒自动消失
  const [lastExport] = useLocalState(WB.lastExport, null)

  const todos = []

  const pipeline = readLS(IW_KEYS.pipeline, [])
  pipeline
    .filter((p) => p.nextDate && !TERMINAL.includes(p.status))
    .forEach((p) => {
      const d = new Date(`${p.nextDate}T00:00:00`)
      if (Number.isNaN(d.getTime())) return
      const diff = Math.round((d - today) / 86400000)
      if (diff > 3) return
      const when = diff < 0 ? `逾期 ${-diff} 天` : diff === 0 ? '就是今天' : `还剩 ${diff} 天`
      todos.push({
        key: `pipeline-${p.id}`,
        kind: 'warn',
        title: `${p.company || '未命名公司'} · ${p.role || '投递跟进'}`,
        sub: `${p.status} · ${p.nextDate}（${when}）`,
        path: '/workbench/interview/pipeline'
      })
    })

  const snapshots = readLS(FP_KEYS.snapshots, [])
  if (!snapshots.some((s) => s.weekLabel === currentWeekLabel())) {
    todos.push({
      key: 'fund-snapshot',
      kind: 'warn',
      title: '本周还没拍资金快照',
      sub: '到「周汇总」拍一次，留住资产走势。',
      path: '/workbench/fund/weekly'
    })
  }

  if (!aiAvailable()) {
    todos.push({
      key: 'ai-config',
      kind: '',
      title: 'AI 未配置',
      sub: '押题与模拟面试点评走离线模板，配置后更贴合你的简历。',
      path: '/workbench/settings'
    })
  }

  // 数据备份：全部数据只在浏览器 localStorage，清站点数据即丢失
  if (hasAnyData()) {
    const days = lastExport ? Math.floor((Date.now() - new Date(lastExport).getTime()) / 86400000) : null
    if (days === null || days > BACKUP_INTERVAL_DAYS) {
      todos.push({
        key: 'backup',
        kind: days === null ? '' : 'warn',
        title: days === null ? '还没有备份过数据' : `数据已经 ${days} 天没有备份`,
        sub: days === null
          ? '全部数据只保存在本机浏览器，建议导出一份 JSON 存档。'
          : '建议每周导出一次 JSON 存档，防止清浏览器数据时丢失。',
        path: '/workbench/settings',
        export: true
      })
    }
  }

  if (!todos.length) {
    return <div className="empty" style={{ padding: '24px 12px' }}><div className="empty-icon">✅</div>暂无待办，一切尽在掌握</div>
  }

  return (
    <div>
      {todos.map((t) => t.export ? (
        <div key={t.key} className={`wb-todo-item ${t.kind}`}>
          <button className="wb-todo-main wb-todo-link" onClick={() => navigate(t.path)}>
            <span className="wb-todo-title">{t.title}</span>
            <div className="wb-todo-sub">{t.sub}</div>
          </button>
          <button className="btn btn-sm btn-primary" onClick={() => downloadAllData()} title="导出全量备份 JSON">⬇ 导出</button>
        </div>
      ) : (
        <button key={t.key} className={`wb-todo-item ${t.kind}`} style={{ width: '100%', textAlign: 'left' }} onClick={() => navigate(t.path)}>
          <span className="wb-todo-main">
            <span className="wb-todo-title">{t.title}</span>
            <div className="wb-todo-sub">{t.sub}</div>
          </span>
          <span className="muted">→</span>
        </button>
      ))}
    </div>
  )
}
