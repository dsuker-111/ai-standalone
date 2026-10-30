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