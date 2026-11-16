// ============================================================
// 持久化与派生计算（所有组件只通过本文件读写数据）
// localStorage 前缀 fp: ；KEYS 见下
// ============================================================
import { useEffect, useState } from 'react';
import { DEFAULT_MODULES, DEFAULT_ITEMS, CATEGORIES } from './data/data.js';

export const KEYS = {
  modules: 'fp:modules',
  items: 'fp:items',
  snapshots: 'fp:snapshots',
  investments: 'fp:investments',
  expenses: 'fp:expenses',   // 日常记账流水 [{ id, date:'YYYY-MM-DD', type:'in'|'out', category, amount, note }]
  budget: 'fp:budget',       // 可选月预算（数字，元）；null/0 = 未设置
  seeded: 'fp:seeded',
  // ---- 页面卡片/板块的拖拽顺序（id 数组，随全量导出备份）----
  assetsOrder: 'fp:assets:order',   // 资产管家页卡片顺序 ['summary','mods']
  catOrder: 'fp:cat:order',         // 三笔钱板块（四分类）顺序
  threeOrder: 'fp:three:order',     // 三笔钱页卡片顺序 ['share','totals','boards']
  weeklyOrder: 'fp:weekly:order',   // 记录对比页卡片顺序 ['snap','cmp','trend','log']
  shopping: 'fp:shopping',          // 购物清单 { lists:[{id,name,createdAt}], items:[{id,listId,text,price,note,done,createdAt}] }
  catGroups: 'fp:cat:groups',       // 三笔钱板块自定义分组 [{ id, name, cats: [分类key] }]；未收录的板块显示在「未分组」区
  assetsExpanded: 'fp:assets:expanded', // 资产管家模块展开集合（string[]；null=首次使用，默认展开第一块）
};

// 记账分类：金额一律正数，方向由 type 区分（沿用账本"方向区分"口径）
export const EXPENSE_CATEGORIES = ['餐饮', '交通', '购物', '居住', '娱乐', '医疗', '学习', '人情', '其他'];
export const INCOME_CATEGORIES = ['工资', '理财收益', '兼职', '红包', '其他'];

