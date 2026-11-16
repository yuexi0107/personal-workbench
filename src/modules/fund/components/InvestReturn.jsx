// 投资收益面板：腾讯理财通无公开 API，本模块为"收益展示面板"，
// 数据手动维护，source 字段预留 'csv' | 'ocr' | 'api' 自动接入能力。
// 页面分区接入 DragGrid（stack 堆叠布局），与数据看板/日常记账同一套交互：
// 分区可拖动排序、隐藏、在恢复条中恢复；新增/编辑弹窗保留在页面级。
import React, { useMemo, useState } from 'react';
import { investmentDerived, uid, fmtMoney, r2 } from '../store.js';
import DragGrid from '../../../widgets/DragGrid.jsx';
import { useDragLayout, pageLayoutKey } from '../../../app/store.js';

// 来源标签配置：licaitong/manual 为当前可用项；csv/ocr/api 为预留自动接入来源
const SOURCE_MAP = {
  licaitong: { label: '理财通', cls: 'tag tag-invest' },
  manual:    { label: '手动',   cls: 'tag' },
  csv:       { label: '导入',   cls: 'tag' },
  ocr:       { label: '识别',   cls: 'tag' },
  api:       { label: '同步',   cls: 'tag' },
};

// 弹窗初始表单（rate 以百分数字面量暂存，如 2.35 表示 2.35%，保存时除以 100）
const EMPTY_FORM = { name: '', source: 'licaitong', principal: '', currentValue: '', rate: '', note: '' };

function openFormOf(inv) {
  return {
    name: inv.name || '',
    source: SOURCE_MAP[inv.source] ? inv.source : 'manual',
    principal: inv.principal != null ? String(inv.principal) : '',
    currentValue: inv.currentValue != null ? String(inv.currentValue) : '',
    rate: inv.rate != null ? String(r2(inv.rate * 100)) : '',
    note: inv.note || '',
  };
}

const HINT = '理财通无公开接口，市值请定期手动更新；粘贴导入/自动同步为预留能力(source 字段已支持 csv/ocr/api)。';

/* ---------- 分区：收益总览 ---------- */
function SummarySection({ totals }) {
  return (
    <div>
      <div className="grid grid-4">
        <div className="stat">
          <div className="stat-label">总市值</div>
          <div className="stat-value">{fmtMoney(totals.value)}</div>
        </div>
        <div className="stat">
          <div className="stat-label">总本金</div>
          <div className="stat-value">{fmtMoney(totals.principal)}</div>
        </div>
        <div className="stat">
          <div className="stat-label">累计收益</div>
          <div className={`stat-value ${totals.totalReturn >= 0 ? 'pos' : 'neg'}`}>
            {totals.totalReturn >= 0 ? '+' : ''}{fmtMoney(totals.totalReturn)}
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">估算日收益</div>
          <div className={`stat-value ${totals.daily >= 0 ? 'pos' : 'neg'}`}>{fmtMoney(totals.daily)}</div>
          <div className="stat-extra">按各款预期年化折算</div>
        </div>
      </div>
      <div className="hint">{HINT}</div>
    </div>
  );
}

/* ---------- 分区：持仓明细 ---------- */
function HoldingsSection({ rows, onEdit, onRemove }) {
  if (rows.length === 0) {
    return <div className="empty">还没有投资款项，点右上角添加第一笔</div>;
  }
  return (
    <div>
      {rows.map(({ inv, d }) => {
        const src = SOURCE_MAP[inv.source] || SOURCE_MAP.manual;
        return (
          <div key={inv.id} className="list-row">
            <div className="list-main">
              <div className="list-name">
                {inv.name}
                <span className={src.cls}>{src.label}</span>
              </div>
              <div className="list-note">
                {inv.note ? inv.note : `更新于 ${(inv.updatedAt || '').slice(0, 10) || '—'}`}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <span className="stat-extra">市值 <span className="amount">{fmtMoney(d.value)}</span></span>
              <span className="stat-extra">本金 <span className="amount">{fmtMoney(inv.principal)}</span></span>
              <span className={`delta-${d.returnRate >= 0 ? 'up' : 'down'}`}>
                收益率 {d.returnRate >= 0 ? '+' : ''}{d.returnRate}%
              </span>
              <span className={`delta-${d.daily >= 0 ? 'up' : 'down'}`}>
                日收益 {d.daily >= 0 ? '+' : ''}{fmtMoney(d.daily)}
              </span>
              <span style={{ display: 'inline-flex', gap: 6 }}>
                <button className="btn btn-sm" onClick={() => onEdit(inv)}>编辑</button>
                <button className="btn btn-sm btn-danger" onClick={() => onRemove(inv)}>删除</button>
              </span>
            </div>
          </div>
        );
      })}
      <div className="hint">{HINT}</div>
    </div>
  );
}

