// Magpie 式拖拽共享基建：弹簧缓动（回弹 cubic-bezier）+ 虚线占位符 + 浮层克隆轻微形变，
// 同层碰撞过滤与确定性键盘导航工厂。侧栏、模块管理抽屉、各看板内部的拖拽都从这里取件，
// 保证全站手感一致。除 dnd-kit 外不引入任何运行时依赖。
import React, { useRef } from 'react'
import {
  defaultDropAnimationSideEffects, DndContext, PointerSensor, KeyboardSensor,
  useSensor, useSensors, closestCenter,
} from '@dnd-kit/core'
import { SortableContext, useSortable, sortableKeyboardCoordinates, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

/** 弹簧缓动：让位与落点都带轻微过冲（回弹） */
export const SPRING_EASING = 'cubic-bezier(0.34, 1.56, 0.64, 1)'
export const springTransition = (ms = 300) => `transform ${ms}ms ${SPRING_EASING}`

/** DragOverlay 落下动画：过冲回弹 + 源占位符立即显形 */
export const SPRING_DROP = {
  duration: 300,
  easing: SPRING_EASING,
  sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: '0' } } })
}

/** 全站统一的传感器：指针位移 5px 激活（避免误拖），键盘走可排序坐标 */
export function useMagpieSensors() {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )
}

/**
 * 同层碰撞过滤工厂：levelKeyOf(id) 返回该条目所属层的键，
 * 只有同键的 droppable 才参与碰撞（父级/子级、组/组内步骤互不干扰）。
 */
export function makeSameLevelCollision(levelKeyOf) {
  return (args) => {
    const key = levelKeyOf(String(args.active.id))
    const containers = args.droppableContainers.filter((c) => levelKeyOf(String(c.id)) === key)
    return closestCenter({ ...args, droppableContainers: containers })
  }
}

/**
 * 确定性键盘导航工厂：siblingsOf(id) 返回同层有序兄弟 id 数组，
 * ↑/↓ 直接以目标行中心为落点（不依赖碰撞检测的模糊性）。
 * 注意 KeyboardSensor 传入的 active 就是拖拽 id 本身（dnd-kit 6.x 的
 * props.active = activeRef.current），不是 { id } 对象，需按字符串取。
 */
export function makeSameLevelKeyboard(siblingsOf) {
  return (event, { active, currentCoordinates }) => {
    const code = event.code
    if (code !== 'ArrowDown' && code !== 'ArrowUp') return currentCoordinates
    const id = typeof active === 'string' ? active : String(active?.id ?? '')
    const siblings = siblingsOf(id)
    const idx = siblings.indexOf(id)
    const targetId = code === 'ArrowDown' ? siblings[idx + 1] : siblings[idx - 1]
    if (!targetId) return currentCoordinates
    const el = document.querySelector(`[data-sort-id="${CSS.escape ? CSS.escape(targetId) : targetId}"]`)
    if (!el) return currentCoordinates
    // 落点超出滚动容器可视带时，dnd-kit 只会滚动容器并直接 return（不移动拖拽）。
    // 这里先把目标滚入视野中线，再按滚动后的视口坐标返回，保证一次按键即落位。
    let p = el.parentElement
    while (p) {
      const st = getComputedStyle(p)
      if (/(auto|scroll)/.test(st.overflowY) && p.scrollHeight > p.clientHeight) {
        const box = p.getBoundingClientRect()
        const top = el.getBoundingClientRect().top
        if (top < box.top + 10 || top > box.bottom - 60) {
          p.scrollTop += top - (box.top + box.clientHeight / 2)
        }
        break
      }
      p = p.parentElement
    }
    const r = el.getBoundingClientRect()
    // KeyboardSensor 的坐标语义是"active 左上角要移到的位置"：返回目标左上角，
    // 让 active 的中心恰好落在目标中心上（返回中心会偏移半个身位，碰撞又选回自己）
    return { x: r.x, y: r.y }
  }
}

/** ⠿ 拖拽把手：仅把手响应拖拽监听，条目其余区域保持点击/编辑；
 *  activatorRef 需传 useSortable 的 setActivatorNodeRef（键盘激活时
 *  dnd-kit 要求 event.target 就是激活节点，缺了它键盘 ↑↓/Space 拖不动） */
