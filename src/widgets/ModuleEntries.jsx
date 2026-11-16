// 模块入口：由菜单树驱动的两大子模块入口卡（仅显示可见模块与可见子页）
import React from 'react'
import { useMenuConfig } from '../app/menu.js'
import { navigate } from '../app/navigate.js'

const MODULE_DESC = {
  interview: '题库刷题 · 简历押题 · 模拟面试 · 投递追踪',
  fund: '资产管家 · 三笔钱 · 周快照 · 投资收益'
}

export default function ModuleEntries() {
  const { tree } = useMenuConfig()
  const modules = tree.filter((m) => m.visible && m.children.length)

  return (
    <div className="wb-entry-cards">
      {modules.map((m) => (
        <div
          key={m.id}
          className="wb-entry-card"
          role="button"
          tabIndex={0}
          onClick={() => navigate(m.children.find((c) => c.visible)?.path || m.children[0].path)}
          onKeyDown={(e) => { if (e.key === 'Enter') navigate(m.children[0].path) }}
        >
          <span className="wb-entry-icon">{m.icon}</span>
          <span style={{ minWidth: 0 }}>
            <span className="wb-entry-name">{m.name}</span>
            <div className="wb-entry-desc">{MODULE_DESC[m.id] || ''}</div>
            <span className="wb-entry-links">
              {m.children.filter((c) => c.visible).map((c) => (
                <button
                  key={c.id}
                  className="wb-entry-link"
                  onClick={(e) => { e.stopPropagation(); navigate(c.path) }}
                >{c.name}</button>
              ))}
            </span>
          </span>
        </div>
      ))}
    </div>
  )
}