export default function InvestReturn({ investments, setInvestments }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');

  // 派生各行收益，汇总一次算好复用
  const rows = useMemo(
    () => (investments || []).map(inv => ({ inv, d: investmentDerived(inv) })),
    [investments]
  );

  const totals = useMemo(() => {
    let value = 0, principal = 0, totalReturn = 0, daily = 0;
    for (const { d, inv } of rows) {
      value += d.value;
      principal += Number(inv.principal || 0);
      totalReturn += d.totalReturn;
      daily += d.daily;
    }
    return { value: r2(value), principal: r2(principal), totalReturn: r2(totalReturn), daily: r2(daily) };
  }, [rows]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const openAdd = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError('');
    setModalOpen(true);
  };

  const openEdit = (inv) => {
    setEditingId(inv.id);
    setForm(openFormOf(inv));
    setError('');
    setModalOpen(true);
  };

  const close = () => { setModalOpen(false); setEditingId(null); setForm(EMPTY_FORM); setError(''); };

  const save = () => {
    const name = form.name.trim();
    const principal = Number(form.principal);
    if (!name) { setError('请填写投资款项名称'); return; }
    if (!(principal > 0)) { setError('本金必须为大于 0 的数字'); return; }
    const ratePct = Number(form.rate || 0);
    if (form.rate !== '' && !Number.isFinite(ratePct)) { setError('预期年化需为数字'); return; }
    // 当前市值：留空 = null（按预期年化估算）
    const cvRaw = form.currentValue.trim();
    const currentValue = cvRaw === '' ? null : Number(cvRaw);
    if (currentValue !== null && !Number.isFinite(currentValue)) { setError('当前市值需为数字或留空'); return; }

    const next = {
      name,
      source: form.source,
      principal: r2(principal),
      currentValue: currentValue === null ? null : r2(currentValue),
      rate: r2((Number(form.rate) || 0) / 100), // 2.35(%) → 0.0235(小数)
      note: form.note.trim(),
      updatedAt: new Date().toISOString(),
    };

    if (editingId) {
      setInvestments(list => list.map(inv => (inv.id === editingId ? { ...inv, ...next } : inv)));
    } else {
      setInvestments(list => [{ id: uid('v'), ...next }, ...list]);
    }
    close();
  };

  const remove = (inv) => {
    if (window.confirm(`确定删除「${inv.name}」这条投资款项吗？删除后收益记录将不可恢复。`)) {
      setInvestments(list => list.filter(x => x.id !== inv.id));
    }
  };

  // 可拖拽分区注册表：排序/显隐经 useDragLayout 持久化
  const SECTIONS = [
    { id: 'summary', title: '收益总览', icon: '💹', el: SummarySection, props: { totals } },
    {
      id: 'holdings', title: `持仓明细（${(investments || []).length} 笔）`, icon: '📋',
      el: HoldingsSection, props: { rows, onEdit: openEdit, onRemove: remove },
      extra: <button className="btn btn-primary btn-sm" onClick={openAdd}>＋ 添加投资款</button>
    },
  ];

  const { order, hidden, setOrder, hide, show, reset } = useDragLayout(
    pageLayoutKey('fund-invest'),
    SECTIONS.map((s) => s.id)
  );

  return (
    <div>
      <div className="row wb-page-head">
        <div>
          <h1 className="page-title">投资收益</h1>
          <p className="page-sub">
            理财通等投资款项的收益展示面板：手动维护当前市值，自动计算累计收益、收益率与估算日收益 · 拖动分区卡头部 ⠿ 可排序
          </p>
        </div>
        <span className="spacer" />
        <button className="btn btn-sm" onClick={reset} title="恢复默认分区顺序与可见性">↺ 恢复默认布局</button>
      </div>

      <DragGrid
        widgets={SECTIONS}
        order={order}
        hidden={hidden}
        onOrderChange={setOrder}
        onHide={hide}
        onRestore={show}
        layout="stack"
        emptyAction={<button className="btn btn-primary" onClick={reset}>恢复默认布局</button>}
      />

      {/* 新增/编辑弹窗 */}
      {modalOpen && (
        <div className="modal-mask" onClick={close}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{editingId ? '编辑投资款项' : '新增投资款项'}</div>

            <div className="field">
              <label>名称</label>
              <input className="input" value={form.name} placeholder="如：理财通-活期+"
                onChange={e => set('name', e.target.value)} />
            </div>

            <div className="field">
              <label>来源</label>
              <div className="segmented">
                <button type="button" className={form.source === 'licaitong' ? 'active' : ''}
                  onClick={() => set('source', 'licaitong')}>理财通</button>
                <button type="button" className={form.source === 'manual' ? 'active' : ''}
                  onClick={() => set('source', 'manual')}>手动</button>
              </div>
              <div className="hint">csv/ocr/api 为预留自动接入来源，暂不开放选择。</div>
            </div>

            <div className="field">
              <label>本金（元）</label>
              <input className="input" type="number" min="0" step="0.01" value={form.principal}
                placeholder="大于 0 的数字" onChange={e => set('principal', e.target.value)} />
            </div>

            <div className="field">
              <label>当前市值（元）</label>
              <input className="input" type="number" step="0.01" value={form.currentValue}
                placeholder="留空则按预期年化估算" onChange={e => set('currentValue', e.target.value)} />
            </div>

            <div className="field">
              <label>预期年化（%）</label>
              <input className="input" type="number" step="0.01" value={form.rate}
                placeholder="填 2.35 表示 2.35%" onChange={e => set('rate', e.target.value)} />
            </div>

            <div className="field">
              <label>备注</label>
              <textarea className="textarea" value={form.note} placeholder="选填"
                onChange={e => set('note', e.target.value)} />
            </div>

            {error && <div className="delta-down">{error}</div>}
            <div className="hint">{HINT}</div>

            <div className="modal-actions">
              <button className="btn" onClick={close}>取消</button>
              <button className="btn btn-primary" onClick={save}>保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
