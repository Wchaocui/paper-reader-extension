# 📖 PaperLens 文献阅读助手

一个 Chrome / Edge 浏览器扩展（Manifest V3），为科研阅读设计 **略读 / 精读 / 审读（同行评审式批判阅读）** 三种 AI 分析模式，支持开放式追问、审稿流程可视化，自动生成结构化文献卡片，本地笔记库 + Google 在线表格 / 文档同步。

## ✨ 功能

### ⚡ 略读模式（快速筛选）
打开论文页面后一键分析，基于**摘要、图表说明、结论**，输出：

- 🎯 应用场景 —— 这篇文章能用在哪
- ❓ 重点解决的问题 —— 作者要攻克什么
- 💡 创新点 —— 相对已有工作新在哪
- 🔧 方法 —— 核心技术路线

侧栏同时展示提取到的**论文图表画廊**，配合 AI 摘要快速扫读。

### 📖 精读模式（吃透全文）
基于**全文**输出：

- 一、论文整体框架（层级大纲：背景 → 问题 → 方法 → 实验 → 结论）
- 二、作者做了什么：解决的问题 / 方法（详细）/ 发现（关键实验结果）/ 结论
- 三、核心观点（含支撑证据）
- 四、**对我的启发**（结合你在设置中填写的研究者档案，给出可落地建议）

### ⚖️ 审读模式（像挑剔的同行评审一样读论文）
**不总结、只挑刺**：AI 自问自答一套审稿问题链，每个判断都要求论文证据，不替作者补结论，推测显式标注。四个等级按钮控制思考深度：

| 等级 | 覆盖 | 回答的问题 |
|---|---|---|
| **L1 快筛** | 值不值得读 | 核心问题是什么（不重复摘要）/ 为什么重要 / 真创新在哪（新问题·方法·数据·机制·场景）/ 最朴素的本质是什么 |
| **L2 查假设** | + 隐含假设 | 哪条核心假设 fails 文章就没意义 / 因果与相关有没有混淆 / 有没有替代解释 |
| **L3 挑方法** | + 设计 nitpick | 选择偏差·遗漏变量·反向因果·测量偏差 / 样本边界撑得起结论吗 / 核心变量怎么测的、换测法结果会变吗 / 控制变量有效吗 |
| **L4 全审稿** | + 结论边界 + 对我的启发 | 显著结果有现实意义吗 / 哪条最 robust 哪条最薄弱 / 有没有作者没讨论的奇怪结果 / 结论什么情况下失败 / 改什么变量结果会变（异质性）/ 继续深入最值得研究的三个问题 / 和我的研究在哪接上 |

每级都以「⚠️ 审读收束」结尾：**这篇文章最值得怀疑的地方是哪里？它真正留下了什么？**

### 💬 开放式追问
任意分析完成后，可直接就这篇论文继续提问（如"它的识别策略在 XX 场景还成立吗？""图 3 那个异常点怎么看？"）。AI 携带论文全文 + 刚才的分析结论作答，多轮追问，问答记录一并存入笔记。

### 🗺 审稿流程可视化
「审稿流程」标签页展示五阶段流程图（值不值得读 → 挖隐含假设 → 挑设计毛病 → 划结论边界 → 接我的研究），每个阶段可**一键发起对应等级的审读**；也附"反向使用"指南——写/改论文时按此清单自检。

### 📇 文献卡片（自动记录）
分析完成后自动生成，可编辑后保存：

> 标题 · 作者 · 发表时间 · 出版位置（期刊/会议）· 网页 · 关键词标签 · 一句话总结 · 个人笔记

