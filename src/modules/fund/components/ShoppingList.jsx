// ============================================================
// 购物清单：页面由多张「清单块」组成（内置 常规购物 / 618 清单 / 双 11 清单）。
// 数据自管 fp:shopping（旧记账数据 fp:expenses/fp:budget 保留不迁移、不删除）。
//   lists: [{ id, name, createdAt }]
//   items: [{ id, listId, text, price, note, done, createdAt }]   price 为数字或空串
// 交互：
//   · 子项：勾选已购（划线）、可选价格与备注；每块顶部输入行添加；
//     双击行或 ✏ 弹窗编辑（名称/价格/备注）；✕ 直接删除。
//   · 子项拖拽：按 ⠿ 可跨清单拖动改归属（拖到目标块空白处 = 移到该清单末尾），
//     块内拖动排序 —— 单数组 items + listId 字段，过滤即视图（参照 TodoBoard）。
//   · 清单块：块头 ⠿ 整块换位（rectSortingStrategy + onDragEnd 一次性提交，
//     网格 live 提交会震荡）；双击清单名或 ✏ 行内重命名；
//     🗑 删除块（确认弹窗，子项一并删，仅剩 1 块时禁用）；页面标题行「＋ 新建清单」。
//   · 块头统计：总件数、已购件数、价格合计（已购 / 未购分别小计）。
// 拖拽基建复用 components/dnd/magpie.jsx（弹簧让位/把手/确定性键盘导航），单一 DndContext
// 按 active 类型分派（清单块 or 子项），碰撞：子项指针优先 + 最近角兜底（参照三笔钱）。
// ============================================================
import React, { useEffect, useRef, useState } from 'react';
import {
  DndContext, DragOverlay,
  PointerSensor, KeyboardSensor, useSensor, useSensors,
  pointerWithin, closestCorners, closestCenter,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, rectSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { KEYS, useLocalState, uid, fmtMoney, r2 } from '../store.js';
import {
  Grip, useSortableRow, SPRING_DROP, makeSameLevelKeyboard,
  moveByIds, springTransition,
} from '../../../components/dnd/magpie.jsx';

// 首次使用时写入的三个内置清单（只在 lists 为空时初始化，保证幂等）
const BUILT_IN_LISTS = ['常规购物', '618 清单', '双 11 清单'];

/** 价格归一：空串/非法输入存空串，其余四舍五入到分 */
function toPrice(raw) {
  const s = String(raw ?? '').trim();
  if (s === '') return '';
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : '';
}

/* ---------- 子项行：把手 + 勾选圈 + 文本/备注/价格 + ✏编辑 + ✕删除（悬停显形） ---------- */
function ShoppingRow({ item, onToggle, onOpenEdit, onRemove }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging, style } = useSortableRow(item.id);
  const note = (item.note || '').trim();
  const price = toPrice(item.price);
  return (
    <div
      ref={setNodeRef}
      data-sort-id={item.id}
      style={style}
      className={`sl-item ${item.done ? 'done' : ''} ${isDragging ? 'is-dragging' : ''}`}
    >
      <Grip listeners={listeners} attributes={attributes} activatorRef={setActivatorNodeRef} dragging={isDragging}
            label="拖动排序子项（可跨清单）" className="bd-grip" />
      <button
        className={`sl-check ${item.done ? 'on' : ''}`}
        onClick={() => onToggle(item.id)}
        aria-label={item.done ? '标记为未购' : '标记为已购'}
      >{item.done ? '✓' : ''}</button>
      {/* 双击文本区打开编辑弹窗（名称 + 价格 + 备注） */}
      <div className="sl-body" onDoubleClick={() => onOpenEdit(item.id)} title="双击编辑名称、价格与备注">
        <div className="sl-title-row">
          <span className="sl-title">{item.text}</span>
          {price !== '' && <span className="sl-price">¥{fmtMoney(price)}</span>}
        </div>
        {note && <div className="sl-note">{note}</div>}
      </div>
      <button className="bd-del" onClick={() => onOpenEdit(item.id)} title="编辑名称、价格与备注（或双击子项）"
              aria-label={`编辑：${item.text}`}>✏</button>
      <button className="bd-del" onClick={() => onRemove(item.id)} title="删除子项"
              aria-label={`删除：${item.text}`}>✕</button>
    </div>
  );
}

