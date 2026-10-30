<script setup>
import { ref, computed, nextTick, onMounted } from 'vue'
import { checkHealth, chat as doChat } from './api/model'
import { listCloudModels, listLocalModels, listAllModels, modelGroup, loadCustomModels, addCustomModel, editCustomModel, removeCustomModel, isLocalId, isCustomId } from './api/models'
import { MEETING_NOTES } from './data/meeting'

// ====== 登录 ======
const USERS_KEY = 'ai_users'
const SESSION_KEY = 'ai_session'
const loggedIn = ref(false)
const loginTab = ref('login')
const loginForm = ref({ username: '', password: '' })
const loginError = ref('')

function loadUsers() {
  try { return JSON.parse(localStorage.getItem(USERS_KEY) || '{}') } catch { return {} }
}
function saveUsers(u) {
  try { localStorage.setItem(USERS_KEY, JSON.stringify(u)) } catch {}
}

function doLogin() {
  loginError.value = ''
  const { username, password } = loginForm.value
  const users = loadUsers()
  if (users[username.trim()] !== password) {
    loginError.value = '用户名或密码错误'
    return
  }
  try { localStorage.setItem(SESSION_KEY, username.trim()) } catch {}
  loggedIn.value = true
}

function doRegister() {
  loginError.value = ''
  const { username, password } = loginForm.value
  if (!username.trim() || !password) { loginError.value = '用户名和密码不能为空'; return }
  const users = loadUsers()
  if (users[username.trim()]) { loginError.value = '该用户名已存在'; return }
  users[username.trim()] = password
  saveUsers(users)
  try { localStorage.setItem(SESSION_KEY, username.trim()) } catch {}
  loggedIn.value = true
}

function doLogout() {
  try { localStorage.removeItem(SESSION_KEY) } catch {}
  loggedIn.value = false
  loginForm.value = { username: '', password: '' }
}

// ====== 状态 ======
const busy = ref(false)
const input = ref('')
const messages = ref([])
const error = ref('')
const online = ref(false)

const cloudModels = ref([])
const localModels = ref([])
const currentModel = ref('')

const CHAT_KEY = 'ai_chat_model'
const MEETING_KEY = 'ai_meeting_on'
const MSGS_KEY = 'ai_chat_messages'
const MAX_MSGS = 200  // 最多保留 200 条消息

// 会议记录开关
const meetingOn = ref(false)
try {
  meetingOn.value = localStorage.getItem(MEETING_KEY) === '1'
} catch { /* ignore */ }

// ====== 模型弹窗 ======
const customOpen = ref(false)
const customEditing = ref(null)
const customForm = ref({ label: '', endpoint: '', apiKey: '', modelId: '' })
const customModels = ref([])
const showApiKey = ref(false)
const testingConn = ref(false)
const testResult = ref('')
const testResultOk = ref(false)

// 预设模板
const PRESETS = [
  { label: 'DeepSeek', endpoint: 'https://api.deepseek.com', modelId: 'deepseek-chat', desc: 'DeepSeek V3 · 须有 API Key' },
  { label: 'OpenAI', endpoint: 'https://api.openai.com', modelId: 'gpt-4o', desc: 'GPT-4o · 须有 API Key' },
  { label: 'Ollama 本地', endpoint: 'http://127.0.0.1:11434', modelId: 'qwen2.5:0.5b', desc: 'Ollama 常驻本地 · 通常无需 API Key' },
  { label: '通义千问（阿里云百炼）', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode', modelId: 'qwen-plus', desc: '阿里云大模型 · 须有百炼 API Key' },
  { label: '智谱 ChatGLM', endpoint: 'https://open.bigmodel.cn/api/paas/v4', modelId: 'glm-4-plus', desc: '智谱清言 · 须有 API Key' }
]

function applyPreset(preset) {
  customForm.value = {
    label: customForm.value.label || preset.desc,
    endpoint: preset.endpoint,
    apiKey: customForm.value.apiKey || '',
    modelId: preset.modelId
  }
}

async function testConnection() {
  testingConn.value = true
  testResult.value = ''
  testResultOk.value = false
  const ep = (customForm.value.endpoint || '').replace(/\/+$/, '') + '/v1/chat/completions'
  const headers = { 'Content-Type': 'application/json' }
  if (customForm.value.apiKey) headers.Authorization = 'Bearer ' + customForm.value.apiKey
  const t0 = Date.now()
  try {
    const res = await fetch(ep, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: customForm.value.modelId || 'default',
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 4
      }),
      signal: AbortSignal.timeout(15000)
    })
    const ms = Date.now() - t0
    const data = await res.json().catch(() => ({}))
    if (res.ok && (data.choices || data.error === undefined)) {
      testResult.value = `✅ 连接成功 · 延迟 ${ms}ms`
      testResultOk.value = true
    } else {
      const detail = (data.error && (data.error.message || data.error.code)) || 'HTTP ' + res.status
      testResult.value = `❌ 失败 · ${detail}`
    }
    // eslint-disable-next-line no-unused-vars
  } catch (e) {
    const ms = Date.now() - t0
    testResult.value = `❌ 无响应 · 等待 ${ms}ms`
  } finally {
    testingConn.value = false
  }
}

