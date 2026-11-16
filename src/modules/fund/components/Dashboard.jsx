// 数据看板：核心指标 + 资产走势 + 构成对比 + 收益摘要 + 最近快照
// 页面分区接入 DragGrid（stack 堆叠布局）：每张分区卡可拖动排序、隐藏、在恢复条/设置中恢复
// （交互参考 magpie：把手拖动、源卡虚线占位、浮层克隆、其余卡片平滑让位）。
// 布局经 useDragLayout 持久化到 wb:layout:fund-dashboard:<profile>；
// 后续新增分区只需在 SECTIONS 里登记 { id, title, icon, el, props }，排序/显隐能力自动获得。
import React, { useMemo, useState } from 'react';
import { CATEGORIES } from '../data/data.js';
import { computeTotals, trendSeries, investmentDerived, fmtMoney, navigate, moduleBalance } from '../store.js';
import Chart, { MiniBar } from './Chart.jsx';
import DragGrid from '../../../widgets/DragGrid.jsx';
import { useDragLayout, pageLayoutKey } from '../../../app/store.js';

const wan = (v) => (Math.abs(v) >= 10000 ? `${(v / 10000).toFixed(1)}万` : `${Math.round(v)}`);
const moneyTick = (v) => `¥${wan(v)}`;

// 走势聚合粒度：周（快照周标签）/ 月 / 年（按 takenAt 分桶，桶内取最后一条）
const GRANULARITY = [
  { key: 'week', label: '周', desc: '每个快照周取最后一条快照' },
  { key: 'month', label: '月', desc: '每月取最后一条快照' },
  { key: 'year', label: '年', desc: '每年取最后一条快照' },
];

function KpiSection({ totals, delta, miniValues }) {
  return (
    <>
      <div className="grid grid-3">
        <div className="stat">
          <span className="stat-label">总资产</span>
          <span className="stat-value">{fmtMoney(totals.totalAsset)}</span>
          <span className="stat-extra">所有资产款项合计</span>
        </div>
        <div className="stat">
          <span className="stat-label">总负债</span>
          <span className="stat-value neg">{fmtMoney(totals.totalLiability)}</span>
          <span className="stat-extra">欠款余额合计</span>
        </div>
        <div className="stat">
          <span className="stat-label">净资产</span>
          <span className={`stat-value ${totals.netWorth >= 0 ? 'pos' : 'neg'}`}>{fmtMoney(totals.netWorth)}</span>
          <span className="stat-extra">
            {delta != null && delta !== 0
              ? <span className={delta > 0 ? 'delta-up' : 'delta-down'}>较上周快照 {delta > 0 ? '+' : ''}{fmtMoney(delta)}</span>
              : '总资产 − 总负债'}
          </span>
        </div>
      </div>
      {miniValues.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <MiniBar values={miniValues} />
          <div className="hint">三笔钱 + 固定资产 + 借出应收 净额结构（按模块细分：同色系深浅 = 同一分类内的不同模块，参考下方构成柱状图）</div>
        </div>
      )}
    </>
  );
}

function TrendSection({ snapshots }) {
  const [gran, setGran] = useState('week');
  const granDesc = GRANULARITY.find((g) => g.key === gran)?.desc;
  const series = useMemo(() => trendSeries(snapshots, gran), [snapshots, gran]);
  const trendData = {
    labels: series.map(t => t.period),
    datasets: [
      { label: '净资产', data: series.map(t => t.netWorth), borderColor: '#2f6fed', backgroundColor: 'rgba(47,111,237,.12)', fill: true, tension: .3, pointRadius: 3 },
      { label: '总资产', data: series.map(t => t.totalAsset), borderColor: '#3aa675', backgroundColor: 'transparent', tension: .3, pointRadius: 2 },
      { label: '总负债', data: series.map(t => t.totalLiability), borderColor: '#d9534f', backgroundColor: 'transparent', tension: .3, pointRadius: 2 },
    ],
  };
  return (
    <div>
      <div className="row" style={{ justifyContent: 'flex-end', marginBottom: 8 }}>
        <div className="segmented">
          {GRANULARITY.map(g => (
            <button key={g.key} className={gran === g.key ? 'active' : ''} onClick={() => setGran(g.key)}>
              按{g.label}
            </button>
          ))}
        </div>
      </div>
      {series.length >= 2
        ? <Chart type="line" data={trendData} options={{ scales: { y: { ticks: { callback: moneyTick } }, x: { ticks: { maxRotation: 0, autoSkip: true } } } }} />
        : <div className="empty">快照不足 2 次：到「记录对比」页拍快照后，这里会出现按{granDesc}的走势线。</div>}
      <div className="hint">走势按{granDesc}；横轴标签为{gran === 'week' ? '快照周' : gran === 'month' ? '月份' : '年份'}。</div>
    </div>
  );
}

