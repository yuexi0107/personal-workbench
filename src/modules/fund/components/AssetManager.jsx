// 资产管家：模块（账户容器）以分块卡片（.am-block）呈现 ——
//   每块常显 资产合计/负债合计/子项净额，展开后列出款项（增删改走原有弹窗）。
//   三层都可拖拽排序（dnd-kit sortable + magpie 共享拖拽基建，把手触发）：
//     页面卡片（汇总条 / 模块区，顺序落盘 fp:assets:order）
//     → 模块卡（数组顺序即 am-grid 排列，rectSortingStrategy 网格让位）
//     → 模块内款项（同层碰撞/键盘导航把拖拽限制在同一模块内）。
import React, { useMemo, useRef, useState } from 'react';
import { DndContext, DragOverlay, PointerSensor, KeyboardSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, rectSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { moduleBalance, moduleSums, uid, fmtMoney, KEYS, useLocalState } from '../store.js';
import { CATEGORIES, CATEGORY_MAP } from '../data/data.js';
import {
  Grip, SortableCard, useSortableRow, SPRING_DROP,
  makeSameLevelCollision, makeSameLevelKeyboard, useMagpieSensors,
  moveByIds, normalizeOrder,
} from '../../../components/dnd/magpie.jsx';

// 空表单初始值
const EMPTY_MODULE_FORM = { name: '', category: 'life', note: '' };
const EMPTY_ITEM_FORM = { name: '', amount: '', direction: 'asset', note: '' };

// 页面卡片：顶部汇总条 / 资产模块区（顺序落盘 KEYS.assetsOrder）
const PAGE_CARDS = ['summary', 'mods'];

// 款项行：块内可排序（把手拖拽 / 键盘 ↑↓），编辑/删除按钮悬停显形
function ItemRow({ it, onEdit, onDelete }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging, style } = useSortableRow(it.id);
  const pos = it.direction === 'asset';
  return (
    <div ref={setNodeRef} data-sort-id={it.id} style={style}
         className={`am-item ${isDragging ? 'is-dragging' : ''}`}
         title={it.note || undefined}>
      <Grip listeners={listeners} attributes={attributes} dragging={isDragging} activatorRef={setActivatorNodeRef}
            label="拖动排序款项" className="bd-grip" />
      <span className="am-item-name">{it.name}</span>
      <span className={`tag tag-${it.direction}`}>{pos ? '资产' : '负债'}</span>
      <span className={`amount ${pos ? 'pos' : 'neg'}`}>{fmtMoney(it.amount)}</span>
      <button className="btn btn-sm" onClick={() => onEdit(it)}>编辑</button>
      <button className="btn btn-sm btn-danger" onClick={() => onDelete(it)}>删除</button>
    </div>
  );
}

