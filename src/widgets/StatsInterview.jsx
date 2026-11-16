// 面试速览：读取面试模块 iw:* 数据（只读，不写入）
import React from 'react'
import { readLS } from '../app/store.js'
import { KEYS } from '../modules/interview/store.js'
import { QUESTIONS } from '../modules/interview/data/questions.js'
import { navigate } from '../app/navigate.js'

const TERMINAL = ['Offer', '已拒绝/流程终止']

export default function StatsInterview() {
  const favorites = readLS(KEYS.favorites, [])
  const bankDone = readLS(KEYS.bankDone, {})
  const pipeline = readLS(KEYS.pipeline, [])
  const interviews = readLS(KEYS.interviews, [])

  const doneCount = Object.values(bankDone).filter((d) => d && d.done).length
  const activeApps = pipeline.filter((p) => !TERMINAL.includes(p.status)).length

  return (
    <div>
      <div className="wb-kpi-grid">
        <div className="wb-kpi"><div className="wb-kpi-num">{QUESTIONS.length}</div><div className="wb-kpi-label">题库总数</div></div>
        <div className="wb-kpi"><div className="wb-kpi-num">{doneCount}</div><div className="wb-kpi-label">已刷</div></div>
        <div className="wb-kpi"><div className="wb-kpi-num">{favorites.length}</div><div className="wb-kpi-label">收藏</div></div>
        <div className="wb-kpi"><div className="wb-kpi-num">{activeApps}</div><div className="wb-kpi-label">进行中投递</div></div>
        <div className="wb-kpi"><div className="wb-kpi-num">{interviews.length}</div><div className="wb-kpi-label">模拟面试</div></div>
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn btn-sm" onClick={() => navigate('/workbench/interview/bank')}>进入题库 →</button>
        <button className="btn btn-sm" onClick={() => navigate('/workbench/interview/pipeline')}>投递看板 →</button>
      </div>
    </div>
  )
}
