// Supabase 客户端 · 与 personal-site 共享同一个项目
import { createClient } from '@supabase/supabase-js'

const URL = 'https://dvkbgbylwlomjevfckcj.supabase.co'
const KEY = 'sb_publishable_4Zm9p0KB-Rst6J9StoVZaA_GOgs4N8r'

export const supabase = createClient(URL, KEY)

export async function isLoggedIn() {
  const { data } = await supabase.auth.getSession()
  return !!(data && data.session)
}

export async function currentUserId() {
  const { data } = await supabase.auth.getSession()
  return (data && data.session && data.session.user && data.session.user.id) || null
}

export async function currentUserEmail() {
  const { data } = await supabase.auth.getSession()
  return (data && data.session && data.session.user && data.session.user.email) || null
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password })
  if (error) throw error
  return data
}

export async function signOut() {
  await supabase.auth.signOut()
}

// ====== 对话历史（跨设备同步） ======

/** 加载最近 N 条消息 */
export async function loadChatHistory(limit = 200) {
  const uid = await currentUserId()
  if (!uid) return []
  const { data, error } = await supabase
    .from('chat_history')
    .select('role,content,model,error,created_at')
    .eq('user_id', uid)
    .order('created_at', { ascending: true })
    .limit(limit)
  if (error) return []
  return (data || []).map((r) => ({ role: r.role === 'ai' ? 'ai' : 'user', content: r.content, model: r.model || '', error: !!r.error }))
}

/** 保存一条消息 */
export async function saveChatMessage(role, content, model, isError) {
  const uid = await currentUserId()
  if (!uid) return
  try {
    await supabase.from('chat_history').insert({
      user_id: uid,
      role: role === 'ai' ? 'ai' : 'user',
      content,
      model: model || '',
      error: !!isError
    })
  } catch { /* ignore */ }
}

/** 清空对话 */
export async function clearChatHistory() {
  const uid = await currentUserId()
  if (!uid) return
  try {
    await supabase.from('chat_history').delete().eq('user_id', uid)
  } catch { /* ignore */ }
}