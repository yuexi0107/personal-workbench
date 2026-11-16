// 投递追踪看板：6+2 状态流转（看板 + 列表两种视图），数据存 KEYS.pipeline
import React, { useMemo, useState } from 'react'
import { useLocalState, KEYS } from '../store.js'

const genId = () => Date.now() + '-' + Math.random().toString(36).slice(2, 7)

// 主流程 7 态 + 终止态
const TRACK = ['待投递', '已投递', '笔试/初筛', '一面', '二面', 'HR面', 'Offer']
const TERMINAL = '已拒绝/流程终止'
const ALL_STATUS = [...TRACK, TERMINAL]

const STATUS_META = {
  待投递: { tag: '', round: 0 },
  已投递: { tag: 'primary', round: 0 },
  '笔试/初筛': { tag: 'purple', round: 1 },
  一面: { tag: 'orange', round: 2 },
  二面: { tag: 'orange', round: 3 },
  HR面: { tag: 'orange', round: 4 },
  Offer: { tag: 'green', round: 5 },
  [TERMINAL]: { tag: 'red', round: 0 }
}

const COLUMN_STYLE = {
  Offer: { head: 'var(--green)', bg: 'var(--green-soft)' },
  [TERMINAL]: { head: 'var(--red)', bg: 'var(--red-soft)' }
}

