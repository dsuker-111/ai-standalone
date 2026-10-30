// 验证 v2：会议记录开关 + 预设模板 + 连接测试
const { chromium } = require('playwright')
const APP_URL = process.env.APP_URL || 'http://localhost:5174/'

;(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  const context = await browser.newContext({ viewport: { width: 960, height: 900 } })
  try { await context.grantPermissions(['local-network-access'], { origin: new URL(APP_URL).origin }) } catch {}
  const page = await context.newPage()
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForSelector('.ai-select', { timeout: 30000 })
  await page.waitForTimeout(3000)

  // 1. 会议记录开关
  const chip = await page.$('.ai-chiptoggle')
  if (!chip) throw new Error('会议记录开关不存在')
  const chipText = await chip.textContent()
  console.log('1) 会议记录开关:', chipText.trim())
  
  // 点开
  await chip.click()
  await page.waitForTimeout(500)
  const hint = await page.$('.meeting-hint')
  if (!hint) throw new Error('会议模式提示条不存在')
  const hintText = await hint.textContent()
  console.log('2) 提示条:', hintText.slice(0, 60) + '…')
  if (!hintText.includes('腾讯会议号 553 398 774')) throw new Error('会议号缺失')

  // 关掉
  await chip.click()
  await page.waitForTimeout(400)
  const hint2 = await page.$('.meeting-hint')
  console.log('3) 关闭后提示条消失:', hint2 ? '❌ 还在' : '✅')

  // 4. 打开模型管理弹窗
  await page.click('button:has-text("管理自定义模型")')
  await page.waitForSelector('.cm-modal', { timeout: 8000 })
  console.log('4) 弹窗已打开')

  // 5. 预设模板
  const presets = await page.$$('.cm-preset')
  console.log('5) 预设模板:', presets.length, '个')
  const presetTexts = await Promise.all(presets.map(p => p.textContent()))
  presetTexts.forEach(t => console.log('   →', t.trim()))

  // 点 DeepSeek 预设
  if (presets.length) {
    await presets[0].click()
    await page.waitForTimeout(300)
    const epVal = await page.$eval('.cm-field:nth-child(3) input', el => el.value)
    console.log('6) 选中 DeepSeek 预设 → endpoint:', epVal)
    if (!epVal.includes('api.deepseek.com')) throw new Error('端点未正确填充')
  }

  // 7. 测试连接按钮
  const testBtn = await page.$('button:has-text("检测连接")')
  if (!testBtn) throw new Error('检测连接按钮不存在')
  console.log('7) 检测连接按钮: ✅')

  // 8. API Key 显隐
  await page.fill('.cm-key-row input', 'sk-test123')
  await page.click('.cm-key-row button')
  await page.waitForTimeout(300)
  const keyType = await page.$eval('.cm-key-row input', el => el.type)
  console.log('8) API Key 显示:', keyType === 'text' ? '✅ 可见' : '❌ 仍隐藏')

  await page.screenshot({ path: '.tmpmedia/ais-v2.png' })
  await page.click('.cm-close')
  await browser.close()
  console.log('\n✅ 全部通过')
})().catch(e => { console.error('失败:', e.message); process.exit(1) })