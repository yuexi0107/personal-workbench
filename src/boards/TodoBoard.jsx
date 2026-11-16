// 任务队列看板：任务分「📌 常规 / 🌴 周末」两个队列，条目可跨队列拖动
// （拖到另一队列的条目上=插到它前面；拖到队列空白处=移到该队列末尾）。
// 任务 = 标题 + 可选内容：双击条目（或 ✏ 按钮）弹窗编辑标题与内容；
// 内容为空时列表只显示标题。拖拽走共享 Magpie 基建（弹簧让位/浮层克隆）；
// 数据上单数组 items + queue 字段（缺省=常规，天然兼容旧数据），过滤即视图。
// 页面另有「⏰ 待办事项」块：轻量清单与优先级任务分开管理，条目可拖动、可选截止日期，
// 同样支持标题+内容（双击或 ✏ 弹窗编辑）。
// 三张卡片（常规队列/周末队列/待办事项）本身也可拖左上把手换位，顺序落盘 board 数据 cardOrder
// （随看板备份导出）；两个队列卡始终保持并排，待办卡可整体置顶或置底。
import React, { useState } from 'react'
import { DndContext, DragOverlay, useDroppable, pointerWithin, closestCorners, closestCenter } from '@dnd-kit/core'
import { restrictToVerticalAxis, restrictToParentElement } from '@dnd-kit/modifiers'
import { SortableContext, verticalListSortingStrategy, rectSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { useBoardData, uid, todayStr, fmtShort, addDaysStr, useRefreshOnVisible } from './store.js'
import { Grip, useSortableRow, SPRING_DROP, useMagpieSensors, SortableCard, moveByIds, normalizeOrder } from '../components/dnd/magpie.jsx'

// 页面卡片 id 与默认顺序（cardOrder 缺失/损坏时回退默认，normalizeOrder 会补齐缺失 id）
const TODO_CARDS = ['q:regular', 'q:weekend', 'todos']

function TodoRow({ item, onToggle, onDelete, onOpenEdit }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging, style } = useSortableRow(item.id)
  const note = (item.note || '').trim()
  return (
    <div
      ref={setNodeRef}
      data-sort-id={item.id}
      style={style}
      className={`todo-item ${item.done ? 'done' : ''} ${isDragging ? 'is-dragging' : ''}`}
    >
      <Grip listeners={listeners} attributes={attributes} activatorRef={setActivatorNodeRef} dragging={isDragging} label="拖动调整优先级（可跨队列）" className="bd-grip" />
      <button
        className={`todo-check ${item.done ? 'on' : ''}`}
        onClick={() => onToggle(item.id)}
        aria-label={item.done ? '标记为未完成' : '标记为已完成'}
      >{item.done ? '✓' : ''}</button>
      {/* 双击标题区打开编辑弹窗（标题 + 内容） */}
      <div className="todo-body" onDoubleClick={() => onOpenEdit(item.id)} title="双击编辑标题与内容">
        <div className="todo-title">{item.text}</div>
        {note && <div className="todo-note">{note}</div>}
      </div>
      <span className="todo-date">{item.createdAt ? fmtShort(item.createdAt) : ''}</span>
      <button className="bd-del" onClick={() => onOpenEdit(item.id)} title="编辑标题与内容（或双击条目）" aria-label={`编辑：${item.text}`}>✏</button>
      <button className="bd-del" onClick={() => onDelete(item.id)} title="删除任务" aria-label={`删除：${item.text}`}>✕</button>
    </div>
  )
}

/** 截止日期芯片（仅展示，编辑在双击弹窗里）：逾期红/今天橙/明天/常规 MM.DD；无期限显示幽灵按钮（悬停行显形），点击打开编辑弹窗 */
function DueCell({ t, today, onOpenEdit }) {
  const due = t.due || ''
  const overdue = !!due && !t.done && due < today
  const isToday = !!due && !t.done && due === today
  const text = !due ? '＋期限'
    : overdue ? `逾期 ${fmtShort(due)}`
    : isToday ? '今天'
    : due === addDaysStr(today, 1) ? '明天'
    : fmtShort(due)
  return (
    <button
      className={`todo-due ${overdue ? 'overdue' : ''} ${isToday ? 'today' : ''} ${due ? '' : 'ghost'}`}
      onClick={(e) => { e.stopPropagation(); onOpenEdit(t.id) }}
      onDoubleClick={(e) => e.stopPropagation()}
      title={due ? '点击打开编辑弹窗修改/清除截止日期' : '设置截止日期（双击条目或在弹窗中设置）'}
      aria-label={`截止日期：${t.text}`}
    >{text}</button>
  )
}

