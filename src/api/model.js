// AI 对话：云端走后端，本地直连 127.0.0.1:8000，自定义也走本地格式（兼容 openai 兼容端点）
import { request, HAS_BACKEND, API_BASE } from './http'
import { localBase, isLocalId, isCustomId, localModelId, loadCustomModels } from './models'

const FALLBACK_NAME = 'deepseek-v4.1-flash'

// 健康检查
export async function checkHealth(timeout = 8000) {
  if (HAS_BACKEND) {
    try {
      const d = await request('/api/health', { auth: false, timeout })
      return {
        online: d.status === 'ok',
        model: d.model || FALLBACK_NAME,
        provider: 'aliyun-dashscope',
        keyConfigured: d.ai_configured !== false,
        mode: 'backend'
      }
    } catch { return { online: false } }
  }
  // 有本地服务也算在线
  const lb = localBase()
  if (lb) {
    try {
      const res = await fetch(lb + '/health', { signal: AbortSignal.timeout(4000) })
      if (res.ok) return { online: true, model: 'local', mode: 'local' }
    } catch { /* ignore */ }
  }
  return { online: false }
}

// 发送对话
export async function chat(prompt, options = {}) {
  // 自定义模型
  if (isCustomId(options.model)) {
    return chatCustom(prompt, options)
  }
  // 本地模型
  if (isLocalId(options.model)) {
    return chatLocal(prompt, options)
  }
  // 云端
  return chatCloud(prompt, options)
}

async function chatCloud(prompt, options = {}) {
  if (!HAS_BACKEND) throw new Error('未配置后端地址')
  const d = await request('/api/chat', {
    method: 'POST',
    body: {
      prompt,
      history: options.history || [],
      model: options.model || undefined
    },
    timeout: options.timeout || 120000
  })
  return { answer: d.answer || '', model: d.model || FALLBACK_NAME, raw: d }
}

async function chatLocal(prompt, options = {}) {
  const base = localBase()
  if (!base) throw new Error('未配置本地模型地址')

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), options.timeout || 180000)
  try {
    const res = await fetch(base + '/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        model: localModelId(options.model),
        history: options.history || [],
        max_new_tokens: options.maxNewTokens ?? 320,
        temperature: options.temperature ?? 0.7
      }),
      signal: ctrl.signal
    })
    if (!res.ok) throw new Error('本地模型返回 HTTP ' + res.status)
    const data = await res.json()
    if (data && data.error) throw new Error(data.error)
    return { answer: (data && data.answer) || '', model: (data && data.model_label) || 'local-model', local: true, raw: data }
  } catch (err) {
    if (err && err.name === 'AbortError') throw new Error('本地模型响应超时')
    if (err instanceof TypeError) throw new Error('无法连接本地模型服务，请先启动 web_api.py')
    throw err
  } finally { clearTimeout(timer) }
}

/** 自定义模型：调用户填入的 endpoint，兼容 OpenAI 兼容 API */
async function chatCustom(prompt, options = {}) {
  const list = loadCustomModels()
  const meta = list.find((m) => m.id === options.model)
  if (!meta) throw new Error('未找到该自定义模型')

  const endpoint = meta.endpoint.replace(/\/+$/, '') + '/v1/chat/completions'
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), options.timeout || 120000)
  try {
    const headers = { 'Content-Type': 'application/json' }
    if (meta.apiKey) headers.Authorization = 'Bearer ' + meta.apiKey

    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: meta.modelId || 'default',
        messages: [
          { role: 'user', content: prompt }
        ],
        max_tokens: options.maxNewTokens ?? 512,
        temperature: options.temperature ?? 0.7
      }),
      signal: ctrl.signal
    })
    if (!res.ok) throw new Error('自定义模型 HTTP ' + res.status)
    const data = await res.json()
    const answer = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || ''
    if (!answer && data.error) throw new Error(data.error.message || data.error)
    return { answer: answer.trim() || '（空应答）', model: meta.label || 'custom', raw: data }
  } catch (err) {
    if (err && err.name === 'AbortError') throw new Error('自定义模型响应超时')
    if (err instanceof TypeError) throw new Error('无法连接自定义模型端点：' + meta.endpoint)
    throw err
  } finally { clearTimeout(timer) }
}