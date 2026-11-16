// 自定义表格看板：行列均可动态增删，单元格点击编辑（同每周数据的三色标记）。
// 行拖拽 = 纵向磁吸；列头拖拽 = 横向磁吸（restrictToHorizontalAxis），两轴分开两个 DndContext 互不干扰。
import React, { useState } from 'react'
import { DndContext, DragOverlay } from '@dnd-kit/core'
import { restrictToVerticalAxis, restrictToHorizontalAxis, restrictToParentElement } from '@dnd-kit/modifiers'
import { SortableContext, verticalListSortingStrategy, horizontalListSortingStrategy, arrayMove, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useBoardData, uid } from './store.js'
import { Grip, useSortableRow, SPRING_DROP, useMagpieSensors } from '../components/dnd/magpie.jsx'

const emptyCell = () => ({ text: '', mark: 0 })

// 行 = 一个 sortable（整行拖拽）+ 一行网格（hook 必须在组件顶层，不能放进 map 回调）
function TableRow({ row, columns, grid, renderCell, cellOf, renameRow, delRow }) {
  const sortable = useSortableRow(row.id)
  return (
    <div
      ref={sortable.setNodeRef}
      data-sort-id={row.id}
      style={{ ...sortable.style, gridTemplateColumns: grid }}
      className={`wt-row ${sortable.isDragging ? 'is-dragging' : ''}`}
    >
      <div className="wt-head-cell wt-rownum" />
      <div className="wt-rowhead">
        <Grip listeners={sortable.listeners} attributes={sortable.attributes} activatorRef={sortable.setActivatorNodeRef} dragging={sortable.isDragging} label="拖动整行" className="bd-grip" />
        <input className="input bd-inline wt-rowname" value={row.name} onChange={(e) => renameRow(row.id, e.target.value)} />
        <button className="bd-del" onClick={() => delRow(row.id)} title="删除该行">✕</button>
      </div>
      {columns.map((col) => renderCell(row, col, cellOf(row, col.id)))}
    </div>
  )
}

// 列头（横向 sortable）
function ColHead({ col, onRename, onDelete }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, isDragging } = useSortable({ id: col.id })
  return (
    <div
      ref={setNodeRef}
      data-sort-id={col.id}
      style={{ transform: CSS.Translate.toString(transform), transition: isDragging ? 'none' : undefined }}
      className={`wt-head-cell wt-colhead ${isDragging ? 'is-dragging' : ''}`}
    >
      <Grip listeners={listeners} attributes={attributes} activatorRef={setActivatorNodeRef} dragging={isDragging} label="左右拖动列" className="bd-grip" />
      <input className="input bd-inline wt-rowname" value={col.name} onChange={(e) => onRename(col.id, e.target.value)} title="重命名列" />
      <button className="bd-del" onClick={() => onDelete(col.id)} title="删除该列" aria-label={`删除列：${col.name}`}>✕</button>
    </div>
  )
}

