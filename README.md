# AI助手（ai-standalone）

**当前版本：`v3.0.0`**

独立 AI 对话工具，支持 Supabase 邮箱登录、跨设备对话同步、自定义模型、本地模型和会议记录模式。

线上地址：**https://ai-chat-tool.surge.sh**

## 功能一览

| 模块 | 说明 |
| --- | --- |
| 登录 | Supabase Auth 邮箱+密码，账号存云端，任何电脑都能登录 |
| 对话同步 | 消息实时写入 `chat_history` 表，换设备登录后自动恢复历史 |
| 历史记录 | 顶栏「📜 历史」按钮，侧滑面板按日期分组浏览 |
| 模型切换 | 云端模型（阿里云）+ 本地模型（TRAE）+ 自定义 OpenAI 兼容端点 |
| 会议记录 | 一键切换，每次提问自动带上会议内容作为上下文 |
| 自定义模型 | 支持 DeepSeek/OpenAI/Ollama/通义千问/智谱等，可检测连接 |

## 支持模型

| 模型 | 来源 | 可用范围 |
| --- | --- | --- |
| deepseek-v4.1-flash | 阿里云百炼 | 任何设备 |
| 本地 LoRA 模型 | TRAE 训练 Qwen2.5-0.5B | 仅本机 |
| 自定义模型 | 用户填写 OpenAI 兼容端点 | 任何设备 |

## 快速开始

```bash
npm install
npm run dev       # 开发模式 http://localhost:5174
npm run build     # 生产构建到 dist/
```

## 部署

```bash
npm run build
npx surge ./dist ai-chat-tool.surge.sh
```

## 架构

```
浏览器（Vue 3 SPA，Surge 托管）
 ├─ 登录：Supabase Auth
 ├─ AI 对话：阿里云 FC3 后端 → 百炼（已停） / 本地 / 自定义
 ├─ 对话存储：Supabase chat_history 表
 └─ 本地模型：http://127.0.0.1:8000
```

## 与 personal-site 的关系

两站共享同一个 Supabase 项目：
- **AI助手**：独立登录（Supabase Auth），只做对话
- **个人主页**：本地登录，含天气/资料/资源库/AI聊天

## 技术栈

- 前端：Vue 3 · Vite 5
- 样式：原生 CSS
- 认证：Supabase Auth
- 数据：Supabase PostgreSQL（chat_history 表）