// ====== 自动换行展开 ======
const textareaRef = ref(null)
function autoResize() {
  nextTick(() => {
    const el = textareaRef.value
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  })
}

// ====== 计算 ======
const allModels = computed(() => listAllModels(cloudModels.value, localModels.value))

const currentProvider = computed(() => {
  const m = allModels.value.find((x) => x.id === currentModel.value)
  return m ? modelGroup(m) : ''
})

const canSend = computed(() => currentModel.value && input.value.trim() && !busy.value)

// ====== 消息 ======
const msgList = ref(null)
function scrollBottom() {
  nextTick(() => {
    const el = msgList.value
    if (el) el.scrollTop = el.scrollHeight
  })
}

async function send() {
  const text = input.value.trim()
  if (!text || !currentModel.value || busy.value) return
  error.value = ''
  busy.value = true
  const promptText = meetingOn.value
    ? `【会议记录】${MEETING_NOTES}\n\n【用户提问】${text}`
    : text
  messages.value.push({ role: 'user', content: text }) // 聊天只显示用户原文
  input.value = ''
  autoResize()
  scrollBottom()
  try {
    const res = await doChat(promptText, { model: currentModel.value, history: recentHistory() })
    messages.value.push({ role: 'ai', content: res.answer, model: res.model })
  } catch (e) {
    error.value = e.message || String(e)
    messages.value.push({ role: 'ai', content: '❌ ' + error.value, error: true })
  } finally {
    busy.value = false
    scrollBottom()
    saveMessages()
  }
}

function recentHistory(n = 8) {
  return messages.value
    .filter((m) => m.role === 'user' || m.role === 'ai')
    .slice(-n)
    .map((m) => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.content }))
}

function onKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    send()
  }
}

function onChangeModel() {
  try { localStorage.setItem(CHAT_KEY, currentModel.value) } catch { /* ignore */ }
}

function toggleMeeting() {
  meetingOn.value = !meetingOn.value
  try { localStorage.setItem(MEETING_KEY, meetingOn.value ? '1' : '0') } catch { /* ignore */ }
}

// ====== 对话持久化 ======
function saveMessages() {
  try {
    const payload = messages.value.slice(-MAX_MSGS)
    localStorage.setItem(MSGS_KEY, JSON.stringify(payload))
  } catch { /* ignore */ }
}

function loadMessages() {
  try {
    const raw = localStorage.getItem(MSGS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) messages.value = parsed
    }
  } catch { /* ignore */ }
}

function clearMessages() {
  messages.value = []
  try { localStorage.removeItem(MSGS_KEY) } catch { /* ignore */ }
}

// ====== 模型管理 ======
function openCustom() {
  customEditing.value = null
  customForm.value = { label: '', endpoint: '', apiKey: '', modelId: '' }
  showApiKey.value = false
  testResult.value = ''
  testResultOk.value = false
  customOpen.value = true
}

function editCustom(model) {
  customEditing.value = model
  customForm.value = { label: model.label, endpoint: model.endpoint, apiKey: model.apiKey || '', modelId: model.modelId || '' }
  showApiKey.value = false
  testResult.value = ''
  testResultOk.value = false
  customOpen.value = true
}

function saveCustom() {
  const f = customForm.value
  if (!f.label.trim() || !f.endpoint.trim()) return
  if (customEditing.value) {
    customModels.value = editCustomModel(customEditing.value.id, { label: f.label.trim(), endpoint: f.endpoint.trim(), apiKey: f.apiKey.trim(), modelId: f.modelId.trim() })
  } else {
    customModels.value = addCustomModel({ label: f.label, endpoint: f.endpoint, apiKey: f.apiKey, modelId: f.modelId })
  }
  customOpen.value = false
}

function delCustom(model) {
  customModels.value = removeCustomModel(model.id)
  if (currentModel.value === model.id) currentModel.value = ''
}

