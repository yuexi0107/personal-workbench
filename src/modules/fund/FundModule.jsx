// 资金模块容器：移植自旧 fund-planner App.jsx 的账本状态与云同步接线；
// 页面组件与 sync 子系统零改动复用，tab 由统一路由传入。
// 购物清单（expense 路由沿用）自管 fp:shopping，旧记账数据 fp:expenses/fp:budget 保留不迁移。
import React, { useCallback, useEffect, useRef } from 'react'
import { KEYS, useLocalState, readJSON, computeTotals } from './store.js'
import Dashboard from './components/Dashboard.jsx'
import AssetManager from './components/AssetManager.jsx'
import ThreeMoney from './components/ThreeMoney.jsx'
import Weekly from './components/Weekly.jsx'
import InvestReturn from './components/InvestReturn.jsx'
import ShoppingList from './components/ShoppingList.jsx'
import SyncBar from './components/SyncBar.jsx'
import { markDirty } from './sync/cloud.js'

// 云端同步暂未上线：状态条与上传接线整体隐藏（云端不可用）。
// 上线时改回 true 即恢复 SyncBar 与"改动→加密上传"接线，其余无需动。
const CLOUD_ENABLED = false

const PAGES = {
  dashboard: Dashboard,
  assets: AssetManager,
  three: ThreeMoney,
  weekly: Weekly,
  invest: InvestReturn,
  expense: ShoppingList
}

export default function FundModule({ tab = 'dashboard' }) {
  const [modules, setModules] = useLocalState(KEYS.modules, [])
  const [items, setItems] = useLocalState(KEYS.items, [])
  const [snapshots, setSnapshots] = useLocalState(KEYS.snapshots, [])
  const [investments, setInvestments] = useLocalState(KEYS.investments, [])

  // 云端账本刚写回本机时，跳过一次"改动→上传"，避免刚解开就自推一版
  const skipPushRef = useRef(false)

  useEffect(() => {
    if (!CLOUD_ENABLED) return
    if (skipPushRef.current) { skipPushRef.current = false; return }
    markDirty()
  }, [modules, items, snapshots, investments])

  const onLedgerApplied = useCallback(() => {
    skipPushRef.current = true
    setModules(readJSON(KEYS.modules, []))
    setItems(readJSON(KEYS.items, []))
    setSnapshots(readJSON(KEYS.snapshots, []))
    setInvestments(readJSON(KEYS.investments, []))
  }, [setModules, setItems, setSnapshots, setInvestments])

  const totals = computeTotals(modules, items)
  const Page = PAGES[tab] || Dashboard

  return (
    <div className="module wb-fund">
      {CLOUD_ENABLED && <SyncBar onLedgerApplied={onLedgerApplied} />}
      <Page
        modules={modules}
        items={items}
        snapshots={snapshots}
        investments={investments}
        totals={totals}
        setModules={setModules}
        setItems={setItems}
        setSnapshots={setSnapshots}
        setInvestments={setInvestments}
      />
    </div>
  )
}
