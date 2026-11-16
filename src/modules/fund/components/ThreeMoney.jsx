// 三笔钱 + 固定资产 + 借出应收：按 CATEGORIES 分组展示结构与逐模块余额。
// 板块（生活消费/投资增值/保险金/固定资产/借出应收）内子项 = 资产管家录入的模块
// （按其录入金额折算成净额显示），子项可跨板块拖动改归属、板块内拖动排序；
// 板块之上还有自定义「组」聚合层（fp:cat:groups）：新建/改名/删除组，
// 组头显示组内板块的资产/负债/净额合计，板块拖到组头即归组、拖到「未分组」区解除；
// 组与板块均可拖左上把手调换顺序（板块顺序落盘 fp:cat:order），页面顶部三张卡片
// （结构占比/合计条/板块区）支持把手拖拽排序（fp:three:order），
// 归属结果直接写回 modules 的 category 与顺序，资产管家页同步生效。
import React, { useRef, useState } from 'react';
import {
  DndContext, DragOverlay, useDroppable,
  PointerSensor, KeyboardSensor, useSensor, useSensors,
  pointerWithin, closestCorners,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, rectSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CATEGORIES, CATEGORY_MAP } from '../data/data.js';
import { moduleBalance, navigate, fmtMoney, KEYS, useLocalState, uid } from '../store.js';
import { MiniBar } from './Chart.jsx';
import {
  Grip, SortableCards, SortableCard, makeSameLevelKeyboard,
  springTransition, moveByIds, normalizeOrder,
} from '../../../components/dnd/magpie.jsx';

// 页面卡片：结构占比 / 合计条 / 分类板块（顺序落盘 KEYS.threeOrder）
const PAGE_CARDS = ['share', 'totals', 'boards'];

/* ---------- 可拖拽子项（模块芯片） ---------- */
function ModuleChip({ mod, items }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: mod.id });
  const bal = moduleBalance(mod.id, items);
  const itemCount = items.filter((i) => i.moduleId === mod.id).length;
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`tm-chip ${isDragging ? 'is-dragging' : ''}`}
      {...attributes}
      {...listeners}
      title={`${mod.name}：净额 ${fmtMoney(bal)}（拖动可调整归属与排序）`}
    >
      <span className="tm-chip-name">{mod.name}</span>
      <span className="tag">{itemCount} 款项</span>
      <span className={`tm-chip-amount ${bal >= 0 ? 'pos' : 'neg'}`}>{fmtMoney(bal)}</span>
    </div>
  );
}