/* ---------- 清单块：整块可拖换位（把手），块身同时是子项的放置目标（拖到空白处=移到块尾） ---------- */
function ListBlock({
  list, items, total, done, sumAll, sumDone, sumUndone, canDelete,
  onAdd, onToggle, onRemoveItem, onOpenEdit, onRename, onRemove,
}) {
  // dnd-kit 的 useSortable 接收 { id } 对象——传裸字符串会让 id 变 undefined，
  // 三个清单全部注册成同一个 undefined droppable（is-over 常亮、跨块拖拽永远落空）
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isOver, isDragging, transform } = useSortable({ id: list.id });
  // 行内重命名：双击清单名或 ✏ 进入，Enter/失焦保存，Esc 取消
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(list.name);
  const [text, setText] = useState('');     // 本块添加栏：名称
  const [price, setPrice] = useState('');   // 本块添加栏：价格（可选）

  const startRename = () => { setDraft(list.name); setRenaming(true); };
  const commitRename = () => {
    const name = draft.trim();
    if (name && name !== list.name) onRename(list.id, name);
    setRenaming(false);
  };
  const add = () => {
    if (!text.trim()) return;
    onAdd(list.id, text.trim(), price.trim());
    setText('');
    setPrice('');
  };

  return (
    <div
      ref={setNodeRef}
      data-sort-id={list.id}
      className={`sl-list ${isOver ? 'is-over' : ''} ${isDragging ? 'is-dragging' : ''}`}
      style={{ transform: CSS.Translate.toString(transform), transition: isDragging ? 'none' : springTransition() }}
    >
      <div className="sl-head">
        <Grip listeners={listeners} attributes={attributes} activatorRef={setActivatorNodeRef} dragging={isDragging}
              label="拖动排序此清单" className="bd-grip" />
        {renaming ? (
          <input
            className="input sl-rename"
            autoFocus
            value={draft}
            aria-label={`重命名清单：${list.name}`}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') setRenaming(false);
            }}
            onBlur={commitRename}
          />
        ) : (
          <span className="sl-name" onDoubleClick={startRename} title="双击重命名清单">{list.name}</span>
        )}
        <span className="sl-stats">
          <span className="bd-stat">共 {total} 件 · 已购 {done}</span>
          <span className="bd-stat">合计 ¥{fmtMoney(sumAll)}（已购 ¥{fmtMoney(sumDone)} / 未购 ¥{fmtMoney(sumUndone)}）</span>
        </span>
        <span className="sl-ops">
          {!renaming && (
            <button className="bd-del" onClick={startRename} title="重命名清单（或双击清单名）"
                    aria-label={`重命名：${list.name}`}>✏</button>
          )}
          <button className="bd-del" onClick={() => onRemove(list.id)} disabled={!canDelete}
                  title={canDelete ? '删除清单（子项一并删除）' : '至少保留一个清单'}
                  aria-label={`删除清单：${list.name}`}>🗑</button>
        </span>
      </div>

      {/* 添加行：名称必填，价格可选，回车或按钮添加（置顶） */}
      <div className="sl-add">
        <input
          className="input sl-add-text"
          placeholder={`要买什么？回车添加到「${list.name}」…`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
        />
        <input
          className="input sl-add-price"
          type="number" min="0" step="0.01" inputMode="decimal"
          placeholder="价格（可选）"
          aria-label="新子项的价格（可选）"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
        />
        <button className="btn btn-primary" onClick={add} disabled={!text.trim()}>＋ 添加</button>
      </div>

      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        {items.length === 0 ? (
          <div className="sl-empty">清单还是空的 — 从上方添加，或把其他清单的子项拖到这里</div>
        ) : (
          <div className="sl-items">
            {items.map((it) => (
              <ShoppingRow key={it.id} item={it} onToggle={onToggle} onOpenEdit={onOpenEdit} onRemove={onRemoveItem} />
            ))}
            {/* 底部虚线承接区：拖到块上任意空白处 = 移到该清单末尾 */}
            <div className="sl-dropzone">拖动子项到这里</div>
          </div>
        )}
      </SortableContext>
    </div>
  );
}

