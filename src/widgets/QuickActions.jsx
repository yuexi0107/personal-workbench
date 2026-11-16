// 快捷入口：跨模块高频操作一键直达
import React from 'react'
import { navigate } from '../app/navigate.js'

const ACTIONS = [
  { label: '▶ 开始刷题', primary: true, path: '/workbench/interview/bank' },
  { label: '🎯 去押题', path: '/workbench/interview/coach' },
  { label: '🎤 发起模拟面试', path: '/workbench/interview/mock' },
  { label: '📈 新增投递', path: '/workbench/interview/pipeline' },
  { label: '💰 记一笔', path: '/workbench/fund/assets' },
  { label: '📷 拍本周快照', path: '/workbench/fund/weekly' }
]

export default function QuickActions() {
  return (
    <div className="wb-quick-actions">
      {ACTIONS.map((a) => (
        <button
          key={a.label}
          className={`btn btn-sm ${a.primary ? 'btn-primary' : ''}`}
          onClick={() => navigate(a.path)}
        >{a.label}</button>
      ))}
    </div>
  )
}
