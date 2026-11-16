// AI 接入层：OpenAI 兼容 /chat/completions，配置存 localStorage
import { readLS, KEYS } from './store.js'

export function getAiConfig() {
  return readLS(KEYS.aiConfig, { baseUrl: '', model: '', apiKey: '', enabled: false })
}

export function aiAvailable() {
  const c = getAiConfig()
  return c.enabled && c.apiKey && c.baseUrl && c.model
}

/**
 * 调用大模型。
 * @param {Array<{role:string,content:string}>} messages
 * @param {{temperature?:number, maxTokens?:number, json?:boolean, signal?:AbortSignal}} opts
 * @returns {Promise<string>} 模型返回的文本
 */
export async function chat(messages, opts = {}) {
  const c = getAiConfig()
  if (!(c.enabled && c.apiKey && c.baseUrl && c.model)) {
    throw new Error('AI_NOT_CONFIGURED')
  }
  const url = c.baseUrl.replace(/\/+$/, '') + '/chat/completions'
  const body = {
    model: c.model,
    messages,
    temperature: opts.temperature ?? 0.7,
    max_tokens: opts.maxTokens ?? 4000
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${c.apiKey}`
    },
    body: JSON.stringify(body),
    signal: opts.signal
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`AI_HTTP_${res.status}: ${text.slice(0, 300)}`)
  }
  const data = await res.json()
  const content = data?.choices?.[0]?.message?.content
  if (typeof content !== 'string') throw new Error('AI_BAD_RESPONSE')
  return content
}

/** 让模型尽量返回 JSON 并解析（容忍 ```json 代码块包裹） */
export async function chatJson(messages, opts = {}) {
  const raw = await chat(
    [
      ...messages,
      { role: 'system', content: 'Always answer with valid JSON only, no markdown fences, no commentary.' }
    ],
    { ...opts, temperature: opts.temperature ?? 0.3 }
  )
  let text = raw.trim()
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) text = fence[1].trim()
  const start = text.search(/[[{]/)
  if (start > 0) text = text.slice(start)
  return JSON.parse(text)
}

/** 连通性测试，返回 {ok, message} */
export async function testConnection() {
  try {
    const reply = await chat(
      [{ role: 'user', content: '请只回复两个字：正常' }],
      { maxTokens: 20, temperature: 0 }
    )
    return { ok: true, message: `连接成功，模型回复：${reply.slice(0, 50)}` }
  } catch (e) {
    if (e.message === 'AI_NOT_CONFIGURED') return { ok: false, message: '请先填写完整配置并启用 AI' }
    return { ok: false, message: e.message }
  }
}