export const uid = (p) => `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
const now = () => new Date().toISOString();

export function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch { return fallback; }
}
function writeJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

/** 通用本地状态 hook：useState + 自动落盘 */
export function useLocalState(key, initial) {
  const [state, setState] = useState(() => {
    // 首次启动写入种子数据
    if (key === KEYS.modules && !localStorage.getItem(KEYS.seeded)) {
      writeJSON(KEYS.modules, DEFAULT_MODULES);
      writeJSON(KEYS.items, DEFAULT_ITEMS);
      writeJSON(KEYS.snapshots, []);
      writeJSON(KEYS.investments, []);
      localStorage.setItem(KEYS.seeded, '1');
      return DEFAULT_MODULES;
    }
    return readJSON(key, typeof initial === 'function' ? initial() : initial);
  });
  useEffect(() => { writeJSON(key, state); }, [key, state]);
  return [state, setState];
}

// ---------------- 模块/款项 CRUD ----------------
/** 模块余额 = Σ(asset 款项) - Σ(liability 款项) */
export function moduleBalance(moduleId, items) {
  let bal = 0;
  for (const it of items) {
    if (it.moduleId !== moduleId) continue;
    bal += it.direction === 'liability' ? -Number(it.amount || 0) : Number(it.amount || 0);
  }
  return Math.round(bal * 100) / 100;
}

/** 全局汇总：按 category 统计资产/负债/净额，及总计与净资产 */
export function computeTotals(modules, items) {
  const byCategory = {};
  for (const c of CATEGORIES) byCategory[c.key] = { asset: 0, liability: 0, balance: 0 };
  let totalAsset = 0, totalLiability = 0;
  for (const it of items) {
    const mod = modules.find(m => m.id === it.moduleId);
    if (!mod || mod.archived) continue;
    const cat = byCategory[mod.category] || (byCategory[mod.category] = { asset: 0, liability: 0, balance: 0 });
    const amt = Number(it.amount || 0);
    if (it.direction === 'liability') { cat.liability += amt; totalLiability += amt; }
    else { cat.asset += amt; totalAsset += amt; }
  }
  for (const k of Object.keys(byCategory)) {
    byCategory[k].asset = r2(byCategory[k].asset);
    byCategory[k].liability = r2(byCategory[k].liability);
    byCategory[k].balance = r2(byCategory[k].asset - byCategory[k].liability);
  }
  return {
    byCategory,
    totalAsset: r2(totalAsset),
    totalLiability: r2(totalLiability),
    netWorth: r2(totalAsset - totalLiability),
  };
}
export const r2 = (n) => Math.round(n * 100) / 100;

// ---------------- 周度快照 ----------------
/** ISO 周标签，如 2026-W40 */
export function currentWeekLabel(d = new Date()) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((t - y0) / 86400000) + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** 拍快照：把当前各模块余额/分类合计固化成一条 Snapshot */
export function takeSnapshot(modules, items) {
  const totals = computeTotals(modules, items);
  const moduleBalances = {};
  for (const m of modules) if (!m.archived) moduleBalances[m.id] = moduleBalance(m.id, items);
  const categoryTotals = {}, categoryDebts = {};
  for (const c of CATEGORIES) {
    categoryTotals[c.key] = totals.byCategory[c.key]?.asset ?? 0;
    categoryDebts[c.key] = totals.byCategory[c.key]?.liability ?? 0;
  }
  return {
    id: uid('s'),
    weekLabel: currentWeekLabel(),
    takenAt: now(),
    moduleBalances, categoryTotals, categoryDebts,
    totalAsset: totals.totalAsset,
    totalLiability: totals.totalLiability,
    netWorth: totals.netWorth,
  };
}

/**
 * 走势序列（支持 周/月/年 三种粒度）：
 *   week  → 按快照 weekLabel（同周多条取最后一条，避免重复横轴）
 *   month → 按 takenAt 的 'YYYY-MM' 分桶，桶内取最后一条
 *   year  → 按 takenAt 的 'YYYY' 分桶，桶内取最后一条
 * 返回 [{ period, netWorth, totalAsset, totalLiability }]，period 升序。
 */
export function trendSeries(snapshots, granularity = 'week') {
  const keyOf = (s) => {
    if (granularity === 'month') return String(s.takenAt || '').slice(0, 7);
    if (granularity === 'year') return String(s.takenAt || '').slice(0, 4);
    return s.weekLabel;
  };
  const latest = new Map();
  for (const s of snapshots) {
    const k = keyOf(s);
    if (!k) continue;
    const prev = latest.get(k);
    if (!prev || String(s.takenAt).localeCompare(String(prev.takenAt)) > 0) latest.set(k, s);
  }
  return [...latest.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([period, s]) => ({ period, netWorth: s.netWorth, totalAsset: s.totalAsset, totalLiability: s.totalLiability }));
}

/** 按周去重：每个 weekLabel 只保留 takenAt 最新的一条，返回按时间升序数组（记录对比按周记录） */
export function dedupeSnapshotsByWeek(snapshots) {
  const latest = new Map();
  for (const s of Array.isArray(snapshots) ? snapshots : []) {
    const k = String(s.weekLabel || '');
    if (!k) continue;
    const prev = latest.get(k);
    if (!prev || String(s.takenAt).localeCompare(String(prev.takenAt)) > 0) latest.set(k, s);
  }
  return [...latest.values()].sort((a, b) => String(a.takenAt).localeCompare(String(b.takenAt)));
}

/** 模块内款项求和：{ asset, liability }（金额一律正数，按 direction 分桶） */
export function moduleSums(moduleId, items) {
  let asset = 0, liability = 0;
  for (const it of items) {
    if (it.moduleId !== moduleId) continue;
    if (it.direction === 'liability') liability += Number(it.amount || 0);
    else asset += Number(it.amount || 0);
  }
  return { asset: r2(asset), liability: r2(liability) };
}

/** 变化百分比：base 为 0 时返回 null（无法计算），结果保留 1 位小数 */
export function pctChange(cur, base) {
  const b = Number(base || 0);
  if (b === 0) return null;
  return r2(((Number(cur || 0) - b) / Math.abs(b)) * 100);
}

// ---------------- 日常记账派生 ----------------
export const todayYMD = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** 某月（默认当月）收支汇总：收入/支出/结余 + 分类占比（仅支出） */
export function expenseMonthStats(expenses, ym) {
  const month = ym || todayYMD().slice(0, 7); // 'YYYY-MM'
  let income = 0, outcome = 0;
  const byCategory = {};
  for (const e of expenses) {
    if (!e || typeof e.date !== 'string' || !e.date.startsWith(month)) continue;
    const amt = Number(e.amount || 0);
    if (e.type === 'in') income += amt;
    else {
      outcome += amt;
      const c = e.category || '其他';
      byCategory[c] = (byCategory[c] || 0) + amt;
    }
  }
  return { month, income: r2(income), outcome: r2(outcome), balance: r2(income - outcome), byCategory };
}

/** 预算状态：未设置 null；否则 { percent, level } level: '' | 'warn'(≥80%) | 'over'(≥100%) */
export function budgetStatus(outcome, budget) {
  const b = Number(budget || 0);
  if (b <= 0) return null;
  const percent = Math.round((outcome / b) * 100);
  const level = percent >= 100 ? 'over' : percent >= 80 ? 'warn' : '';
  return { percent: Math.min(percent, 999), level, budget: b };
}

/** 流水按月分组（倒序）：[{ month, entries, income, outcome }] */
export function expenseByMonth(expenses) {
  const groups = {};
  for (const e of expenses) {
    const m = typeof e?.date === 'string' && e.date.slice(0, 7) || '未知月份';
    (groups[m] = groups[m] || []).push(e);
  }
  return Object.entries(groups)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([month, list]) => {
      const sorted = [...list].sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.id).localeCompare(String(a.id)));
      let income = 0, outcome = 0;
      for (const e of sorted) {
        if (e.type === 'in') income += Number(e.amount || 0);
        else outcome += Number(e.amount || 0);
      }
      return { month, entries: sorted, income: r2(income), outcome: r2(outcome) };
    });
}

// ---------------- 投资派生 ----------------
export function investmentDerived(inv, daysHeld = 7) {
  const principal = Number(inv.principal || 0);
  const rate = Number(inv.rate || 0);
  const value = inv.currentValue == null ? null : Number(inv.currentValue);
  const totalReturn = value != null ? r2(value - principal) : r2(principal * rate * (daysHeld / 365));
  const daily = r2(principal * rate / 365);
  const returnRate = principal > 0 ? r2((totalReturn / principal) * 10000) / 100 : 0;
  return { value: value ?? r2(principal + totalReturn), totalReturn, daily, returnRate };
}

// ---------------- 跨页跳转（沿用面试工作台模式）----------------
export function navigate(key) {
  window.__fpNavigate?.(key);
}

export const fmtMoney = (n) =>
  (Number(n) || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
