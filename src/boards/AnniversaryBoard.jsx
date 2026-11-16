// 纪念日看板：事项 / 起始日期 / 当前日期 / 累计天数 / 折合月天，列表项可拖拽重排、行内编辑。
import React, { useState } from 'react'
import { DndContext, DragOverlay } from '@dnd-kit/core'
import { restrictToVerticalAxis, restrictToParentElement } from '@dnd-kit/modifiers'
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { useBoardData, uid, todayStr, daysSince, monthDayText } from './store.js'
import { Grip, useSortableRow, SPRING_DROP, useMagpieSensors } from '../components/dnd/magpie.jsx'

const COLS = '30px minmax(140px,1.3fr) minmax(130px,1fr) minmax(110px,0.9fr) minmax(110px,0.8fr) minmax(120px,1fr) 30px'

function AnnRow({ item, onPatch, onDelete }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging, style } = useSortableRow(item.id)
  return (
    <div
      ref={setNodeRef}
      data-sort-id={item.id}
      style={{ ...style, gridTemplateColumns: COLS }}
      className={`ann-row ${isDragging ? 'is-dragging' : ''}`}
    >
      <Grip listeners={listeners} attributes={attributes} activatorRef={setActivatorNodeRef} dragging={isDragging} label="拖动重排" className="bd-grip" />
      <input
        className="input bd-inline"
        value={item.name}
        placeholder="事项名称"
        onChange={(e) => onPatch(item.id, { name: e.target.value })}
      />
      <input
        className="input bd-inline"
        type="date"
        value={item.date}
        onChange={(e) => onPatch(item.id, { date: e.target.value })}
      />
      <span className="ann-cell muted">{todayStr()}</span>
      <span className="ann-cell ann-days">{daysSince(item.date)} 天</span>
      <span className="ann-cell ann-months tag green">{monthDayText(item.date)}</span>
      <button className="bd-del" onClick={() => onDelete(item.id)} title="删除事项" aria-label={`删除：${item.name}`}>✕</button>
    </div>
  )
}

export default function AnniversaryBoard({ boardId }) {
  const [data, setData] = useBoardData(boardId, 'anniversary')
  const items = data.items || []
  const [form, setForm] = useState({ name: '', date: todayStr() })
  const [activeId, setActiveId] = useState(null)
  const sensors = useMagpieSensors()

  const activeItem = items.find((i) => i.id === activeId)

  const add = () => {
    const name = form.name.trim()
    if (!name) return
    setData((d) => ({ ...d, items: [...(d.items || []), { id: uid(), name, date: form.date || todayStr() }] }))
    setForm({ name: '', date: todayStr() })
  }
  const patch = (id, p) =>
    setData((d) => ({ ...d, items: (d.items || []).map((it) => (it.id === id ? { ...it, ...p } : it)) }))
  const remove = (id) =>
    setData((d) => ({ ...d, items: (d.items || []).filter((it) => it.id !== id) }))
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

  return (
    <div className="bd-panel">
      <div className="ann-head" style={{ gridTemplateColumns: COLS }}>
        <span />
        <span>事项</span>
        <span>起始日期</span>
        <span>当前日期</span>
        <span>累计天数</span>
        <span>折合</span>
        <span />
      </div>

      <DndContext
        sensors={sensors}
        modifiers={[restrictToVerticalAxis, restrictToParentElement]}
        onDragStart={(e) => setActiveId(String(e.active.id))}
        // 同一列表内排序只在 onDragEnd 一次性提交（live arrayMove 上拖会来回震荡），
        // 拖动过程中的让位由 transform 预览完成
        onDragEnd={(e) => { move(String(e.active.id), e.over && String(e.over.id)); setActiveId(null) }}
        onDragCancel={() => setActiveId(null)}
      >
        {items.length === 0 ? (
          <div className="empty"><div className="empty-icon">💞</div>还没有纪念日，添加一个开始记录。</div>
        ) : (
          <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            <div className="ann-list">
              {items.map((item) => (
                <AnnRow key={item.id} item={item} onPatch={patch} onDelete={remove} />
              ))}
            </div>
          </SortableContext>
        )}
        <DragOverlay dropAnimation={SPRING_DROP}>
          {activeItem ? (
            <div className="ann-row ann-overlay" style={{ gridTemplateColumns: COLS }}>
              <span className="wb-grip is-grabbing">⠿</span>
              <span className="ann-cell">{activeItem.name}</span>
              <span className="ann-cell muted">{activeItem.date}</span>
              <span className="ann-cell muted">{todayStr()}</span>
              <span className="ann-cell ann-days">{daysSince(activeItem.date)} 天</span>
              <span className="ann-cell tag green">{monthDayText(activeItem.date)}</span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <div className="ann-add bd-add-row">
        <span style={{ width: 30 }} />
        <input
          className="input bd-inline"
          placeholder="新事项，如：健身打卡"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          onKeyDown={(e) => { if (e.key === 'Enter') add() }}
        />
        <input
          className="input bd-inline"
          type="date"
          value={form.date}
          onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
        />
        <span />
        <button className="btn btn-primary btn-sm" onClick={add} disabled={!form.name.trim()}>＋ 添加</button>
      </div>
      <div className="muted" style={{ marginTop: 8 }}>
        天数从起始日到今天自然日累计；拖动 ⠿ 可调整列表顺序。
      </div>
    </div>
  )
}
