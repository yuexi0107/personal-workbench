// 护肤打卡看板：分步打卡（区分早晚），分区 → 分组 → 步骤三级结构。
// 分区可拖拽排序（横向网格换位），分组可拖拽排序（分区内），步骤可拖拽排序（分组内），
// 同层碰撞过滤互不干扰；拖拽把手与删除钮同款悬停显形；
// 勾选状态按日期存储，跨天自动清零（每日打卡）。
import React, { useEffect, useRef, useState } from 'react'
import { DndContext, DragOverlay, PointerSensor, KeyboardSensor, useSensor, useSensors } from '@dnd-kit/core'
import { restrictToVerticalAxis, restrictToParentElement } from '@dnd-kit/modifiers'
import { SortableContext, verticalListSortingStrategy, rectSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { useBoardData, uid, todayStr, addDaysStr, fmtShort, useRefreshOnVisible } from './store.js'
import { Grip, useSortableRow, SPRING_DROP, makeSameLevelCollision, makeSameLevelKeyboard } from '../components/dnd/magpie.jsx'

const pad2 = (n) => String(n).padStart(2, '0')

/** 日期选择日历（样式与「每周数据」的周日历一致）：点日期切换查看/补记那天；
 *  只高亮所查看的当天（不整周高亮），今天仅描边参照；未来日期还没到，置灰不可选 */
function DayCalendar({ viewDate, today, onPick, onClose }) {
  const [ym, setYm] = useState(viewDate.slice(0, 7)) // 打开时定位到查看日所在月
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
          const future = ds > today
          return (
            <button
              key={ds}
              disabled={future}
              className={`wt-cal-day${ds === viewDate ? ' is-sel' : ''}${ds === today ? ' is-today' : ''}${future ? ' is-off' : ''}`}
              title={future ? '还没到，不能补记未来' : `点击查看/补记 ${ds === today ? '今天' : fmtShort(ds)}`}
              onClick={() => { onPick(ds); onClose() }}
            >
              {Number(ds.slice(8))}
            </button>
          )
        })}
      </div>
      <div className="wt-cal-hint">点击日期切换查看/补记 · 描边是今天 · 灰色是未来（不可选）</div>
    </div>
  )
}

/* ---------- 步骤行 ---------- */
function StepRow({ groupId, step, checked, onToggle, onRename, onDelete }) {
  const id = `s:${groupId}:${step.id}`
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging, style } = useSortableRow(id)
  return (
    <div
      ref={setNodeRef}
      data-sort-id={id}
      style={style}
      className={`ck-step ${checked ? 'done' : ''} ${isDragging ? 'is-dragging' : ''}`}
    >
      <Grip listeners={listeners} attributes={attributes} activatorRef={setActivatorNodeRef} dragging={isDragging} label="拖动排序步骤" className="bd-grip" />
      <button
        className={`todo-check ck-check ${checked ? 'on' : ''}`}
        onClick={() => onToggle(step.id)}
        aria-label={checked ? `取消：${step.name}` : `完成：${step.name}`}
      >{checked ? '✓' : ''}</button>
      <input
        className="input bd-inline ck-step-name"
        value={step.name}
        onChange={(e) => onRename(step.id, e.target.value)}
      />
      <button className="bd-del" onClick={() => onDelete(step.id)} title="删除步骤" aria-label={`删除步骤：${step.name}`}>✕</button>
    </div>
  )
}

/* ---------- 分组卡片（可拖拽，拖动时整体带着步骤走） ---------- */
function GroupCard({ sectionId, group, checkedCount, children, onRename, onDelete, onAddStep, addText, setAddText }) {
  const id = `g:${sectionId}:${group.id}`
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging, style } = useSortableRow(id)
  const total = group.steps.length
  return (
    <div
      ref={setNodeRef}
      data-sort-id={id}
      style={style}
      className={`ck-group ${isDragging ? 'is-dragging' : ''}`}
    >
      <div className="ck-group-head">
        <Grip listeners={listeners} attributes={attributes} activatorRef={setActivatorNodeRef} dragging={isDragging} label="拖动排序分组" className="bd-grip" />
        <input className="input bd-inline ck-group-name" value={group.name} onChange={(e) => onRename(group.id, e.target.value)} />
        <span className={`tag ${total && checkedCount === total ? 'green' : 'primary'} ck-progress`}>
          {total ? `${checkedCount}/${total}` : '空'}
        </span>
        <button className="bd-del" onClick={() => onDelete(group.id)} title="删除分组" aria-label={`删除分组：${group.name}`}>✕</button>
      </div>
      <div className="ck-steps">{children}</div>
      <div className="ck-add-step">
        <input
          className="input bd-inline"
          placeholder="＋ 添加步骤，回车确认"
          value={addText}
          onChange={(e) => setAddText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onAddStep() }}
        />
      </div>
    </div>
  )
}

