// 模型清单：云端（后端 /api/models）+ 本地（本机服务 /models）+ 自定义（localStorage）
import { request, HAS_BACKEND } from './http'

// 本地服务地址
export function localBase() {
  const raw = (typeof window !== 'undefined' && window.__LOCAL_MODEL__) || import.meta.env.VITE_LOCAL_MODEL || ''
  return String(raw).replace(/\/+$/, '')
}

// 前缀：本地和自定义都走本机或后续自定义端点
export const LOCAL_PREFIX = 'local:'
export const CUSTOM_PREFIX = 'custom:'

export function isLocalId(id) { return String(id || '').startsWith(LOCAL_PREFIX) }
export function isCustomId(id) { return String(id || '').startsWith(CUSTOM_PREFIX) }

export function localModelId(id) {
  const s = String(id || '')
  return isLocalId(s) ? s.slice(LOCAL_PREFIX.length) : s
}

// ========== 自定义模型（用户自己添加，存 localStorage） ==========
const CUSTOM_KEY = 'ai_custom_models'

export function loadCustomModels() {
  try {
    const raw = localStorage.getItem(CUSTOM_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function saveCustomModels(list) {
  try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(list)) } catch { /* ignore */ }
}

export function addCustomModel({ label, endpoint, apiKey, modelId } = {}) {
  const list = loadCustomModels()
  const id = CUSTOM_PREFIX + Date.now().toString(36)
  list.push({ id, label: label.trim() || '未命名模型', endpoint: endpoint.trim(), apiKey: apiKey.trim(), modelId: modelId.trim() })
  saveCustomModels(list)
  return list
}

export function editCustomModel(id, patch) {
  const list = loadCustomModels()
  const idx = list.findIndex((m) => m.id === id)
  if (idx < 0) return list
  list[idx] = { ...list[idx], ...patch }
  saveCustomModels(list)
  return list
}

export function removeCustomModel(id) {
  const list = loadCustomModels().filter((m) => m.id !== id)
  saveCustomModels(list)
  return list
}

// ========== 云端模型 ==========
export async function listCloudModels(timeout = 8000) {
  if (!HAS_BACKEND) return []
  try {
    const d = await request('/api/models', { auth: false, timeout })
    return (d.models || []).map((m) => ({ ...m, kind: 'cloud' }))
  } catch { return [] }
}

// ========== 本地模型 ==========
export async function listLocalModels(timeout = 3000) {
  const base = localBase()
  if (!base) return []
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeout)
  try {
    const res = await fetch(base + '/models', { signal: ctrl.signal })
    if (!res.ok) return []
    const d = await res.json()
    return (d.models || []).filter((m) => m && m.id).map((m) => ({
      id: LOCAL_PREFIX + m.id,
      label: m.label || m.id,
      desc: m.desc || '',
      kind: 'local',
      ready: m.ready !== false,
      loaded: !!m.loaded
    }))
  } catch { return [] }
  finally { clearTimeout(timer) }
}

// ========== 全部模型 ==========
export function listAllModels(cloud, local) {
  const custom = loadCustomModels().map((m) => ({ ...m, kind: 'custom' }))
  return [...(cloud || []), ...(local || []), ...custom]
}

// 模型归属
export function modelGroup(m) {
  if (!m) return '云端'
  if (m.kind === 'local') return '本地 · 仅本机可用'
  if (m.kind === 'custom') return '自定义'
  return '云端 · 任何设备可用'
}