function nextStatus(s) {
  if (s === TERMINAL) return TRACK[0]
  const i = TRACK.indexOf(s)
  if (i < 0 || i >= TRACK.length - 1) return null
  return TRACK[i + 1]
}
function prevStatus(s) {
  if (s === TERMINAL) return null
  const i = TRACK.indexOf(s)
  return i > 0 ? TRACK[i - 1] : null
}

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function weekStartStr() {
  const d = new Date()
  const day = (d.getDay() + 6) % 7 // 周一为一周起点
  d.setDate(d.getDate() - day)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function fmtTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const EMPTY_FORM = { company: '', role: '', link: '', status: TRACK[0], nextDate: '', notes: '' }

export default function Pipeline() {
  const [items, setItems] = useLocalState(KEYS.pipeline, [])
  const [view, setView] = useState('board') // board | list
  const [kw, setKw] = useState('')
  const [form, setForm] = useState(null) // null | {..fields, id?}
  const [dragId, setDragId] = useState(null)
  const [dragOver, setDragOver] = useState(null)

  const filtered = useMemo(() => {
    const k = kw.trim().toLowerCase()
    if (!k) return items
    return items.filter((it) => `${it.company || ''} ${it.role || ''}`.toLowerCase().includes(k))
  }, [items, kw])

  const stats = useMemo(() => {
    const weekStart = weekStartStr()
    const inProgress = items.filter((it) => it.status !== 'Offer' && it.status !== TERMINAL).length
    const weekNew = items.filter((it) => (it.updatedAt || '').slice(0, 10) >= weekStart && TRACK.indexOf(it.status) >= 1).length
    const offers = items.filter((it) => it.status === 'Offer').length
    const reached = items.filter((it) => (it.round || 0) > 0)
    const avgRound = reached.length ? (reached.reduce((s, it) => s + it.round, 0) / reached.length).toFixed(1) : '0.0'
    return { inProgress, weekNew, offers, avgRound }
  }, [items])

  const overdue = useMemo(() => {
    const t = todayStr()
    return filtered.filter((it) => it.nextDate && it.nextDate < t && it.status !== 'Offer' && it.status !== TERMINAL)
  }, [filtered])

  const save = (draft) => {
    const now = new Date().toISOString()
    const round = Math.max(draft.round || 0, STATUS_META[draft.status]?.round || 0)
    setItems((prev) => {
      if (draft.id) return prev.map((it) => (it.id === draft.id ? { ...it, ...draft, round, updatedAt: now } : it))
      return [{ ...draft, id: genId(), round, updatedAt: now }, ...prev]
    })
  }

  const moveTo = (id, status) => {
    setItems((prev) => prev.map((it) => (it.id === id
      ? { ...it, status, round: Math.max(it.round || 0, STATUS_META[status]?.round || 0), updatedAt: new Date().toISOString() }
      : it)))
  }

  const remove = (it) => {
    if (!window.confirm(`确定删除「${it.company} · ${it.role}」这条投递记录？`)) return
    setItems((prev) => prev.filter((x) => x.id !== it.id))
  }

  const openAdd = () => setForm({ ...EMPTY_FORM })
  const openEdit = (it) => setForm({ ...it })

  const onDrop = (status) => (e) => {
    e.preventDefault()
    const id = dragId || e.dataTransfer.getData('text/plain')
    setDragId(null)
    setDragOver(null)
    if (!id) return
    const it = items.find((x) => x.id === id)
    if (!it || it.status === status) return
    moveTo(id, status)
  }

  const renderCard = (it) => {
    const meta = STATUS_META[it.status] || { tag: '' }
    const nf = nextStatus(it.status)
    const pf = prevStatus(it.status)
    const overdueIt = it.nextDate && it.nextDate < todayStr() && it.status !== 'Offer' && it.status !== TERMINAL
    return (
      <div
        key={it.id}
        draggable
        onDragStart={(e) => { setDragId(it.id); e.dataTransfer.setData('text/plain', it.id); e.dataTransfer.effectAllowed = 'move' }}
        onDragEnd={() => { setDragId(null); setDragOver(null) }}
        className="list-item"
        style={{ marginBottom: 0, cursor: 'grab', borderLeft: `3px solid ${overdueIt ? 'var(--orange)' : 'var(--border)'}` }}
      >
        <div style={{ fontWeight: 700, lineHeight: 1.4 }}>{it.company}</div>
        <div className="muted" style={{ marginBottom: 6 }}>{it.role}</div>
        <div className="row" style={{ gap: 4, marginBottom: 6 }}>
          <span className={`tag ${meta.tag}`}>{it.status}</span>
          {it.round > 0 && <span className="tag">第 {it.round} 轮</span>}
        </div>
        {it.nextDate && (
          <div style={{ fontSize: '0.78rem', color: overdueIt ? 'var(--orange)' : 'var(--text-2)', marginBottom: 4 }}>
            ⏰ 下一步：{it.nextDate}{overdueIt ? '（已过期）' : ''}
          </div>
        )}
        {it.link && (
          <a href={it.link} target="_blank" rel="noreferrer" style={{ fontSize: '0.76rem', color: 'var(--primary)', display: 'inline-block', marginBottom: 4 }}>
            投递链接 ↗
          </a>
        )}
        {it.notes && (
          <div className="muted" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5, marginBottom: 4, maxHeight: 60, overflow: 'hidden' }}>
            {it.notes}
          </div>
        )}
        <div className="muted" style={{ marginBottom: 8 }}>更新于 {fmtTime(it.updatedAt)}</div>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn btn-sm" disabled={!pf} onClick={() => moveTo(it.id, pf)} title="后退到上一状态">←</button>
          <button className="btn btn-sm btn-primary" disabled={!nf} onClick={() => moveTo(it.id, nf)}>
            {it.status === TERMINAL ? '重新投递' : nf ? `推进到 ${nf}` : '已是最终态'}
          </button>
          {it.status !== TERMINAL && it.status !== 'Offer' && (
            <button className="btn btn-sm btn-danger" onClick={() => moveTo(it.id, TERMINAL)}>终止</button>
          )}
          <div className="spacer" />
          <button className="btn btn-sm btn-ghost" onClick={() => openEdit(it)}>编辑</button>
          <button className="btn btn-sm btn-ghost" onClick={() => remove(it)}>删除</button>
        </div>
      </div>
    )
  }

  return (
    <div className="module">
      {/* 顶部统计 */}
      <div className="card">
        <div className="row">
          <div><div className="stat-num">{stats.inProgress}</div><div className="stat-label">进行中流程</div></div>
          <div style={{ width: 1, background: 'var(--border)', margin: '0 8px' }} />
          <div><div className="stat-num">{stats.weekNew}</div><div className="stat-label">本周新增投递</div></div>
          <div style={{ width: 1, background: 'var(--border)', margin: '0 8px' }} />
          <div><div className="stat-num">{stats.offers}</div><div className="stat-label">拿到 Offer</div></div>
          <div style={{ width: 1, background: 'var(--border)', margin: '0 8px' }} />
          <div><div className="stat-num">{stats.avgRound}</div><div className="stat-label">平均面试轮次</div></div>
          <div className="spacer" />
          <div className="segmented">
            <button className={view === 'board' ? 'active' : ''} onClick={() => setView('board')}>看板</button>
            <button className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}>列表</button>
          </div>
          <button className="btn btn-primary" onClick={openAdd}>＋ 新增投递</button>
        </div>
      </div>

      {/* 搜索 + 过期提醒 */}
      <div className="card">
        <div className="row">
          <input
            className="input"
            style={{ flex: 1, minWidth: 200 }}
            placeholder="搜索公司 / 岗位…"
            value={kw}
            onChange={(e) => setKw(e.target.value)}
          />
          <span className="muted">共 {filtered.length} 条 / 全部 {items.length} 条</span>
        </div>
        <div className="muted" style={{ marginTop: 8 }}>
          状态流转：待投递 → 已投递 → 笔试/初筛 → 一面 → 二面 → HR面 → Offer（另有 已拒绝/流程终止）。可直接拖动卡片到任意列。
        </div>
        {overdue.length > 0 && (
          <div className="alert warn" style={{ marginTop: 12, marginBottom: 0 }}>
            ⚠ 有 {overdue.length} 条流程的“下一步日期”已过期：
            {overdue.slice(0, 5).map((it) => ` ${it.company}(${it.nextDate})`).join('、')}
            {overdue.length > 5 ? ' 等' : ''}，建议尽快跟进或更新状态。
          </div>
        )}
      </div>

      {items.length === 0 && (
        <div className="empty">
          <div className="empty-icon">📈</div>
          还没有投递记录，点击「新增投递」开始追踪你的面试流程
        </div>
      )}

      {/* 看板视图 */}
      {items.length > 0 && view === 'board' && (
        <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 12, alignItems: 'flex-start' }}>
          {ALL_STATUS.map((status) => {
            const list = filtered.filter((it) => it.status === status)
            const col = COLUMN_STYLE[status]
            const isOver = dragOver === status && dragId
            return (
              <div
                key={status}
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (dragOver !== status) setDragOver(status) }}
                onDragLeave={() => setDragOver((s) => (s === status ? null : s))}
                onDrop={onDrop(status)}
                style={{
                  minWidth: 220,
                  width: 240,
                  flexShrink: 0,
                  background: isOver ? 'var(--primary-soft)' : (col ? col.bg : 'var(--panel-2)'),
                  border: `1px solid ${isOver ? 'var(--primary)' : (col ? col.head : 'var(--border)')}`,
                  borderRadius: 'var(--radius)',
                  padding: 10,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  transition: 'background 0.15s, border-color 0.15s'
                }}
              >
                <div className="row" style={{ gap: 6 }}>
                  <span style={{ fontWeight: 700, fontSize: '0.86rem', color: col ? col.head : 'var(--text)' }}>{status}</span>
                  <span className="tag" style={{ marginLeft: 'auto' }}>{list.length}</span>
                </div>
                <div style={{ height: 3, borderRadius: 999, background: col ? col.head : 'var(--border)' }} />
                {list.length === 0 ? (
                  <div className="muted" style={{ textAlign: 'center', padding: '18px 0' }}>拖拽到此列</div>
                ) : list.map((it) => renderCard(it))}
              </div>
            )
          })}
        </div>
      )}

      {/* 列表视图 */}
      {items.length > 0 && view === 'list' && (
        <div>
          {filtered.length === 0 && (
            <div className="empty">
              <div className="empty-icon">🔍</div>
              没有匹配「{kw}」的投递记录
            </div>
          )}
          {filtered.map((it) => {
            const meta = STATUS_META[it.status] || { tag: '' }
            const nf = nextStatus(it.status)
            const pf = prevStatus(it.status)
            const overdueIt = it.nextDate && it.nextDate < todayStr() && it.status !== 'Offer' && it.status !== TERMINAL
            return (
              <div key={it.id} className="list-item">
                <div className="row" style={{ alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <div style={{ fontWeight: 700 }}>
                      {it.company}
                      <span className="muted" style={{ marginLeft: 8, fontWeight: 400 }}>{it.role}</span>
                    </div>
                    <div className="muted" style={{ marginTop: 6 }}>
                      更新于 {fmtTime(it.updatedAt) || '—'}
                      {it.nextDate ? ` · 下一步 ${it.nextDate}` : ''}
                    </div>
                  </div>
                  <div style={{ flex: 2, minWidth: 260 }}>
                    <div className="row" style={{ gap: 6 }}>
                      <span className={`tag ${meta.tag}`}>{it.status}</span>
                      <span className="tag">轮次 {it.round || 0}</span>
                      {it.nextDate && <span className={`tag ${overdueIt ? 'orange' : ''}`}>⏰ {it.nextDate}{overdueIt ? ' 已过期' : ''}</span>}
                      {it.link && <a href={it.link} target="_blank" rel="noreferrer" className="tag primary">投递链接 ↗</a>}
                    </div>
                    {it.notes && (
                      <div className="muted" style={{ marginTop: 6, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                        备注：{it.notes}
                      </div>
                    )}
                  </div>
                  <div className="row" style={{ gap: 6, flexShrink: 0 }}>
                    <button className="btn btn-sm" disabled={!pf} onClick={() => moveTo(it.id, pf)} title="后退">←</button>
                    <button className="btn btn-sm btn-primary" disabled={!nf} onClick={() => moveTo(it.id, nf)}>
                      {it.status === TERMINAL ? '重新投递' : nf ? `→ ${nf}` : '终态'}
                    </button>
                    {it.status !== TERMINAL && it.status !== 'Offer' && (
                      <button className="btn btn-sm btn-danger" onClick={() => moveTo(it.id, TERMINAL)}>终止</button>
                    )}
                    <button className="btn btn-sm" onClick={() => openEdit(it)}>编辑</button>
                    <button className="btn btn-sm btn-ghost" onClick={() => remove(it)}>删除</button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* 新增 / 编辑弹窗 */}
      {form && (
        <div className="modal-mask" onClick={() => setForm(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="row">
              <h3 className="modal-title" style={{ margin: 0 }}>{form.id ? '编辑投递' : '新增投递'}</h3>
              <div className="spacer" />
              <button className="btn btn-sm btn-ghost" onClick={() => setForm(null)}>✕</button>
            </div>
            <div className="col" style={{ marginTop: 14 }}>
              <div className="field">
                <label>公司 *</label>
                <input
                  className="input"
                  placeholder="如：字节跳动"
                  value={form.company}
                  onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
                />
              </div>
              <div className="field">
                <label>岗位 *</label>
                <input
                  className="input"
                  placeholder="如：前端开发工程师"
                  value={form.role}
                  onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                />
              </div>
              <div className="field">
                <label>内推 / 官网链接</label>
                <input
                  className="input"
                  placeholder="https://…"
                  value={form.link}
                  onChange={(e) => setForm((f) => ({ ...f, link: e.target.value }))}
                />
              </div>
              <div className="row" style={{ alignItems: 'stretch', gap: 12 }}>
                <div className="field" style={{ flex: 1, minWidth: 160 }}>
                  <label>当前状态</label>
                  <select
                    className="select"
                    value={form.status}
                    onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                  >
                    {ALL_STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="field" style={{ flex: 1, minWidth: 160 }}>
                  <label>下一节点日期</label>
                  <input
                    type="date"
                    className="input"
                    value={form.nextDate}
                    onChange={(e) => setForm((f) => ({ ...f, nextDate: e.target.value }))}
                  />
                </div>
              </div>
              <div className="field">
                <label>备注（HR 联系方式、面试官反馈、复习重点等）</label>
                <textarea
                  className="textarea"
                  style={{ minHeight: 90 }}
                  placeholder="记录流程细节…"
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </div>
            </div>
            <div className="row" style={{ marginTop: 16 }}>
              {form.id ? (
                <button className="btn btn-danger" onClick={() => { remove(form); setForm(null) }}>删除</button>
              ) : (
                <span className="muted">全部数据只存在你的浏览器 localStorage</span>
              )}
              <div className="spacer" />
              <button className="btn" onClick={() => setForm(null)}>取消</button>
              <button
                className="btn btn-primary"
                disabled={!form.company.trim() || !form.role.trim()}
                onClick={() => {
                  save({
                    ...form,
                    company: form.company.trim(),
                    role: form.role.trim(),
                    link: form.link.trim(),
                    notes: form.notes
                  })
                  setForm(null)
                }}
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