export default function ShoppingList() {
  const [data, setData] = useLocalState(KEYS.shopping, { lists: [], items: [] });
  const lists = Array.isArray(data.lists) ? data.lists : [];
  const items = Array.isArray(data.items) ? data.items : [];

  const [activeId, setActiveId] = useState(null);   // 当前拖拽 id（清单块或子项）
  const [kbdDrag, setKbdDrag] = useState(false);    // 键盘触发的拖拽：只在 onDragEnd 一次性提交
  const kbdMovedRef = useRef(false);                // 键盘拖拽需实际按过方向键才提交
  const [editing, setEditing] = useState(null);     // 子项编辑弹窗 { id, text, price, note } | null
  const [creating, setCreating] = useState(false);  // 新建清单弹窗
  const [newName, setNewName] = useState('');

  // 挂载时若 lists 为空则写入三个内置清单（只在没有 lists 时初始化，幂等）
  useEffect(() => {
    setData((d) => {
      if (Array.isArray(d.lists) && d.lists.length > 0) return d;
      return {
        lists: BUILT_IN_LISTS.map((name) => ({ id: uid('l'), name, createdAt: new Date().toISOString() })),
        items: Array.isArray(d.items) ? d.items : [],
      };
    });
    // 仅挂载时执行一次
  }, []);

  const listIdSet = new Set(lists.map((l) => l.id));
  const isListId = (id) => listIdSet.has(String(id));
  const activeItem = activeId && !isListId(activeId) ? items.find((i) => i.id === activeId) : null;
  const activeList = activeId && isListId(activeId) ? lists.find((l) => l.id === activeId) : null;

  /* ---------- 清单块 CRUD ---------- */
  const createList = () => {
    const name = newName.trim();
    if (!name) return;
    setData((d) => ({ ...d, lists: [...(d.lists || []), { id: uid('l'), name, createdAt: new Date().toISOString() }] }));
    setNewName('');
    setCreating(false);
  };
  const renameList = (id, name) =>
    setData((d) => ({ ...d, lists: (d.lists || []).map((l) => (l.id === id ? { ...l, name } : l)) }));
  const removeList = (id) => {
    if (lists.length <= 1) return;                       // 仅剩 1 块时禁用删除
    const lst = lists.find((l) => l.id === id);
    if (!lst) return;
    const n = items.filter((i) => i.listId === id).length;
    if (!window.confirm(`删除清单「${lst.name}」？其中 ${n} 个子项将一并删除，此操作不可恢复。`)) return;
    setData((d) => ({
      lists: (d.lists || []).filter((l) => l.id !== id),
      items: (d.items || []).filter((i) => i.listId !== id),   // 块内子项一并删
    }));
  };

  /* ---------- 子项 CRUD ---------- */
  const addItem = (listId, text, priceRaw) =>
    setData((d) => ({
      ...d,
      // 新子项置顶 = 该清单最新想要的东西
      items: [{ id: uid('i'), listId, text, price: toPrice(priceRaw), note: '', done: false, createdAt: new Date().toISOString() }, ...(d.items || [])],
    }));
  const toggleItem = (id) =>
    setData((d) => ({ ...d, items: (d.items || []).map((i) => (i.id === id ? { ...i, done: !i.done } : i)) }));
  const removeItem = (id) =>
    setData((d) => ({ ...d, items: (d.items || []).filter((i) => i.id !== id) }));
  const openEdit = (id) => {
    const it = items.find((i) => i.id === id);
    if (it) setEditing({ id, text: it.text, price: it.price === '' || it.price == null ? '' : String(it.price), note: it.note || '' });
  };
  const saveEdit = () => {
    if (!editing) return;
    const text = editing.text.trim();
    if (!text) return; // 名称不能为空
    setData((d) => ({
      ...d,
      items: (d.items || []).map((i) => (i.id === editing.id
        ? { ...i, text, price: toPrice(editing.price), note: editing.note.trim() }
        : i)),
    }));
    setEditing(null);
  };

  /* ---------- 子项拖动：同清单 arrayMove 排序 / 跨清单摘出重插（参照 TodoBoard.moveTask） ---------- */
  const moveItem = (active, over) => {
    if (!over || active === over) return;
    setData((d) => {
      const list = d.items || [];
      const from = list.findIndex((i) => i.id === active);
      if (from < 0) return d;
      let targetListId, refIdx // refIdx = 参照条目下标；-1 = 目标清单末尾
      if (isListId(over)) {
        // over 是清单块本身：移到该清单末尾
        targetListId = String(over);
        refIdx = -1;
      } else {
        const to = list.findIndex((i) => i.id === over);
        if (to < 0) return d;
        targetListId = list[to].listId;
        refIdx = to;
      }
      if (list[from].listId === targetListId && refIdx >= 0) {
        if (refIdx === from) return d;
        return { ...d, items: arrayMove(list, from, refIdx) };
      }
      // 跨清单（或移到清单尾）：摘出后按目标清单重新插入
      const item2 = { ...list[from], listId: targetListId };
      const rest = list.filter((_, i) => i !== from);
      let insertAt;
      if (refIdx < 0) {
        insertAt = rest.length;
        for (let i = rest.length - 1; i >= 0; i--) {
          if (rest[i].listId === targetListId) { insertAt = i + 1; break }
        }
      } else {
        insertAt = refIdx > from ? refIdx - 1 : refIdx // 摘出后参照条目下标可能前移
      }
      const out = [...rest];
      out.splice(insertAt, 0, item2);
      return { ...d, items: out };
    });
  };

  /* ---------- 清单块拖动：整块换位，一次性提交（网格 live 提交会震荡） ---------- */
  const moveList = (a, overId) => {
    if (!overId || overId === a || !isListId(overId)) return;
    setData((d) => ({ ...d, lists: moveByIds(d.lists || [], a, overId) }));
  };

  /* ---------- 拖拽调度：单一 DndContext 按 active 类型分派（参照三笔钱） ---------- */
  // 碰撞检测：清单块拖拽只在块之间寻找落点（子项不参与，避免最近角误命中）；
  // 子项拖拽指针优先（指针不在任何容器内时回退最近角，供键盘拖拽与空块边缘使用）
  const collisionDetection = (args) => {
    if (isListId(String(args.active.id))) {
      const containers = args.droppableContainers.filter((c) => isListId(String(c.id)));
      return closestCorners({ ...args, droppableContainers: containers });
    }
    const p = pointerWithin(args);
    return p.length > 0 ? p : closestCorners(args);
  };
  // 碰撞结果解析（子项拖拽）：优先条目（拖到条目上=插到它前面），其次清单块容器（=移到该清单末尾）
  const resolveOverId = (e) => {
    const cols = e.collisions || [];
    const activeStr = String(e.active.id);
    for (const c of cols) {
      const id = String(c.id)
      if (!isListId(id) && id !== activeStr) return id
    }
    for (const c of cols) if (isListId(String(c.id))) return String(c.id)
    return e.over ? String(e.over.id) : null
  };
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    // 键盘 ↑↓：清单块按块顺序走，子项在所属清单内排序（确定性落点）；
    // 有实际位移才标记 kbdMovedRef（防「拿起未动却换到几何最近目标」）
    useSensor(KeyboardSensor, {
      coordinateGetter: (event, ctx) => {
        const r = makeSameLevelKeyboard((id) => {
          if (isListId(id)) return lists.map((l) => l.id);
          const it = items.find((i) => i.id === String(id));
          return it ? items.filter((i) => i.listId === it.listId).map((i) => i.id) : [];
        })(event, ctx);
        if (r && ctx.currentCoordinates
            && (Math.abs(r.x - ctx.currentCoordinates.x) > 0.5 || Math.abs(r.y - ctx.currentCoordinates.y) > 0.5)) {
          kbdMovedRef.current = true;
        }
        return r;
      },
    }),
  );

  /* ---------- 每块统计：总件数 / 已购件数 / 价格合计（已购、未购分别小计） ---------- */
  const statsOf = (lid) => {
    const arr = items.filter((i) => i.listId === lid);
    let done = 0, sumAll = 0, sumDone = 0;
    for (const it of arr) {
      const p = Number(toPrice(it.price)) || 0;
      sumAll += p;
      if (it.done) { done += 1; sumDone += p; }
    }
    return { arr, total: arr.length, done, sumAll: r2(sumAll), sumDone: r2(sumDone), sumUndone: r2(sumAll - sumDone) };
  };

  return (
    <div>
      <div className="row wb-page-head">
        <div>
          <h1 className="page-title">购物清单</h1>
          <p className="page-sub">
            多张清单块管理购物计划：常规购物与大促（618 / 双 11）分开存放 · 勾选已购、记价格与备注 ·
            子项可跨清单拖动，清单块也可整块换位 · 旧记账数据保留不受影响
          </p>
        </div>
        <span className="spacer" />
        <button className="btn btn-primary" onClick={() => setCreating(true)}>＋ 新建清单</button>
      </div>
      <div className="hint" style={{ marginTop: 0, marginBottom: 12 }}>
        拖子项 ⠿ 可跨清单移动（拖到目标清单空白处 = 移到该清单末尾）；拖块头 ⠿ 整块换位；双击清单名可重命名；块头显示件数与价格合计。
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={(e) => {
          setActiveId(String(e.active.id));
          setKbdDrag(e.activatorEvent instanceof KeyboardEvent);
          kbdMovedRef.current = false;
        }}
        onDragOver={(e) => {
          if (kbdDrag) return;              // 键盘拖拽：只在 onDragEnd 一次性提交
          const a = String(e.active.id);
          // 清单块整块换位不在 live 阶段提交：网格 + live arrayMove 会来回震荡（已验证的坑）
          if (isListId(a)) return;
          const o = resolveOverId(e);
          if (!o) return;
          // 子项只在跨清单时 live 提交（换清单的归属反馈要即时）；同清单内排序交给
          // onDragEnd 一次提交 —— 同列表 live arrayMove 上拖会来回震荡（预览闪烁）
          const fromItem = items.find((i) => i.id === a);
          if (!fromItem) return;
          const targetListId = isListId(o) ? String(o) : items.find((i) => i.id === o)?.listId;
          if (targetListId && targetListId !== fromItem.listId) moveItem(a, o);
        }}
        onDragEnd={(e) => {
          const a = String(e.active.id);
          const isKbd = e.activatorEvent instanceof KeyboardEvent;
          if (isListId(a)) {
            // 清单块：落位在结束时一次性提交；键盘需实际按过方向键
            if (!isKbd || kbdMovedRef.current) moveList(a, e.over && String(e.over.id));
          } else {
            moveItem(a, resolveOverId(e));
          }
          setActiveId(null);
          setKbdDrag(false);
        }}
        onDragCancel={() => { setActiveId(null); setKbdDrag(false); }}
      >
        <SortableContext items={lists.map((l) => l.id)} strategy={rectSortingStrategy}>
          <div className="sl-grid">
            {lists.map((list) => {
              const st = statsOf(list.id);
              return (
                <ListBlock
                  key={list.id}
                  list={list}
                  items={st.arr}
                  total={st.total} done={st.done}
                  sumAll={st.sumAll} sumDone={st.sumDone} sumUndone={st.sumUndone}
                  canDelete={lists.length > 1}
                  onAdd={addItem} onToggle={toggleItem} onRemoveItem={removeItem}
                  onOpenEdit={openEdit} onRename={renameList} onRemove={removeList}
                />
              );
            })}
          </div>
        </SortableContext>
        <DragOverlay dropAnimation={SPRING_DROP}>
          {activeItem ? (
            <div className={`sl-item sl-overlay ${activeItem.done ? 'done' : ''}`}>
              <span className="wb-grip is-grabbing">⠿</span>
              <span className={`sl-check ${activeItem.done ? 'on' : ''}`}>{activeItem.done ? '✓' : ''}</span>
              <div className="sl-body">
                <div className="sl-title-row">
                  <span className="sl-title">{activeItem.text}</span>
                  {toPrice(activeItem.price) !== '' && <span className="sl-price">¥{fmtMoney(toPrice(activeItem.price))}</span>}
                </div>
                {(activeItem.note || '').trim() && <div className="sl-note">{activeItem.note}</div>}
              </div>
            </div>
          ) : activeList ? (
            <div className="sl-overlay">
              <span className="wb-grip is-grabbing">⠿</span>
              <span className="sl-overlay-name">{activeList.name}</span>
              <span className="bd-stat">{items.filter((i) => i.listId === activeList.id).length} 件</span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* 子项编辑弹窗：名称 / 价格 / 备注 */}
      {editing && (
        <div className="modal-mask" onClick={() => setEditing(null)}>
          <div className="modal" style={{ width: 'min(480px, 100%)' }} onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">✏️ 编辑子项</h3>
            <div className="field">
              <label>名称</label>
              <input
                className="input"
                autoFocus
                value={editing.text}
                onChange={(e) => setEditing({ ...editing, text: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Enter') saveEdit() }}
              />
            </div>
            <div className="field">
              <label>价格（可选，仅用于块头合计统计）</label>
              <input
                className="input"
                type="number" min="0" step="0.01" inputMode="decimal"
                placeholder="0.00"
                value={editing.price}
                onChange={(e) => setEditing({ ...editing, price: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Enter') saveEdit() }}
              />
            </div>
            <div className="field">
              <label>备注（可选，列表中随名称显示）</label>
              <textarea
                className="textarea"
                style={{ minHeight: 80 }}
                placeholder="规格、链接、给谁买…"
                value={editing.note}
                onChange={(e) => setEditing({ ...editing, note: e.target.value })}
              />
            </div>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setEditing(null)}>取消</button>
              <button className="btn btn-primary" onClick={saveEdit} disabled={!editing.text.trim()}>💾 保存</button>
            </div>
          </div>
        </div>
      )}

      {/* 新建清单弹窗 */}
      {creating && (
        <div className="modal-mask" onClick={() => setCreating(false)}>
          <div className="modal" style={{ width: 'min(420px, 100%)' }} onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">🛒 新建清单</h3>
            <div className="field">
              <label>清单名称</label>
              <input
                className="input"
                autoFocus
                placeholder="如：年货清单 / 生日礼物 / 双 12 清单…"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') createList() }}
              />
            </div>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setCreating(false)}>取消</button>
              <button className="btn btn-primary" onClick={createList} disabled={!newName.trim()}>＋ 创建</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