/* ---------- 板块（可排序容器：整块拖左上把手换位；同时也是子项的放置目标） ---------- */
function CategoryBoard({ cat, mods, items, totals }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isOver, isDragging, transform } = useSortable({ id: cat.key });
  const t = totals?.byCategory?.[cat.key] || { asset: 0, liability: 0, balance: 0 };
  return (
    <div
      ref={setNodeRef}
      data-sort-id={cat.key}
      className={`tm-board ${isOver ? 'is-over' : ''} ${isDragging ? 'is-dragging' : ''}`}
      style={{
        '--tm-color': cat.color,
        transform: CSS.Translate.toString(transform),
        transition: isDragging ? 'none' : springTransition(),
      }}
    >
      <div className="card-title" style={{ marginBottom: 8 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Grip listeners={listeners} attributes={attributes} dragging={isDragging} activatorRef={setActivatorNodeRef}
                label="拖动排序板块" className="bd-grip" />
          <span><span style={{ color: cat.color }}>●</span> {cat.name}</span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className={`tag tag-${cat.key}`}>{cat.desc}</span>
          <button className="btn btn-sm" onClick={() => navigate('assets')}>去管理</button>
        </span>
      </div>
      <div className="grid grid-3" style={{ marginBottom: 4 }}>
        <div className="stat">
          <div className="stat-label">资产合计</div>
          <div className="stat-value pos" style={{ fontSize: 18 }}>{fmtMoney(t.asset)}</div>
        </div>
        <div className="stat">
          <div className="stat-label">负债合计</div>
          <div className="stat-value neg" style={{ fontSize: 18 }}>{fmtMoney(t.liability)}</div>
        </div>
        <div className="stat">
          <div className="stat-label">净额</div>
          <div className={`stat-value${t.balance >= 0 ? ' pos' : ' neg'}`} style={{ fontSize: 18 }}>
            {fmtMoney(t.balance)}
          </div>
        </div>
      </div>
      <SortableContext items={mods.map((m) => m.id)} strategy={verticalListSortingStrategy}>
        <div className="tm-chips">
          {mods.length === 0
            ? <div className="tm-board-empty">拖动模块到这里（空板块也可放置）</div>
            : mods.map((m) => <ModuleChip key={m.id} mod={m} items={items} />)}
        </div>
      </SortableContext>
    </div>
  );
}

/* ---------- 自定义组（板块之上的聚合层）：组头把手拖动排序、行内改名、删除；
   组体放其成员板块（板块拖到组容器=归组追加到末尾；组头合计 = 成员板块之和） ---------- */
function GroupSection({ group, modsByCat, items, totals, onRename, onDelete }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging, isOver, transform } = useSortable(`grp:${group.id}`);
  const sums = group.cats.reduce(
    (acc, k) => {
      const t = totals?.byCategory?.[k];
      if (!t) return acc;
      acc.asset += t.asset; acc.liability += t.liability; acc.balance += t.balance;
      return acc;
    },
    { asset: 0, liability: 0, balance: 0 },
  );
  return (
    <div
      ref={setNodeRef}
      data-sort-id={`grp:${group.id}`}
      className={`tm-group ${isDragging ? 'is-dragging' : ''} ${isOver ? 'is-over' : ''}`}
      style={{ transform: CSS.Translate.toString(transform), transition: isDragging ? 'none' : springTransition() }}
    >
      <div className="tm-group-head">
        <span className="tm-group-title">
          <Grip listeners={listeners} attributes={attributes} dragging={isDragging} activatorRef={setActivatorNodeRef}
                label="拖动排序组" className="bd-grip" />
          <input
            className="input bd-inline tm-group-name"
            value={group.name}
            onChange={(e) => onRename(group.id, e.target.value)}
            title="重命名组"
            aria-label={`组名：${group.name}`}
          />
        </span>
        <span className="tm-group-sums">
          资产 <b className="pos">{fmtMoney(sums.asset)}</b> · 负债 <b className="neg">{fmtMoney(sums.liability)}</b> · 净额{' '}
          <b className={sums.balance >= 0 ? 'pos' : 'neg'}>{fmtMoney(sums.balance)}</b>
        </span>
        <span className="tm-group-ops">
          <span className="tag">{group.cats.length} 板块</span>
          <button className="btn btn-sm btn-danger" onClick={() => onDelete(group)} title="删除该组（组内板块回到未分组）">🗑</button>
        </span>
      </div>
      <SortableContext items={group.cats} strategy={rectSortingStrategy}>
        <div className="tm-boards">
          {group.cats.length === 0
            ? <div className="tm-group-empty">拖动板块进来（空组也可放置）</div>
            : group.cats.map((key) => (
              <CategoryBoard key={key} cat={CATEGORY_MAP[key]} mods={modsByCat[key] || []} items={items} totals={totals} />
            ))}
        </div>
      </SortableContext>
    </div>
  );
}

/* ---------- 未分组区：不在任何自定义组里的板块；本身是 droppable（板块拖到这里=解除归组） ---------- */
function UngroupedZone({ catKeys, modsByCat, items, totals }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'cats:ungrouped' });
  return (
    <div ref={setNodeRef} className={`tm-ungrouped ${isOver ? 'is-over' : ''}`}>
      <div className="tm-ungrouped-head">
        未分组板块
        <span className="tm-group-sums">拖板块到上方组头即归组 · 拖回此处解除归组</span>
      </div>
      <SortableContext items={catKeys} strategy={rectSortingStrategy}>
        <div className="tm-boards">
          {catKeys.length === 0
            ? <div className="tm-group-empty">所有板块都已归组</div>
            : catKeys.map((key) => (
              <CategoryBoard key={key} cat={CATEGORY_MAP[key]} mods={modsByCat[key] || []} items={items} totals={totals} />
            ))}
        </div>
      </SortableContext>
    </div>
  );
}

