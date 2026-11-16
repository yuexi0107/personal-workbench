// 可拖拽卡片网格（通用，供控制台首页与各模块页面复用）：交互参考 magpie 的"抓手拖动整行"——
// 卡片头部左侧 ⠿ 把手、拖起后源卡虚线占位、浮层克隆跟手、其余卡片平滑让位（transform 过渡）、
// 网格最近位置碰撞、限制在容器边界内。布局顺序与显隐经 useDragLayout 持久化（调用方决定存储键）。
// 两种排布：layout="grid" 多列网格（首页）；layout="stack" 单列堆叠（模块页面分区）。
// 条目可选字段：props（透传给 el 的属性）、extra（头部右侧操作区）、available=false（本会话无数据，直接不渲染）。
import React, { useState } from 'react'
import {
  DndContext, DragOverlay, PointerSensor, KeyboardSensor,
  useSensor, useSensors, closestCenter
} from '@dnd-kit/core'
import { restrictToParentElement } from '@dnd-kit/modifiers'
import {
  SortableContext, rectSortingStrategy, verticalListSortingStrategy, useSortable,
  arrayMove, sortableKeyboardCoordinates
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import ErrorBoundary from '../components/ErrorBoundary.jsx'
import PageState from '../components/PageState.jsx'
import { navigate } from '../app/navigate.js'

function SortableWidget({ widget, onHide, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: widget.id })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`wb-widget ${isDragging ? 'is-dragging' : ''}`}
    >
      <div className="wb-widget-header">
        <button
          className="wb-grip"
          {...attributes}
          {...listeners}
          title="拖动排序"
          aria-label={`拖动排序：${widget.title}`}
        >⠿</button>
        <span className="wb-widget-title">{widget.icon} {widget.title}</span>
        <span className="spacer" />
        {widget.extra}
        <button className="wb-widget-hide" title="隐藏该卡片（可在上方恢复条或设置中恢复）" onClick={() => onHide(widget.id)}>✕</button>
      </div>
      {children}
    </div>
  )
}

export default function DragGrid({
  widgets, order, hidden,
  onOrderChange, onHide, onRestore,
  emptyAction, layout = 'grid'
}) {
  const [activeId, setActiveId] = useState(null)
  const [activeWidth, setActiveWidth] = useState(null) // 拖起时锁定源卡宽度，浮层不再被拉伸
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )
  const byId = Object.fromEntries(widgets.map((w) => [w.id, w]))
  const visible = order.map((id) => byId[id]).filter(Boolean)
    .filter((w) => w.available !== false)
    .filter((w) => !hidden.includes(w.id))
  // 恢复条展示所有可恢复的已隐藏条目（调用方传 onRestore 才启用）
  const hiddenItems = hidden.map((id) => byId[id]).filter(Boolean)

  const move = (active, over) => {
    if (!over || active === over) return
    const from = order.indexOf(active)
    const to = order.indexOf(over)
    if (from < 0 || to < 0) return
    onOrderChange(arrayMove(order, from, to))
  }

  const activeWidget = activeId ? byId[activeId] : null
  const isStack = layout === 'stack'

  const handleStart = (e) => {
    setActiveId(String(e.active.id))
    const rect = e.active.rect.current.initial
    setActiveWidth(rect ? rect.width : null)
  }
  const handleEnd = () => { setActiveId(null); setActiveWidth(null) }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToParentElement]}
      onDragStart={handleStart}
      /* 排序只在 onDragEnd 一次性提交：live arrayMove 在同容器里上拖会来回震荡（预览闪烁），
         拖动过程中的让位由 SortableContext 的 transform 预览完成 */
      onDragEnd={(e) => {
        move(String(e.active.id), e.over && String(e.over.id))
        handleEnd()
      }}
      onDragCancel={handleEnd}
    >
      {onRestore && hiddenItems.length > 0 && (
        <div className="wb-hidden-strip">
          <span className="wb-hidden-label">已隐藏 {hiddenItems.length} 张卡片：</span>
          {hiddenItems.map((w) => (
            <button key={w.id} className="wb-hidden-restore" onClick={() => onRestore(w.id)} title={`恢复「${w.title}」`}>
              ＋ {w.title}
            </button>
          ))}
          <button className="wb-hidden-restore wb-hidden-all" onClick={() => hiddenItems.forEach((w) => onRestore(w.id))}>
            全部恢复
          </button>
        </div>
      )}
      {visible.length === 0 ? (
        <PageState
          status="empty"
          icon="🧩"
          title="页面卡片都已隐藏"
          desc="可以一键恢复默认布局，或到「设置 → 模块显示与排序」重新开启对应模块。"
          action={emptyAction}
        />
      ) : (
        <SortableContext
          items={visible.map((w) => w.id)}
          strategy={isStack ? verticalListSortingStrategy : rectSortingStrategy}
        >
          <div className={isStack ? 'wb-stack' : 'wb-grid'}>
            {visible.map((w) => (
              <SortableWidget key={w.id} widget={w} onHide={onHide}>
                <ErrorBoundary title={`${w.title} 卡片出错`}>
                  <w.el {...(w.props || {})} />
                </ErrorBoundary>
              </SortableWidget>
            ))}
          </div>
        </SortableContext>
      )}
      <DragOverlay dropAnimation={{ duration: 200, easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)' }}>
        {activeWidget ? (
          <div
            className={`wb-widget wb-widget-overlay ${isStack ? 'is-stack' : ''}`}
            style={activeWidth ? { width: activeWidth } : undefined}
          >
            <div className="wb-widget-header">
              <span className="wb-grip is-grabbing" style={{ cursor: 'grabbing' }}>⠿</span>
              <span className="wb-widget-title">{activeWidget.icon} {activeWidget.title}</span>
              <span className="spacer" />
              {activeWidget.extra}
            </div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

// 供 widget 内部跳转使用，避免各卡片直接依赖路由实现
export { navigate }
