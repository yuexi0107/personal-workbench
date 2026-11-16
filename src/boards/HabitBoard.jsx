// 习惯打卡看板：每日打卡 + 连续天数 streak + 按月可视化矩阵（可切「年度面板」整年回看）。
// 矩阵图可点击过去某天补打/取消（纠错用），未来日期置灰不可点；今日打卡走条目左侧的 ✓ 按钮。
// 与护肤打卡（checklist，每日重置）不同：habit 按习惯×日期保留全部历史。
// 数据结构见 seed.js：{ items: [{id,name,createdAt}], marks: { [habitId]: { 'YYYY-MM-DD': true } } }
import React, { useState } from 'react'
import { DndContext, DragOverlay } from '@dnd-kit/core'
import { restrictToVerticalAxis, restrictToParentElement } from '@dnd-kit/modifiers'
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { useBoardData, uid, todayStr, useRefreshOnVisible } from './store.js'
import { Grip, useSortableRow, SPRING_DROP, useMagpieSensors } from '../components/dnd/magpie.jsx'

const pad2 = (n) => String(n).padStart(2, '0')
const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
const WEEKDAY_HEAD = ['一', '二', '三', '四', '五', '六', '日']

/** 连续天数：从今天起往回数；今天还没打卡则从昨天起算（不打断昨天的连胜） */
function streakOf(dayMarks) {
  const cursor = new Date()
  cursor.setHours(0, 0, 0, 0)
  if (!dayMarks[ymd(cursor)]) cursor.setDate(cursor.getDate() - 1)
  let streak = 0
  while (dayMarks[ymd(cursor)]) {
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}

/** 某月（month 0-11）周一开头的日历矩阵：元素为 'YYYY-MM-DD' 或 null（前后补位） */
function monthCells(year, month) {
  const offset = (new Date(year, month, 1).getDay() + 6) % 7 // 周一=0
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = []
  for (let i = 0; i < offset; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(ymd(new Date(year, month, d)))
  while (cells.length % 7) cells.push(null)
  return cells
}

/** 月矩阵：点击过去/今天的格子可补打或取消（onToggleDay 传入时生效）；未来日期置灰只读 */
function MonthGrid({ dayMarks, cells, today, compact, onToggleDay }) {
  return (
    <div className={`hb-matrix ${compact ? 'compact' : ''}`}>
      {WEEKDAY_HEAD.map((w) => <span key={w} className="hb-matrix-wd">{w}</span>)}
      {cells.map((date, i) => {
        if (!date) return <span key={`b${i}`} className="hb-mcell blank" />
        const done = !!dayMarks[date]
        const markable = !!onToggleDay && date <= today
        const cls = [
          'hb-mcell',
          done ? 'on' : '',
          date === today ? 'today' : '',
          date > today ? 'future' : '',
          markable ? 'markable' : ''
        ].filter(Boolean).join(' ')
        return (
          <span
            key={date}
            className={cls}
            title={`${date}${done ? ' · 已打卡' : ''}${markable ? (done ? '，点击取消' : '，点击补打') : ''}`}
            onClick={markable ? () => onToggleDay(date) : undefined}
          />
        )
      })}
    </div>
  )
}

function HabitRow({ habit, marks, today, onToggle, onRename, onDelete, view, cells, year }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging, style } = useSortableRow(habit.id)
  const dayMarks = marks[habit.id] || {}
  const streak = streakOf(dayMarks)
  return (
    <div ref={setNodeRef} data-sort-id={habit.id} style={style} className={`hb-row ${isDragging ? 'is-dragging' : ''}`}>
      <div className="hb-main">
        <Grip listeners={listeners} attributes={attributes} activatorRef={setActivatorNodeRef} dragging={isDragging} label="拖动排序习惯" className="bd-grip" />
        <button
          className={`todo-check ${dayMarks[today] ? 'on' : ''}`}
          onClick={() => onToggle(habit.id, todayStr())}
          aria-label={dayMarks[today] ? `取消今日打卡：${habit.name}` : `今日打卡：${habit.name}`}
        >{dayMarks[today] ? '✓' : ''}</button>
        <input
          className="input bd-inline hb-name"
          value={habit.name}
          aria-label={`习惯名：${habit.name}`}
          onChange={(e) => onRename(habit.id, e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur() }}
          onBlur={(e) => { if (!e.target.value.trim()) onDelete(habit.id) }}
        />
        <span className={`hb-streak ${streak > 0 ? 'on' : ''}`} title={streak > 0 ? `已连续 ${streak} 天` : '今天打个卡，开启连续记录'}>
          🔥 {streak} 天
        </span>
        <button className="bd-del" onClick={() => onDelete(habit.id)} title="删除习惯" aria-label={`删除习惯：${habit.name}`}>✕</button>
      </div>
      <div className="hb-viz" role="img" aria-label={`${habit.name} 打卡矩阵图`}>
        {view === 'month' ? (
          <MonthGrid dayMarks={dayMarks} cells={cells} today={today} onToggleDay={(date) => onToggle(habit.id, date)} />
        ) : (
          <div className="hb-year">
            {Array.from({ length: 12 }, (_, m) => (
              <div key={m} className="hb-ymonth">
                <span className="hb-ymonth-label">{m + 1}月</span>
                <MonthGrid compact dayMarks={dayMarks} cells={monthCells(year, m)} today={today} onToggleDay={(date) => onToggle(habit.id, date)} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default function HabitBoard({ boardId }) {
  const [data, setData] = useBoardData(boardId, 'habit')
  const items = data.items || []
  const marks = data.marks || {}
  useRefreshOnVisible() // 隔夜挂着的页面恢复可见时刷新，避免「今天」停留在昨天
  const today = todayStr()
  const [text, setText] = useState('')
  const [activeId, setActiveId] = useState(null)
  const [view, setView] = useState('month') // 'month' 按月矩阵 | 'year' 年度面板
  const now = new Date()
  const [cursor, setCursor] = useState({ y: now.getFullYear(), m: now.getMonth() })
  const sensors = useMagpieSensors()

  const doneToday = items.filter((h) => marks[h.id]?.[today]).length
  const isThisMonth = cursor.y === now.getFullYear() && cursor.m === now.getMonth()
  const cells = monthCells(cursor.y, cursor.m)

  const add = () => {
    const t = text.trim()
    if (!t) return
    // 新习惯插到最前（紧挨输入框下方），与任务队列一致；拖拽把手可自行调整顺序
    setData((d) => ({ ...d, items: [{ id: uid(), name: t, createdAt: todayStr() }, ...(d.items || [])] }))
    setText('')
  }
  // 打卡/取消：date 由调用方给（今日 ✓ 按钮传实时 todayStr()，矩阵格子传格子日期）；未来日期不存在入口
  const toggle = (habitId, date) =>
    setData((d) => {
      const all = d.marks || {}
      const dayMarks = { ...(all[habitId] || {}) }
      if (dayMarks[date]) delete dayMarks[date]
      else dayMarks[date] = true
      return { ...d, marks: { ...all, [habitId]: dayMarks } }
    })
  const remove = (habitId) => {
    const h = items.find((x) => x.id === habitId)
    const n = Object.keys(marks[habitId] || {}).length
    if (h && n > 0 && !window.confirm(`删除习惯「${h.name}」？其 ${n} 天打卡历史将一并清除。`)) return
    setData((d) => {
      const nextMarks = { ...(d.marks || {}) }
      delete nextMarks[habitId]
      return { ...d, items: (d.items || []).filter((i) => i.id !== habitId), marks: nextMarks }
    })
  }
  const rename = (habitId, name) =>
    setData((d) => ({ ...d, items: (d.items || []).map((i) => (i.id === habitId ? { ...i, name } : i)) }))
  const move = (active, over) => {
    if (!over || active === over) return
    setData((d) => {
      const list = d.items || []
      const from = list.findIndex((i) => i.id === active)
      const to = list.findIndex((i) => i.id === over)
      if (from < 0 || to < 0 || from === to) return d
      return { ...d, items: arrayMove(list, from, to) }
    })
  }
  const shiftMonth = (delta) =>
    setCursor((c) => {
      const d = new Date(c.y, c.m + delta, 1)
      return { y: d.getFullYear(), m: d.getMonth() }
    })

  const activeHabit = items.find((i) => i.id === activeId)

  return (
    <div className="bd-panel">
      <div className="bd-toolbar">
        <input
          className="input bd-grow"
          placeholder="输入习惯名，回车添加（如：早睡 / 阅读 20 分钟）…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') add() }}
        />
        <button className="btn btn-primary" onClick={add} disabled={!text.trim()}>＋ 添加习惯</button>
        <span className="bd-stat">今日 {doneToday}/{items.length}</span>
        <span className="bd-progress"><span style={{ width: items.length ? `${(doneToday / items.length) * 100}%` : 0 }} /></span>
      </div>

      <div className="bd-hint" style={{ padding: '0 4px 8px', fontSize: 12, color: 'var(--text-3)' }}>
        🔥 连续天数逐日累计 · 矩阵图按月/按年回看，点过去的格子可补打/取消（未来日期不可打）
      </div>

      <div className="bd-toolbar hb-viz-bar">
        <div className="segmented">
          <button className={view === 'month' ? 'active' : ''} onClick={() => setView('month')}>按月</button>
          <button className={view === 'year' ? 'active' : ''} onClick={() => setView('year')}>按年</button>
        </div>
        {view === 'month' ? (
          <>
            <button className="btn btn-sm" onClick={() => shiftMonth(-1)} title="上个月">‹</button>
            <span className="bd-stat">{cursor.y}年{cursor.m + 1}月</span>
            <button className="btn btn-sm" onClick={() => shiftMonth(1)} disabled={isThisMonth} title={isThisMonth ? '已是本月' : '下个月'}>›</button>
            {!isThisMonth && (
              <button className="btn btn-sm" onClick={() => setCursor({ y: now.getFullYear(), m: now.getMonth() })}>回到本月</button>
            )}
          </>
        ) : (
          <>
            <button className="btn btn-sm" onClick={() => setCursor((c) => ({ ...c, y: c.y - 1 }))} title="上一年">‹</button>
            <span className="bd-stat">{cursor.y} 年</span>
            <button className="btn btn-sm" onClick={() => setCursor((c) => ({ ...c, y: c.y + 1 }))} disabled={cursor.y >= now.getFullYear()} title={cursor.y >= now.getFullYear() ? '已是今年' : '下一年'}>›</button>
          </>
        )}
      </div>

      <DndContext
        sensors={sensors}
        modifiers={[restrictToVerticalAxis, restrictToParentElement]}
        onDragStart={(e) => setActiveId(String(e.active.id))}
        // 列表内排序只在 onDragEnd 一次性提交（live arrayMove 上拖会来回震荡），
        // 拖动过程中的让位由 transform 预览完成
        onDragEnd={(e) => { move(String(e.active.id), e.over && String(e.over.id)); setActiveId(null) }}
        onDragCancel={() => setActiveId(null)}
      >
        {items.length === 0 ? (
          <div className="empty"><div className="empty-icon">🔥</div>还没有习惯，添加一个开始连续打卡吧。</div>
        ) : (
          <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            <div className="hb-list">
              {items.map((habit) => (
                <HabitRow
                  key={habit.id}
                  habit={habit}
                  marks={marks}
                  today={today}
                  onToggle={toggle}
                  onRename={rename}
                  onDelete={remove}
                  view={view}
                  cells={cells}
                  year={cursor.y}
                />
              ))}
            </div>
          </SortableContext>
        )}
        <DragOverlay dropAnimation={SPRING_DROP}>
          {activeHabit ? (
            <div className="hb-row hb-overlay">
              <span className="wb-grip is-grabbing">⠿</span>
              <span className="todo-check">{''}</span>
              <span className="hb-name">{activeHabit.name}</span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  )
}