/* ---------- 分区列（分区本身可拖拽排序，整列横向换位） ---------- */
function SectionColumn({ sec, checks, onRenameSection, onDeleteSection, onAddGroup,
  groupProps }) {
  const id = `sec:${sec.id}`
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging, style } = useSortableRow(id)
  const secSteps = sec.groups.reduce((m, g) => m + g.steps.length, 0)
  const secDone = sec.groups.reduce((m, g) => m + g.steps.filter((st) => checks[st.id]).length, 0)
  return (
    <section
      ref={setNodeRef}
      data-sort-id={id}
      style={style}
      className={`ck-section ${isDragging ? 'is-dragging' : ''}`}
    >
      <div className="ck-section-head">
        <Grip listeners={listeners} attributes={attributes} activatorRef={setActivatorNodeRef} dragging={isDragging} label="拖动排序分区" className="bd-grip" />
        <input className="input bd-inline ck-section-name" value={sec.name} onChange={(e) => onRenameSection(sec.id, e.target.value)} />
        <span className={`tag ${secSteps && secDone === secSteps ? 'green' : ''}`}>{secDone}/{secSteps}</span>
        <button className="bd-del" onClick={() => onDeleteSection(sec.id)} title="删除分区" aria-label={`删除分区：${sec.name}`}>✕</button>
      </div>
      <SortableContext items={sec.groups.map((g) => `g:${sec.id}:${g.id}`)} strategy={verticalListSortingStrategy}>
        <div className="ck-groups">
          {sec.groups.map((group) => (
            <GroupCard
              key={group.id}
              sectionId={sec.id}
              group={group}
              checkedCount={group.steps.filter((st) => checks[st.id]).length}
              {...groupProps}
              addText={groupProps.addTexts[group.id] || ''}
              setAddText={(v) => groupProps.setAddTexts((t) => ({ ...t, [group.id]: v }))}
              onAddStep={() => groupProps.addStep(group.id)}
            >
              <SortableContext items={group.steps.map((st) => `s:${group.id}:${st.id}`)} strategy={verticalListSortingStrategy}>
                {group.steps.map((step) => (
                  <StepRow
                    key={step.id}
                    groupId={group.id}
                    step={step}
                    checked={!!checks[step.id]}
                    onToggle={groupProps.toggle}
                    onRename={groupProps.renameStep}
                    onDelete={groupProps.deleteStep}
                  />
                ))}
              </SortableContext>
            </GroupCard>
          ))}
        </div>
      </SortableContext>
      <button className="btn btn-sm bd-dashed" onClick={() => onAddGroup(sec.id)}>＋ 添加分组</button>
    </section>
  )
}