/** 待办事项行：块内独立拖拽排序；双击打开弹窗编辑标题、内容与截止日期（芯片随标题展示） */
function TodoSubRow({ t, today, onToggle, onDelete, onOpenEdit }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging, style } = useSortableRow(t.id)
  const note = (t.note || '').trim()
  return (
    <div
      ref={setNodeRef}
      data-sort-id={t.id}
      style={style}
      className={`todo-item ${t.done ? 'done' : ''} ${isDragging ? 'is-dragging' : ''}`}
    >
      <Grip listeners={listeners} attributes={attributes} activatorRef={setActivatorNodeRef} dragging={isDragging} label="拖动排序待办" className="bd-grip" />
      <button
        className={`todo-check ${t.done ? 'on' : ''}`}
        onClick={() => onToggle(t.id)}
        aria-label={t.done ? '标记为未完成' : '标记为已完成'}
      >{t.done ? '✓' : ''}</button>
      {/* 双击标题区打开编辑弹窗（标题 + 内容 + 截止日期） */}
      <div className="todo-body" onDoubleClick={() => onOpenEdit(t.id)} title="双击编辑标题、内容与截止日期">
        <div className="todo-title-row">
          <span className="todo-title">{t.text}</span>
          <DueCell t={t} today={today} onOpenEdit={onOpenEdit} />
        </div>
        {note && <div className="todo-note">{note}</div>}
      </div>
      <button className="bd-del" onClick={() => onOpenEdit(t.id)} title="编辑标题、内容与截止日期（或双击条目）" aria-label={`编辑待办：${t.text}`}>✏</button>
      <button className="bd-del" onClick={() => onDelete(t.id)} title="删除待办" aria-label={`删除待办：${t.text}`}>✕</button>
    </div>
  )
}

/** 队列列容器：整列是 droppable —— 拖到列表空白处=移到该队列末尾，空队列也承接拖入。
 *  grip 由外层 SortableCard 注入（卡片级拖拽把手，与条目把手互不干扰）。 */
function QueueColumn({ colId, icon, title, sub, items, done, text, onText, onAdd, onClearDone, grip, children }) {
  const { setNodeRef, isOver } = useDroppable({ id: colId })
  return (
    <div ref={setNodeRef} className={`todo-queue ${isOver ? 'is-over' : ''}`}>
      <div className="todo-block-head">
        {grip}
        <span className="todo-block-title">{icon} {title}</span>
        <span className="todo-block-sub">{sub}</span>
        {items.length > 0 && <span className="bd-stat">{done}/{items.length} 完成</span>}
        {done > 0 && <button className="btn btn-sm" onClick={onClearDone}>清已完成（{done}）</button>}
      </div>
      <div className="bd-toolbar" style={{ marginBottom: 8 }}>
        <input
          className="input bd-grow"
          placeholder={`输入任务标题，回车添加到${title}…`}
          value={text}
          onChange={(e) => onText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onAdd() }}
        />
        <button className="btn btn-primary" onClick={onAdd} disabled={!text.trim()}>＋ 添加</button>
      </div>
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        {items.length === 0 ? (
          <div className="todo-queue-empty">这里还没有任务 — 从上方添加，或把另一队列的任务拖进来</div>
        ) : (
          <div className="todo-list">{children}</div>
        )}
      </SortableContext>
    </div>
  )
}

