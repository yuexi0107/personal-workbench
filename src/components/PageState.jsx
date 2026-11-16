// 统一加载 / 空 / 错误状态组件
import React from 'react'

const DEFAULT_ICON = { loading: '', empty: '🫧', error: '💥' }

export default function PageState({ status = 'empty', icon, title, desc, action }) {
  if (status === 'loading') {
    return (
      <div className="wb-page-state">
        <span className="spinner" />
        <div className="wb-page-title">{title || '加载中…'}</div>
        {desc && <div className="wb-page-desc">{desc}</div>}
      </div>
    )
  }
  return (
    <div className="wb-page-state">
      <div className="wb-page-icon">{icon || DEFAULT_ICON[status] || DEFAULT_ICON.empty}</div>
      {title && <div className="wb-page-title">{title}</div>}
      {desc && <div className="wb-page-desc">{desc}</div>}
      {action && <div style={{ marginTop: 8 }}>{action}</div>}
    </div>
  )
}