// 模块卡：整卡可拖拽排序（把手在块头最左，把手点击不触发展开/收起）
function ModuleBlock({ mod, items, expanded, onToggle, onEditModule, onRemoveModule, onAddItem, onEditItem, onDeleteItem }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging, style } = useSortableRow(mod.id);
  const modItems = items.filter(i => i.moduleId === mod.id);
  const sums = moduleSums(mod.id, items);
  const bal = moduleBalance(mod.id, items);
  const cat = CATEGORY_MAP[mod.category];
  return (
    <div ref={setNodeRef} data-sort-id={mod.id}
         style={{ ...style, '--am-accent': cat ? cat.color : undefined }}
         className={`am-block ${isDragging ? 'is-dragging' : ''}`}>
      {/* 块头：点击整行展开/收起；把手与右侧按钮区阻断冒泡 */}
      <div className="am-block-head" onClick={() => onToggle(mod.id)}>
        <span className="am-grip" onClick={e => e.stopPropagation()}>
          <Grip listeners={listeners} attributes={attributes} dragging={isDragging} activatorRef={setActivatorNodeRef}
                label="拖动排序模块" className="bd-grip" />
        </span>
        <span aria-hidden="true">{expanded ? '▾' : '▸'}</span>
        <span className="am-block-name" title={mod.note || undefined}>{mod.name}</span>
        <span className={`tag tag-${mod.category}`}>{cat ? cat.name : mod.category}</span>
        <span className="tag">{modItems.length} 款项</span>
        <span className={`amount ${bal >= 0 ? 'pos' : 'neg'}`}>{fmtMoney(bal)}</span>
        <span className="am-block-ops" onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: 4 }}>
          <button className="btn btn-sm" onClick={() => onEditModule(mod)}>编辑</button>
          <button className="btn btn-sm btn-danger" onClick={() => onRemoveModule(mod)}>删除</button>
          <button className="btn btn-sm btn-primary" onClick={onAddItem}>＋ 添加款项</button>
        </span>
      </div>

      {/* 常显小计：资产合计 / 负债合计 / 子项净额 */}
      <div className="am-block-sums">
        <div className="grid grid-3">
          <div className="stat">
            <div className="stat-label">资产合计</div>
            <div className="stat-value pos">{fmtMoney(sums.asset)}</div>
          </div>
          <div className="stat">
            <div className="stat-label">负债合计</div>
            <div className="stat-value neg">{fmtMoney(sums.liability)}</div>
          </div>
          <div className="stat">
            <div className="stat-label">子项净额</div>
            <div className={`stat-value ${bal >= 0 ? 'pos' : 'neg'}`}>{fmtMoney(bal)}</div>
          </div>
        </div>
      </div>

      {/* 展开区：款项行（同模块内拖拽排序） */}
      {expanded && (
        <div className="am-items">
          {modItems.length === 0 ? (
            <div className="hint">该模块暂无款项，点击「＋添加款项」录入</div>
          ) : (
            <SortableContext items={modItems.map(i => i.id)} strategy={verticalListSortingStrategy}>
              {modItems.map(it => (
                <ItemRow key={it.id} it={it} onEdit={onEditItem} onDelete={onDeleteItem} />
              ))}
            </SortableContext>
          )}
        </div>
      )}
    </div>
  );
}

