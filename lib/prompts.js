/**
 * 精读 / 略读两种模式的提示词与输入组装。
 */

const META_TAIL_RULE = `
最后，必须严格按照以下格式在文末追加元数据（不要加粗、不要改字段名）：
---元数据---
关键词标签：3-6 个关键词，用逗号分隔
一句话总结：用不超过 40 字概括这篇文章`;

const SKIM_SYSTEM = `你是一位资深的科研论文快速评估助手。用户正在略读（skimming）一篇论文：
只依据我提供的页面内容（元数据、摘要、图表说明、结论、正文节选）进行评估，绝不编造不存在的信息；某项信息缺失时明确写"页面未提供"。
请用中文、Markdown 格式输出以下四个小节（保持 ### 级标题与 emoji）：

### 🎯 应用场景
这篇文章的方法/成果可以落地到哪些实际场景或研究方向（2-4 条，每条一句）。

### ❓ 重点解决的问题
作者要攻克的核心问题是什么，为什么重要（2-3 条）。

### 💡 创新点
相对已有工作的关键创新（2-4 条，写清"新在哪"）。

### 🔧 方法
核心技术路线与关键步骤（2-4 条，简明但具体，含关键模型/算法/数据名称）。
${META_TAIL_RULE}`;

const DEEP_SYSTEM = `你是一位资深的科研论文精读助手。用户要精读（deep reading）这篇论文：
只依据我提供的内容进行分析，不编造；信息缺失时注明"页面未提供"。
请用中文、Markdown 格式输出（保持 ## 级标题与编号）：

## 一、论文整体框架
用层级大纲（缩进列表）呈现论文结构：研究背景 → 问题定义 → 方法各模块 → 实验设置 → 结果 → 结论，每个节点后用一句话标注该部分的作用。

## 二、作者做了什么
### 解决的问题
### 方法（详细）
按模块拆解技术方案，写清关键假设、模型/算法细节、数据与实现要点。
### 发现（关键实验结果）
列出最重要的实验发现，尽量带具体数字/指标对比。
### 结论

## 三、核心观点
作者最想传达的 2-4 个论点，每个论点附上论文中的支撑证据。

## 四、对我的启发
结合"我的研究背景"，给出 3-6 条可落地的启发：可借鉴的方法或技巧、可对比的基线、可延伸的研究方向、实验设计/写作上可学习之处。
${META_TAIL_RULE}`;

/* ---------------- 输入组装 ---------------- */

function metaBlock(page) {
  const m = page.meta || {};
  const lines = [
    `标题：${page.title || '页面未提供'}`,
    `作者：${(m.authors || []).join(', ') || '页面未提供'}`,
    `发表时间：${m.publishDate || '页面未提供'}`,
    `出版位置：${m.venue || '页面未提供'}${m.doi ? `（DOI: ${m.doi}）` : ''}`,
    `网页：${page.url}`,
  ];
  if (m.keywords) lines.push(`页面关键词：${m.keywords}`);
  return lines.join('\n');
}

function figureBlock(page) {
  if (!page.figures || !page.figures.length) return '（页面未提取到图表）';
  return page.figures
    .map((f, i) => `${i + 1}. ${f.caption}`)
    .join('\n');
}

function clip(text, max) {
  if (!text) return '';
  if (text.length <= max) return text;
  const head = Math.floor(max * 0.7);
  const tail = max - head;
  return (
    text.slice(0, head) +
    `\n\n……【中间部分因长度限制省略】……\n\n` +
    text.slice(-tail)
  );
}

/** 略读输入：摘要 + 图表 + 结论 + 少量正文 */
function buildSkimInput(page) {
  const parts = [
    `【页面元数据】\n${metaBlock(page)}`,
    `【摘要】\n${page.abstract || '页面未提供摘要'}`,
    `【图表说明（共 ${(page.figures || []).length} 张）】\n${figureBlock(page)}`,
    `【结论部分】\n${page.conclusion || '页面未单独提供结论章节'}`,
    `【正文节选（辅助上下文）】\n${clip(page.fullText, 6000) || '页面未提取到正文'}`,
  ];
  return parts.join('\n\n');
}

/** 精读输入：全文 + 全部图表说明 + 用户背景 */
function buildDeepInput(page, userBackground) {
  const parts = [
    `【页面元数据】\n${metaBlock(page)}`,
    `【摘要】\n${page.abstract || '页面未提供摘要'}`,
    `【图表说明（共 ${(page.figures || []).length} 张）】\n${figureBlock(page)}`,
    `【我的研究背景】\n${userBackground || '未提供，请以通用科研视角给出启发'}`,
    `【论文全文】\n${clip(page.fullText, 52000) || '页面未提取到正文'}`,
  ];
  return parts.join('\n\n');
}

export function buildMessages(mode, page, userBackground) {
  if (mode === 'deep') {
    return [
      { role: 'system', content: DEEP_SYSTEM },
      { role: 'user', content: buildDeepInput(page, userBackground) },
    ];
  }
  return [
    { role: 'system', content: SKIM_SYSTEM },
    { role: 'user', content: buildSkimInput(page) },
  ];
}

/** 从 AI 输出文末提取关键词与一句话总结（容错：兼容加粗/中英冒号） */
export function extractMetaTail(md) {
  const plain = md.replace(/\*/g, '');
  const kw = plain.match(/关键词标签[：:]\s*([^\n]+)/);
  const ol = plain.match(/一句话总结[：:]\s*([^\n]+)/);
  return {
    keywords: kw ? kw[1].trim() : '',
    oneLiner: ol ? ol[1].trim() : '',
  };
}