- **本地保存**：笔记库存储在浏览器 `chrome.storage.local`，支持搜索、查看、删除
- **导出**：单篇 Markdown / 全部 Markdown 汇总 / CSV（Excel）/ JSON 备份
- **Google 在线同步**：
  - Google 表格：一键复制 TSV 并打开 [sheets.new](https://sheets.new) 粘贴即分列；或配置 Apps Script 后全自动追加
  - Google Docs：一键复制 Markdown 并打开 [docs.new](https://docs.new)（Google Docs 支持 Markdown 粘贴）

## 📦 安装（开发者模式加载）

1. 打开 Chrome，访问 `chrome://extensions`
2. 右上角打开 **开发者模式**
3. 点击 **加载已解压的扩展程序**，选择本目录 `paper-reader-extension/`
4. 工具栏出现 📖 图标即安装成功（Edge 同理：`edge://extensions`）

## ⚙️ 配置（首次使用必读）

1. 点击扩展图标打开侧栏 → 点右上角 **⚙** 进入设置
2. 选择 AI 服务商并填写 API Key（Key 仅保存在本地浏览器）：

| 服务商 | 获取 Key | 默认模型 |
|---|---|---|
| 智谱 GLM（推荐） | https://open.bigmodel.cn | `glm-4.7` |
| DeepSeek | https://platform.deepseek.com | `deepseek-chat` |
| OpenAI | https://platform.openai.com | `gpt-4o` |
| Kimi | https://platform.moonshot.cn | `moonshot-v1-128k` |
| 自定义 | 任意 OpenAI 兼容接口 | — |

3. （强烈推荐）填写**研究者档案**（六项：我的数据 / 会的方法 / 做过的课题 / 近期主线 / 长期问题 / 其他）——精读「对我的启发」与审读第五类问题会严格对照它回答"这篇论文和我的研究在哪里能接上"
4. 点击 **测试连接** 确认可用 → **保存设置**

> 💡 精读需要长上下文模型（全文约 2~5 万字符），建议选择支持 128K 以上上下文的模型。

## 🚀 使用流程

1. 打开一篇论文页面（推荐 HTML 全文页，如 arXiv 的 `/html/` 版本、期刊官网全文页）
2. 点击工具栏 📖 打开侧栏，自动识别页面（标题 / 字数 / 章节数 / 图表数）
3. 选择 **⚡ 略读** 或 **🔍 精读**，点击开始，AI 流式输出分析
4. 检查 / 修改文献卡片（关键词与一句话总结已自动填写），点击保存
5. 在 **🗂 笔记库** 中搜索、查看、导出或同步 Google

### 🌐 全自动 Google 表格同步（可选）

1. 新建一个 Google 表格，访问 https://script.google.com 创建项目，绑定该表格
2. 粘贴设置页中提供的 `doPost` 代码（或复制下方）：

```javascript
function doPost(e) {
  const body = JSON.parse(e.postData.contents);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const name = body.sheetName || '文献笔记';
  const sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  if (sheet.getLastRow() === 0 && body.header) {
    sheet.appendRow(body.header);
    sheet.getRange(1, 1, 1, body.header.length).setFontWeight('bold');
  }
  (body.rows || []).forEach(function (row) { sheet.appendRow(row); });
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, added: (body.rows || []).length }))
    .setMimeType(ContentService.MimeType.JSON);
}
```

3. 部署 → 新建部署 → 类型选 **Web 应用** → 执行者「我」→ 访问权限「**任何人**」→ 部署
4. 复制 Web App URL（`https://script.google.com/macros/s/…/exec`）填入扩展设置
5. 之后点击「同步 Google 表格」即自动追加行；未配置时则自动切换为「复制 TSV + 打开在线表格」的半自动方式

## 📁 项目结构

```
paper-reader-extension/
├── manifest.json               # MV3 清单（侧边栏 + 全站内容提取）
├── background/service-worker.js# 后台：AI 流式转发 / 测试连接
├── content/content.js          # 页面提取：元数据/摘要/章节/全文/图表
├── lib/
│   ├── ai-client.js            # OpenAI 兼容流式客户端
│   ├── prompts.js              # 略读/精读提示词与输入组装
│   ├── storage.js              # 笔记与设置存储、服务商预设
│   ├── export.js               # MD/CSV/TSV/JSON 导出、剪贴板、Apps Script
│   └── markdown.js             # 无依赖 Markdown 渲染器（含 XSS 转义）
├── sidepanel/                  # 主界面：阅读分析 + 笔记库
├── options/                    # 设置页
└── icons/                      # 图标（gen_icons.py 可重新生成）
```

## ⚠️ 已知限制

- **浏览器内置 PDF 查看器**无法注入脚本提取文字。请在论文的 HTML 页面使用（arXiv 摘要页可分析摘要；完整精读请打开 `arxiv.org/html/<编号>` 全文页）
- 部分出版商的**付费墙全文页**只能提取到摘要与元数据
- 图表分析基于图表的标题说明文字（caption），AI 不直接读图；原图可在侧栏画廊点击放大自行查看
- 超长论文会按「保留前后关键部分」的策略截断到约 5 万字符

## 🛠 隐私说明

API Key 与全部笔记仅存储于本地浏览器（`chrome.storage.local`）；论文内容只在点击「开始分析」时发送给你自己配置的 AI 服务商，本扩展不收集任何数据。
