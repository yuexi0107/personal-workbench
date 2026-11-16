// 每周数据看板：字段行 × 周一~周日 列，支持「单周编辑」与「按月总览」两种视图。
// 行可拖拽重排（纵向磁吸）；单元格点击编辑，可标绿（做得好）/标橙（要注意），
// 编辑浮层内可「清空」该格（弹窗确认）；表头显示周一~周日对应日期（今天高亮）；
// 单周视图点日期区间弹日历，点日期直跳所在周；周序号按 ISO 年内第几周显示；
// 新一周可复制上周内容或创建空白周；月视图按「月初到月底」整周铺开（含跨月衔接周），
// 今天所在周自动高亮，「回到本周」一键跳回。
// 整列复制：点表头「⧉ 复制」复制某天整列内容，再点其他星期表头粘贴（弹窗确认，Esc 取消）；
// 历史导入：「📥 导入历史」读取周数据 JSON（{ weeks: [{ start, rows }] }），与现有数据
// 合并（同起点周只补空格、已有内容优先，行名相同则映射到现有行，缺行自动新建）。
import React, { useEffect, useRef, useState } from 'react'
import { DndContext, DragOverlay } from '@dnd-kit/core'
import { restrictToVerticalAxis, restrictToParentElement } from '@dnd-kit/modifiers'
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { useBoardData, uid, addDaysStr, fmtShort, todayStr, mondayOf } from './store.js'
import { Grip, useSortableRow, SPRING_DROP, useMagpieSensors } from '../components/dnd/magpie.jsx'

const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
const GRID = 'minmax(125px, 145px) repeat(7, minmax(150px, 1fr))' // 行头收窄，空间让给日期列；列内容居中
const MARK_NAME = { 1: '做得好', 2: '要注意' }
const pad2 = (n) => String(n).padStart(2, '0')

const emptyCell = () => ({ text: '', mark: 0 })
const monthKeyOf = (dateStr) => (dateStr || '').slice(0, 7) // 'YYYY-MM'
const monthLabelOf = (key) => {
  const [y, m] = String(key).split('-').map(Number)
  return `${y}年${m}月`
}
const parseYMDLocal = (s) => {
  const [y, m, d] = String(s || '').split('-').map(Number)
  return y && m && d ? new Date(y, m - 1, d) : null
}
/** ISO 周信息 { year, week }：周一为一周起点，跨年周归下一年（周四所在年） */
const isoWeekInfo = (dateStr) => {
  const d = parseYMDLocal(dateStr)
  if (!d) return { year: 0, week: 0 }
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + 3) // 移到本 ISO 周的周四
  const jan4 = new Date(d.getFullYear(), 0, 4)
  jan4.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7) + 3) // 第 1 周的周四
  return { year: d.getFullYear(), week: 1 + Math.round((d - jan4) / 604800000) }
}
/** 该年份共有几个 ISO 周（12.28 恒在最后一个周内）—— 52 或 53 */
const isoWeeksInYear = (y) => isoWeekInfo(`${y}-12-28`).week

/** 表头：记录项 + 周一~周日（附对应日期；today 命中的日期加高亮徽标）。
 *  传入 onCopyDay/onPasteDay 时启用「整列复制」：平时表头悬停显「⧉ 复制」按钮，
 *  进入复制模式（copySrc 非空）后源列置灰、其余列表头变为点击粘贴目标。 */
function WeekHeader({ start, today, onCopyDay, onPasteDay, onClearDay, copySrc }) {
  const copyMode = copySrc != null
  return (
    <>
      <div className="wt-head-cell wt-corner">记录项</div>
      {WEEKDAYS.map((d, i) => {
        const date = addDaysStr(start, i)
        const canPaste = copyMode && onPasteDay && i !== copySrc
        return (
          <div
            key={d}
            className={`wt-head-cell wt-daycell${canPaste ? ' is-paste' : ''}${copyMode && i === copySrc ? ' is-copysrc' : ''}`}
            onClick={canPaste ? () => onPasteDay(i) : undefined}
            title={copyMode
              ? (i === copySrc ? `复制来源：${d}（点击其他星期粘贴）` : `点击：把 ${WEEKDAYS[copySrc]} 的整列内容复制到 ${WEEKDAYS[i]}`)
              : undefined}
          >
            <span className="wt-head-day">{d}</span>
            <span className={`wt-head-date${date === today ? ' is-today' : ''}`}>{fmtShort(date)}</span>
            {!copyMode && onCopyDay && (
              <button
                className="wt-daycopy"
                onClick={(e) => { e.stopPropagation(); onCopyDay(i) }}
                title={`复制 ${d} 整列内容（含标记），可粘贴到其他天`}
              >⧉ 复制</button>
            )}
            {!copyMode && onClearDay && (
              <button
                className="wt-dayclear"
                onClick={(e) => { e.stopPropagation(); onClearDay(i) }}
                title={`清空 ${d} 整列的内容与标记`}
              >🗑 清空</button>
            )}
          </div>
        )
      })}
    </>
  )
}

