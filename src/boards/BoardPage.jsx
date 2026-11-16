// 生活看板页面容器：按 boardId 解析看板定义（内置 4 种 + 自定义实例），分发到对应类型组件。
// 自定义看板可在此删除（连同其看板数据）；内置看板只能在设置里隐藏。
import React, { useState } from 'react'
import { useCustomBoards } from '../app/menu.js'
import { navigate } from '../app/navigate.js'
import { findBoard, isCustomId, BOARD_TYPES } from './registry.js'
import { removeCustomBoard, renameCustomBoard } from './store.js'
import PageState from '../components/PageState.jsx'
import TodoBoard from './TodoBoard.jsx'
import AnniversaryBoard from './AnniversaryBoard.jsx'
import ChecklistBoard from './ChecklistBoard.jsx'
import WeeklyBoard from './WeeklyBoard.jsx'
import TableBoard from './TableBoard.jsx'
import HabitBoard from './HabitBoard.jsx'

const TYPE_COMPONENTS = {
  todo: TodoBoard,
  anniversary: AnniversaryBoard,
  checklist: ChecklistBoard,
  weekly: WeeklyBoard,
  table: TableBoard,
  habit: HabitBoard
}

export default function BoardPage({ boardId }) {
  const [customs] = useCustomBoards()
  const board = findBoard(boardId, customs)
  const [renaming, setRenaming] = useState(false)
  const [draft, setDraft] = useState('')

  if (!board) {
    return (
      <div className="module">
        <PageState
          status="error"
          icon="🧩"
          title="看板不存在"
          desc="它可能已被删除。可在「设置 → 模块显示与排序」重新添加自定义看板。"
          action={<button className="btn btn-primary" onClick={() => navigate('/workbench/life')}>返回生活看板</button>}
        />
      </div>
    )
  }

  const typeDef = BOARD_TYPES[board.type] || {}
  const Board = TYPE_COMPONENTS[board.type]
  const removable = isCustomId(board.id)

  const onDelete = () => {
    if (!window.confirm(`删除自定义看板「${board.name}」？其中的全部数据将一并清除，且不可恢复。`)) return
    removeCustomBoard(board.id)
    navigate('/workbench/life')
  }
  const startRename = () => { setDraft(board.name); setRenaming(true) }
  const commitRename = () => {
    if (renaming) renameCustomBoard(board.id, draft)
    setRenaming(false)
  }

  return (
    <div className="module board-page">
      <header className="board-head">
        <span className="board-icon">{board.icon}</span>
        <div className="board-head-body">
          {removable && renaming ? (
            <input
              className="input board-rename"
              autoFocus
              value={draft}
              aria-label="重命名看板"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenaming(false) }}
              onBlur={commitRename}
            />
          ) : (
            <h1 className="board-title">{board.name}</h1>
          )}
          <div className="board-sub">
            {removable ? `自定义 · ${typeDef.label || board.type}` : typeDef.label || board.type}
            · 数据保存在本机 localStorage，刷新不丢失
          </div>
        </div>
        <span className="spacer" />
        {removable && !renaming && (
          <button className="btn btn-sm" onClick={startRename} title="重命名看板（侧栏同步更新）">✏️ 重命名</button>
        )}
        {removable && (
          <button className="btn btn-danger btn-sm" onClick={onDelete}>🗑 删除模块</button>
        )}
      </header>
      {Board ? <Board key={board.id} boardId={board.id} /> : (
        <PageState status="error" icon="⚠️" title={`未知看板类型：${board.type}`} />
      )}
    </div>
  )
}
