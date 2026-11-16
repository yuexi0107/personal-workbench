// 资金速览：读取资金模块 fp:* 数据（只读；computeTotals 为纯函数，不触发种子逻辑）
import React from 'react'
import { readLS } from '../app/store.js'
import { KEYS, computeTotals, fmtMoney } from '../modules/fund/store.js'
import { navigate } from '../app/navigate.js'

export default function StatsFund() {
  const modules = readLS(KEYS.modules, [])
  const items = readLS(KEYS.items, [])
  const snapshots = readLS(KEYS.snapshots, [])
  const totals = computeTotals(modules, items)

  const last = snapshots.length
    ? snapshots.reduce((a, b) => ((a.takenAt || '') > (b.takenAt || '') ? a : b))
    : null
  const delta = last ? Math.round((totals.netWorth - Number(last.netWorth || 0)) * 100) / 100 : null

  return (
    <div>
      <div className="wb-kpi-grid">
        <div className="wb-kpi"><div className="wb-kpi-num">{fmtMoney(totals.totalAsset)}</div><div className="wb-kpi-label">总资产</div></div>
        <div className="wb-kpi"><div className="wb-kpi-num neg">{fmtMoney(totals.totalLiability)}</div><div className="wb-kpi-label">总负债</div></div>
        <div className="wb-kpi">
          <div className={`wb-kpi-num ${totals.netWorth >= 0 ? 'pos' : 'neg'}`}>{fmtMoney(totals.netWorth)}</div>
          <div className="wb-kpi-label">净资产</div>
          {delta != null && delta !== 0 && (
            <div className={`wb-kpi-extra ${delta > 0 ? 'pos' : 'neg'}`} style={{ color: delta > 0 ? 'var(--green)' : 'var(--red)' }}>
              较上次快照 {delta > 0 ? '+' : ''}{fmtMoney(delta)}
            </div>
          )}
        </div>
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn btn-sm" onClick={() => navigate('/workbench/fund/dashboard')}>数据看板 →</button>
        <button className="btn btn-sm" onClick={() => navigate('/workbench/fund/assets')}>记一笔 →</button>
      </div>
    </div>
  )
}
