// 控制台首页：问候 + 可拖拽 widget 网格（布局经 useDragLayout 持久化到 wb:layout:<profile>）
import React from 'react'
import DragGrid from '../widgets/DragGrid.jsx'
import { WIDGETS } from '../widgets/registry.js'
import { useDragLayout, layoutKey } from './store.js'
import { usePermissions } from './permissions.js'

function greeting() {
  const h = new Date().getHours()
  if (h < 5) return '夜深了'
  if (h < 9) return '早上好'
  if (h < 12) return '上午好'
  if (h < 14) return '中午好'
  if (h < 18) return '下午好'
  return '晚上好'
}

export default function HomePage() {
  const { can } = usePermissions()
  const widgets = WIDGETS.filter((w) => can(w.permission))
  const { order, hidden, setOrder, hide, show, reset } = useDragLayout(
    layoutKey(),
    widgets.map((w) => w.id)
  )

  return (
    <div className="module">
      <div className="wb-home-head row">
        <div>
          <div className="wb-home-greet">{greeting()}。</div>
          <div className="wb-home-date">
            {new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
            {' '}· 统一入口：面试、资金都在这里
          </div>
        </div>
        <span className="spacer" />
        <button className="btn btn-sm" onClick={reset} title="恢复默认卡片顺序与可见性">
          ↺ 恢复默认布局
        </button>
      </div>
      <DragGrid
        widgets={widgets}
        order={order}
        hidden={hidden}
        onOrderChange={setOrder}
        onHide={hide}
        onRestore={show}
        emptyAction={<button className="btn btn-primary" onClick={reset}>恢复默认布局</button>}
      />
    </div>
  )
}
