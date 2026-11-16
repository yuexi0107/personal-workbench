// 模块显示与排序（内联卡片，挂在设置页）：菜单树（父级/子级同级拖拽）+ 控制台首页卡片的排序与显隐。
// 拖拽交互与首页卡片一致（参考 magpie）：把手 ⋮⋮、源行虚线占位、浮层克隆、平滑让位。
// 开关与排序经 wb:ls-change 事件即时同步到侧栏/首页/路由守卫。
// 后续新增模块只需登记进 menu.js 的 MENU_NODES / widgets 的 registry.js，即自动出现在此处并参与排序。
import React from 'react'
import {
  DndContext, DragOverlay, PointerSensor, KeyboardSensor,
  useSensor, useSensors, closestCenter
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy, useSortable
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useMenuConfig } from '../app/menu.js'
import { usePermissions } from '../app/permissions.js'
import { WIDGETS } from '../widgets/registry.js'
import { useDragLayout, layoutKey, getProfile, useLocalState, WB } from '../app/store.js'
import { SPRING_DROP, SPRING_EASING } from './dnd/magpie.jsx'
import { addCustomBoard, removeCustomBoard } from '../boards/store.js'
import { BOARD_TYPES, isCustomId } from '../boards/registry.js'
import Switch from './Switch.jsx'

const childId = (parentId, nodeId) => `${parentId}:${nodeId}`

function SortableRow({ id, disabled, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled })
  return (
    <div
      ref={setNodeRef}
      data-sort-id={id}
      style={{
        transform: CSS.Translate.toString(transform),
        transition: isDragging ? 'none' : `transform 300ms ${SPRING_EASING}`
      }}
      className={`wb-sort-row ${isDragging ? 'is-dragging' : ''}`}
    >
      <button
        className="wb-sort-handle"
        {...attributes}
        {...listeners}
        disabled={disabled}
        title="拖动排序"
        aria-label={`拖动排序：${id}`}
      >⋮⋮</button>
      {children}
    </div>
  )
}

function NodeRowBody({ node, parentId, onToggle, onDelete, collapsible, open, onToggleCollapse }) {
  const custom = isCustomId(node.id)
  return (
    <>
      {/* 分组折叠箭头：子模块可收起/展开（设置页专属，不影响侧栏） */}
      {collapsible && (
        <button
          className="wb-mgr-chevron"
          onClick={onToggleCollapse}
          title={open ? '收起子模块' : '展开子模块'}
          aria-expanded={open}
          aria-label={`${open ? '收起' : '展开'}子模块：${node.name}`}
        >{open ? '▾' : '▸'}</button>
      )}
      <span className="wb-sort-name">
        {node.icon} {node.name}
        {node.fixed && <span className="tag" style={{ marginLeft: 6 }}>固定显示</span>}
        {custom && <span className="tag primary" style={{ marginLeft: 6 }}>自定义</span>}
        {parentId && node.desc && <div className="wb-todo-sub">{node.desc}</div>}
      </span>
      {custom && (
        <button
          className="bd-del"
          title="删除该自定义看板（连同其数据）"
          aria-label={`删除自定义看板：${node.name}`}
          onClick={() => onDelete(node.id, node.name)}
        >🗑</button>
      )}
      <Switch
        checked={node.fixed ? true : node.visible}
        disabled={!!node.fixed}
        onChange={(v) => onToggle(node.id, v)}
        label={`显示 ${node.name}`}
      />
    </>
  )
}