/** 周选择日历：点日期跳到所在周（仅已有记录的周可选，灰色为暂无记录） */
function WeekCalendar({ weeks, currentId, onPick, onClose }) {
  const today = todayStr()
  const cur = weeks.find((w) => w.id === currentId)
  const [ym, setYm] = useState(((cur && cur.start) || today).slice(0, 7)) // 打开时定位到当前周所在月
  const wrapRef = useRef(null)
  // 点击外部 / Esc 关闭
  useEffect(() => {
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) onClose() }
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [onClose])

  const [y, m] = ym.split('-').map(Number)
  const offset = (new Date(y, m - 1, 1).getDay() + 6) % 7 // 周一为格首
  const dayCount = new Date(y, m, 0).getDate()
  const cells = []
  for (let i = 0; i < offset; i++) cells.push(null)
  for (let d = 1; d <= dayCount; d++) cells.push(`${y}-${pad2(m)}-${pad2(d)}`)
  while (cells.length % 7) cells.push(null)
  const weekIdxOf = (ds) => weeks.findIndex((w) => w.start && w.start <= ds && ds <= addDaysStr(w.start, 6))
  const inCur = (ds) => !!(cur && cur.start && cur.start <= ds && ds <= addDaysStr(cur.start, 6))
  const shift = (delta) =>
    setYm((k) => {
      const [yy, mm] = k.split('-').map(Number)
      const d2 = new Date(yy, mm - 1 + delta, 1)
      return `${d2.getFullYear()}-${pad2(d2.getMonth() + 1)}`
    })

  return (
    <div className="wt-cal" ref={wrapRef}>
      <div className="wt-cal-head">
        <button className="btn btn-sm" onClick={() => shift(-1)} aria-label="上个月">‹</button>
        <span className="wt-cal-title">{y} 年 {m} 月</span>
        <button className="btn btn-sm" onClick={() => shift(1)} aria-label="下个月">›</button>
      </div>
      <div className="wt-cal-grid">
        {['一', '二', '三', '四', '五', '六', '日'].map((d) => <span key={d} className="wt-cal-wd">{d}</span>)}
        {cells.map((ds, i) => {
          if (!ds) return <span key={`blank${i}`} />
          const idx = weekIdxOf(ds)
          const has = idx >= 0
          return (
            <button
              key={ds}
              disabled={!has}
              className={`wt-cal-day${inCur(ds) ? ' is-cur' : ''}${ds === today ? ' is-today' : ''}${has ? '' : ' is-off'}`}
              title={has
                ? `第 ${isoWeekInfo(ds).week} 周（${fmtShort(weeks[idx].start)} ~ ${fmtShort(addDaysStr(weeks[idx].start, 6))}），点击跳转`
                : '该周暂无记录'}
              onClick={() => has && onPick(idx)}
            >
              {Number(ds.slice(8))}
            </button>
          )
        })}
      </div>
      <div className="wt-cal-hint">点击日期切换到所在周 · 灰色日期还没有周记录</div>
    </div>
  )
}

