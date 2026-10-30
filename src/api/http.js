// 后端 HTTP 客户端：统一处理 base URL、token、错误
const raw =
  (typeof window !== 'undefined' && window.__API_BASE__) ||
  import.meta.env.VITE_API_BASE ||
  ''

export const API_BASE = String(raw).replace(/\/+$/, '')
export const HAS_BACKEND = Boolean(API_BASE)

const TOKEN_KEY = 'ps_api_token'

export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY) || '' } catch { return '' }
}

export function setToken(t) {
  try { localStorage.setItem(TOKEN_KEY, t || '') } catch { /* ignore */ }
}

export function clearToken() {
  try { localStorage.removeItem(TOKEN_KEY) } catch { /* ignore */ }
}

export async function request(path, { method = 'GET', body, auth = true, timeout = 120000 } = {}) {
  if (!API_BASE) throw new Error('未配置后端地址（config.js 的 __API_BASE__）')

  const headers = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (auth) {
    const t = getToken()
    if (t) headers.Authorization = 'Bearer ' + t
  }

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeout)
  try {
    const res = await fetch(API_BASE + path, {
      method, headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctrl.signal
    })
    const text = await res.text()
    let data
    try { data = JSON.parse(text) } catch { data = { raw: text.slice(0, 200) } }
    if (res.status === 401) { clearToken(); throw new Error('登录已过期，请重新登录') }
    if (data && data.error) throw new Error(data.error)
    if (!res.ok) throw new Error('HTTP ' + res.status)
    return data
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('请求超时')
    if (err instanceof TypeError) throw new Error('无法连接后端服务')
    throw err
  } finally { clearTimeout(timer) }
}