export function Grip({ listeners, attributes, dragging = false, label = '拖动排序', className = '', activatorRef }) {
  return (
    <button
      ref={activatorRef}
      className={`wb-grip ${dragging ? 'is-grabbing' : ''} ${className}`}
      {...attributes}
      {...listeners}
      title={label}
      aria-label={label}
    >⠿</button>
  )
}

/**
 * 可排序条目 hook：拖动中的条目不参与过渡（由 DragOverlay 接管），
 * 其余条目让位时走弹簧缓动 —— 即"平滑占位符"手感。
 */
export function useSortableRow(id, { disabled } = {}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id, disabled })
  const style = {
    transform: CSS.Translate.toString(transform),
    transition: isDragging ? 'none' : springTransition()
  }
  return { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging, style }
}

/* ---------- 页面级大卡片拖拽（资产管家/三笔钱/记录对比/设置页共用） ---------- */

/**
 * 页面卡片排序容器：卡片用"把手拖拽"（排序节点是整卡，但拖拽监听只挂在
 * SortableCard 渲染出的把手上），因此可与卡片内部的嵌套 DndContext
 * （资产管家块内款项、三笔钱板块内子项）安全共存，互不误触。
 */
export function SortableCards({ ids, onMove, strategy = verticalListSortingStrategy, children }) {
  // 键盘拖拽：确定性落点（↑↓ 跳到相邻卡片中心），且需实际按过方向键才提交，
  // 避免"Space 拿起未动、放下时却换到几何最近的相邻卡片"
  const kbdMovedRef = useRef(false)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: (event, ctx) => {
        const r = makeSameLevelKeyboard(() => ids)(event, ctx)
        if (r && ctx.currentCoordinates
            && (Math.abs(r.x - ctx.currentCoordinates.x) > 0.5 || Math.abs(r.y - ctx.currentCoordinates.y) > 0.5)) {
          kbdMovedRef.current = true
        }
        return r
      },
    }),
  )
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={() => { kbdMovedRef.current = false }}
      onDragEnd={({ active, over, activatorEvent }) => {
        // 键盘拖拽需实际按过方向键才提交（防"拿起未动却换到几何最近卡片"）；
        // 指针拖拽自带 5px 激活约束，正常提交
        const isKeyboard = activatorEvent instanceof KeyboardEvent
        if (isKeyboard && !kbdMovedRef.current) return
        if (over && active.id !== over.id) onMove(String(active.id), String(over.id))
      }}
    >
      <SortableContext items={ids} strategy={strategy}>
        {children}
      </SortableContext>
    </DndContext>
  )
}

/** 可排序大卡片：children(grip) —— 把把手放进卡头即可，卡片其余区域保持原有交互；
 *  corner 模式（无标题卡片）：把手固定在卡片左上角，children 为普通内容。
 *  把手带 wb-card-grip 标记类：CSS 据此把「卡片把手」与卡内块/条目把手分层显形
 *  （悬停子项只显子项把手，悬停卡片其余区域只显卡把手），见 wb-boards.css */
export function SortableCard({ id, className = 'card', gripLabel = '拖动排序此卡片', corner = false, children }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging, style } = useSortableRow(id)
  const grip = (
    <Grip listeners={listeners} attributes={attributes} dragging={isDragging} activatorRef={setActivatorNodeRef}
          label={gripLabel} className={`bd-grip wb-card-grip${corner ? ' wb-corner-grip' : ''}`} />
  )
  return (
    <div ref={setNodeRef} data-sort-id={id}
         className={`${className} wb-sortcard${isDragging ? ' is-card-dragging' : ''}`} style={style}>
      {corner ? <>{grip}{children}</> : children(grip)}
    </div>
  )
}

/** 顺序数组工具：按拖拽落位 arrayMove */
export function moveByIds(prev, activeId, overId) {
  const a = String(activeId)
  const b = String(overId)
  const from = prev.indexOf(a)
  const to = prev.indexOf(b)
  if (from < 0 || to < 0 || from === to) return prev
  return arrayMove(prev, from, to)
}

/** 顺序数组清洗：按已存顺序保留有效 id（去掉已不存在的），把新增 id 追加到末尾 */
export function normalizeOrder(order, allIds) {
  const saved = Array.isArray(order) ? order : []
  const known = saved.filter((id) => allIds.includes(id))
  return [...known, ...allIds.filter((id) => !known.includes(id))]
}