// ====== 启动 ======
onMounted(async () => {
  // 检查是否有上次登录的会话
  try {
    const sess = localStorage.getItem(SESSION_KEY)
    if (sess) {
      const users = loadUsers()
      if (users[sess]) loggedIn.value = true
    }
  } catch {}

  if (!loggedIn.value) return

  loadMessages()

  const h = await checkHealth()
  online.value = h.online

  cloudModels.value = await listCloudModels()
  localModels.value = await listLocalModels()
  customModels.value = loadCustomModels()

  let stored = ''
  try { stored = localStorage.getItem(CHAT_KEY) || '' } catch { /* ignore */ }

  const all = listAllModels(cloudModels.value, localModels.value)
  const valid = all.some((m) => m.id === stored)
  currentModel.value = valid ? stored : (all[0] ? all[0].id : '')
})
</script>

<template>
  <div class="ai-app">
    <!-- 登录界面 -->
    <div v-if="!loggedIn" class="ai-login-screen">
      <div class="ai-login-card">
        <div class="ai-login-brand">
          <span class="ai-login-logo">🤖</span>
          <h1>AI 助手</h1>
          <p>登录以使用 AI 对话</p>
        </div>

        <div class="login-tabs">
          <button :class="{ active: loginTab === 'login' }" type="button" @click="loginTab = 'login'">登录</button>
          <button :class="{ active: loginTab === 'register' }" type="button" @click="loginTab = 'register'">注册</button>
        </div>

        <form class="ai-login-form" @submit.prevent="loginTab === 'login' ? doLogin() : doRegister()">
          <input v-model.trim="loginForm.username" type="text" placeholder="用户名" autofocus autocomplete="username" />
          <input v-model="loginForm.password" type="password" placeholder="密码" autocomplete="current-password" />
          <p v-if="loginError" class="ai-login-err">{{ loginError }}</p>
          <button type="submit" :disabled="!loginForm.username || !loginForm.password">
            {{ loginTab === 'register' ? '注 册' : '登 录' }}
          </button>
        </form>

        <p class="ai-login-hint">账号保存在本机浏览器，不与个人主页互通</p>
      </div>
    </div>

    <!-- 聊天主界面 -->
    <template v-else>
    <header class="ai-top">
      <span class="ai-logo">🤖 AI 助手</span>
      <div class="ai-top-right">
        <button class="ai-btn ghost" type="button" @click="doLogout">退出登录</button>
        <div class="ai-version">v{{ __APP_VERSION__ }}</div>
      </div>
    </header>

    <!-- 模型栏 -->
    <div class="ai-bar">
      <div class="ai-bar-left">
        <select v-model="currentModel" class="ai-select" @change="onChangeModel">
          <option disabled value="">选择模型…</option>
          <optgroup v-if="cloudModels.length" label="云端 · 任何设备可用">
            <option v-for="m in cloudModels" :key="m.id" :value="m.id">{{ m.label }}</option>
          </optgroup>
          <optgroup v-if="localModels.length" label="本地 · 仅本机可用">
            <option v-for="m in localModels" :key="m.id" :value="m.id">{{ m.label }}</option>
          </optgroup>
          <optgroup v-if="customModels.length" label="自定义">
            <option v-for="m in customModels" :key="m.id" :value="m.id">{{ m.label }}</option>
          </optgroup>
        </select>
        <span class="ai-provider">{{ currentProvider }}</span>
        <span class="ai-dot" :class="online ? 'on' : 'off'"></span>
      </div>

      <div class="ai-bar-right">
        <!-- 会议记录开关 -->
        <button
          class="ai-chiptoggle"
          :class="{ active: meetingOn }"
          type="button"
          title="开启后每次提问自动带上腾讯会议记录作为上下文"
          @click="toggleMeeting"
        >
          <span :class="meetingOn ? 'mt-on' : 'mt-off'">📋</span>
          会议记录
        </button>
        <button class="ai-btn ghost" type="button" @click="openCustom">⚙️ 管理自定义模型</button>
      </div>
    </div>

    <!-- 会议记录开启提示 -->
    <div v-if="meetingOn" class="meeting-hint">
      📋 已开启会议记录模式（腾讯会议号 553 398 774 · 2026-10-27/28）—— 每次提问都会带上课程会议内容作为参考上下文
    </div>

    <!-- 消息 -->
    <main ref="msgList" class="ai-msgs">
      <div v-if="messages.length" class="ai-msgs-header">
        <span class="ai-msgs-count">{{ messages.length }} 条消息</span>
        <button class="ai-btn ghost danger" type="button" @click="clearMessages">清空对话</button>
      </div>
      <div v-if="!messages.length" class="ai-empty">
        <p>👋 选好模型，输入问题开始对话</p>
        <p class="ai-empty-sub">云端走阿里云百炼 · 本机走 TRAE 训练模型 · 也可加自定义 OpenAI 兼容端点</p>
      </div>

      <div
        v-for="(m, i) in messages"
        :key="i"
        class="ai-msg"
        :class="m.role === 'user' ? 'user' : 'ai'"
      >
        <div class="ai-bubble" :class="{ err: m.error }">{{ m.content }}</div>
        <div v-if="m.role === 'ai' && m.model" class="ai-model-tag">{{ m.model }}</div>
      </div>

      <div v-if="busy" class="ai-msg ai">
        <div class="ai-bubble typing">思考中<span class="dots">…</span></div>
      </div>
    </main>

    <!-- 输入 -->
    <footer class="ai-foot">
      <textarea
        ref="textareaRef"
        v-model="input"
        class="ai-input"
        rows="1"
        maxlength="2000"
        placeholder="输入问题，Enter 发送，Shift+Enter 换行"
        :disabled="busy"
        @keydown="onKeydown"
        @input="autoResize"
      ></textarea>
      <button class="ai-btn send" :disabled="!canSend" @click="send">发送</button>
    </footer>

    <!-- 自定义模型弹窗 -->
    <div v-if="customOpen" class="cm-mask" @click.self="customOpen = false">
      <div class="cm-modal">
        <header class="cm-head">
          <span>{{ customEditing ? '编辑模型' : '添加自定义模型' }}</span>
          <button class="cm-close" @click="customOpen = false">✕</button>
        </header>

        <div class="cm-body">
          <!-- 预设模板 -->
          <div class="cm-presets">
            <span class="cm-section-label">快速预设</span>
            <div class="cm-preset-chips">
              <button
                v-for="p in PRESETS"
                :key="p.label"
                class="cm-preset"
                type="button"
                :title="p.desc"
                @click="applyPreset(p)"
              >
                {{ p.label }}
              </button>
            </div>
          </div>

          <label class="cm-field">
            <span>名称</span>
            <input v-model="customForm.label" type="text" placeholder="如 我的 DeepSeek" maxlength="30" />
          </label>
          <label class="cm-field">
            <span>端点地址</span>
            <input v-model="customForm.endpoint" type="text" placeholder="https://api.deepseek.com" maxlength="200" />
          </label>
          <label class="cm-field">
            <span>API Key</span>
            <div class="cm-key-row">
              <input
                v-model="customForm.apiKey"
                :type="showApiKey ? 'text' : 'password'"
                placeholder="sk-…（选填）"
                maxlength="120"
              />
              <button class="ai-btn ghost" type="button" @click="showApiKey = !showApiKey">
                {{ showApiKey ? '隐藏' : '显示' }}
              </button>
            </div>
          </label>
          <label class="cm-field">
            <span>模型 ID</span>
            <input v-model="customForm.modelId" type="text" placeholder="如 deepseek-chat，不填用 default" maxlength="40" />
          </label>

          <!-- 测试连接 -->
          <div class="cm-test">
            <button
              class="ai-btn"
              type="button"
              :disabled="testingConn || !customForm.endpoint"
              @click="testConnection"
            >
              {{ testingConn ? '测试中…' : '🔌 检测连接' }}
            </button>
            <span v-if="testResult" class="cm-test-result" :class="testResultOk ? 'ok' : 'fail'">
              {{ testResult }}
            </span>
          </div>

          <p class="cm-hint">
            端点应与 OpenAI Chat Completions API 兼容（`POST /v1/chat/completions`）。
          </p>
        </div>

        <div class="cm-actions">
          <button class="ai-btn" type="button" @click="customOpen = false">取消</button>
          <button
            class="ai-btn primary"
            type="button"
            :disabled="!customForm.label || !customForm.endpoint"
            @click="saveCustom"
          >
            {{ customEditing ? '保存修改' : '添加' }}
          </button>
        </div>

        <!-- 已有列表 -->
        <div v-if="customModels.length" class="cm-list">
          <p class="cm-list-title">已添加的模型</p>
          <div v-for="m in customModels" :key="m.id" class="cm-item">
            <div class="cm-item-info">
              <strong>{{ m.label }}</strong>
              <span>{{ m.endpoint }}</span>
            </div>
            <div class="cm-item-acts">
              <button class="ai-btn ghost" type="button" @click="editCustom(m)">✎</button>
              <button class="ai-btn ghost danger" type="button" @click="delCustom(m)">🗑</button>
            </div>
          </div>
        </div>
      </div>
    </div>
    </template>
  </div>
</template>