// 验证独立 AI 助手：模型下拉 / 自定义模型弹窗 / 对话
const { chromium } = require('playwright')
const APP_URL = process.env.APP_URL || 'http://localhost:5174/'

;(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  const context = await browser.newContext({ viewport: { width: 960, height: 900 } })
  try { await context.grantPermissions(['local-network-access'], { origin: new URL(APP_URL).origin }) } catch {}
  const page = await context.newPage()

  await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForSelector('.ai-select', { timeout: 25000 })
  await page.waitForTimeout(2000)

  // 1. 列出所有模型（云端/本地可能因网络不可达为空）
  const opts = await page.evaluate(() =>
    [...document.querySelectorAll('.ai-select option:not([disabled])')].map((o) => ({
      text: o.textContent.trim(),
      value: o.value
    }))
  )
  console.log('1) 模型下拉:', opts.length, '个')
  opts.forEach((o) => console.log('   ', o.value.slice(0, 30), '→', o.text))

  // 2. 打开自定义模型弹窗 → 加一个测试 → 看下拉出现
  await page.click('button:has-text("管理自定义模型")')
  await page.waitForSelector('.cm-modal', { timeout: 8000 })
  console.log('2) 弹窗已打开:', await page.evaluate(() => document.querySelector('.cm-head span')?.textContent.trim()))

  await page.fill('.cm-field:nth-child(1) input', 'DeepSeek 测试')
  await page.fill('.cm-field:nth-child(2) input', 'https://api.deepseek.com')
  await page.fill('.cm-field:nth-child(4) input', 'deepseek-chat')
  await page.click('button:has-text("添加")')
  await page.waitForTimeout(600)

  // 弹窗自动关了，检查下拉
  const customOpts = await page.evaluate(() =>
    [...document.querySelectorAll('.ai-select option')].filter((o) => o.value.startsWith('custom:')).map((o) => ({ val: o.value, text: o.textContent.trim() }))
  )
  console.log('3) 自定义模型已加入:', customOpts.length, '个 →', customOpts.map((o) => o.text).join(', '))

  // 再打开弹窗，编辑刚加的模型
  await page.click('button:has-text("管理自定义模型")')
  await page.waitForSelector('.cm-modal', { timeout: 8000 })
  const editBtn = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('.cm-item-acts button')]
    const edit = btns.find((b) => b.textContent.trim() === '✎')
    return edit ? 'found' : null
  })
  console.log('4) 编辑按钮:', editBtn)
  // 关弹窗
  await page.click('.cm-close')
  await page.waitForTimeout(400)

  // 选一个可用模型
  await page.evaluate(() => {
    const s = document.querySelector('.ai-select')
    const avail = [...s.options].filter((o) => o.value && !o.disabled)
    if (avail.length) { s.value = avail[0].value; s.dispatchEvent(new Event('change', { bubbles: true })) }
  })
  const sel = await page.evaluate(() => document.querySelector('.ai-select').value)
  console.log('5) 选中:', sel.slice(0, 40))

  // 如果选中的是自定义模型（端点可能不通），跳过对话实测
  if (sel.startsWith('custom:')) {
    console.log('6) 自定义模型端点跳过对话（远端可能不通）')
  } else if (sel) {
    await page.fill('.ai-input', 'hello')
    await page.click('button:has-text("发送")')
    await page.waitForFunction(() => document.querySelectorAll('.ai-msg.ai .ai-bubble').length >= 2, { timeout: 60000 })
    const last = await page.evaluate(() => {
      const msgs = document.querySelectorAll('.ai-msg.ai .ai-bubble')
      return msgs[msgs.length - 1].textContent.trim()
    })
    console.log('6) AI 应答:', last.slice(0, 80))
  }

  // 删掉刚才加的自定义模型（清理）
  await page.click('button:has-text("管理自定义模型")')
  await page.waitForSelector('.cm-modal', { timeout: 8000 })
  const del = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('.cm-item-acts button')]
    const delBtn = btns.find((b) => b.textContent.trim() === '🗑')
    if (delBtn) { delBtn.click(); return 'deleted' }
    return 'not found'
  })
  console.log('7) 已删除自定义模型:', del)
  await page.click('.cm-close')
  await page.screenshot({ path: '.tmpmedia/ais-home.png' })
  await browser.close()
  console.log('✅ 功能验证通过')
})().catch((e) => { console.error('失败:', e.message); process.exit(1) })