export default function AssetManager({ modules, setModules, items, setItems, totals }) {
  // 展开的模块 id 集合（支持多块同时展开）——持久化到 fp:assets:expanded，
  // 切页/刷新后保持上次的展开或收起状态。存储为 string[]；null = 首次使用，默认展开第一块；
  // 读取时过滤掉已删除的模块 id，避免脏数据。
  const [expandedState, setExpandedState] = useLocalState(KEYS.assetsExpanded, null);
  const expandedIds = useMemo(() => {
    if (Array.isArray(expandedState)) return new Set(expandedState.filter((id) => modules.some((m) => m.id === id)));
    return new Set(modules.length ? [modules[0].id] : []);
  }, [expandedState, modules]);
  // 与旧 setState(Set) 同签名的适配层：updater(当前Set) → 新Set，内部转数组落盘
  const setExpandedIds = (updater) =>
    setExpandedState((prev) => {
      const cur = Array.isArray(prev)
        ? new Set(prev.filter((id) => modules.some((m) => m.id === id)))
        : new Set(modules.length ? [modules[0].id] : []);
      return [...updater(cur)];
    });
  // 弹窗状态：{ kind: 'module' | 'item', editId: string | null, moduleId?: string }
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY_MODULE_FORM);
  const [error, setError] = useState('');
  // 拖拽中的 id（款项 / 模块 / 页面卡片，null 表示未拖拽）
  const [activeId, setActiveId] = useState(null);
  // 键盘触发的拖拽（Space 激活）：live move 会让网格连锁重排，
  // 故键盘拖拽只在 onDragEnd 一次性提交落位；且需实际按过方向键（有位移），
  // 避免"没动过却换到几何最近的卡片"
  const [kbdDrag, setKbdDrag] = useState(false);
  const kbdMovedRef = useRef(false);
  // 页面卡片顺序：汇总条 / 模块区（把手拖拽，落盘 fp:assets:order）
  const [pageOrder, setPageOrder] = useLocalState(KEYS.assetsOrder, PAGE_CARDS);
  const pageIds = normalizeOrder(pageOrder, PAGE_CARDS);

  // ---------- 展开/收起模块块 ----------
  function toggleBlock(id) {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // ---------- 打开/关闭弹窗 ----------
  function openModuleModal(mod) {
    setForm(mod ? { name: mod.name, category: mod.category, note: mod.note || '' } : { ...EMPTY_MODULE_FORM });
    setError('');
    setModal({ kind: 'module', editId: mod ? mod.id : null });
  }
  function openItemModal(itemId, moduleId) {
    const it = itemId ? items.find(i => i.id === itemId) : null;
    setForm(it ? { name: it.name, amount: String(it.amount), direction: it.direction, note: it.note || '' }
               : { ...EMPTY_ITEM_FORM });
    setError('');
    setModal({ kind: 'item', editId: itemId || null, moduleId });
  }
  function closeModal() { setModal(null); setError(''); }

  // ---------- 模块 CRUD ----------
  function saveModule() {
    const name = form.name.trim();
    if (!name) { setError('模块名称不能为空'); return; }
    if (modal.editId) {
      setModules(ms => ms.map(m => m.id === modal.editId
        ? { ...m, name, category: form.category, note: form.note.trim() }
        : m));
    } else {
      setModules(ms => [...ms, {
        id: uid('m'), name, category: form.category, note: form.note.trim(),
        archived: false, createdAt: new Date().toISOString(),
      }]);
    }
    closeModal();
  }
  function removeModule(mod) {
    if (!window.confirm(`确定删除模块「${mod.name}」？该模块下的所有款项也将一并删除。`)) return;
    setModules(ms => ms.filter(m => m.id !== mod.id));
    setItems(is => is.filter(i => i.moduleId !== mod.id));
    setExpandedIds(prev => {
      if (!prev.has(mod.id)) return prev;
      const next = new Set(prev);
      next.delete(mod.id);
      return next;
    });
  }

  // ---------- 款项 CRUD ----------
  function saveItem() {
    const name = form.name.trim();
    const amount = Number(form.amount);
    if (!name) { setError('款项名称不能为空'); return; }
    if (form.amount === '' || Number.isNaN(amount) || amount < 0) { setError('金额需为不小于 0 的数字'); return; }
    const nowIso = new Date().toISOString();
    if (modal.editId) {
      setItems(is => is.map(i => i.id === modal.editId
        ? { ...i, name, amount, direction: form.direction, note: form.note.trim(), updatedAt: nowIso }
        : i));
    } else {
      setItems(is => [...is, {
        id: uid('i'), moduleId: modal.moduleId, name, amount,
        direction: form.direction, note: form.note.trim(),
        createdAt: nowIso, updatedAt: nowIso,
      }]);
    }
    closeModal();
  }
  function removeItem(it) {
    if (!window.confirm(`确定删除款项「${it.name}」？`)) return;
    setItems(is => is.filter(i => i.id !== it.id));
  }

  // ---------- 款项排序：全局 items 数组内 arrayMove（仅限同一模块） ----------
  function moveItem(activeItemId, overId) {
    if (!activeItemId || !overId || activeItemId === overId) return;
    setItems(is => {
      const from = is.findIndex(i => i.id === activeItemId);
      const to = is.findIndex(i => i.id === overId);
      if (from < 0 || to < 0 || from === to) return is;
      if (is[from].moduleId !== is[to].moduleId) return is; // 跨模块拖拽直接忽略
      return arrayMove(is, from, to);
    });
  }
  // ---------- 模块卡排序：modules 数组内 arrayMove ----------
  function moveModule(a, o) {
    if (!a || !o || a === o) return;
    setModules(ms => {
      const from = ms.findIndex(m => m.id === a);
      const to = ms.findIndex(m => m.id === o);
      if (from < 0 || to < 0 || from === to) return ms;
      return arrayMove(ms, from, to);
    });
  }

  // ---------- 拖拽基建（magpie：同层碰撞 + 确定性键盘导航，三层各自成"层"） ----------
  const moduleIds = modules.map(m => m.id);
  const isPageId = (id) => pageIds.includes(id);
  const isModuleId = (id) => moduleIds.includes(id);
  const moduleIdOf = (id) => items.find(i => i.id === id)?.moduleId;
  const levelKeyOf = (id) =>
    isPageId(id) ? 'page' : isModuleId(id) ? 'modlist' : `mod:${moduleIdOf(id)}`;
  const collision = makeSameLevelCollision(levelKeyOf);
  const keyboardCoord = (event, ctx) => {
    const r = makeSameLevelKeyboard(id => {
      if (isPageId(id)) return pageIds;
      if (isModuleId(id)) return moduleIds;
      const mid = moduleIdOf(id);
      return mid ? items.filter(i => i.moduleId === mid).map(i => i.id) : [];
    })(event, ctx);
    if (r && ctx.currentCoordinates
        && (Math.abs(r.x - ctx.currentCoordinates.x) > 0.5 || Math.abs(r.y - ctx.currentCoordinates.y) > 0.5)) {
      kbdMovedRef.current = true;
    }
    return r;
  };
  // 传感器沿用 magpie 统一配置（指针位移 5px 激活），仅把键盘坐标换成"同层确定性落点"：
  // dnd-kit 的 coordinateGetter 只能随 KeyboardSensor 描述符注入（DndContext 无独立 keyboard 属性），
  // 故在 useMagpieSensors() 基础上重建键盘描述符。
  const dndSensors = useSensors(
    ...useMagpieSensors().filter(d => d.sensor !== KeyboardSensor),
    useSensor(KeyboardSensor, { coordinateGetter: keyboardCoord }),
  );

  // 拖拽调度：按 active 所属层分发（页面卡片 / 模块卡 / 款项）。
  // 三层都是同层排序（款项跨模块本就被忽略，无跨容器 live 需求），落位统一在
  // onDragEnd 一次性提交 —— live arrayMove 会让同层上拖来回震荡（预览闪烁），
  // 拖动过程中的让位由 SortableContext 的 transform 预览完成。
  const dispatchMove = (a, o) => {
    if (!a || !o || a === o) return;
    if (isPageId(a)) setPageOrder(prev => moveByIds(prev, a, o));
    else if (isModuleId(a)) moveModule(a, o);
    else moveItem(a, o);
  };

  const activeItem = activeId ? items.find(i => i.id === activeId) : null;
  const activeModule = !activeItem && activeId ? modules.find(m => m.id === activeId) : null;
  const activeModBal = activeModule ? moduleBalance(activeModule.id, items) : 0;

  // ---------- 渲染 ----------
  const netClass = totals.netWorth >= 0 ? 'pos' : 'neg';

  return (
    <div>
      <div className="page-title">资产管家</div>
      <div className="page-sub">管理账户模块与使用款项：金额填正数，方向区分资产/负债</div>

      <DndContext
        sensors={dndSensors}
        collisionDetection={collision}
        onDragStart={(e) => {
          setActiveId(String(e.active.id));
          setKbdDrag(e.activatorEvent instanceof KeyboardEvent);
          kbdMovedRef.current = false;
        }}
        onDragEnd={(e) => {
          // 指针拖拽直接提交；键盘拖拽需实际按过方向键（有位移）才提交
          const isKbd = e.activatorEvent instanceof KeyboardEvent;
          if (!isKbd || kbdMovedRef.current) dispatchMove(String(e.active.id), e.over && String(e.over.id));
          setActiveId(null);
          setKbdDrag(false);
        }}
        onDragCancel={() => { setActiveId(null); setKbdDrag(false); }}
      >
        <SortableContext items={pageIds} strategy={verticalListSortingStrategy}>
          {/* 页面卡片按持久化顺序渲染：汇总条（无标题，把手固定左上角）/ 资产模块区 */}
          {pageIds.map((pageId) => pageId === 'summary' ? (
            <SortableCard key="summary" id="summary" corner gripLabel="拖动排序此卡片">
              <div className="grid grid-3">
                <div className="stat">
                  <div className="stat-label">总资产</div>
                  <div className="stat-value pos">{fmtMoney(totals.totalAsset)}</div>
                </div>
                <div className="stat">
                  <div className="stat-label">总负债</div>
                  <div className="stat-value neg">{fmtMoney(totals.totalLiability)}</div>
                </div>
                <div className="stat">
                  <div className="stat-label">净资产</div>
                  <div className={`stat-value ${netClass}`}>{fmtMoney(totals.netWorth)}</div>
                </div>
              </div>
            </SortableCard>
          ) : (
            <SortableCard key="mods" id="mods" gripLabel="拖动排序此卡片">
              {(grip) => (
                <>
                  <div className="card-title">
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {grip}
                      <span>资产模块（{modules.length}）</span>
                    </span>
                    {/* 一键展开/收起所有模块的款项明细 */}
                    <span style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-sm" onClick={() => setExpandedIds(() => new Set(modules.map(m => m.id)))} disabled={!modules.length} title="展开所有模块的款项明细">全部展开</button>
                      <button className="btn btn-sm" onClick={() => setExpandedIds(() => new Set())} disabled={!modules.length} title="收起所有模块的款项明细">全部收起</button>
                      <button className="btn btn-sm btn-primary" onClick={() => openModuleModal(null)}>＋ 新增模块</button>
                    </span>
                  </div>

                  {modules.length === 0 ? (
                    <div className="empty">暂无模块，点击右上角「新增模块」开始建立你的账户容器</div>
                  ) : (
                    <SortableContext items={moduleIds} strategy={rectSortingStrategy}>
                      <div className="am-grid">
                        {modules.map(mod => (
                          <ModuleBlock key={mod.id} mod={mod} items={items}
                                       expanded={expandedIds.has(mod.id)} onToggle={toggleBlock}
                                       onEditModule={openModuleModal} onRemoveModule={removeModule}
                                       onAddItem={() => openItemModal(null, mod.id)}
                                       onEditItem={(x) => openItemModal(x.id, mod.id)}
                                       onDeleteItem={removeItem} />
                        ))}
                      </div>
                    </SortableContext>
                  )}

                  <div className="hint">
                    提示：点击模块卡头部可展开/收起款项明细，顶部按钮可一键展开/收起全部（展开状态会记忆，切页/刷新后保持）；页面卡片、模块卡、款项均可拖左上把手排序。
                    负债款项金额填正数、方向选「负债」。
                  </div>
                </>
              )}
            </SortableCard>
          ))}
        </SortableContext>

        {/* 拖拽浮层：款项/模块克隆（页面卡片走本体位移，无浮层） */}
        <DragOverlay dropAnimation={SPRING_DROP}>
          {activeItem ? (
            <div className="am-overlay">
              <span className="wb-grip is-grabbing">⠿</span>
              <span className="am-item-name">{activeItem.name}</span>
              <span className={`amount ${activeItem.direction === 'asset' ? 'pos' : 'neg'}`}>
                {fmtMoney(activeItem.amount)}
              </span>
            </div>
          ) : activeModule ? (
            <div className="am-overlay">
              <span className="wb-grip is-grabbing">⠿</span>
              <span className="am-item-name">{activeModule.name}</span>
              <span className={`tag tag-${activeModule.category}`}>
                {CATEGORY_MAP[activeModule.category] ? CATEGORY_MAP[activeModule.category].name : activeModule.category}
              </span>
              <span className="tag">{items.filter(i => i.moduleId === activeModule.id).length} 款项</span>
              <span className={`amount ${activeModBal >= 0 ? 'pos' : 'neg'}`}>{fmtMoney(activeModBal)}</span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* 弹窗：新增/编辑 模块 或 款项 */}
      {modal && (
        <div className="modal-mask" onClick={closeModal}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">
              {modal.kind === 'module'
                ? (modal.editId ? '编辑模块' : '新增模块')
                : (modal.editId ? '编辑款项' : '添加款项')}
            </div>

            {modal.kind === 'module' ? (
              <>
                <div className="field">
                  <label>模块名称 *</label>
                  <input className="input" value={form.name} placeholder="如：现金/银行卡"
                         onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                </div>
                <div className="field">
                  <label>分类</label>
                  <select className="select" value={form.category}
                          onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                    {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.name}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>备注</label>
                  <input className="input" value={form.note} placeholder="可空"
                         onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
                </div>
              </>
            ) : (
              <>
                <div className="field">
                  <label>款项名称 *</label>
                  <input className="input" value={form.name} placeholder="如：账单待还"
                         onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                </div>
                <div className="field">
                  <label>金额（元，正数）*</label>
                  <input className="input" type="number" min="0" step="0.01" value={form.amount}
                         placeholder="0.00"
                         onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
                </div>
                <div className="field">
                  <label>方向</label>
                  <div className="segmented">
                    <button className={form.direction === 'asset' ? 'active' : ''}
                            onClick={() => setForm(f => ({ ...f, direction: 'asset' }))}>资产</button>
                    <button className={form.direction === 'liability' ? 'active' : ''}
                            onClick={() => setForm(f => ({ ...f, direction: 'liability' }))}>负债</button>
                  </div>
                </div>
                <div className="field">
                  <label>备注</label>
                  <input className="input" value={form.note} placeholder="可空"
                         onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
                </div>
              </>
            )}

            {error && <div className="delta-down">{error}</div>}

            <div className="modal-actions">
              <button className="btn" onClick={closeModal}>取消</button>
              <button className="btn btn-primary"
                      onClick={() => (modal.kind === 'module' ? saveModule() : saveItem())}>保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
