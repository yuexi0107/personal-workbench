// 统一的 localStorage 状态管理：useLocalState(key, initial) 返回 [value, setValue, reset]
// 同一 key 在多处使用时会通过自定义事件保持同步。
import { useState, useEffect, useCallback } from 'react'

const LS_EVENT = 'iw:ls-change'

export function readLS(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return fallback
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

export function writeLS(key, value) {
  localStorage.setItem(key, JSON.stringify(value))
  window.dispatchEvent(new CustomEvent(LS_EVENT, { detail: { key } }))
}

export function useLocalState(key, initial) {
  const [value, setValue] = useState(() => readLS(key, initial))

  useEffect(() => {
    const onChange = (e) => {
      if (e.detail && e.detail.key === key) setValue(readLS(key, initial))
    }
    window.addEventListener(LS_EVENT, onChange)
    return () => window.removeEventListener(LS_EVENT, onChange)
  }, [key])

  const set = useCallback((v) => {
    setValue((prev) => {
      const next = typeof v === 'function' ? v(prev) : v
      writeLS(key, next)
      return next
    })
  }, [key])

  const reset = useCallback(() => {
    localStorage.removeItem(key)
    setValue(initial)
    window.dispatchEvent(new CustomEvent(LS_EVENT, { detail: { key } }))
  }, [key])

  return [value, set, reset]
}

// 全局存储键约定
export const KEYS = {
  aiConfig: 'iw:ai-config',      // { baseUrl, model, apiKey, enabled }
  favorites: 'iw:favorites',     // [questionId]
  bankDone: 'iw:bank-done',      // { [questionId]: {done, star} }
  resumes: 'iw:resumes',         // [{id,name,text,createdAt}]
  jobs: 'iw:jobs',               // [{id,name,company,text,createdAt}]
  predictions: 'iw:predictions', // [{id,resumeId,jobId,mode,items,createdAt}]
  interviews: 'iw:interviews',   // [{id,title,role,qa:[{q,a,seconds,score,comment}],totalSec,createdAt,report}]
  pipeline: 'iw:pipeline',       // [{id,company,role,link,status,round,notes,nextDate,updatedAt}]
  practiceStats: 'iw:practice-stats' // { [category]: {done, total} }
}
