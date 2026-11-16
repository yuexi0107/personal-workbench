// 面包屑：个人工作台 / 模块 / 页面（样式参考 magpie 顶栏，如「使用 / Agent」）
import React from 'react'
import { navigate } from '../app/navigate.js'

// 中间层级的模块名可点击，跳到该模块默认页
const CRUMB_LINKS = {
  '面试工作台': '/workbench/interview',
  '资金库规划器': '/workbench/fund',
  '控制台': '/workbench',
  '设置': '/workbench/settings'
}

export default function Breadcrumb({ items = [] }) {
  return (
    <nav className="wb-breadcrumb" aria-label="面包屑">
      <button className="wb-crumb wb-crumb-link" onClick={() => navigate('/workbench')}>个人工作台</button>
      {items.map((t, i) => {
        const last = i === items.length - 1
        return (
          <React.Fragment key={`${t}-${i}`}>
            <span className="wb-crumb-sep">/</span>
            {last || !CRUMB_LINKS[t] ? (
              <span className={`wb-crumb ${last ? 'wb-crumb-current' : ''}`}>{t}</span>
            ) : (
              <button className="wb-crumb wb-crumb-link" onClick={() => navigate(CRUMB_LINKS[t])}>{t}</button>
            )}
          </React.Fragment>
        )
      })}
    </nav>
  )
}