export default function ThreeMoney({ modules, items, totals, setModules }) {
  const [activeId, setActiveId] = useState(null);
  // 键盘触发的拖拽：live move 会让网格连锁重排，只在 onDragEnd 一次性提交；
  // 且需实际按过方向键（有位移）才提交，避免"没动过却换到几何最近板块"
  const [kbdDrag, setKbdDrag] = useState(false);
  const kbdMovedRef = useRef(false);
  // 松手落位的 DOM 几何解析：dnd-kit 的 droppableRects 在个别拖拽里会缺组容器缓存
  //（实测 pointerWithin/最近角都会因此把组头落点误判到相邻板块），
  // 故板块/组的最终落点改用"松手指针位置 + elementFromPoint"直接解析 DOM 层级。
  const lastPointerRef = useRef(null);
  const byCategory = totals?.byCategory || {};

  // 板块顺序（四分类整板换位，落盘 fp:cat:order）与页面卡片顺序（fp:three:order）
  const [catOrder, setCatOrder] = useLocalState(KEYS.catOrder, CATEGORIES.map((c) => c.key));
  const [cardOrder, setCardOrder] = useLocalState(KEYS.threeOrder, PAGE_CARDS);
  const catIds = normalizeOrder(catOrder, CATEGORIES.map((c) => c.key));
  const cardIds = normalizeOrder(cardOrder, PAGE_CARDS);

  // —— 自定义组（板块之上的聚合层，落盘 fp:cat:groups）——
  const [groups, setGroups] = useLocalState(KEYS.catGroups, []);
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  // 分组数据规整（容错旧/坏数据）与派生：每组板块列表、未分组板块、各分类的模块列表
  const safeGroups = (Array.isArray(groups) ? groups : []).map((g, i) => ({
    id: (g && g.id) || `g${i}`,
    name: String((g && g.name) || '未命名组'),
    cats: Array.isArray(g && g.cats) ? g.cats.filter((k) => !!CATEGORY_MAP[k]) : [],
  }));
  const modsByCat = {};
  for (const c of CATEGORIES) modsByCat[c.key] = modules.filter((m) => m.category === c.key && !m.archived);
  const groupOfCat = (catKey) => safeGroups.find((g) => g.cats.includes(catKey)) || null;
  const ungroupedCats = catIds.filter((k) => !groupOfCat(k));

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    // 键盘 ↑↓：板块按板块顺序走，子项在所属板块内排序（确定性落点）
    useSensor(KeyboardSensor, {
      coordinateGetter: (event, ctx) => {
        const r = makeSameLevelKeyboard((id) => {
          const s = String(id);
          if (s.startsWith('grp:')) return safeGroups.map((g) => `grp:${g.id}`);
          if (CATEGORY_MAP[s]) {
            // 板块的同层兄弟 = 它所在组内的板块（未分组则在未分组区内部）
            const ownGroup = safeGroups.find((g) => g.cats.includes(s));
            const pool = ownGroup ? ownGroup.cats : ungroupedCats;
            return catIds.filter((k) => pool.includes(k));
          }
          const mod = modules.find((m) => m.id === s);
          return mod
            ? modules.filter((m) => m.category === mod.category && !m.archived).map((m) => m.id)
            : [];
        })(event, ctx);
        if (r && ctx.currentCoordinates
            && (Math.abs(r.x - ctx.currentCoordinates.x) > 0.5 || Math.abs(r.y - ctx.currentCoordinates.y) > 0.5)) {
          kbdMovedRef.current = true;
        }
        return r;
      },
    }),
  );

  // 四组净额（负数按 0 处理占比，MiniBar 内部会忽略负值）
  const shareValues = CATEGORIES.map((c) => ({
    label: c.name,
    value: byCategory[c.key]?.balance ?? 0,
    color: c.color,
  }));
  const allZero = shareValues.every((v) => (Number(v.value) || 0) === 0);

  /** 子项拖动落位：跨板块改 category，板块内/跨板块都插到目标位置（原目标后移一位，
      与拖拽 transform 预览、任务队列/购物清单的落位语义一致） */
  const moveTo = (activeIdArg, over) => {
    if (!over) return;
    const overId = String(over.id);
    if (overId === String(activeIdArg)) return;
    setModules((prev) => {
      const active = prev.find((m) => m.id === String(activeIdArg));
      if (!active) return prev;
      const isCatKey = CATEGORIES.some((c) => c.key === overId);
      const targetCat = isCatKey ? overId : prev.find((m) => m.id === overId)?.category;
      if (!targetCat) return prev;
      const without = prev.filter((m) => m.id !== active.id);
      let insertAt;
      if (isCatKey) {
        // 放到板块末尾：目标分类最后一个模块之后
        insertAt = 0;
        without.forEach((m, i) => { if (m.category === targetCat) insertAt = i + 1; });
      } else {
        const oi = without.findIndex((m) => m.id === overId);
        if (oi < 0) return prev;
        insertAt = oi;
      }
      const next = [...without];
      next.splice(insertAt, 0, { ...active, category: targetCat });
      return next;
    });
  };

  /** 组管理：新建 / 行内改名 / 删除（组内板块回到未分组） */
  const addGroup = () => {
    const name = newGroupName.trim();
    if (!name) return;
    setGroups((prev) => [...(Array.isArray(prev) ? prev : []), { id: uid('g'), name, cats: [] }]);
    setNewGroupName('');
    setNewGroupOpen(false);
  };
  const renameGroup = (gid, name) =>
    setGroups((prev) => (Array.isArray(prev) ? prev : []).map((g) => (g.id === gid ? { ...g, name } : g)));
  const deleteGroup = (group) => {
    if (!window.confirm(`删除组「${group.name}」？组内 ${group.cats.length} 个板块将回到未分组。`)) return;
    setGroups((prev) => (Array.isArray(prev) ? prev : []).filter((g) => g.id !== group.id));
  };

  /** 板块落位到组/未分组：over=组容器→归组追加到末尾；over=未分组区→解除归组；
      over=另一板块（或板块内子项）→进它所在的组（已在同组则仅调序），同时按落点调全局板块顺序 */
  const moveBoardTo = (catKey, overId) => {
    let o = String(overId);
    if (o === 'cats:ungrouped') {
      setGroups((prev) => (Array.isArray(prev) ? prev : []).map((g) => ({ ...g, cats: (g.cats || []).filter((k) => k !== catKey) })));
      return;
    }
    // 落在子项芯片上：归一到该芯片所属板块
    if (!CATEGORY_MAP[o] && !o.startsWith('grp:')) {
      const om = modules.find((m) => m.id === o);
      if (!om) return;
      o = om.category;
    }
    setGroups((prev) => {
      const list = Array.isArray(prev) ? prev : [];
      const targetGid = o.startsWith('grp:')
        ? o.slice(4)
        : (list.find((g) => (g.cats || []).includes(o)) || {}).id;
      if (o.startsWith('grp:') && !targetGid) return list; // 落到不存在的组：忽略
      return list.map((g) => (g.id === targetGid
        ? { ...g, cats: [...(g.cats || []).filter((k) => k !== catKey), catKey] }
        : { ...g, cats: (g.cats || []).filter((k) => k !== catKey) }));
    });
    if (CATEGORY_MAP[o]) setCatOrder((prev) => moveByIds(prev, catKey, o));
  };

  /** 组整板换位：over=另一组→换位；over=板块（或其子项）→换到该板块所在组的位置 */
  const moveGroup = (gid, overId) => {
    const o = String(overId);
    let targetGid = null;
    if (o.startsWith('grp:')) targetGid = o.slice(4);
    else if (CATEGORY_MAP[o]) targetGid = (safeGroups.find((g) => g.cats.includes(o)) || {}).id;
    else {
      const om = modules.find((m) => m.id === o);
      if (om) targetGid = (safeGroups.find((g) => g.cats.includes(om.category)) || {}).id;
    }
    if (!targetGid || targetGid === gid) return;
    setGroups((prev) => {
      const list = Array.isArray(prev) ? prev : [];
      const from = list.findIndex((g) => g.id === gid);
      const to = list.findIndex((g) => g.id === targetGid);
      if (from < 0 || to < 0 || from === to) return list;
      return arrayMove(list, from, to);
    });
  };

  // 拖拽调度：active 是板块键（cat key）走整板换位，否则按子项落位。
  // live 落位只在 onDragOver 做，onDragEnd 仅清理状态（重复提交会把已就位的
  // 板块/子项又摆回去）。
  const dispatchMove = (a, over) => {
    if (!over) return;
    // over 兼容两种形态：dnd-kit 的 over 对象（{id}）与 resolveOverByDom 的字符串 id
    const overId = typeof over === 'string' ? over : String(over.id);
    if (overId === a) return;
    const as = String(a);
    if (as.startsWith('grp:')) {
      moveGroup(as.slice(4), overId);
      return;
    }
    if (CATEGORY_MAP[as]) {
      moveBoardTo(as, overId);
      return;
    }
    moveTo(a, over);
  };

  // 碰撞检测：组拖拽只在组容器之间寻找落点；板块拖拽在板块 + 组容器 + 未分组区之间
  //（组容器=拖入该组、未分组=解除归组，板块内子项不参与避免最近角误命中）；
  // 子项拖拽保持指针优先、指针不在任何容器内时回退最近角（拖到空板块边缘也能命中）
  const collisionDetection = (args) => {
    const a = String(args.active.id);
    if (a.startsWith('grp:')) {
      const containers = args.droppableContainers.filter((c) => String(c.id).startsWith('grp:'));
      return closestCorners({ ...args, droppableContainers: containers });
    }
    if (CATEGORY_MAP[a]) {
      const containers = args.droppableContainers.filter((c) => {
        const id = String(c.id);
        return !!CATEGORY_MAP[id] || id.startsWith('grp:') || id === 'cats:ungrouped';
      });
      // 指针优先：组容器很宽，最近角测量会把落点误判到别的板块上；
      // 指针不在任何容器内时（键盘拖拽）才回退最近角。
      // （拖拽过程中的 is-over 高亮由此驱动；最终落位见 resolveOverByDom）
      const p = pointerWithin({ ...args, droppableContainers: containers });
      return p.length > 0 ? p : closestCorners({ ...args, droppableContainers: containers });
    }
    const p = pointerWithin(args);
    return p.length > 0 ? p : closestCorners(args);
  };

  /** 松手落点解析（板块/组专用）：拖拽浮层正压在指针下，elementFromPoint 不可靠；
      改用纯几何矩形命中（浮层不在选择器内天然排除），从细到粗：
      板块（精细插入/换位）→ 组容器空白处（归组）→ 未分组区（解除归组） */
  const resolveOverByDom = () => {
    const pt = lastPointerRef.current;
    if (!pt) return null;
    const inRect = (el) => {
      const r = el.getBoundingClientRect();
      return pt.x >= r.x && pt.x <= r.right && pt.y >= r.y && pt.y <= r.bottom;
    };
    const board = [...document.querySelectorAll('.tm-board')].find(inRect);
    if (board) return board.dataset.sortId || null;
    const group = [...document.querySelectorAll('.tm-group')].find(inRect);
    if (group) return group.dataset.sortId || null;
    const ungrouped = document.querySelector('.tm-ungrouped');
    if (ungrouped && inRect(ungrouped)) return 'cats:ungrouped';
    return null;
  };

  const activeMod = activeId ? modules.find((m) => m.id === String(activeId)) : null;
  const activeCat = activeId ? CATEGORY_MAP[String(activeId)] : null;
  const activeGroup = activeId && String(activeId).startsWith('grp:')
    ? safeGroups.find((g) => `grp:${g.id}` === String(activeId)) : null;
  const activeBal = activeMod ? moduleBalance(activeMod.id, items) : 0;

  /* ---------- 页面卡片内容 ---------- */
  const totalsBody = (
    <div className="grid grid-3">
      <div className="stat">
        <div className="stat-label">总储钱罐（资产合计）</div>
        <div className="stat-value pos">{fmtMoney(totals?.totalAsset ?? 0)}</div>
      </div>
      <div className="stat">
        <div className="stat-label">欠（负债合计）</div>
        <div className="stat-value neg">{fmtMoney(totals?.totalLiability ?? 0)}</div>
      </div>
      <div className="stat">
        <div className="stat-label">实有（净资产）</div>
        <div className={`stat-value${(totals?.netWorth ?? 0) >= 0 ? ' pos' : ' neg'}`}>
          {fmtMoney(totals?.netWorth ?? 0)}
        </div>
      </div>
    </div>
  );

  const shareCard = (grip) => (
    <>
      <div className="card-title">
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {grip}
          <span>结构占比</span>
        </span>
        <span className="stat-extra">按各组净额</span>
      </div>
      {allZero ? (
        <div className="empty">先去资产管家录入款项</div>
      ) : (
        <>
          <MiniBar values={shareValues} />
          {/* 5 分类各占一格 */}
          <div className="grid grid-5" style={{ marginTop: 12 }}>
            {shareValues.map((v, i) => (
              <div key={CATEGORIES[i].key} className="stat">
                <div className="stat-label">
                  <span style={{ color: v.color }}>●</span> {v.label}
                </div>
                <div className={`stat-value${v.value >= 0 ? ' pos' : ' neg'}`} style={{ fontSize: 16 }}>
                  {fmtMoney(v.value)}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );

  const boardsCard = (grip) => (
    <>
      <div className="card-title">
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {grip}
          <span>分类板块</span>
        </span>
        <span className="stat-extra">子项金额 = 该模块净额（来自资产管家）</span>
      </div>
      <div className="hint" style={{ marginTop: 0, marginBottom: 12 }}>
        「＋新建组」可把板块组合起来（组头显示组内合计）；拖板块到组头即归组、拖到「未分组」解除；组与板块均可拖左上把手排序；拖动子项到其他板块调整归属并同步回「资产管家」。增删改款项请到「资产管家」。
      </div>
      {/* 新建组：行内输入（回车创建 / Esc 取消） */}
      <div className="bd-toolbar" style={{ marginBottom: 10 }}>
        {newGroupOpen ? (
          <>
            <input
              className="input bd-grow"
              autoFocus
              placeholder="输入组名称，回车创建（如：我的流动资金）"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addGroup();
                if (e.key === 'Escape') setNewGroupOpen(false);
              }}
            />
            <button className="btn btn-primary" onClick={addGroup} disabled={!newGroupName.trim()}>创建</button>
            <button className="btn" onClick={() => setNewGroupOpen(false)}>取消</button>
          </>
        ) : (
          <>
            <span className="muted">组 = 板块之上的自定义聚合层，随时可建可删</span>
            <span className="spacer" />
            <button className="btn btn-sm" onClick={() => { setNewGroupOpen(true); setNewGroupName(''); }}>＋ 新建组</button>
          </>
        )}
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={(e) => {
          setActiveId(String(e.active.id));
          setKbdDrag(e.activatorEvent instanceof KeyboardEvent);
          kbdMovedRef.current = false;
          lastPointerRef.current = null;
          const track = (ev) => { lastPointerRef.current = { x: ev.clientX, y: ev.clientY }; };
          document.addEventListener('pointermove', track, true);
          window.__tmTrack = track; // 供 onDragEnd/Cancel 移除
        }}
        onDragOver={(e) => {
          if (kbdDrag) return;
          const a = String(e.active.id);
          // 板块/组的网格布局不在 live 阶段提交：live arrayMove 会来回震荡
          if (CATEGORY_MAP[a] || a.startsWith('grp:')) return;
          // 子项只在跨板块时 live 提交（换板块的归属反馈要即时）；同板块内排序交给
          // onDragEnd 一次提交 —— 同列表 live arrayMove 上拖会来回震荡（预览闪烁）
          const overId = e.over ? String(e.over.id) : null;
          const targetCat = CATEGORY_MAP[overId] ? overId : modules.find((m) => m.id === overId)?.category;
          const activeCat = modules.find((m) => m.id === a)?.category;
          if (targetCat && activeCat && targetCat !== activeCat) dispatchMove(a, e.over);
        }}
        onDragEnd={(e) => {
          if (window.__tmTrack) { document.removeEventListener('pointermove', window.__tmTrack, true); window.__tmTrack = null; }
          const a = String(e.active.id);
          const deferred = !!CATEGORY_MAP[a] || a.startsWith('grp:'); // 板块/组：落位在结束时一次性提交
          const isKbd = e.activatorEvent instanceof KeyboardEvent;
          if (deferred) {
            // 键盘需实际按过方向键；指针拖拽用 DOM 几何解析落点（见 resolveOverByDom），
            // 解析不出再回退 dnd-kit 的 over
            const overId = (!isKbd && resolveOverByDom()) ?? (e.over ? String(e.over.id) : null);
            if (!isKbd || kbdMovedRef.current) dispatchMove(a, overId);
          } else if (!isKbd || kbdMovedRef.current) {
            // 子项：同板块排序在此一次性提交（live 只处理跨板块）；跨板块后也会
            // 按最终落点再校准一次位置
            dispatchMove(a, e.over);
          }
          lastPointerRef.current = null;
          setActiveId(null);
          setKbdDrag(false);
        }}
        onDragCancel={() => {
          if (window.__tmTrack) { document.removeEventListener('pointermove', window.__tmTrack, true); window.__tmTrack = null; }
          lastPointerRef.current = null;
          setActiveId(null);
          setKbdDrag(false);
        }}
      >
        <SortableContext items={safeGroups.map((g) => `grp:${g.id}`)} strategy={verticalListSortingStrategy}>
          <div className="tm-groups">
            {safeGroups.map((g) => (
              <GroupSection key={g.id} group={g} modsByCat={modsByCat} items={items} totals={totals}
                            onRename={renameGroup} onDelete={deleteGroup} />
            ))}
          </div>
        </SortableContext>
        <UngroupedZone catKeys={ungroupedCats} modsByCat={modsByCat} items={items} totals={totals} />
        <DragOverlay dropAnimation={{ duration: 200, easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)' }}>
          {activeMod ? (
            <div className="tm-overlay">
              <span className="tm-chip-name">{activeMod.name}</span>
              <span className={`tm-chip-amount ${activeBal >= 0 ? 'pos' : 'neg'}`}>{fmtMoney(activeBal)}</span>
            </div>
          ) : activeCat ? (
            <div className="tm-overlay">
              <span style={{ color: activeCat.color }}>●</span>
              <span className="tm-chip-name">{activeCat.name}</span>
              <span className={`tag tag-${activeCat.key}`}>{activeCat.desc}</span>
            </div>
          ) : activeGroup ? (
            <div className="tm-overlay">
              <span className="wb-grip is-grabbing">⠿</span>
              <span className="tm-chip-name">{activeGroup.name}</span>
              <span className="tag">{activeGroup.cats.length} 板块</span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </>
  );

  const renderCard = (id, grip) => {
    if (id === 'share') return shareCard(grip);
    if (id === 'boards') return boardsCard(grip);
    return null;
  };

  return (
    <div>
      <div className="page-title">三笔钱 · 结构视图</div>
      <div className="page-sub">
        把资金分成三笔钱加固定资产：生活消费是随时可用的钱；投资增值是让钱生钱的钱；保险金是保命的钱；固定资产是公积金、社保等不可流动的钱。借出应收是借出去、还没收回的钱。
      </div>

      {/* 页面卡片：结构占比 / 合计条 / 分类板块，均可拖左上把手排序 */}
      <SortableCards ids={cardIds} onMove={(a, o) => setCardOrder((prev) => moveByIds(prev, a, o))}>
        {cardIds.map((id) => (
          id === 'totals' ? (
            <SortableCard key={id} id={id} corner gripLabel="拖动排序此卡片">
              {totalsBody}
            </SortableCard>
          ) : (
            <SortableCard key={id} id={id} gripLabel="拖动排序此卡片">
              {(grip) => renderCard(id, grip)}
            </SortableCard>
          )
        ))}
      </SortableCards>
    </div>
  );
}