export default function TableBoard({ boardId }) {
  const [data, setData] = useBoardData(boardId, 'table')
  const columns = data.columns || []
  const rows = data.rows || []
  const [editing, setEditing] = useState(null) // { rowId, colId, draft, mark }
  const [newRow, setNewRow] = useState('')
  const [newCol, setNewCol] = useState('')
  const [activeRowId, setActiveRowId] = useState(null)
  const [activeColId, setActiveColId] = useState(null)
  const rowSensors = useMagpieSensors()
  const colSensors = useMagpieSensors()

  const grid = `30px minmax(120px, 160px) repeat(${Math.max(columns.length, 1)}, minmax(120px, 1fr))`
  const cellOf = (row, colId) => (row.cells && row.cells[colId]) || emptyCell()
  const activeRow = rows.find((r) => r.id === activeRowId)
  const activeCol = columns.find((c) => c.id === activeColId)

  /* ---- 单元格 ---- */
  const setCell = (rowId, colId, cell) =>
    setData((d) => ({
      ...d,
      rows: (d.rows || []).map((r) =>
        r.id === rowId ? { ...r, cells: { ...(r.cells || {}), [colId]: { ...cellOf(r, colId), ...cell } } } : r
      )
    }))
  const commitEdit = () => {
    if (!editing) return
    setCell(editing.rowId, editing.colId, { text: editing.draft, mark: editing.mark })
    setEditing(null)
  }

  /* ---- 列 ---- */
  const addCol = () => {
    const name = newCol.trim() || `列${columns.length + 1}`
    setData((d) => ({ ...d, columns: [...(d.columns || []), { id: uid(), name }] }))
    setNewCol('')
  }
  const renameCol = (colId, name) => setData((d) => ({ ...d, columns: (d.columns || []).map((c) => (c.id === colId ? { ...c, name } : c)) }))
  const delCol = (colId) => {
    const c = columns.find((x) => x.id === colId)
    if (!window.confirm(`删除列「${c ? c.name : ''}」？该列所有行数据将一并清除。`)) return
    setData((d) => ({
      ...d,
      columns: (d.columns || []).filter((x) => x.id !== colId),
      rows: (d.rows || []).map((r) => {
        const cells = { ...(r.cells || {}) }
        delete cells[colId]
        return { ...r, cells }
      })
    }))
  }
  const moveCol = (active, over) => {
    if (!over || active === over) return
    setData((d) => {
      const list = d.columns || []
      const from = list.findIndex((c) => c.id === active)
      const to = list.findIndex((c) => c.id === over)
      if (from < 0 || to < 0 || from === to) return d
      return { ...d, columns: arrayMove(list, from, to) }
    })
  }

  /* ---- 行 ---- */
  const addRow = () => {
    const name = newRow.trim()
    if (!name) return
    setData((d) => ({ ...d, rows: [...(d.rows || []), { id: uid(), name, cells: {} }] }))
    setNewRow('')
  }
  const renameRow = (rowId, name) => setData((d) => ({ ...d, rows: (d.rows || []).map((r) => (r.id === rowId ? { ...r, name } : r)) }))
  const delRow = (rowId) => {
    const r = rows.find((x) => x.id === rowId)
    if (!window.confirm(`删除行「${r ? r.name : ''}」？`)) return
    setData((d) => ({ ...d, rows: (d.rows || []).filter((x) => x.id !== rowId) }))
  }
  const moveRow = (active, over) => {
    if (!over || active === over) return
    setData((d) => {
      const list = d.rows || []
      const from = list.findIndex((r) => r.id === active)
      const to = list.findIndex((r) => r.id === over)
      if (from < 0 || to < 0 || from === to) return d
      return { ...d, rows: arrayMove(list, from, to) }
    })
  }

  const renderCell = (row, col, cell) => {
    const isEditing = editing && editing.rowId === row.id && editing.colId === col.id
    return (
      <div
        key={col.id}
        className={`wt-cell mark-${cell.mark || 0} ${isEditing ? 'editing' : ''}`}
        onClick={() => !isEditing && setEditing({ rowId: row.id, colId: col.id, draft: cell.text, mark: cell.mark || 0 })}
        title="点击编辑"
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
                if (e.nativeEvent.isComposing) return // 中文输入法组词期间：回车确认候选词、Esc 取消组词，都不当作编辑操作
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); commitEdit() }
                if (e.key === 'Escape') setEditing(null)
              }}
              onBlur={commitEdit}
            />
            {/* 阻止 mousedown 默认行为：防止点击标记时输入框失焦提前提交 */}
            <div className="wt-marks" onMouseDown={(e) => e.preventDefault()}>
              {[0, 1, 2].map((m) => (
                <button key={m} className={`wt-mark-dot m${m} ${editing.mark === m ? 'on' : ''}`} onClick={() => setEditing({ ...editing, mark: m })} />
              ))}
            </div>
            <div className="wt-edit-hint">回车换行 · Ctrl+Enter 或点击空白处保存</div>
          </div>
        ) : (
          <span className="wt-text">{cell.text}</span>
        )}
      </div>
    )
  }

  return (
    <div className="bd-panel">
      <div className="bd-toolbar">
        <span className="bd-stat">{rows.length} 行 × {columns.length} 列</span>
        <span className="muted">列头右侧输入列名回车加列；⠿ 左右拖列、上下拖行</span>
      </div>

      <div className="wt-scroll">
        {/* 列头：横向拖拽（横向磁吸对齐） */}
        <DndContext
          sensors={colSensors}
          modifiers={[restrictToHorizontalAxis, restrictToParentElement]}
          onDragStart={(e) => setActiveColId(String(e.active.id))}
          // 列/行排序只在 onDragEnd 一次性提交（live arrayMove 拖动中会来回震荡）
          onDragEnd={(e) => { moveCol(String(e.active.id), e.over && String(e.over.id)); setActiveColId(null) }}
          onDragCancel={() => setActiveColId(null)}
        >
          <SortableContext items={columns.map((c) => c.id)} strategy={horizontalListSortingStrategy}>
            <div className="wt-row wt-header" style={{ gridTemplateColumns: grid }}>
              <div className="wt-head-cell wt-corner" />
              <div className="wt-head-cell wt-corner">条目</div>
              {columns.map((col) => (
                <ColHead key={col.id} col={col} onRename={renameCol} onDelete={delCol} />
              ))}
              <div className="wt-head-cell wt-addcol">
                <input
                  className="input bd-inline"
                  placeholder="＋列"
                  value={newCol}
                  onChange={(e) => setNewCol(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') addCol() }}
                />
                <button className="btn btn-sm" onClick={addCol}>＋</button>
              </div>
            </div>
          </SortableContext>
          <DragOverlay dropAnimation={SPRING_DROP}>
            {activeCol ? (
              <div className="wt-head-cell wt-colhead wt-overlay">
                <span className="wb-grip is-grabbing">⠿</span>
                <span className="wt-rowname">{activeCol.name}</span>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>

        {/* 行：纵向拖拽（纵向磁吸对齐） */}
        <DndContext
          sensors={rowSensors}
          modifiers={[restrictToVerticalAxis, restrictToParentElement]}
          onDragStart={(e) => setActiveRowId(String(e.active.id))}
          onDragEnd={(e) => { moveRow(String(e.active.id), e.over && String(e.over.id)); setActiveRowId(null) }}
          onDragCancel={() => setActiveRowId(null)}
        >
          <SortableContext items={rows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
            <div className="wt-rows">
              {rows.map((row) => (
                <TableRow
                  key={row.id}
                  row={row}
                  columns={columns}
                  grid={grid}
                  renderCell={renderCell}
                  cellOf={cellOf}
                  renameRow={renameRow}
                  delRow={delRow}
                />
              ))}
            </div>
          </SortableContext>
          <DragOverlay dropAnimation={SPRING_DROP}>
            {activeRow ? (
              <div className="wt-row wt-overlay" style={{ gridTemplateColumns: grid }}>
                <div className="wt-head-cell" />
                <div className="wt-rowhead"><span className="wb-grip is-grabbing">⠿</span><span className="wt-rowname">{activeRow.name}</span></div>
                {columns.map((col) => (
                  <div key={col.id} className={`wt-cell mark-${cellOf(activeRow, col.id).mark || 0}`}>
                    <span className="wt-text">{cellOf(activeRow, col.id).text}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>

        <div className="wt-addrow">
          <input
            className="input bd-inline"
            placeholder="＋ 添加条目行，回车确认"
            value={newRow}
            onChange={(e) => setNewRow(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addRow() }}
          />
          <button className="btn btn-primary btn-sm" onClick={addRow} disabled={!newRow.trim()}>添加行</button>
        </div>
      </div>
    </div>
  )
}