export default function WeeklyBoard({ boardId }) {
  const [data, setData] = useBoardData(boardId, 'weekly')
  const rows = data.rows || []
  const weeks = data.weeks || []
  const weekIdx = Math.max(0, weeks.findIndex((w) => w.id === data.current))
  const week = weeks[weekIdx] || null
  const today = todayStr()
  const [view, setView] = useState('week') // 'week' 单周编辑 | 'month' 按月总览
  const [monthKey, setMonthKey] = useState(() => monthKeyOf((weeks[weeks.length - 1] || {}).start) || monthKeyOf(today))
  const [editing, setEditing] = useState(null) // { rowId, day, draft, mark } | null
  const [newRow, setNewRow] = useState('')
  const [activeId, setActiveId] = useState(null)
  const [calOpen, setCalOpen] = useState(false) // 周标签旁的日历浮层
  const [pendingJump, setPendingJump] = useState(false) // 「回到本周」后等高亮块渲染完成再滚动
  const [colCopy, setColCopy] = useState(null) // 整列复制：{ src: dayIndex } | null
  const [importMsg, setImportMsg] = useState(null) // 历史导入的结果/错误提示
  const importFileRef = useRef(null)
  const nowBlockRef = useRef(null)
  const sensors = useMagpieSensors()

  // —— 每周小结：随周存取（w.summary），单周视图下方编辑（失焦/Ctrl+Enter 保存），按月总览同步展示 ——
  const curWeek = weeks.find((w) => w.id === data.current) || null
  const [summaryDraft, setSummaryDraft] = useState('')
  useEffect(() => {
    setSummaryDraft((curWeek && curWeek.summary) || '')
  }, [curWeek && curWeek.id, curWeek && curWeek.summary])
  const commitSummary = () => {
    if (!curWeek || summaryDraft === (curWeek.summary || '')) return
    setData((d) => ({ ...d, weeks: (d.weeks || []).map((w) => (w.id === d.current ? { ...w, summary: summaryDraft } : w)) }))
  }

  if (!week) return <div className="empty"><div className="empty-icon">📅</div>暂无周数据</div>
  const cellsOfWeek = (w, rowId) => {
    const arr = (w.cells && w.cells[rowId]) || []
    return Array.from({ length: 7 }, (_, i) => arr[i] || emptyCell())
  }
  const cellsOf = (rowId) => cellsOfWeek(week, rowId)
  const activeRow = rows.find((r) => r.id === activeId)
  // 某周是否覆盖今天（今天所在周，用于月视图高亮）
  const coversToday = (w) => !!(w.start && w.start <= today && today <= addDaysStr(w.start, 6))

  /* ---- 按月总览：从月初到月底，含与本月有重叠的跨月衔接周 ---- */
  const [my, mm] = monthKey.split('-').map(Number)
  const monthStart = `${monthKey}-01`
  const monthEnd = `${monthKey}-${pad2(new Date(my, mm, 0).getDate())}`
  const monthWeeks = weeks
    .filter((w) => w.start && w.start <= monthEnd && addDaysStr(w.start, 6) >= monthStart)
    .sort((a, b) => (a.start < b.start ? -1 : 1))
  const shiftMonth = (delta) =>
    setMonthKey((k) => {
      const [y, m] = String(k).split('-').map(Number)
      const d = new Date(y, m - 1 + delta, 1)
      return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`
    })
  // 一键回到今天所在周：定位月份后滚动到高亮块
  const jumpToNow = () => {
    setMonthKey(monthKeyOf(today)) // 今天所在周必与本月重叠
    setPendingJump(true)
  }
  useEffect(() => {
    if (!pendingJump) return
    setPendingJump(false)
    if (nowBlockRef.current) nowBlockRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [pendingJump, monthWeeks.length])

  /* ---- 单元格编辑 ---- */
  const setCell = (rowId, day, cell) =>
    setData((d) => {
      const weeks2 = (d.weeks || []).map((w) => {
        if (w.id !== d.current) return w
        const row = [...((w.cells && w.cells[rowId]) || Array.from({ length: 7 }, emptyCell))]
        while (row.length < 7) row.push(emptyCell())
        row[day] = { ...row[day], ...cell }
        return { ...w, cells: { ...(w.cells || {}), [rowId]: row } }
      })
      return { ...d, weeks: weeks2 }
    })
  const commitEdit = () => {
    if (!editing) return
    const { rowId, day, draft, mark } = editing
    setCell(rowId, day, { text: draft, mark })
    setEditing(null)
  }
  // 清空选中格：内容 + 标记一并复位，弹窗确认后生效
  const clearCell = () => {
    if (!editing) return
    if (!window.confirm('清空该格的内容与标记？')) return
    setCell(editing.rowId, editing.day, { text: '', mark: 0 })
    setEditing(null)
  }

  /* ---- 整列复制：把某天的全部行内容（含标记）复制到另一天 ---- */
  // 复制模式中按 Esc 取消
  useEffect(() => {
    if (!colCopy) return
    const onKey = (e) => { if (e.key === 'Escape') setColCopy(null) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [colCopy])
  const pasteColumn = (dst) => {
    if (!colCopy || colCopy.src === dst) { setColCopy(null); return }
    const src = colCopy.src
    if (!window.confirm(`把 ${WEEKDAYS[src]} 的整列内容（含标记）复制到 ${WEEKDAYS[dst]}？\n${WEEKDAYS[dst]} 现有内容将被覆盖（共 ${rows.length} 行）。`)) return
    setData((d) => ({
      ...d,
      weeks: (d.weeks || []).map((w) => {
        if (w.id !== d.current) return w
        const cells = { ...(w.cells || {}) }
        for (const r of d.rows || []) {
          const row = [...((w.cells && w.cells[r.id]) || Array.from({ length: 7 }, emptyCell))]
          while (row.length < 7) row.push(emptyCell())
          const srcCell = row[src] || emptyCell()
          row[dst] = { text: srcCell.text, mark: srcCell.mark }
          cells[r.id] = row
        }
        return { ...w, cells }
      })
    }))
    setColCopy(null)
  }

  /* ---- 清空某天整列：该天所有行的内容与标记一次复位，弹窗确认后生效 ---- */
  const clearColumn = (dst) => {
    if (!window.confirm(`清空 ${WEEKDAYS[dst]} 整列的内容与标记？（共 ${rows.length} 行）`)) return
    setEditing(null)
    setData((d) => ({
      ...d,
      weeks: (d.weeks || []).map((w) => {
        if (w.id !== d.current) return w
        const cells = { ...(w.cells || {}) }
        for (const r of d.rows || []) {
          const row = [...((w.cells && w.cells[r.id]) || Array.from({ length: 7 }, emptyCell))]
          while (row.length < 7) row.push(emptyCell())
          row[dst] = { text: '', mark: 0 }
          cells[r.id] = row
        }
        return { ...w, cells }
      })
    }))
  }

  /* ---- 历史周数据导入（JSON）：与现有数据合并，不覆盖已有内容 ---- */
  // 行名归一：去首尾空白 + 全角括号转半角（Excel 里两种括号都可能出现）
  const normRowName = (s) => String(s || '').trim().replace(/（/g, '(').replace(/）/g, ')')
  const importHistory = (payload) => {
    const weeksIn = payload && Array.isArray(payload.weeks) ? payload.weeks : null
    if (!weeksIn || !weeksIn.length) throw new Error('文件里没有 weeks 数据（需要 { weeks: [{ start, rows }] } 结构）')
    // 预解析 + 校验：start 合法（吸附回周一）、rows 转成 { 归一行名: [{text, mark} x7] }
    const plan = weeksIn.map((w) => {
      if (!w || !/^\d{4}-\d{2}-\d{2}$/.test(String(w.start || ''))) throw new Error(`周起点日期不合法：${w && w.start}`)
      const snapped = mondayOf(w.start)
      if (snapped !== w.start) console.warn(`[weekly] 导入周 ${w.start} 非周一，已吸附回 ${snapped}`)
      const cells = {}
      for (const [name, arr] of Object.entries(w.rows && typeof w.rows === 'object' ? w.rows : {})) {
        if (!Array.isArray(arr)) continue
        cells[normRowName(name)] = arr.slice(0, 7).map((c) => ({
          text: String((c && c.text) ?? ''),
          mark: (c && (c.mark === 1 || c.mark === 2)) ? c.mark : 0,
        }))
      }
      return { start: snapped, cells }
    }).sort((a, b) => (a.start < b.start ? -1 : 1))
    const existByStart = new Map(weeks.map((w) => [w.start, w]))
    const existNames = new Map(rows.map((r) => [normRowName(r.name), r]))
    const newNames = [...new Set(plan.flatMap((w) => Object.keys(w.cells)))].filter((n) => !existNames.has(n) && plan.some((w) => (w.cells[n] || []).some((c) => c.text.trim())))
    const toAdd = plan.filter((w) => !existByStart.has(w.start))
    const toMerge = plan.filter((w) => existByStart.has(w.start))
    if (!toAdd.length && !toMerge.length) { setImportMsg('文件里没有可导入的周记录。'); return }
    const ok = window.confirm(
      `导入 ${plan.length} 周历史记录（${plan[0].start} ~ ${plan[plan.length - 1].start}）：\n` +
      `· 新增 ${toAdd.length} 周\n` +
      `· 与现有同起点的 ${toMerge.length} 周合并（只补空格，已有内容优先）\n` +
      (newNames.length ? `· 新建记录行：${newNames.join('、')}\n` : '') +
      '现有内容不会被覆盖，继续？'
    )
    if (!ok) return
    setData((d) => {
      // 行名 → 行 id：缺的行追加新建（新行也要给所有已有周补空格结构）
      const nameToId = new Map((d.rows || []).map((r) => [normRowName(r.name), r.id]))
      const rows2 = [...(d.rows || [])]
      const emptyRow = () => Array.from({ length: 7 }, emptyCell)
      for (const n of newNames) {
        const id = uid()
        rows2.push({ id, name: n })
        nameToId.set(n, id)
      }
      // 周：同起点只补空格（内容+标记均空才填）；没有则整周追加；最后按起点升序
      const byStart = new Map((d.weeks || []).map((w) => [w.start, { ...w, cells: { ...(w.cells || {}) } }]))
      for (const w of plan) {
        const target = byStart.get(w.start)
        if (target) {
          for (const [name, cs] of Object.entries(w.cells)) {
            const rid = nameToId.get(name)
            if (!rid) continue
            const row = [...(target.cells[rid] || emptyRow())]
            while (row.length < 7) row.push(emptyCell())
            cs.forEach((c, i) => {
              if (!String(row[i].text || '').trim() && !row[i].mark && (c.text.trim() || c.mark)) row[i] = { ...c }
            })
            target.cells[rid] = row
          }
        } else {
          const cells = {}
          for (const [name, cs] of Object.entries(w.cells)) {
            const rid = nameToId.get(name)
            if (!rid) continue
            cells[rid] = Array.from({ length: 7 }, (_, i) => ({ ...(cs[i] || emptyCell()) }))
          }
          byStart.set(w.start, { id: uid(), start: w.start, cells })
        }
      }
      const weeks2 = [...byStart.values()].sort((a, b) => (a.start < b.start ? -1 : 1))
      return { ...d, rows: rows2, weeks: weeks2 }
    })
    setImportMsg(`导入完成：新增 ${toAdd.length} 周、合并 ${toMerge.length} 周${newNames.length ? `、新建记录行 ${newNames.length} 条` : ''}；已按日期排序，可切「按月总览」查看。`)
  }
  const onImportHistoryFile = async (e) => {
    const file = e.target.files && e.target.files[0]
    e.target.value = '' // 允许连续导入同一文件
    if (!file) return
    try {
      importHistory(JSON.parse(await file.text()))
    } catch (err) {
      setImportMsg(`导入失败：${err.message}`)
    }
  }

  /* ---- 周管理 ---- */
  const goto = (idx) => setData((d) => ({ ...d, current: (d.weeks || [])[idx] ? (d.weeks[idx].id) : d.current }))
  // 一键回到今天所在周：已有记录则单周视图直达；本周还没建记录时以本周一为起点新建（复制最近一周作底稿）并跳过去，
  // 避免旧数据起点停在过去时「新一周」只能一周周顺延、永远追不上今天
  const todayWeekIdx = weeks.findIndex((w) => coversToday(w))
  const createThisWeek = () =>
    setData((d) => {
      const list = d.weeks || []
      const last = list[list.length - 1]
      const cells = {}
      for (const r of d.rows || []) {
        const src = (last && last.cells && last.cells[r.id]) || []
        cells[r.id] = Array.from({ length: 7 }, (_, i) => ({ text: (src[i] && src[i].text) || '', mark: 0 }))
      }
      const w = { id: uid(), start: mondayOf(today), cells }
      return { ...d, weeks: [...list, w], current: w.id }
    })
  const gotoTodayWeek = () => {
    if (todayWeekIdx >= 0) goto(todayWeekIdx)
    else createThisWeek()
  }
  const addWeek = (blank) =>
    setData((d) => {
      const list = d.weeks || []
      const last = list[list.length - 1]
      // 复制模式沿用上周内容作底稿（餐食常复用）；空白模式只复制行结构，内容全部留空；两种模式标记均清零
      const cells = {}
      for (const r of d.rows || []) {
        const src = (!blank && last && last.cells && last.cells[r.id]) || []
        cells[r.id] = Array.from({ length: 7 }, (_, i) => ({ text: (!blank && src[i] && src[i].text) || '', mark: 0 }))
      }
      // 首周锚定本周一；后续周从最近一周 +7 顺延
      const start = last ? addDaysStr(last.start, 7) : mondayOf(today)
      const w = { id: uid(), start, cells }
      return { ...d, weeks: [...list, w], current: w.id }
    })
  const delWeek = () => {
    if (weeks.length <= 1) return
    if (!window.confirm(`删除本周（${fmtShort(week.start)} ~ ${fmtShort(addDaysStr(week.start, 6))}）记录？`)) return
    setData((d) => {
      const list = (d.weeks || []).filter((w) => w.id !== d.current)
      return { ...d, weeks: list, current: list.length ? list[list.length - 1].id : d.current }
    })
  }
  // 批量清空本周：所有记录行的 7 天内容与标记一次复位（行结构保留），弹窗确认后生效
  const clearWeek = () => {
    if (!window.confirm(`清空本周（${weekLabel}）全部 ${rows.length} 行 × 7 天的内容与标记？行结构保留。`)) return
    setData((d) => ({
      ...d,
      weeks: (d.weeks || []).map((w) => {
        if (w.id !== d.current) return w
        const cells = {}
        for (const r of d.rows || []) cells[r.id] = Array.from({ length: 7 }, emptyCell)
        return { ...w, cells }
      })
    }))
  }

  /* ---- 行管理 ---- */
  const addRow = () => {
    const name = newRow.trim()
    if (!name) return
    const id = uid()
    setData((d) => ({
      ...d,
      rows: [...(d.rows || []), { id, name }],
      weeks: (d.weeks || []).map((w) => ({ ...w, cells: { ...(w.cells || {}), [id]: Array.from({ length: 7 }, emptyCell) } }))
    }))
    setNewRow('')
  }
  const renameRow = (rowId, name) => setData((d) => ({ ...d, rows: (d.rows || []).map((r) => (r.id === rowId ? { ...r, name } : r)) }))
  const delRow = (rowId) => {
    const r = rows.find((x) => x.id === rowId)
    if (!window.confirm(`删除记录行「${r ? r.name : ''}」？所有周的该行数据将一并清除。`)) return
    setData((d) => ({
      ...d,
      rows: (d.rows || []).filter((x) => x.id !== rowId),
      weeks: (d.weeks || []).map((w) => {
        const cells = { ...(w.cells || {}) }
        delete cells[rowId]
        return { ...w, cells }
      })
    }))
  }
  const move = (active, over) => {
    if (!over || active === over) return
    setData((d) => {
      const list = d.rows || []
      const from = list.findIndex((r) => r.id === active)
      const to = list.findIndex((r) => r.id === over)
      if (from < 0 || to < 0 || from === to) return d
      return { ...d, rows: arrayMove(list, from, to) }
    })
  }

  const weekLabel = `${fmtShort(week.start)} ~ ${fmtShort(addDaysStr(week.start, 6))}`
  const wkInfo = isoWeekInfo(week.start)

  const renderCell = (row, day, cell, draggingRow) => {
    const isEditing = editing && editing.rowId === row.id && editing.day === day
    return (
      <div
        key={day}
        className={`wt-cell mark-${cell.mark || 0} ${isEditing ? 'editing' : ''}`}
        onClick={() => !isEditing && setEditing({ rowId: row.id, day, draft: cell.text, mark: cell.mark || 0 })}
        title="点击编辑；标记：绿=做得好，橙=要注意"
      >
        {isEditing ? (
          <div className="wt-edit" onClick={(e) => e.stopPropagation()}>
            {/* textarea 支持回车换行；Ctrl+Enter 或点击空白处保存，Esc 取消 */}
            <textarea
              className="input bd-inline wt-edit-area"
              autoFocus
              rows={Math.max(2, Math.min(6, editing.draft.split('\n').length + 1))}
              value={editing.draft}
              onChange={(e) => setEditing({ ...editing, draft: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); commitEdit() }
                if (e.key === 'Escape') setEditing(null)
              }}
              onBlur={commitEdit}
            />
            {/* 阻止 mousedown 默认行为：防止点击标记/清空按钮时输入框失焦提前提交 */}
            <div className="wt-editbar" onMouseDown={(e) => e.preventDefault()}>
              <div className="wt-marks">
                {[0, 1, 2].map((m) => (
                  <button
                    key={m}
                    className={`wt-mark-dot m${m} ${editing.mark === m ? 'on' : ''}`}
                    onClick={() => setEditing({ ...editing, mark: m })}
                    title={m === 0 ? '无标记' : MARK_NAME[m]}
                  />
                ))}
              </div>
              <span className="spacer" />
              <button className="wt-clear-btn" onClick={clearCell} title="清空该格的内容与标记">🗑 清空</button>
            </div>
            <div className="wt-edit-hint">回车换行 · Ctrl+Enter 或点击空白处保存</div>
          </div>
        ) : (
          <span className="wt-text">{cell.text}</span>
        )}
      </div>
    )
  }

  const renderRowHead = (row, dragging) => (
    <div className="wt-rowhead">
      <Grip listeners={dragging.listeners} attributes={dragging.attributes} activatorRef={dragging.setActivatorNodeRef} dragging={dragging.isDragging} label="拖动整行" className="bd-grip" />
      <input className="input bd-inline wt-rowname" value={row.name} onChange={(e) => renameRow(row.id, e.target.value)} title="重命名记录行" />
      <button className="bd-del" onClick={() => delRow(row.id)} title="删除该行" aria-label={`删除行：${row.name}`}>✕</button>
    </div>
  )

  return (
    <div className="bd-panel">
      <div className="bd-toolbar">
        <div className="segmented">
          <button className={view === 'week' ? 'active' : ''} onClick={() => setView('week')}>单周编辑</button>
          <button className={view === 'month' ? 'active' : ''} onClick={() => setView('month')}>按月总览</button>
        </div>
        {view === 'week' ? (
          <>
            <button className="btn btn-sm" onClick={() => goto(weekIdx - 1)} disabled={weekIdx <= 0}>‹ 上周</button>
            {/* 点日期区间弹日历：选日期直跳所在周 */}
            <div className="wt-weekwrap">
              <button
                className="wt-weeklabel tag primary wt-weekbtn"
                onClick={() => setCalOpen((v) => !v)}
                title="点击打开日历，选日期跳到所在周"
              >
                {weekLabel} <span className="wt-weekcaret">▾</span>
              </button>
              {calOpen && (
                <WeekCalendar
                  weeks={weeks}
                  currentId={week.id}
                  onClose={() => setCalOpen(false)}
                  onPick={(idx) => { goto(idx); setCalOpen(false) }}
                />
              )}
            </div>
            <button className="btn btn-sm" onClick={() => goto(weekIdx + 1)} disabled={weekIdx >= weeks.length - 1}>下周 ›</button>
            <span
              className="muted"
              title={wkInfo.week
                ? `${wkInfo.year} 年第 ${wkInfo.week} 周（全年共 ${isoWeeksInYear(wkInfo.year)} 周）· 本机共记录 ${weeks.length} 周`
                : undefined}
            >
              {wkInfo.week ? `第 ${wkInfo.week} / ${isoWeeksInYear(wkInfo.year)} 周` : `第 — 周（本地第 ${weekIdx + 1} / ${weeks.length} 周）`}
            </span>
            <button
              className="btn btn-sm"
              onClick={gotoTodayWeek}
              disabled={coversToday(week)}
              title={coversToday(week) ? '当前正是今天所在周' : (todayWeekIdx >= 0 ? '跳到今天所在的周' : '本周还没有记录，点击以本周一为起点新建（复制最近一周内容）')}
            >📍 回到本周</button>
          </>
        ) : (
          <>
            <button className="btn btn-sm" onClick={() => shiftMonth(-1)}>‹ 上个月</button>
            <span className="wt-weeklabel tag primary">{monthLabelOf(monthKey)}</span>
            <button className="btn btn-sm" onClick={() => shiftMonth(1)}>下个月 ›</button>
            <span className="muted">月初到月底整周铺开（含跨月衔接周）</span>
            <button className="btn btn-sm" onClick={jumpToNow} title="跳到今天所在周并高亮">📍 回到本周</button>
          </>
        )}
        <span className="spacer" />
        {view === 'week' && (
          <>
            <button className="btn btn-sm" onClick={() => addWeek(true)} title="复制记录行结构，内容全部留空">＋ 新一周（空白）</button>
            <button className="btn btn-sm" onClick={() => addWeek(false)}>＋ 新一周（复制上周）</button>
            <button className="btn btn-sm" onClick={clearWeek} title="批量清空本周所有格的内容与标记（弹窗确认）">🧹 清空本周</button>
            <button className="btn btn-sm" onClick={() => importFileRef.current && importFileRef.current.click()}
                    title="导入历史周数据 JSON（{weeks:[{start,rows}]}），与现有数据合并：同起点周只补空格，已有内容优先">
              📥 导入历史
            </button>
            <input ref={importFileRef} type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={onImportHistoryFile} />
            <button className="btn btn-sm btn-danger" onClick={delWeek} disabled={weeks.length <= 1}>删除本周</button>
          </>
        )}
      </div>

      {importMsg && <div className="hint bd-hint" style={{ marginBottom: 10 }}>{importMsg}</div>}
      {colCopy && view === 'week' && (
        <div className="wt-copybar">
          📋 已复制 <b>{WEEKDAYS[colCopy.src]}</b> 的整列内容（含标记）— 点击要粘贴到的星期表头，
          <button className="btn btn-sm" onClick={() => setColCopy(null)}>取消</button>
        </div>
      )}

      {view === 'month' ? (
        <div className="wt-scroll wt-monthwrap">
          {monthWeeks.length === 0 ? (
            <div className="empty"><div className="empty-icon">🗓️</div>{monthLabelOf(monthKey)}暂无周记录，可切回单周视图新增。</div>
          ) : monthWeeks.map((w) => {
            const isNow = coversToday(w)
            const info = isoWeekInfo(w.start)
            return (
              <div key={w.id} ref={isNow ? nowBlockRef : undefined} className={`wt-month-block${isNow ? ' is-now' : ''}`}>
                <div className="wt-month-head">
                  <span className="wt-month-title">
                    {info.week ? `第 ${info.week} 周 · ` : ''}{fmtShort(w.start)} ~ {fmtShort(addDaysStr(w.start, 6))}
                  </span>
                  {isNow && <span className="tag primary">本周</span>}
                  {w.id === data.current && <span className="tag">编辑中</span>}
                  <span className="spacer" />
                  <button className="btn btn-sm" onClick={() => { setData((d) => ({ ...d, current: w.id })); setView('week') }}>✏️ 编辑此周</button>
                </div>
                <div className="wt-table" style={{ gridTemplateColumns: GRID }}>
                  <WeekHeader start={w.start} today={today} />
                </div>
                <div className="wt-rows">
                  {rows.map((row) => (
                    <div key={row.id} className="wt-row" style={{ gridTemplateColumns: GRID }}>
                      <div className="wt-rowhead"><span className="wt-rowname">{row.name}</span></div>
                      {cellsOfWeek(w, row.id).map((c, i) => (
                        <div key={i} className={`wt-cell mark-${c.mark || 0}`}><span className="wt-text">{c.text}</span></div>
                      ))}
                    </div>
                  ))}
                </div>
                {(w.summary || '').trim() !== '' && (
                  <div className="wt-month-summary">
                    <span className="wt-ms-label">📝 小结</span>
                    <span className="wt-ms-text">{w.summary}</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <div className="wt-scroll">
          <div className="wt-table" style={{ gridTemplateColumns: GRID }}>
            <WeekHeader
              start={week.start}
              today={today}
              copySrc={colCopy ? colCopy.src : null}
              onCopyDay={(i) => { setEditing(null); setColCopy({ src: i }) }}
              onPasteDay={pasteColumn}
              onClearDay={clearColumn}
            />
          </div>

          <DndContext
            sensors={sensors}
            modifiers={[restrictToVerticalAxis, restrictToParentElement]}
            onDragStart={(e) => setActiveId(String(e.active.id))}
            // 行排序只在 onDragEnd 一次性提交（live arrayMove 上拖会来回震荡），
            // 拖动过程中的让位由 transform 预览完成
            onDragEnd={(e) => { move(String(e.active.id), e.over && String(e.over.id)); setActiveId(null) }}
            onDragCancel={() => setActiveId(null)}
          >
            <SortableContext items={rows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
              <div className="wt-rows wt-rows-stretch">
                {rows.map((row) => (
                  <WeeklyRow
                    key={row.id}
                    row={row}
                    cells={cellsOf(row.id)}
                    renderCell={renderCell}
                    renderRowHead={renderRowHead}
                  />
                ))}
              </div>
            </SortableContext>
            <DragOverlay dropAnimation={SPRING_DROP}>
              {activeRow ? (
                <div className="wt-row wt-overlay" style={{ gridTemplateColumns: GRID }}>
                  <div className="wt-rowhead"><span className="wb-grip is-grabbing">⠿</span><span className="wt-rowname">{activeRow.name}</span></div>
                  {cellsOf(activeRow.id).map((c, i) => (
                    <div key={i} className={`wt-cell mark-${c.mark || 0}`}><span className="wt-text">{c.text}</span></div>
                  ))}
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>

          <div className="wt-addrow">
            <input
              className="input bd-inline"
              placeholder="＋ 添加记录行（如：饮水、护肤）"
              value={newRow}
              onChange={(e) => setNewRow(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addRow() }}
            />
            <button className="btn btn-primary btn-sm" onClick={addRow} disabled={!newRow.trim()}>添加</button>
          </div>
        </div>
      )}
      {view === 'week' && (
        <div className="wt-summary-block">
          <div className="wt-summary-head">
            <span className="wt-summary-title">📝 每周小结</span>
            <span className="wt-summary-sub">随本周记录保存 · 按月总览中同步展示</span>
          </div>
          <textarea
            className="input wt-summary-area"
            placeholder="记录本周的总结、反思与下周计划…"
            value={summaryDraft}
            onChange={(e) => setSummaryDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); commitSummary() }
              if (e.key === 'Escape') setSummaryDraft((curWeek && curWeek.summary) || '')
            }}
            onBlur={commitSummary}
            title="输入小结，失焦或 Ctrl+Enter 保存；Esc 还原"
          />
        </div>
      )}
      <div className="muted" style={{ marginTop: 8 }}>
        {view === 'week' ? (
          <>
            点中间的日期区间打开日历，点日期即可跳到所在周；「📍 回到本周」直达今天所在周（本周还没记录时会自动新建）。点击单元格编辑（Ctrl+Enter 保存），可选标记
            <span className="wt-legend"><span className="wt-mark-dot m1 on" />做得好</span>
            <span className="wt-legend"><span className="wt-mark-dot m2 on" />要注意</span>；「🗑 清空」清空单格、「🧹 清空本周」批量清空整周（均有弹窗确认）。点表头「⧉ 复制」可把某天整列内容复制到其他天，表头「🗑 清空」清空某天整列（均有确认弹窗）。行首 ⠿ 拖动整行调整记录顺序。下方「📝 每周小结」失焦或 Ctrl+Enter 即保存。
          </>
        ) : (
          <>
            从月初到月底整周铺开（含跨月衔接周），今天所在周自动高亮，「📍 回到本周」一键跳回，「✏️ 编辑此周」回到单周修改。
          </>
        )}
      </div>
    </div>
  )
}

// 单行 = 一个 sortable（整行拖拽）+ 一行网格
function WeeklyRow({ row, cells, renderCell, renderRowHead }) {
  const sortable = useSortableRow(row.id)
  return (
    <div
      ref={sortable.setNodeRef}
      data-sort-id={row.id}
      style={{ ...sortable.style, gridTemplateColumns: GRID }}
      className={`wt-row ${sortable.isDragging ? 'is-dragging' : ''}`}
    >
      {renderRowHead(row, sortable)}
      {cells.map((c, day) => renderCell(row, day, c, sortable.isDragging))}
    </div>
  )
}
