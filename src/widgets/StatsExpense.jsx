// 记账速览：读取日常记账 fp:expenses / fp:budget（只读），展示本月支出/收入/结余与预算进度
import React from 'react'
import { readLS } from '../app/store.js'
import { KEYS, expenseMonthStats, budgetStatus, fmtMoney } from '../modules/fund/store.js'
import { navigate } from '../app/navigate.js'

export default function StatsExpense() {
  const expenses = readLS(KEYS.expenses, [])
  const budget = readLS(KEYS.budget, 0)
  const stats = expenseMonthStats(expenses)
  const bs = budgetStatus(stats.outcome, budget)
  const empty = expenses.length === 0

  return (
    <div>
      {empty ? (
        <div className="wb-kpi-grid">
          <div className="wb-kpi">
            <div className="wb-kpi-num">—</div>
            <div className="wb-kpi-label">本月还没有记账</div>
            <div className="wb-kpi-extra muted">记一笔只要几秒，攒下真实流水才能看清花销</div>
          </div>
        </div>
      ) : (
        <div className="wb-kpi-grid">
          <div className="wb-kpi"><div className="wb-kpi-num neg">{fmtMoney(stats.outcome)}</div><div className="wb-kpi-label">本月支出</div></div>
          <div className="wb-kpi"><div className="wb-kpi-num pos">{fmtMoney(stats.income)}</div><div className="wb-kpi-label">本月收入</div></div>
          <div className="wb-kpi">
            <div className={`wb-kpi-num ${stats.balance >= 0 ? 'pos' : 'neg'}`}>{fmtMoney(stats.balance)}</div>
            <div className="wb-kpi-label">本月结余</div>
            {bs && <div className={`wb-kpi-extra ${bs.level === 'over' ? 'neg' : ''}`} style={bs.level === 'over' ? { color: 'var(--red)' } : undefined}>预算已用 {bs.percent}%{bs.level === 'over' ? '（超支）' : bs.level === 'warn' ? '（接近上限）' : ''}</div>}
          </div>
        </div>
      )}
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn btn-sm btn-primary" onClick={() => navigate('/workbench/fund/expense')}>记一笔 →</button>
        <button className="btn btn-sm" onClick={() => navigate('/workbench/fund/expense')}>看流水 →</button>
      </div>
    </div>
  )
}