export default function ChecklistBoard({ boardId }) {
  const [data, setData] = useBoardData(boardId, 'checklist')
  const sections = data.sections || []
  const [activeId, setActiveId] = useState(null)
  const [addTexts, setAddTexts] = useState({}) // { [groupId]: 输入中步骤名 }

  useRefreshOnVisible() // 隔夜挂着的页面恢复可见时刷新，避免「今天」停留在昨天
  const today = todayStr()
  // 查看日期：默认今天，可切换到过去日期回看/补记历史打卡（未来日期不放行）
  const [viewDate, setViewDate] = useState(todayStr())
  const [calOpen, setCalOpen] = useState(false) // 日期标签旁的日历浮层
  // 打卡历史 { 'YYYY-MM-DD': { [stepId]: true } }；旧数据无 history 时回退 checks/checkDate 兼容
  const hist = data.history || {}
  const dayChecks = (date) => hist[date] || (date === data.checkDate ? (data.checks || {}) : {})
  const checks = dayChecks(viewDate)
  const weekdayText = (() => {
    const [y, m, d] = viewDate.split('-').map(Number)
    return '日一二三四五六'[new Date(y, m - 1, d).getDay()]
  })()
  const toggle = (stepId) =>
    setData((d) => {
      const h = { ...(d.history || {}) }
      const base = { ...(h[viewDate] || (viewDate === d.checkDate ? (d.checks || {}) : {})) }
      if (base[stepId]) delete base[stepId]
      else base[stepId] = true
      h[viewDate] = base
      const next = { ...d, history: h }
      if (viewDate === today) { next.checkDate = today; next.checks = base } // 旧字段同步写，保持向后兼容
      return next
    })

  /* ---- 结构编辑 ---- */
  const patchSections = (fn) => setData((d) => ({ ...d, sections: fn(d.sections || []) }))
  const mapGroups = (fn) => patchSections((secs) => secs.map((s) => ({ ...s, groups: s.groups.map(fn) })))
  const renameSection = (sectionId, name) => patchSections((secs) => secs.map((s) => (s.id === sectionId ? { ...s, name } : s)))
  const addSection = () => patchSections((secs) => [...secs, { id: uid(), name: `分区 ${secs.length + 1}`, groups: [] }])
  const deleteSection = (sectionId) => {
    const s = sections.find((x) => x.id === sectionId)
    const n = s ? s.groups.reduce((m, g) => m + g.steps.length, 0) : 0
    if (n && !window.confirm(`删除分区「${s.name}」及其 ${n} 个步骤？`)) return
    patchSections((secs) => secs.filter((x) => x.id !== sectionId))
    if (s) purgeChecks(s.groups.flatMap((g) => g.steps.map((st) => st.id)))
  }
  const renameGroup = (groupId, name) => mapGroups((g) => (g.id === groupId ? { ...g, name } : g))
  // 清掉一组步骤 ID 的打卡记录（删组/删分区时防脏数据残留：history 全部日期 + 当日旧字段）
  const purgeChecks = (stepIds) =>
    setData((d) => {
      const ids = new Set(stepIds)
      let changed = false
      const h = {}
      for (const [date, dayMap] of Object.entries(d.history || {})) {
        const nextDay = {}
        for (const [k, v] of Object.entries(dayMap || {})) {
          if (ids.has(k)) { changed = true; continue }
          nextDay[k] = v
        }
        h[date] = nextDay
      }
      const base = d.checkDate === today ? (d.checks || {}) : {}
      const nextChecks = {}
      for (const [k, v] of Object.entries(base)) {
        if (ids.has(k)) { changed = true; continue }
        nextChecks[k] = v
      }
      if (!changed) return d
      const next = { ...d, history: h }
      if (d.checkDate === today) { next.checkDate = today; next.checks = nextChecks }
      return next
    })
  const deleteGroup = (groupId) => {
    const g = sections.flatMap((s) => s.groups).find((x) => x.id === groupId)
    if (g && g.steps.length && !window.confirm(`删除分组「${g.name}」及其 ${g.steps.length} 个步骤？`)) return
    patchSections((secs) => secs.map((s) => ({ ...s, groups: s.groups.filter((x) => x.id !== groupId) })))
    if (g) purgeChecks(g.steps.map((st) => st.id))
  }
  const addGroup = (sectionId) =>
    patchSections((secs) => secs.map((s) => (s.id === sectionId ? { ...s, groups: [...s.groups, { id: uid(), name: '新分组', steps: [] }] } : s)))
  const renameStep = (stepId, name) => mapGroups((g) => ({ ...g, steps: g.steps.map((st) => (st.id === stepId ? { ...st, name } : st)) }))
  const deleteStep = (stepId) => {
    mapGroups((g) => ({ ...g, steps: g.steps.filter((st) => st.id !== stepId) }))
    purgeChecks([stepId]) // 从当日打卡中一并移除
  }
  const addStep = (groupId) => {
    const name = (addTexts[groupId] || '').trim()
    if (!name) return
    mapGroups((g) => (g.id === groupId ? { ...g, steps: [...g.steps, { id: uid(), name }] } : g))
    setAddTexts((t) => ({ ...t, [groupId]: '' }))
  }

  /* ---- 拖拽：步骤在分组内、分组在分区内，同层碰撞过滤 ---- */
  const activeStep = (() => {
    if (!activeId || !String(activeId).startsWith('s:')) return null
    const [, gid, sid] = String(activeId).split(':')
    const group = sections.flatMap((s) => s.groups).find((g) => g.id === gid)
    return group ? { group, step: group.steps.find((st) => st.id === sid) } : null
  })()
  const activeGroup = (() => {
    if (!activeId || !String(activeId).startsWith('g:')) return null
    const [, sid, gid] = String(activeId).split(':')
    const sec = sections.find((s) => s.id === sid)
    return sec ? { section: sec, group: sec.groups.find((g) => g.id === gid) } : null
  })()

  const moveStep = (active, over) => {
    if (!over || active === over) return
    const gid = String(active).split(':')[1]
    if (String(over).split(':')[1] !== gid) return
    mapGroups((g) => {
      if (g.id !== gid) return g
      const from = g.steps.findIndex((st) => st.id === String(active).split(':')[2])
      const to = g.steps.findIndex((st) => st.id === String(over).split(':')[2])
      if (from < 0 || to < 0 || from === to) return g
      return { ...g, steps: arrayMove(g.steps, from, to) }
    })
  }
  const moveGroup = (active, over) => {
    if (!over || active === over) return
    const sid = String(active).split(':')[1]
    if (String(over).split(':')[1] !== sid) return
    patchSections((secs) => secs.map((s) => {
      if (s.id !== sid) return s
      const from = s.groups.findIndex((g) => g.id === String(active).split(':')[2])
      const to = s.groups.findIndex((g) => g.id === String(over).split(':')[2])
      if (from < 0 || to < 0 || from === to) return s
      return { ...s, groups: arrayMove(s.groups, from, to) }
    }))
  }

  const levelKeyOf = (id) => {
    const s = String(id)
    if (s.startsWith('s:')) return `steps:${s.split(':')[1]}`
    if (s.startsWith('g:')) return `groups:${s.split(':')[1]}`
    if (s.startsWith('sec:')) return 'sections'
    return s
  }
  const siblingsOf = (id) => {
    const s = String(id)
    if (s.startsWith('s:')) {
      const group = sections.flatMap((sec) => sec.groups).find((g) => g.id === s.split(':')[1])
      return group ? group.steps.map((st) => `s:${group.id}:${st.id}`) : []
    }
    if (s.startsWith('g:')) {
      const sec = sections.find((x) => x.id === s.split(':')[1])
      return sec ? sec.groups.map((g) => `g:${sec.id}:${g.id}`) : []
    }
    if (s.startsWith('sec:')) return sections.map((x) => `sec:${x.id}`)
    return []
  }
  const collision = makeSameLevelCollision(levelKeyOf)
  const keyboard = makeSameLevelKeyboard(siblingsOf)
  const dndSensors = useSensorsWithKeyboard(keyboard)

  // 分区在横向网格里换位：不能用全局的"仅纵向"限制，按层级分别施加约束
  // （dnd-kit 未拖拽时也会跑一遍 modifiers，active 可能为 null，须判空）
  const dragModifier = (args) => {
    if (!args.active) return args.transform
    if (String(args.active.id).startsWith('sec:')) return restrictToParentElement(args)
    const axis = restrictToVerticalAxis(args)
    return restrictToParentElement({ ...args, transform: axis })
  }

  const moveSection = (active, over) => {
    if (!over || active === over) return
    if (!String(active).startsWith('sec:') || !String(over).startsWith('sec:')) return
    patchSections((secs) => {
      const from = secs.findIndex((s) => `sec:${s.id}` === String(active))
      const to = secs.findIndex((s) => `sec:${s.id}` === String(over))
      if (from < 0 || to < 0 || from === to) return secs
      return arrayMove(secs, from, to)
    })
  }

  const activeSection = activeId && String(activeId).startsWith('sec:')
    ? sections.find((s) => `sec:${s.id}` === String(activeId)) || null
    : null

  const totalSteps = sections.reduce((n, s) => n + s.groups.reduce((m, g) => m + g.steps.length, 0), 0)
  const doneSteps = sections.reduce((n, s) => n + s.groups.reduce((m, g) => m + g.steps.filter((st) => checks[st.id]).length, 0), 0)

  return (
    <div className="bd-panel">
      <div className="bd-toolbar">
        <button className="btn btn-sm" onClick={() => setViewDate(addDaysStr(viewDate, -1))} title="查看/补记前一天">‹ 前一天</button>
        {/* 点日期标签弹日历：选日期直跳查看/补记那天 */}
        <div className="wt-weekwrap">
          <button
            className={`tag ${viewDate === today ? 'primary' : 'orange'} wt-weekbtn`}
            onClick={() => setCalOpen((v) => !v)}
            title="点击打开日历，选日期查看/补记"
          >
            {viewDate === today ? '今天' : '历史'} · {fmtShort(viewDate)} 周{weekdayText} <span className="wt-weekcaret">▾</span>
          </button>
          {calOpen && (
            <DayCalendar
              viewDate={viewDate}
              today={today}
              onClose={() => setCalOpen(false)}
              onPick={(ds) => setViewDate(ds)}
            />
          )}
        </div>
        <button className="btn btn-sm" onClick={() => setViewDate(addDaysStr(viewDate, 1))} disabled={addDaysStr(viewDate, 1) > today} title="后一天">后一天 ›</button>
        {viewDate !== today && <button className="btn btn-sm btn-primary" onClick={() => setViewDate(today)}>回到今天</button>}
        <span className="bd-stat">{viewDate === today ? '今日打卡' : '该日打卡'} {doneSteps}/{totalSteps}</span>
        <span className="bd-progress"><span style={{ width: totalSteps ? `${(doneSteps / totalSteps) * 100}%` : 0 }} /></span>
        <span className="spacer" />
        <button className="btn btn-sm" onClick={addSection}>＋ 添加分区</button>
      </div>
      <div className="bd-hint" style={{ padding: '0 4px 8px', fontSize: 12, color: 'var(--text-3)' }}>
        切换日期可回看/补记历史打卡（按所选日期保存）；点日期标签打开日历选日，日历只高亮所选当天（描边是今天），「回到今天」一键跳回；进度与勾选状态随所选日期显示。
      </div>

      <DndContext
        sensors={dndSensors}
        collisionDetection={collision}
        modifiers={[dragModifier]}
        onDragStart={(e) => setActiveId(String(e.active.id))}
        // 步骤/分组/分区都是同层排序（跨组/跨区一律忽略），落位只在 onDragEnd 一次性提交：
        // live arrayMove 会让上拖来回震荡（预览闪烁），拖动过程中的让位由 transform 预览完成
        onDragEnd={(e) => {
          moveStep(String(e.active.id), e.over && String(e.over.id))
          moveGroup(String(e.active.id), e.over && String(e.over.id))
          moveSection(String(e.active.id), e.over && String(e.over.id))
          setActiveId(null)
        }}
        onDragCancel={() => setActiveId(null)}
      >
        <SortableContext items={sections.map((s) => `sec:${s.id}`)} strategy={rectSortingStrategy}>
          <div className="ck-cols">
            {sections.map((sec) => (
              <SectionColumn
                key={sec.id}
                sec={sec}
                checks={checks}
                onRenameSection={renameSection}
                onDeleteSection={deleteSection}
                onAddGroup={addGroup}
                groupProps={{
                  onRename: renameGroup,
                  onDelete: deleteGroup,
                  addTexts,
                  setAddTexts,
                  addStep,
                  toggle,
                  renameStep,
                  deleteStep,
                }}
              />
            ))}
          </div>
        </SortableContext>

        <DragOverlay dropAnimation={SPRING_DROP}>
          {activeSection ? (
            <div className="ck-section ck-sec-overlay">
              <div className="ck-section-head">
                <span className="wb-grip is-grabbing">⠿</span>
                <span className="ck-section-name">{activeSection.name}</span>
                <span className="tag">
                  {activeSection.groups.reduce((n, g) => n + g.steps.length, 0)} 步
                </span>
              </div>
            </div>
          ) : activeStep && activeStep.step ? (
            <div className="ck-step ck-overlay">
              <span className="wb-grip is-grabbing">⠿</span>
              <span className="todo-check ck-check">{''}</span>
              <span className="ck-step-name">{activeStep.step.name}</span>
            </div>
          ) : activeGroup && activeGroup.group ? (
            <div className="ck-group ck-overlay">
              <div className="ck-group-head">
                <span className="wb-grip is-grabbing">⠿</span>
                <span className="ck-group-name">{activeGroup.group.name}</span>
                <span className="tag primary ck-progress">{activeGroup.group.steps.length} 步</span>
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  )
}

// 传感器：指针位移激活 + 同层键盘导航（步骤/分组各自成层）
function useSensorsWithKeyboard(keyboard) {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: keyboard })
  )
}