/* ---------- 添加自定义看板（挂到侧栏「生活看板」组） ---------- */
function AddModuleForm() {
  const [open, setOpen] = React.useState(false)
  const [type, setType] = React.useState('todo')
  const [name, setName] = React.useState('')
  const [icon, setIcon] = React.useState(BOARD_TYPES.todo.icons[0])
  const [msg, setMsg] = React.useState(null)

  if (!open) {
    return (
      <button className="btn bd-dashed" style={{ marginTop: 10 }} onClick={() => { setOpen(true); setMsg(null) }}>
        ＋ 添加新模块（自定义看板）
      </button>
    )
  }
  const def = BOARD_TYPES[type]
  const submit = () => {
    const b = addCustomBoard({ type, name, icon })
    setOpen(false)
    setName('')
    setMsg({ ok: true, text: `已添加「${b.icon} ${b.name}」→ 侧栏「生活看板」组，可在下方列表拖动排序、控制显隐。` })
    setTimeout(() => setMsg(null), 6000)
  }
  return (
    <div className="wb-addmod" style={{ marginTop: 10 }}>
      <div className="row" style={{ gap: 8 }}>
        {Object.entries(BOARD_TYPES).map(([key, t]) => (
          <button
            key={key}
            className={`btn btn-sm ${type === key ? 'btn-primary' : ''}`}
            onClick={() => { setType(key); setIcon(t.icons[0]) }}
            title={t.desc}
          >{t.icon} {t.label}</button>
        ))}
      </div>
      <div className="row" style={{ marginTop: 10, gap: 8 }}>
        <input
          className="input"
          style={{ flex: 1, minWidth: 160 }}
          placeholder={`模块名称（默认：${def.defaultName}）`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
        />
        <div className="row" style={{ gap: 4 }}>
          {def.icons.map((ic) => (
            <button
              key={ic}
              className={`btn btn-sm wb-icon-pick ${icon === ic ? 'btn-primary' : ''}`}
              onClick={() => setIcon(ic)}
              aria-label={`图标 ${ic}`}
            >{ic}</button>
          ))}
        </div>
        <button className="btn btn-primary" onClick={submit}>添加</button>
        <button className="btn" onClick={() => setOpen(false)}>收起</button>
      </div>
      {msg && <div className={`alert ${msg.ok ? 'ok' : 'error'}`} style={{ marginTop: 10, marginBottom: 0 }}>{msg.ok ? '✅ ' : '❌ '}{msg.text}</div>}
    </div>
  )
}

/* ---------- 菜单模块：根节点 + 各组子级，同层拖拽 ---------- */
function MenuTreeManager() {
  const { tree, moveRoot, moveChild, setNodeVisible, resetMenu } = useMenuConfig()
  const [collapsed, setCollapsed] = useLocalState(WB.mgrCollapsed, {}) // 组折叠状态（▸/▾），持久化
  const [activeId, setActiveId] = React.useState(null)
  const treeRef = React.useRef(tree)
  treeRef.current = tree

  const deleteCustom = (id, name) => {
    if (!window.confirm(`删除自定义看板「${name}」？其中的全部数据将一并清除。`)) return
    removeCustomBoard(id)
    setActiveId(null)
  }
  const toggleCollapse = (id) => setCollapsed((c) => ({ ...(c || {}), [id]: !(c && c[id]) }))

  // 键盘导航：直接按菜单树取同层兄弟（父级=根顺序，子级=组内顺序），
  // 返回目标行中心作为移动目标；over 随后由同层碰撞过滤解析
  const sameLevelKeyboardCoordinates = React.useCallback((event, { currentCoordinates, context }) => {
    const code = event.code
    if (code !== 'ArrowDown' && code !== 'ArrowUp') return currentCoordinates
    const id = String(context.active.id)
    let siblings
    if (id.includes(':')) {
      const parentId = id.split(':')[0]
      const parent = treeRef.current.find((n) => n.id === parentId)
      siblings = parent ? parent.children.map((c) => `${parentId}:${c.id}`) : []
    } else {
      siblings = treeRef.current.map((n) => n.id)
    }
    const idx = siblings.indexOf(id)
    const targetId = code === 'ArrowDown' ? siblings[idx + 1] : siblings[idx - 1]
    if (!targetId) return currentCoordinates
    const el = document.querySelector(`[data-sort-id="${targetId}"]`)
    if (!el) return currentCoordinates
    const r = el.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  }, [])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sameLevelKeyboardCoordinates })
  )

  // 同层碰撞：父级拖拽只在根节点间寻找目标，子级拖拽只在同组兄弟间寻找
  const sameLevelCollision = React.useCallback((args) => {
    const id = String(args.active.id)
    let containers = args.droppableContainers
    if (id.includes(':')) {
      const parentId = id.split(':')[0]
      containers = containers.filter((c) => String(c.id).startsWith(`${parentId}:`))
    } else {
      containers = containers.filter((c) => !String(c.id).includes(':'))
    }
    return closestCenter({ ...args, droppableContainers: containers })
  }, [])

  // 仅同级排序：子级 id 形如 "parent:child"，跨组/跨层一律忽略
  const move = (active, over) => {
    if (!over || active === over) return
    if (active.includes(':')) {
      const parentId = active.split(':')[0]
      if (!over.startsWith(`${parentId}:`)) return
      moveChild(parentId, active, over)
    } else {
      if (over.includes(':')) return
      moveRoot(active, over)
    }
  }

  const findNode = (id) => {
    if (!id) return null
    if (id.includes(':')) {
      const [pid, cid] = id.split(':')
      const parent = tree.find((n) => n.id === pid)
      const child = parent && parent.children.find((c) => c.id === cid)
      return child ? { node: child, isChild: true } : null
    }
    const node = tree.find((n) => n.id === id)
    return node ? { node, isChild: false } : null
  }

  const active = findNode(activeId)

  return (
    // 注意：这里不能加 restrictToParentElement —— 该限制取的是「被拖行自身的父元素」，
    // 分组行的父元素是它所在的 wb-sort-group（只向下延伸到自己的子级），会锁死上拖方向；
    // 跨层/跨组的落点已由 sameLevelCollision + move() 过滤，去掉限制不影响正确性
    <DndContext
      sensors={sensors}
      collisionDetection={sameLevelCollision}
      onDragStart={(e) => setActiveId(String(e.active.id))}
      // 同层排序只在 onDragEnd 一次性提交（live arrayMove 拖动中会来回震荡）
      onDragEnd={(e) => { move(String(e.active.id), e.over && String(e.over.id)); setActiveId(null) }}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="wb-sort-list">
        <SortableContext items={tree.map((n) => n.id)} strategy={verticalListSortingStrategy}>
          {tree.map((node) => (
            <div key={node.id} className={`wb-sort-group ${node.visible ? '' : 'is-hidden'}`}>
              <SortableRow id={node.id}>
                <NodeRowBody
                  node={node}
                  onToggle={setNodeVisible}
                  collapsible={node.children.length > 0}
                  open={!(collapsed && collapsed[node.id])}
                  onToggleCollapse={() => toggleCollapse(node.id)}
                />
              </SortableRow>
              {node.children.length > 0 && !(collapsed && collapsed[node.id]) && (
                <div className="wb-sort-children">
                  <SortableContext
                    items={node.children.map((c) => childId(node.id, c.id))}
                    strategy={verticalListSortingStrategy}
                  >
                    {node.children.map((c) => (
                      <SortableRow key={c.id} id={childId(node.id, c.id)}>
                        <NodeRowBody node={c} parentId={node.id} onToggle={setNodeVisible} onDelete={deleteCustom} />
                      </SortableRow>
                    ))}
                  </SortableContext>
                </div>
              )}
            </div>
          ))}
        </SortableContext>
      </div>

      <DragOverlay dropAnimation={SPRING_DROP}>
        {active ? (
          <div className={`wb-sort-row wb-sort-overlay ${active.isChild ? 'is-child' : ''}`}>
            <span className="wb-sort-handle is-grabbing" style={{ cursor: 'grabbing' }}>⋮⋮</span>
            <span className="wb-sort-name">{active.node.icon} {active.node.name}</span>
          </div>
        ) : null}
      </DragOverlay>

      <AddModuleForm />

      <div className="wb-mgr-actions">
        <button className="btn btn-sm" onClick={() => { resetMenu(); setActiveId(null) }}>↺ 恢复默认排序与显隐</button>
        <span className="muted">点击组行的 ▸/▾ 折叠或展开子模块；父级隐藏时子级一并隐藏；直接访问被隐藏模块的路由会被拦截。</span>
      </div>
    </DndContext>
  )
}

