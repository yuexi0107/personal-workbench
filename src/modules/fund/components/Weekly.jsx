// 记录对比页：任选基准/对比两期分析资金结构变化（默认以当前实时资金为基准对比所选快照），
// 保留周快照拍摄与快照记录列表，走势图支持 周/月/年 三种粒度切换
import React, { useEffect, useMemo, useState } from 'react';
import {
  takeSnapshot, trendSeries, currentWeekLabel, todayYMD,
  computeTotals, moduleBalance, pctChange, fmtMoney, r2,
  dedupeSnapshotsByWeek,
  KEYS, useLocalState,
} from '../store.js';
import { CATEGORIES } from '../data/data.js';
import Chart from './Chart.jsx';
import { SortableCards, SortableCard, moveByIds, normalizeOrder } from '../../../components/dnd/magpie.jsx';

/** takenAt ISO → 本地 'MM-DD HH:mm' */
function fmtTaken(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 差额展示：正绿负红（delta-up/delta-down） */
function Delta({ value }) {
  const v = r2(Number(value) || 0);
  if (v === 0) return <span className="delta-up">持平</span>;
  return (
    <span className={v > 0 ? 'delta-up' : 'delta-down'}>
      {v > 0 ? '▲ +' : '▼ '}{fmtMoney(v)}
    </span>
  );
}

/** 百分比文案：null（基准为 0 无法计算）时返回空串，否则渲染为（+x.x%） */
function pctText(p) {
  if (p == null) return '';
  return `（${p >= 0 ? '+' : ''}${Number(p).toFixed(1)}%）`;
}

// 走势图聚合粒度选项：[granularity, 按钮文字]
const GRANS = [['week', '周'], ['month', '月'], ['year', '年']];

// 页面卡片 id：本周快照 / 记录对比 / 走势分析 / 快照记录（顺序落盘 KEYS.weeklyOrder）
const WEEKLY_CARDS = ['snap', 'cmp', 'trend', 'log'];

export default function Weekly({ modules, items, snapshots, setSnapshots }) {
  const [expandedId, setExpandedId] = useState(null);
  const [gran, setGran] = useState('week');          // 走势粒度：week | month | year
  // 页面卡片顺序（把手拖拽，落盘 fp:weekly:order）
  const [cardOrder, setCardOrder] = useLocalState(KEYS.weeklyOrder, WEEKLY_CARDS);
  const cardIds = normalizeOrder(cardOrder, WEEKLY_CARDS);

  const week = currentWeekLabel();

  // 列表按拍摄时间倒序（同周多拍时最新 takenAt 在前）
  const sorted = useMemo(
    () => [...snapshots].sort((a, b) => String(b.takenAt).localeCompare(String(a.takenAt))),
    [snapshots],
  );

  const [baseId, setBaseId] = useState('current');         // 基准侧：'current'（实时）或快照 id
  const [cmpId, setCmpId] = useState(sorted[0]?.id ?? ''); // 对比侧：快照 id，默认最新一条

  // 本周已有几条快照（按周去重后恒为 0 或 1）
  const thisWeekCount = snapshots.filter(s => s.weekLabel === week).length;

  // 按周去重清洗存量数据：同周多条只保留最新一条（每周只记录最后一次改动），幂等
  useEffect(() => {
    const deduped = dedupeSnapshotsByWeek(snapshots);
    if (deduped.length !== snapshots.length) setSnapshots(deduped);
  }, [snapshots, setSnapshots]);

  // 拍快照（覆盖式）：本周已有快照时确认后替换，只保留当周最后一次改动
  const appendSnapshot = () => {
    const snap = takeSnapshot(modules, items);
    if (snapshots.some(s => s.weekLabel === snap.weekLabel)
        && !window.confirm('本周已有快照，重新拍摄将覆盖本周之前的记录（只保留最后一次），继续？')) return;
    setSnapshots(prev => [...prev.filter(s => s.weekLabel !== snap.weekLabel), snap]);
  };

  const removeSnapshot = (id) => {
    if (!window.confirm('确定删除这条快照吗？仅删除该条记录。')) return;
    setSnapshots(prev => prev.filter(s => s.id !== id));
  };

  // ---- 对比两侧各取哪条快照 ----
  // 基准：'current' 实时计算，或指定快照；所存 baseId 快照已被删除时回退为实时（null）
  const baseSnap = baseId === 'current' ? null : (snapshots.find(s => s.id === baseId) ?? null);
  // 对比候选：基准是快照且还有别的快照时排除基准本身，避免自己和自己比
  const cmpCandidates = (baseSnap && sorted.length > 1)
    ? sorted.filter(s => s.id !== baseSnap.id)
    : sorted;
  // 对比侧：优先用所选 cmpId；为空 / 已删除 / 与基准重合时，回退候选里最新一条
  const cmpSnap = cmpCandidates.find(s => s.id === cmpId) ?? cmpCandidates[0] ?? null;

  // 模块 id → 名称（快照里可能含已删除模块，兜底显示 id）
  const moduleName = (id) => modules.find(m => m.id === id)?.name ?? id;

  // ---- 两侧数据构建：快照读固化字段，'current' 实时计算（A=基准，B=对比，Δ = A − B）----
  const sides = useMemo(() => {
    const build = (snap) => {
      if (snap) {
        return {
          label: `${snap.weekLabel}（${fmtTaken(snap.takenAt)}）`,
          categoryTotals: snap.categoryTotals || {},   // 各分类资产
          categoryDebts: snap.categoryDebts || {},     // 各分类负债
          moduleBalances: snap.moduleBalances || {},
          totalAsset: snap.totalAsset,
          totalLiability: snap.totalLiability,
          netWorth: snap.netWorth,
        };
      }
      const totals = computeTotals(modules, items);
      return {
        label: `当前实时（${todayYMD()}）`,
        categoryTotals: Object.fromEntries(CATEGORIES.map(c => [c.key, totals.byCategory[c.key]?.asset ?? 0])),
        categoryDebts: Object.fromEntries(CATEGORIES.map(c => [c.key, totals.byCategory[c.key]?.liability ?? 0])),
        moduleBalances: Object.fromEntries(
          modules.filter(m => !m.archived).map(m => [m.id, moduleBalance(m.id, items)]),
        ),
        totalAsset: totals.totalAsset,
        totalLiability: totals.totalLiability,
        netWorth: totals.netWorth,
      };
    };
    return { A: build(baseSnap), B: build(cmpSnap) };
  }, [baseSnap, cmpSnap, modules, items]);

  // ---- 派生：各项差值 / 模块变化行 / 自动分析文案 ----
  const cmpData = useMemo(() => {
    const { A, B } = sides;
    const netDelta = r2(A.netWorth - B.netWorth);
    const netPct = pctChange(A.netWorth, B.netWorth);
    const assetDelta = r2(A.totalAsset - B.totalAsset);
    const liabDelta = r2(A.totalLiability - B.totalLiability);

    // 模块余额变化行：取两侧模块并集，跳过 Δ=0，按 |Δ| 降序
    const ids = [...new Set([...Object.keys(A.moduleBalances), ...Object.keys(B.moduleBalances)])];
    const moduleRows = ids
      .map(id => ({ id, a: Number(A.moduleBalances[id] ?? 0), b: Number(B.moduleBalances[id] ?? 0) }))
      .map(r => ({ ...r, d: r2(r.a - r.b) }))
      .filter(r => r.d !== 0)
      .sort((x, y) => Math.abs(y.d) - Math.abs(x.d));

    // 自动分析（3-5 句）
    const parts = [];
    if (netDelta === 0) {
      parts.push(`净资产：由 ${fmtMoney(B.netWorth)} 变为 ${fmtMoney(A.netWorth)}，持平`);
    } else {
      parts.push(`净资产：由 ${fmtMoney(B.netWorth)} 变为 ${fmtMoney(A.netWorth)}，${netDelta > 0 ? '增加' : '减少'} ¥${fmtMoney(Math.abs(netDelta))}${pctText(netPct)}`);
    }
    // 四分类资产变化最大项（A − B）
    const catDeltas = CATEGORIES.map(c => ({
      name: c.name,
      d: r2(Number(A.categoryTotals[c.key] ?? 0) - Number(B.categoryTotals[c.key] ?? 0)),
    }));
    const up = catDeltas.filter(x => x.d > 0).sort((x, y) => y.d - x.d)[0];
    const down = catDeltas.filter(x => x.d < 0).sort((x, y) => x.d - y.d)[0];
    if (up) parts.push(`「${up.name}」资产增加最多（+¥${fmtMoney(up.d)}）`);
    if (down) parts.push(`「${down.name}」资产减少最多（−¥${fmtMoney(Math.abs(down.d))}）`);
    if (liabDelta > 0) parts.push(`总负债增加 ¥${fmtMoney(liabDelta)}，注意还款节奏`);
    else if (liabDelta < 0) parts.push(`总负债减少 ¥${fmtMoney(Math.abs(liabDelta))}`);
    else parts.push('总负债持平');
    parts.push(`共 ${moduleRows.length} 个模块余额发生变化`);

    return { netDelta, netPct, assetDelta, liabDelta, moduleRows, note: parts.join('；') + '。' };
  }, [sides]);

  // ---- 走势图数据（按所选粒度聚合）----
  const series = useMemo(() => trendSeries(snapshots, gran), [snapshots, gran]);
  const chartData = useMemo(() => ({
    labels: series.map(p => p.period),
    datasets: [
      {
        label: '净资产',
        data: series.map(p => p.netWorth),
        borderColor: '#2f6fed',
        backgroundColor: 'rgba(47, 111, 237, .12)',
        pointRadius: 3,
        tension: 0.3,
        fill: true,
      },
      {
        label: '总资产',
        data: series.map(p => p.totalAsset),
        borderColor: '#3aa675',
        backgroundColor: '#3aa675',
        pointRadius: 3,
        tension: 0.3,
        fill: false,
      },
      {
        label: '总负债',
        data: series.map(p => p.totalLiability),
        borderColor: '#d9534f',
        backgroundColor: '#d9534f',
        pointRadius: 3,
        tension: 0.3,
        fill: false,
      },
    ],
  }), [series]);

  const chartOptions = useMemo(() => ({
    scales: {
      y: {
        ticks: {
          callback: (v) => {
            const n = Number(v);
            if (Math.abs(n) >= 10000) return `¥${(n / 10000).toFixed(1)}万`;
            return `¥${n}`;
          },
        },
      },
    },
  }), []);

  // 四张页面卡片内容（grip 注入标题；按 cardIds 顺序渲染，拖动落盘 fp:weekly:order）
  const cardBodies = {
    snap: (grip) => (
        <>
        <div className="card-title">
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {grip}<span>本周快照</span>
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={appendSnapshot}>
            {thisWeekCount > 0 ? '📸 更新本周快照（覆盖）' : '📸 本周拍快照'}
          </button>
          <span className="hint" style={{ marginTop: 0 }}>
            当前周：{week}
            {thisWeekCount > 0 && '　·　本周已记录，重新拍摄将覆盖本周之前的记录'}
          </span>
        </div>
        <div className="hint">按周记录：每周只保留最后一次拍摄（重复拍摄覆盖不新增）；建议每周固定一天拍摄，金额以当前各模块款项余额为准。</div>
        </>
    ),
    cmp: (grip) => (
        <>
        <div className="card-title">
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {grip}<span>记录对比</span>
          </span>
        </div>
        {!cmpSnap ? (
          <div className="empty">还没有快照，先拍一次快照再对比</div>
        ) : (
          <>
            {/* 基准 / 对比 期次选择 */}
            <div className="cmp-selects">
              <label>
                基准：
                <select
                  className="select"
                  value={baseSnap ? baseSnap.id : 'current'}
                  onChange={(e) => setBaseId(e.target.value)}
                >
                  <option value="current">当前实时</option>
                  {sorted.map(s => (
                    <option key={s.id} value={s.id}>{s.weekLabel}（{fmtTaken(s.takenAt)}）</option>
                  ))}
                </select>
              </label>
              <label>
                对比：
                <select
                  className="select"
                  value={cmpSnap.id}
                  onChange={(e) => setCmpId(e.target.value)}
                >
                  {cmpCandidates.map(s => (
                    <option key={s.id} value={s.id}>{s.weekLabel}（{fmtTaken(s.takenAt)}）</option>
                  ))}
                </select>
              </label>
            </div>

            {/* 净资产三卡：基准 / 对比 / 变化 */}
            <div className="grid grid-3">
              <div className="stat">
                <div className="stat-label">基准净资产</div>
                <div className="stat-value">{fmtMoney(sides.A.netWorth)}</div>
                <div className="stat-extra">{sides.A.label}</div>
              </div>
              <div className="stat">
                <div className="stat-label">对比净资产</div>
                <div className="stat-value">{fmtMoney(sides.B.netWorth)}</div>
                <div className="stat-extra">{sides.B.label}</div>
              </div>
              <div className="stat">
                <div className="stat-label">净资产变化</div>
                <div className={`stat-value${cmpData.netDelta > 0 ? ' pos' : cmpData.netDelta < 0 ? ' neg' : ''}`}>
                  {fmtMoney(cmpData.netDelta)}
                </div>
                <div className="stat-extra">
                  <Delta value={cmpData.netDelta} />{pctText(cmpData.netPct)}
                </div>
              </div>
            </div>

            {/* 总资产 / 总负债：基准值 vs 对比值 */}
            <div className="cmp-row">
              <div className="cmp-row-name">总资产</div>
              <div className="cmp-vals"><span className="cmp-muted">{fmtMoney(sides.A.totalAsset)}</span> vs {fmtMoney(sides.B.totalAsset)}　<Delta value={cmpData.assetDelta} /></div>
            </div>
            <div className="cmp-row">
              <div className="cmp-row-name">总负债</div>
              <div className="cmp-vals"><span className="cmp-muted">{fmtMoney(sides.A.totalLiability)}</span> vs {fmtMoney(sides.B.totalLiability)}　<Delta value={cmpData.liabDelta} /></div>
            </div>

            {/* 四分类资产/负债变化 */}
            <div className="hint">四分类变化</div>
            <div className="grid grid-2">
              {CATEGORIES.map(c => {
                const aA = Number(sides.A.categoryTotals[c.key] ?? 0);
                const aB = Number(sides.B.categoryTotals[c.key] ?? 0);
                const dA = Number(sides.A.categoryDebts[c.key] ?? 0);
                const dB = Number(sides.B.categoryDebts[c.key] ?? 0);
                return (
                  <div key={c.key} className="stat">
                    <div className="stat-label"><span className={`tag tag-${c.key}`}>{c.name}</span></div>
                    <div className="stat-extra">资产 {fmtMoney(aA)} → {fmtMoney(aB)}　Δ <Delta value={r2(aA - aB)} />{pctText(pctChange(aA, aB))}</div>
                    <div className="stat-extra">负债 {fmtMoney(dA)} → {fmtMoney(dB)}　Δ <Delta value={r2(dA - dB)} />{pctText(pctChange(dA, dB))}</div>
                  </div>
                );
              })}
            </div>

            {/* 模块余额变化（跳过无变化，按 |Δ| 降序） */}
            <div className="hint">模块余额变化</div>
            {cmpData.moduleRows.length === 0 ? (
              <div className="hint">所有模块余额均无变化</div>
            ) : (
              cmpData.moduleRows.map(r => (
                <div key={r.id} className="cmp-row">
                  <div className="cmp-row-name">{moduleName(r.id)}</div>
                  <div className="cmp-vals"><span className="cmp-muted">{fmtMoney(r.a)} →</span> {fmtMoney(r.b)}　<Delta value={r.d} /></div>
                </div>
              ))
            )}

            {/* 自动分析 */}
            <div className="hint">自动分析</div>
            <div className="cmp-note">{cmpData.note}</div>
          </>
        )}
        </>
    ),
    trend: (grip) => (
        <>
        <div className="card-title" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
          {grip}
          走势分析
          <div className="segmented granular-seg">
            {GRANS.map(([g, name]) => (
              <button key={g} className={gran === g ? 'active' : ''} onClick={() => setGran(g)}>{name}</button>
            ))}
          </div>
        </div>
        {series.length < 2 ? (
          <div className="empty">快照积累中，拍满两次后展示走势（支持按周/月/年聚合）</div>
        ) : (
          <Chart type="line" data={chartData} options={chartOptions} />
        )}
        </>
    ),
    log: (grip) => (
        <>
        <div className="card-title">
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {grip}<span>快照记录（共 {sorted.length} 条）</span>
          </span>
        </div>
        {sorted.length === 0 ? (
          <div className="empty">还没有快照，点击上方按钮拍下第一周的资金结构</div>
        ) : (
          sorted.map(s => (
            <div key={s.id}>
              <div className="list-row">
                <div
                  className="list-main"
                  style={{ cursor: 'pointer' }}
                  onClick={() => setExpandedId(id => (id === s.id ? null : s.id))}
                >
                  <div className="list-name">
                    <span className="tag">{s.weekLabel}</span>
                    <span className="list-note">{fmtTaken(s.takenAt)}</span>
                    <span className="list-note">{expandedId === s.id ? '收起 ▲' : '展开 ▼'}</span>
                  </div>
                </div>
                <div className="amount">净资产 {fmtMoney(s.netWorth)}</div>
                <button className="btn btn-danger btn-sm" onClick={() => removeSnapshot(s.id)}>删除</button>
              </div>

              {expandedId === s.id && (
                <div style={{ padding: '8px 4px 12px' }}>
                  <div className="grid grid-2">
                    {CATEGORIES.map(c => (
                      <div key={c.key} className="stat">
                        <div className="stat-label">
                          <span className={`tag tag-${c.key}`}>{c.name}</span>
                        </div>
                        <div className="stat-extra">资产 {fmtMoney(s.categoryTotals?.[c.key] ?? 0)}</div>
                        <div className="stat-extra">负债 {fmtMoney(s.categoryDebts?.[c.key] ?? 0)}</div>
                      </div>
                    ))}
                  </div>
                  <div className="hint">模块余额（{s.weekLabel}）</div>
                  {Object.entries(s.moduleBalances || {}).map(([mid, bal]) => (
                    <div key={mid} className="list-row">
                      <div className="list-name">{moduleName(mid)}</div>
                      <div className={`amount${bal >= 0 ? ' pos' : ' neg'}`}>{fmtMoney(bal)}</div>
                    </div>
                  ))}
                  <div className="list-row">
                    <div className="list-name">总资产 / 总负债</div>
                    <div className="amount">
                      {fmtMoney(s.totalAsset)} / <span className="amount neg">{fmtMoney(s.totalLiability)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
        </>
    ),
  };

  return (
    <div>
      <div className="page-title">记录对比</div>
      <div className="page-sub">任选两期快照对比资金结构变化，默认以当前实时资金为基准对比所选快照</div>

      {/* 四张页面卡片：均可拖动左上把手排序，按持久化顺序渲染 */}
      <SortableCards ids={cardIds} onMove={(a, o) => setCardOrder((prev) => moveByIds(prev, a, o))}>
        {cardIds.map((id) => (
          <SortableCard key={id} id={id} gripLabel="拖动排序此卡片">
            {(grip) => cardBodies[id](grip)}
          </SortableCard>
        ))}
      </SortableCards>
    </div>
  );
}