export default function TodoBoard({ boardId }) {
  const [data, setData] = useBoardData(boardId, 'todo')
  const items = data.items || []
  const [text, setText] = useState('') // 常规队列添加框
  const [weekendText, setWeekendText] = useState('') // 周末队列添加框
  const [activeId, setActiveId] = useState(null)
  const [editing, setEditing] = useState(null) // { scope: 'task'|'todo', id, title, note } | null
  const sensors = useMagpieSensors()

  // —— 双队列：单数组 items + queue 字段（缺省=常规），过滤即视图，天然兼容旧数据 ——
  const queueOf = (it) => (it && it.queue === 'weekend' ? 'weekend' : 'regular')
  const regularItems = items.filter((i) => queueOf(i) === 'regular')
  const weekendItems = items.filter((i) => queueOf(i) === 'weekend')
  const regularDone = regularItems.filter((i) => i.done).length
  const weekendDone = weekendItems.filter((i) => i.done).length
  const activeItem = items.find((i) => i.id === activeId)

  useRefreshOnVisible() // 隔夜挂着的页面恢复可见时刷新「今天」，逾期/今天芯片才准确
  const today = todayStr()
  // —— 待办事项块：{ id, text, note, due, done, createdAt }，独立于 items 的轻量清单 ——
  const todos = data.todos || []
  const [todoText, setTodoText] = useState('')
  const [todoDue, setTodoDue] = useState('')
  const [activeTodoId, setActiveTodoId] = useState(null)
  const todoDone = todos.filter((t) => t.done).length
  const activeTodo = todos.find((t) => t.id === activeTodoId)

  const add = (queue) => {
    const t = (queue === 'weekend' ? weekendText : text).trim()
    if (!t) return
    // 新任务置顶 = 该队列最高优先级
    setData((d) => ({ ...d, items: [{ id: uid(), text: t, note: '', done: false, createdAt: todayStr(), queue }, ...(d.items || [])] }))
    if (queue === 'weekend') setWeekendText('')
    else setText('')
  }
  const toggle = (id) =>
    setData((d) => ({ ...d, items: (d.items || []).map((i) => (i.id === id ? { ...i, done: !i.done } : i)) }))
  const remove = (id) =>
    setData((d) => ({ ...d, items: (d.items || []).filter((i) => i.id !== id) }))
  const openEdit = (id) => {
    const it = items.find((i) => i.id === id)
    if (it) setEditing({ scope: 'task', id, title: it.text, note: it.note || '' })
  }
  const saveEdit = () => {
    if (!editing) return
    const title = editing.title.trim()
    if (!title) return // 标题不能为空
    const patch = { text: title, note: editing.note.trim() }
    if (editing.scope === 'todo') patch.due = editing.due || '' // 待办的截止日期也在弹窗里维护
    setData((d) => editing.scope === 'todo'
      ? { ...d, todos: (d.todos || []).map((t) => (t.id === editing.id ? { ...t, ...patch } : t)) }
      : { ...d, items: (d.items || []).map((i) => (i.id === editing.id ? { ...i, ...patch } : i)) })
    setEditing(null)
  }
  const clearDone = (queue) =>
    setData((d) => ({ ...d, items: (d.items || []).filter((i) => queueOf(i) !== queue || !i.done) }))
  // 跨队列移动 / 队列内排序：over 为条目 id → 落到它前面（同队列即 arrayMove 语义）；
  // over 为队列容器（col:regular / col:weekend）→ 移到该队列末尾。
  const moveTask = (active, over) => {
    if (!over || active === over) return
    setData((d) => {
      const list = d.items || []
      const from = list.findIndex((i) => i.id === active)
      if (from < 0) return d
      let targetQueue, refIdx // refIdx = 参照条目下标；-1 = 目标队列末尾
      if (String(over).startsWith('col:')) {
        targetQueue = over === 'col:weekend' ? 'weekend' : 'regular'
        refIdx = -1
      } else {
        const to = list.findIndex((i) => i.id === over)
        if (to < 0) return d
        targetQueue = queueOf(list[to])
        refIdx = to
      }
      if (queueOf(list[from]) === targetQueue && refIdx >= 0) {
        if (refIdx === from) return d
        return { ...d, items: arrayMove(list, from, refIdx) }
      }
      // 跨队列（或移到队尾）：摘出后按目标队列重新插入
      const item2 = { ...list[from], queue: targetQueue }
      const rest = list.filter((_, i) => i !== from)
      let insertAt
      if (refIdx < 0) {
        insertAt = rest.length
        for (let i = rest.length - 1; i >= 0; i--) {
          if (queueOf(rest[i]) === targetQueue) { insertAt = i + 1; break }
        }
      } else {
        insertAt = refIdx > from ? refIdx - 1 : refIdx // 摘出后参照条目下标可能前移
      }
      const out = [...rest]
      out.splice(insertAt, 0, item2)
      return { ...d, items: out }
    })
  }
  // 碰撞结果解析：优先条目（拖到条目上=插到它前面），其次队列空白区容器
  const resolveOverId = (e) => {
    const cols = e.collisions || []
    const activeStr = String(e.active.id)
    for (const c of cols) {
      const id = String(c.id)
      if (!id.startsWith('col:') && id !== activeStr) return id
    }
    for (const c of cols) if (String(c.id).startsWith('col:')) return String(c.id)
    return e.over ? String(e.over.id) : null
  }
  // 碰撞策略（分层，参照资产管家三层模式）：卡片拖拽只在三张卡之间找落点（最近中心），
  // 条目拖拽只在队列条目+列容器之间找落点（指针优先，最近角兜底供键盘拖拽用）——
  // 待办条目是嵌套 DndContext 的 droppable，不会出现在主上下文的碰撞集合里。
  const isCardId = (id) => TODO_CARDS.includes(String(id))
  const collisionDetection = (args) => {
    const cardDrag = isCardId(String(args.active.id))
    const containers = args.droppableContainers.filter((c) => isCardId(String(c.id)) === cardDrag)
    const filtered = { ...args, droppableContainers: containers }
    if (cardDrag) {
      // 卡片拖拽按「指针到各卡中心」判落点（排除自身）：closestCenter 比的是被拖卡中心，
      // 宽卡片（待办块横贯整行）中心常常更近，会把落点误判给下方卡片；指针位置才符合"放到我指的这张卡上"的直觉。
      // 键盘拖拽无指针坐标，回退最近中心。
      const p = args.pointerCoordinates
      if (!p) return closestCenter(filtered)
      return containers
        .filter((c) => String(c.id) !== String(args.active.id))
        .map((c) => {
          const r = c.rect.current
          const value = Math.hypot(p.x - (r.left + r.width / 2), p.y - (r.top + r.height / 2))
          return { id: c.id, data: { droppableContainer: c, value } }
        })
        .sort((a, b) => a.data.value - b.data.value)
    }
    const hits = pointerWithin(filtered)
    return hits.length ? hits : closestCorners(filtered)
  }
  // 统一落位分发：卡片 → moveCard；队列条目 → moveTask（跨队列/排序/列尾）。
  // 待办条目拖拽由嵌套 DndContext 自己处理，不会走到这里。
  const dispatchMove = (a, o) => {
    if (!a || !o || a === o) return
    if (isCardId(a)) { moveCard(a, o); return }
    moveTask(a, o)
  }
  // —— 待办事项块操作 ——
  const addTodo = () => {
    const s = todoText.trim()
    if (!s) return
    setData((d) => ({ ...d, todos: [...(d.todos || []), { id: uid(), text: s, note: '', due: todoDue || '', done: false, createdAt: todayStr() }] }))
    setTodoText('')
    setTodoDue('')
  }
  const toggleTodo = (id) =>
    setData((d) => ({ ...d, todos: (d.todos || []).map((t) => (t.id === id ? { ...t, done: !t.done } : t)) }))
  const removeTodo = (id) =>
    setData((d) => ({ ...d, todos: (d.todos || []).filter((t) => t.id !== id) }))
  const openTodoEdit = (id) => {
    const t = todos.find((x) => x.id === id)
    if (t) setEditing({ scope: 'todo', id, title: t.text, note: t.note || '', due: t.due || '' })
  }
  const clearTodosDone = () =>
    setData((d) => ({ ...d, todos: (d.todos || []).filter((t) => !t.done) }))
  const moveTodo = (active, over) => {
    if (!over || active === over) return
    setData((d) => {
      const list = d.todos || []
      const from = list.findIndex((t) => t.id === active)
      const to = list.findIndex((t) => t.id === over)
      if (from < 0 || to < 0 || from === to) return d
      return { ...d, todos: arrayMove(list, from, to) }
    })
  }

  // —— 卡片级拖拽：常规队列 / 周末队列 / 待办事项 三卡换位（顺序落盘 board 数据 cardOrder） ——
  const cardIds = normalizeOrder(Array.isArray(data.cardOrder) ? data.cardOrder : TODO_CARDS, TODO_CARDS)
  const queueIds = cardIds.filter((id) => id !== 'todos')
  const todosFirst = cardIds[0] === 'todos'
  const moveCard = (a, o) =>
    setData((d) => ({ ...d, cardOrder: moveByIds(Array.isArray(d.cardOrder) ? d.cardOrder : TODO_CARDS, a, o) }))

  // 待办事项卡片（可整卡拖动置顶/置底；块内条目拖拽独立成 DndContext，与卡片拖拽互不干扰）
  const todosCard = (
    <SortableCard id="todos" gripLabel="拖动排序此卡片（可移到最上或最下）">
      {(grip) => (
        <div className="todo-block">
          <div className="todo-block-head">
            {grip}
            <span className="todo-block-title">⏰ 待办事项</span>
            <span className="todo-block-sub">带截止日期的轻量清单，与上方任务分开管理 · 拖动排序 · 双击编辑标题、内容与截止日期</span>
            {todos.length > 0 && <span className="bd-stat">{todoDone}/{todos.length} 完成</span>}
            {todoDone > 0 && <button className="btn btn-sm" onClick={clearTodosDone}>清已完成（{todoDone}）</button>}
          </div>
          <div className="bd-toolbar" style={{ marginBottom: 8 }}>
            <input
              className="input bd-grow"
              placeholder="输入待办事项，回车添加…"
              value={todoText}
              onChange={(e) => setTodoText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addTodo() }}
            />
            <input
              type="date"
              className="input todo-add-due"
              value={todoDue}
              title="截止日期（可选）"
              aria-label="新待办的截止日期（可选）"
              onChange={(e) => setTodoDue(e.target.value)}
            />
            <button className="btn btn-primary" onClick={addTodo} disabled={!todoText.trim()}>＋ 添加待办</button>
          </div>
          {todos.length > 0 && (
            <DndContext
              sensors={sensors}
              modifiers={[restrictToVerticalAxis, restrictToParentElement]}
              onDragStart={(e) => setActiveTodoId(String(e.active.id))}
              // 同一列表内排序只在 onDragEnd 一次性提交：live arrayMove 在列表里上拖会
              // 来回震荡（预览闪烁），拖动过程中的让位由 transform 预览完成
              onDragEnd={(e) => { moveTodo(String(e.active.id), e.over && String(e.over.id)); setActiveTodoId(null) }}
              onDragCancel={() => setActiveTodoId(null)}
            >
              <SortableContext items={todos.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                <div className="todo-list">
                  {todos.map((t) => (
                    <TodoSubRow
                      key={t.id} t={t} today={today}
                      onToggle={toggleTodo} onDelete={removeTodo} onOpenEdit={openTodoEdit}
                    />
                  ))}
                </div>
              </SortableContext>
              <DragOverlay dropAnimation={SPRING_DROP}>
                {activeTodo ? (
                  <div className={`todo-item todo-overlay ${activeTodo.done ? 'done' : ''}`}>
                    <span className="wb-grip is-grabbing">⠿</span>
                    <span className={`todo-check ${activeTodo.done ? 'on' : ''}`}>{activeTodo.done ? '✓' : ''}</span>
                    <div className="todo-body">
                      <div className="todo-title-row">
                        <span className="todo-title">{activeTodo.text}</span>
                        {activeTodo.due && <span className="todo-due">{fmtShort(activeTodo.due)}</span>}
                      </div>
                      {(activeTodo.note || '').trim() && <div className="todo-note">{activeTodo.note}</div>}
                    </div>
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          )}
        </div>
      )}
    </SortableCard>
  )

  return (
    <div className="bd-panel">
      <div className="bd-toolbar">
        <span className="muted">任务分「常规 / 周末」两个队列：按住条目 ⠿ 拖动可跨队列移动（拖到空白处 = 移到该队列末尾）；三张卡片可拖标题旁 ⠿ 换位；双击任务可编辑标题与内容</span>
      </div>

      {/* 主 DndContext 同时承载 三张卡片（可排序）+ 两个队列的条目/列容器（跨队列拖拽）：
          碰撞按 active 所属层级过滤，卡片把手与条目把手互不误触；
          待办块内部条目拖拽由 todosCard 里嵌套的独立 DndContext 处理 */}
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={(e) => setActiveId(String(e.active.id))}
        // 条目拖拽只在跨队列时 live 提交（换队列的归属反馈要即时）；同队列内的排序交给
        // onDragEnd 一次提交 —— 同列表 live arrayMove 上拖会来回震荡（预览闪烁）。
        // 卡片拖拽只在松手时提交一次——卡片换位会改变布局（两列交换/待办块上下移），
        // live 提交会让落点目标跟着布局移动而来回振荡
        onDragOver={(e) => {
          const a = String(e.active.id)
          if (isCardId(a)) return
          const o = resolveOverId(e)
          if (!o) return
          const from = items.find((i) => i.id === a)
          if (!from) return
          const targetQueue = String(o).startsWith('col:')
            ? (o === 'col:weekend' ? 'weekend' : 'regular')
            : queueOf(items.find((i) => i.id === o))
          if (targetQueue !== queueOf(from)) moveTask(a, o)
        }}
        onDragEnd={(e) => { dispatchMove(String(e.active.id), resolveOverId(e)); setActiveId(null) }}
        onDragCancel={() => setActiveId(null)}
      >
        <SortableContext items={cardIds} strategy={rectSortingStrategy}>
          {todosFirst && todosCard}
          <div className="todo-queues">
            {queueIds.map((id) => id === 'q:regular' ? (
              <SortableCard key={id} id={id} gripLabel="拖动排序此卡片（可交换两个队列位置）">
                {(grip) => (
                  <QueueColumn
                    colId="col:regular" icon="📌" title="常规任务队列"
                    sub="工作日要做的事 · 拖 ⠿ 调整优先级或移入周末队列"
                    items={regularItems} done={regularDone} grip={grip}
                    text={text} onText={setText} onAdd={() => add('regular')} onClearDone={() => clearDone('regular')}
                  >
                    {regularItems.map((item) => (
                      <TodoRow key={item.id} item={item} onToggle={toggle} onDelete={remove} onOpenEdit={openEdit} />
                    ))}
                  </QueueColumn>
                )}
              </SortableCard>
            ) : (
              <SortableCard key={id} id={id} gripLabel="拖动排序此卡片（可交换两个队列位置）">
                {(grip) => (
                  <QueueColumn
                    colId="col:weekend" icon="🌴" title="周末任务队列"
                    sub="留到周末处理的事 · 同样可拖回常规队列"
                    items={weekendItems} done={weekendDone} grip={grip}
                    text={weekendText} onText={setWeekendText} onAdd={() => add('weekend')} onClearDone={() => clearDone('weekend')}
                  >
                    {weekendItems.map((item) => (
                      <TodoRow key={item.id} item={item} onToggle={toggle} onDelete={remove} onOpenEdit={openEdit} />
                    ))}
                  </QueueColumn>
                )}
              </SortableCard>
            ))}
          </div>
          {!todosFirst && todosCard}
        </SortableContext>
        <DragOverlay dropAnimation={SPRING_DROP}>
          {activeItem ? (
            <div className={`todo-item todo-overlay ${activeItem.done ? 'done' : ''}`}>
              <span className="wb-grip is-grabbing">⠿</span>
              <span className={`todo-check ${activeItem.done ? 'on' : ''}`}>{activeItem.done ? '✓' : ''}</span>
              <div className="todo-body">
                <div className="todo-title">{activeItem.text}</div>
                {(activeItem.note || '').trim() && <div className="todo-note">{activeItem.note}</div>}
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* 标题 + 内容编辑弹窗 */}
      {editing && (
        <div className="modal-mask" onClick={() => setEditing(null)}>
          <div className="modal" style={{ width: 'min(520px, 100%)' }} onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">{editing.scope === 'todo' ? '✏️ 编辑待办' : '✏️ 编辑任务'}</h3>
            <div className="field">
              <label>标题</label>
              <input
                className="input"
                autoFocus
                value={editing.title}
                onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Enter') saveEdit() }}
              />
            </div>
            {/* 截止日期：仅待办作用域；逾期标红、当天标橙 */}
            {editing.scope === 'todo' && (
              <div className="field">
                <label>截止日期（可选：逾期标红、今天标橙；留空为无期限）</label>
                <div className="todo-due-edit-row">
                  <input
                    type="date"
                    className="input"
                    value={editing.due || ''}
                    onChange={(e) => setEditing({ ...editing, due: e.target.value })}
                    aria-label="截止日期"
                  />
                  <button
                    className="btn btn-sm"
                    onClick={() => setEditing({ ...editing, due: '' })}
                    disabled={!editing.due}
                    title="清除截止日期"
                  >清除</button>
                </div>
              </div>
            )}
            <div className="field">
              <label>内容（可选，列表中随标题显示；留空则只显示标题）</label>
              <textarea
                className="textarea"
                style={{ minHeight: 110 }}
                placeholder="补充说明、链接、验收标准…"
                value={editing.note}
                onChange={(e) => setEditing({ ...editing, note: e.target.value })}
              />
            </div>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setEditing(null)}>取消</button>
              <button className="btn btn-primary" onClick={saveEdit} disabled={!editing.title.trim()}>💾 保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