/* ---------- 控制台首页卡片：排序 + 显隐（与首页拖拽布局同一份存储） ---------- */
function HomeCardsManager() {
  const { can } = usePermissions()
  const permitted = WIDGETS.filter((w) => can(w.permission))
  const allIds = permitted.map((w) => w.id)
  const { order, hidden, setOrder, hide, show, reset } = useDragLayout(layoutKey(), allIds)
  const [activeId, setActiveId] = React.useState(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  )

  const move = (active, over) => {
    if (!over || active === over) return
    const from = order.indexOf(active)
    const to = order.indexOf(over)
    if (from < 0 || to < 0 || from === to) return
    const next = order.slice()
    next.splice(to, 0, next.splice(from, 1)[0])
    setOrder(next)
  }

  const activeWidget = permitted.find((w) => w.id === activeId)

  return (
    // 同上：每行外层包了一个 div，restrictToParentElement 会把拖动钳在自身行内（完全拖不动），故不使用
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={(e) => setActiveId(String(e.active.id))}
      onDragEnd={(e) => { move(String(e.active.id), e.over && String(e.over.id)); setActiveId(null) }}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="wb-sort-list">
        <SortableContext items={order} strategy={verticalListSortingStrategy}>
          {order.map((id) => {
            const w = permitted.find((x) => x.id === id)
            if (!w) return null
            const isHidden = hidden.includes(id)
            return (
              <div key={id} className={isHidden ? 'is-hidden' : ''}>
                <SortableRow id={id}>
                  <span className="wb-sort-name">
                    {w.icon} {w.title}
                    {isHidden && <span className="tag" style={{ marginLeft: 6 }}>已隐藏</span>}
                  </span>
                  <Switch
                    checked={!isHidden}
                    onChange={(v) => (v ? show(id) : hide(id))}
                    label={`显示首页卡片 ${w.title}`}
                  />
                </SortableRow>
              </div>
            )
          })}
        </SortableContext>
      </div>

      <DragOverlay dropAnimation={SPRING_DROP}>
        {activeWidget ? (
          <div className="wb-sort-row wb-sort-overlay">
            <span className="wb-sort-handle is-grabbing" style={{ cursor: 'grabbing' }}>⋮⋮</span>
            <span className="wb-sort-name">{activeWidget.icon} {activeWidget.title}</span>
          </div>
        ) : null}
      </DragOverlay>

      <div className="wb-mgr-actions">
        <button className="btn btn-sm" onClick={reset}>↺ 恢复默认首页布局</button>
        <span className="muted">与控制台首页的卡片拖拽是同一份布局，两侧修改实时互通。</span>
      </div>
    </DndContext>
  )
}

export default function ModuleManager() {
  return (
    <>
      <p className="card-sub">
        拖动 ⋮⋮ 把手调整顺序（弹簧过渡），用开关控制显隐：侧栏菜单（含各组子模块）、控制台首页卡片的排序与显隐都在这里统一管理，
        侧边栏不提供拖动入口，顺序以此处为准、修改实时生效。通过「＋ 添加新模块」可把任务队列、自定义表格、纪念日、护肤打卡等
        自定义看板加进侧栏「生活看板」组（也可在各看板页内删除）。隐藏的模块会从菜单与首页消失。后续新增的模块会自动出现在下方列表中。
      </p>
      <div className="wb-mgr-section">
        <h3 className="wb-mgr-title">📋 侧栏菜单模块</h3>
        <MenuTreeManager />
      </div>
      <hr className="divider" />
      <div className="wb-mgr-section">
        <h3 className="wb-mgr-title">🏠 控制台首页卡片</h3>
        <HomeCardsManager />
      </div>
      <div className="muted" style={{ marginTop: 10 }}>
        当前使用者标识：{getProfile()}（布局、排序与可见性按此隔离）
      </div>
    </>
  )
}
