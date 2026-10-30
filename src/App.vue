<script setup>
import { ref, computed, nextTick, onMounted, watch } from 'vue'
import { checkHealth, chat as doChat } from './api/model'
import { listCloudModels, listLocalModels, listAllModels, modelGroup, loadCustomModels, addCustomModel, editCustomModel, removeCustomModel, LOCAL_PREFIX, isLocalId, isCustomId } from './api/models'

// 状态
const busy = ref(false)
const input = ref('')
const messages = ref([])
const error = ref('')
const online = ref(false)

const cloudModels = ref([])
const localModels = ref([])
const currentModel = ref('')

// 自定义模型管理弹窗
const customOpen = ref(false)
const customEditing = ref(null)  // null=添加模式，object=编辑模式
const customForm = ref({ label: '', endpoint: '', apiKey: '', modelId: '' })
const customModels = ref([])

const CHAT_KEY = 'ai_chat_model'

const allModels = computed(() => listAllModels(cloudModels.value, localModels.value))

const currentLabel = computed(() => {
  const m = allModels.value.find((x) => x.id === currentModel.value)
  if (m) return m.label
  return '选择模型'
})

const currentProvider = computed(() => {
  const m = allModels.value.find((x) => x.id === currentModel.value)
  return m ? modelGroup(m) : ''
})

const canSend = computed(() => currentModel.value && input.value.trim() && !busy.value)

// 消息列表滚动到最新
const msgList = ref(null)
function scrollBottom() {
  nextTick(() => {
    const el = msgList.value
    if (el) el.scrollTop = el.scrollHeight
  })
}

// 发消息
async function send() {
  const text = input.value.trim()
  if (!text || !currentModel.value || busy.value) return
  error.value = ''
  busy.value = true
  messages.value.push({ role: 'user', content: text })
  input.value = ''
  scrollBottom()
  try {
    const res = await doChat(text, { model: currentModel.value, history: recentHistory() })
    messages.value.push({ role: 'ai', content: res.answer, model: res.model })
  } catch (e) {
    error.value = e.message || String(e)
    messages.value.push({ role: 'ai', content: '❌ ' + error.value, error: true })
  } finally {
    busy.value = false
    scrollBottom()
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

// 换模型
function onChangeModel() {
  try { localStorage.setItem(CHAT_KEY, currentModel.value) } catch { /* ignore */ }
}

// 自定义模型弹窗
function openCustom() {
  customEditing.value = null
  customForm.value = { label: '', endpoint: '', apiKey: '', modelId: '' }
  customOpen.value = true
}

function editCustom(model) {
  customEditing.value = model
  customForm.value = { label: model.label, endpoint: model.endpoint, apiKey: model.apiKey || '', modelId: model.modelId || '' }
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
  // 恢复下拉
  customOpen.value = false
}

function delCustom(model) {
  customModels.value = removeCustomModel(model.id)
  if (currentModel.value === model.id) currentModel.value = ''
}

// 启动
onMounted(async () => {
  const h = await checkHealth()
  online.value = h.online

  cloudModels.value = await listCloudModels()
  localModels.value = await listLocalModels()
  customModels.value = loadCustomModels()

  // 上次选的模型
  let stored = ''
  try { stored = localStorage.getItem(CHAT_KEY) || '' } catch { /* ignore */ }

  const all = listAllModels(cloudModels.value, localModels.value)
  const valid = all.some((m) => m.id === stored)
  currentModel.value = valid ? stored : (all[0] ? all[0].id : '')
})
</script>

<template>
  <div class="ai-app">
    <header class="ai-top">
      <span class="ai-logo">🤖 AI 助手</span>
      <div class="ai-version">v{{ __APP_VERSION__ }}</div>
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
        <span class="ai-status">{{ online ? '在线' : '离线' }}</span>
      </div>
      <button class="ai-btn ghost" type="button" @click="openCustom">⚙️ 管理自定义模型</button>
    </div>

    <!-- 消息 -->
    <main ref="msgList" class="ai-msgs">
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
        v-model="input"
        class="ai-input"
        rows="2"
        maxlength="2000"
        placeholder="输入问题，Enter 发送，Shift+Enter 换行"
        :disabled="busy"
        @keydown="onKeydown"
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
          <label class="cm-field">
            <span>名称</span>
            <input v-model="customForm.label" type="text" placeholder="如 本地 DeepSeek" maxlength="30" />
          </label>
          <label class="cm-field">
            <span>端点地址</span>
            <input v-model="customForm.endpoint" type="text" placeholder="http://127.0.0.1:11434 或 https://api.openai.com" maxlength="200" />
          </label>
          <label class="cm-field">
            <span>API Key（选填）</span>
            <input v-model="customForm.apiKey" type="text" placeholder="sk-…" maxlength="120" />
          </label>
          <label class="cm-field">
            <span>模型 ID（选填）</span>
            <input v-model="customForm.modelId" type="text" placeholder="如 deepseek-chat，不填用 default" maxlength="40" />
          </label>
          <p class="cm-hint">
            端点应与 OpenAI Chat Completions API 兼容（POST /v1/chat/completions）。
            只要你的服务端实现了 `messages` + `choices[0].message.content` 返回，就能直接接入。
          </p>
        </div>

        <div class="cm-actions">
          <button class="ai-btn" type="button" @click="customOpen = false">取消</button>
          <button class="ai-btn primary" type="button" :disabled="!customForm.label || !customForm.endpoint" @click="saveCustom">
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
  </div>
</template>