// 同分类内多模块分色：以分类色为基准做 HSL 明度偏移（色相不变、深浅可辨）。
// canvas 不解析 CSS 变量，必须输出具体色值；明度钳制在 [20%, 80%] 防止过黑过白。
function hexToHsl(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, s * 100, l * 100];
}
const SHADE_STEPS = [-13, 0, 13, -26, 26, -39]; // 分类内第 i 个模块的明度偏移（%），超出循环
function shadeOf(hex, index) {
  const hsl = hexToHsl(hex);
  if (!hsl) return String(hex || '#888888');
  const [h, s, l] = hsl;
  const li = Math.min(80, Math.max(20, l + SHADE_STEPS[index % SHADE_STEPS.length]));
  return `hsl(${h.toFixed(1)}, ${s.toFixed(1)}%, ${li.toFixed(1)}%)`;
}

function CompositionSection({ pieSlices, activeModules, items }) {
  const pieData = {
    labels: pieSlices.map(s => s.c.name),
    datasets: [{ data: pieSlices.map(s => s.v), backgroundColor: pieSlices.map(s => s.c.color), borderWidth: 0 }],
  };
  const totalAsset = pieSlices.reduce((s, x) => s + x.v, 0);
  const modAsset = (m) => items.filter(i => i.moduleId === m.id && i.direction !== 'liability').reduce((s, i) => s + Number(i.amount || 0), 0);
  const modDebt = (m) => items.filter(i => i.moduleId === m.id && i.direction === 'liability').reduce((s, i) => s + Number(i.amount || 0), 0);

  const hasAsset = pieSlices.length > 0;
  const hasDebt = activeModules.some(m => modDebt(m) > 0);
  const isEmpty = !hasAsset && !hasDebt;

  // 柱状图：每大类一行，条内按模块分段（分隔线划分占比）。
  // 行 = 有资产的分类（CATEGORIES 顺序，0 值分类不显示）+ 负债行（有负债时）。
  // 段的构成：资产段 = 有钱模块一个 dataset（label=分类名，backgroundColor=分类色字符串）；
  // 负债段 = 有负债模块单独的红色 dataset（label='负债'，负债行有值其余行 0）——
  // 负债不用分类色 dataset 的数据点着色（per-point 数组背景色会让 Chart.js 图例渲染异常）。
  const catRows = CATEGORIES.filter(c => (pieSlices.find(s => s.c.key === c.key)?.v ?? 0) > 0);
  const labels = [...catRows.map(c => c.name), ...(hasDebt ? ['负债'] : [])];
  const DEBT_RED = '#d9534f';
  const segBorder = {
    // 段间分隔线：画满四周的 2px 底色描边，把相邻模块段划开（canvas 不解析 CSS var，
    // 故读 :root 上 --panel 的实际色值，深浅主题各自生效）
    borderWidth: 2,
    borderSkipped: false,
    borderColor: getComputedStyle(document.documentElement).getPropertyValue('--panel').trim() || '#ffffff',
  };
  // 资产模块 dataset：按分类排序保证同大类段相邻；同分类内按序号做同色系深浅偏移，
  // 让「同一绿色里的三笔资金」在占比条上肉眼可辨（悬停仍显示模块名与金额）
  const assetMods = activeModules.filter(m => modAsset(m) > 0).sort((a, b) => {
    const ia = CATEGORIES.findIndex(c => c.key === a.category);
    const ib = CATEGORIES.findIndex(c => c.key === b.category);
    return ia - ib;
  });
  const shadeIdx = {};
  const barData = {
    labels,
    datasets: [
      ...assetMods.map((m) => {
        const cat = CATEGORIES.find(c => c.key === m.category);
        const i = shadeIdx[m.category] ?? 0;
        shadeIdx[m.category] = i + 1;
        return {
          label: cat ? cat.name : m.category,
          moduleName: m.name,
          data: catRows.map(c => (m.category === c.key ? modAsset(m) : 0)),
          backgroundColor: cat ? shadeOf(cat.color, i) : '#888888',
          ...segBorder,
        };
      }),
      ...activeModules
        .filter(m => modDebt(m) > 0)
        .map((m) => ({
          label: '负债',
          moduleName: m.name,
          data: labels.map(l => (l === '负债' ? modDebt(m) : 0)),
          backgroundColor: DEBT_RED,
          ...segBorder,
        })),
    ],
  };
  // 图例：同 label 只保留首个（分类色块与负债红块各一项）。
  // 必须无状态——Chart 封装是销毁重建式，带状态的 filter 闭包会在第二次重建时
  // 把所有项都判重过滤掉（图例凭空消失）。
  const legendFilter = (item) => {
    const ds = barData.datasets[item.datasetIndex];
    if (!ds) return false;
    return barData.datasets.findIndex(d => d.label === ds.label) === item.datasetIndex;
  };
  const barHeight = Math.max(230, labels.length * 38 + 60);

  return (
    <div className="wb-comp-row">
      {isEmpty ? (
        <div className="empty">暂无资产数据：到「资产管家」录入款项后，这里会出现分类构成与对比。</div>
      ) : (
        <>
          <div className="wb-comp-pie">
            <div className="wb-sec-sub">资产构成（按三笔钱）</div>
            {hasAsset
              ? <Chart type="doughnut" data={pieData} options={{ cutout: '55%', plugins: { legend: { display: false } } }} height={280} />
              : <div className="empty">暂无资产数据</div>}
            {/* 图例色块：分类名 + 占比（悬停看金额），与扇形图颜色一一对应 */}
            {hasAsset && (
              <div className="wb-pie-legend">
                {pieSlices.map(s => (
                  <span key={s.c.key} className="wb-pie-legend-item" title={`${s.c.name}：${fmtMoney(s.v)}`}>
                    <i style={{ background: s.c.color }} />
                    {s.c.name}
                    <b>{totalAsset > 0 ? `${Math.round((s.v / totalAsset) * 100)}%` : '0%'}</b>
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="wb-comp-bar">
            <div className="wb-sec-sub">各模块资产 vs 负债</div>
            <Chart type="bar" data={barData}
                   options={{
                     indexAxis: 'y',
                     scales: { x: { stacked: true, ticks: { callback: moneyTick } }, y: { stacked: true } },
                     plugins: {
                       legend: { labels: { filter: legendFilter } },
                       tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.moduleName ?? ctx.dataset.label}：${fmtMoney(ctx.parsed.x)}` } },
                     },
                   }}
                   height={barHeight} />
            <div className="hint">同一分类内以同色系深浅区分不同模块，悬停查看模块名与金额</div>
          </div>
        </>
      )}
    </div>
  );
}

function InvestSection({ investments }) {
  const invSummary = useMemo(() => {
    let value = 0, principal = 0, daily = 0;
    for (const inv of investments) {
      const d = investmentDerived(inv);
      value += d.value; principal += Number(inv.principal || 0); daily += d.daily;
    }
    return { value, principal, daily, totalReturn: value - principal };
  }, [investments]);

  return investments.length > 0 ? (
    <div className="grid grid-4">
      <div className="stat"><span className="stat-label">总市值</span><span className="stat-value">{fmtMoney(invSummary.value)}</span></div>
      <div className="stat"><span className="stat-label">总本金</span><span className="stat-value">{fmtMoney(invSummary.principal)}</span></div>
      <div className="stat"><span className="stat-label">累计收益</span><span className={`stat-value ${invSummary.totalReturn >= 0 ? 'pos' : 'neg'}`}>{fmtMoney(invSummary.totalReturn)}</span></div>
      <div className="stat"><span className="stat-label">估算日收益</span><span className="stat-value">{fmtMoney(invSummary.daily)}</span></div>
    </div>
  ) : (
    <div className="empty">尚未录入投资款项（如理财通持仓），到「投资收益」页添加后可在此单独查看收益。</div>
  );
}

function SnapshotSection({ latest }) {
  return (
    // CATEGORIES 现在 5 个，快照卡改 5 列
    <div className="grid grid-5">
      {CATEGORIES.map(c => (
        <div className="stat" key={c.key}>
          <span className="stat-label">{c.name}</span>
          <span className="stat-value" style={{ fontSize: 16 }}>{fmtMoney(latest.categoryTotals?.[c.key] ?? 0)}</span>
          <span className="stat-extra">负债 {fmtMoney(latest.categoryDebts?.[c.key] ?? 0)}</span>
        </div>
      ))}
    </div>
  );
}

export default function Dashboard({ modules, items, snapshots, investments, totals: _t }) {
  const totals = useMemo(() => computeTotals(modules, items), [modules, items]);
  const latest = snapshots.length ? [...snapshots].sort((a, b) => b.takenAt.localeCompare(a.takenAt))[0] : null;
  const prev = snapshots.length > 1
    ? [...snapshots].sort((a, b) => b.takenAt.localeCompare(a.takenAt))[1] : null;

  const delta = prev ? totals.netWorth - (prev.netWorth ?? 0) : null;

  // 构成：按分类资产合计饼图
  const pieSlices = CATEGORIES.map(c => ({ c, v: totals.byCategory[c.key]?.asset ?? 0 })).filter(s => s.v > 0);

  // 资产负债对比：每个模块两根柱
  const activeModules = modules.filter(m => !m.archived);

  // 核心指标的净额结构条：按「分类 → 模块」细分段 —— 同一分类内的模块沿用构成柱状图
  // 的同色系深浅偏移（如现金类里的「现金 / 活期资产」各自成段，而不是绿色一整段），
  // 悬停提示为「分类 · 模块名 + 金额占比」，比整类一段更细致可辨
  const miniValues = useMemo(() => {
    const segs = [];
    for (const c of CATEGORIES) {
      let shadeIdx = 0;
      for (const m of activeModules) {
        if (m.category !== c.key) continue;
        const bal = moduleBalance(m.id, items);
        if (bal > 0) segs.push({ label: `${c.name} · ${m.name}`, value: bal, color: shadeOf(c.color, shadeIdx++) });
      }
    }
    return segs;
  }, [activeModules, items]);

  // 可拖拽分区注册表：新增分区只需在此追加一行（id 唯一），排序/显隐能力自动获得
  const SECTIONS = [
    { id: 'kpi', title: '核心指标', icon: '📊', el: KpiSection, props: { totals, delta, miniValues } },
    {
      id: 'trend', title: '资金走势（周 / 月 / 年）', icon: '📈', el: TrendSection, props: { snapshots },
      extra: <button className="btn btn-sm" onClick={() => navigate('weekly')}>去拍快照</button>
    },
    {
      id: 'composition', title: '资产构成与对比', icon: '🧭', el: CompositionSection,
      props: { pieSlices, activeModules, items }
    },
    {
      id: 'invest', title: '投资收益摘要', icon: '💹', el: InvestSection, props: { investments },
      extra: <button className="btn btn-sm" onClick={() => navigate('invest')}>管理投资款</button>
    },
    { id: 'snapshot', title: '最近一次快照', icon: '📸', el: SnapshotSection, props: { latest }, available: !!latest }
  ];

  const { order, hidden, setOrder, hide, show, reset } = useDragLayout(
    pageLayoutKey('fund-dashboard'),
    SECTIONS.map((s) => s.id)
  );

  return (
    <div>
      <div className="row wb-page-head">
        <div>
          <h1 className="page-title">数据看板</h1>
          <p className="page-sub">资金全景一览 · 走势支持按周/月/年聚合 · 拖动分区卡头部 ⠿ 可排序</p>
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
    </div>
  );
}
