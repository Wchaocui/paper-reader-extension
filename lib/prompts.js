/**
 * 三种阅读模式（略读 / 精读 / 审读）+ 开放式追问 的提示词与输入组装。
 *
 * 审读模式（Review）：像一个挑剔的同行评审一样批判性阅读，
 * 四级递进 —— L1 值不值得读 → L2 挖隐含假设 → L3 挑方法设计 → L4 全审稿（含结论边界与对我的启发）。
 */

const META_TAIL_RULE = `
最后，必须严格按照以下格式在文末追加元数据（不要加粗、不要改字段名）：
---元数据---
关键词标签：3-6 个关键词，用逗号分隔
一句话总结：用不超过 40 字概括这篇文章`;

/* ================= 略读模式 ================= */

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

/* ================= 精读模式 ================= */

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
结合"研究者档案"，给出 3-6 条可落地的启发：可借鉴的方法或技巧、可对比的基线、可延伸的研究方向、实验设计/写作上可学习之处。
${META_TAIL_RULE}`;

/* ================= 审读模式（同行评审式批判阅读） ================= */

const REVIEW_SYSTEM = `你是一位挑剔的同行评审（nitpicking reviewer），与用户一起审读这篇论文。你的任务不是总结论文，而是批判性地检验它。请遵守以下铁律：

1. 【证据绑定】每一个判断后面必须紧跟来自论文的证据——章节名/图表编号/数据/原文短引；论文中找不到证据时，明确写"（论文未见证据）"。
2. 【不替作者补位】不要替作者补结论、补条件、补解释；你的推测必须显式标注【推测】。
3. 【事实与评价分离】先陈述"论文写了什么"（事实），再给"我认为怎样"（评价）。
4. 【不重复摘要】用审稿人的眼光提炼，不要复述摘要或结论章节。
5. 输出中文、Markdown。每类问题用 "## 一、/## 二、…" 编号标题，问题用 "### 1." 小标题，判断用要点列表。
6. 审读覆盖到哪一级，就只输出哪一级对应的部分，不要越级输出。`;

const REVIEW_CATS = {
  1: {
    title: '一、这篇文章是否值得一读？',
    questions: [
      '这篇文章的核心问题是什么？它真正想解决的是什么？（不要重复摘要）',
      '这个问题为什么重要？',
      '真正的创新点在哪里？是新问题、新方法、新数据、新机制，还是应用场景的创新？',
      '抛开文章的具体内容：解决它所解决的问题，最朴实的方法 / 最朴素的理论基础是什么？（即这篇文章最本质的内容是什么）',
    ],
  },
  2: {
    title: '二、作者没有明说的假设',
    questions: [
      '作者最核心的理论假设是哪一条？哪条假设一旦 fails，这篇文章就失去意义？',
      '文中变量之间的因果关系、相关关系是否表述明确？有没有把相关当因果（或混淆二者）？',
      '有没有其他理论或机制，同样可以解释文中的实验结果（替代解释）？',
    ],
  },
  3: {
    title: '三、研究设计与实验能否支撑结论（nitpick）',
    questions: [
      '研究方法的设计最可能受到什么影响：选择偏差、遗漏变量、反向因果，还是测量偏差？',
      '数据样本能否支撑这么大的结论？样本的边界应当就是结论的边界。',
      '哪个是核心变量？它是如何测量的？换一种测量方式，结果会不会改变？',
      '变量是否得到了有效控制？',
    ],
  },
  4: {
    title: '四、结论的边界在哪里',
    questions: [
      '文中显著的结果是否具有现实意义？在真实（非仿真）应用场景下，这个结果的可信度可能有多少？',
      '哪一条实验结果 / 结论最 robust？哪一条最薄弱？',
      '实验数据中有没有看起来奇怪、但作者没有讨论的结果？',
      '在什么情况下，这篇文章的结论最可能失败？（真正好的理论一定是有边界的）',
    ],
  },
  5: {
    title: '五、对我当前工作的启发（对照研究者档案）',
    questions: [
      '更改什么变量会使结果发生变化？研究对象的什么参数一变、结果随之而变？（找出异质性）',
      '作者自己承认还有哪些没解决的问题？文中列出的局限是什么？',
      '作者提出的未来研究方向（future work / 展望）有哪些？论文没明确写就说明"论文未明确给出"，再【推测】最自然的延伸方向',
      '如果沿着这篇论文继续深入，最值得研究的三个问题是什么？（从机制 / 边界 / 因果 / 测量 / 干预等方向寻找）',
      '这篇论文和我的研究（见研究者档案）在哪里能接上？',
    ],
  },
};

const REVIEW_TAIL = `
## ⚠️ 审读收束（必答）
### 这篇文章最值得我怀疑的地方是哪里？
### 它真正留下了什么？还有什么没解释清楚？
${META_TAIL_RULE}`;

const LEVEL_COVER = {
  1: [1],
  2: [1, 2],
  3: [1, 2, 3],
  4: [1, 2, 3, 4, 5],
};

export const LEVEL_INFO = {
  1: { name: 'L1 快筛', desc: '只回答"值不值得读"：核心问题、重要性、真创新、最朴素的本质。约 2 分钟。' },
  2: { name: 'L2 查假设', desc: '在 L1 基础上挖作者没明说的假设：核心假设、因果与相关、替代解释。' },
  3: { name: 'L3 挑方法', desc: '再加研究设计 nitpick：偏差来源、样本边界、核心变量测量、控制变量。' },
  4: { name: 'L4 全审稿', desc: '完整同行评审：以上全部 + 结论边界 + 对照你的研究档案给出启发，并收束"最值得怀疑之处"。' },
};

function reviewQuestionBlock(level) {
  const cats = LEVEL_COVER[level] || LEVEL_COVER[4];
  return cats
    .map((c) => {
      const cat = REVIEW_CATS[c];
      const qs = cat.questions.map((q, i) => `${i + 1}. ${q}`).join('\n');
      const head =
        c === 5
          ? `${cat.title}\n（回答必须紧密结合"研究者档案"）`
          : cat.title;
      return `${head}\n${qs}`;
    })
    .join('\n\n') + REVIEW_TAIL;
}

/* ================= 追问（开放式问答） ================= */

const ASK_SYSTEM = `你仍是那位挑剔的同行评审，用户就刚才审读/阅读的论文向你追问。
规则：
1. 回答基于提供的论文内容与已有分析，证据绑定（标注章节/图表/数据），论文没有的信息直说"论文未提供"。
2. 不替作者补结论；你的推测标注【推测】。
3. 简洁直接回答问题本身（可以适当用要点列表），不要重复已输出过的完整分析。
4. 中文回答，Markdown 格式。`;

/* ---------------- 公共输入组装 ---------------- */

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
  return page.figures.map((f, i) => `${i + 1}. ${f.caption}`).join('\n');
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

/** 研究者档案 → 文本块 */
export function profileBlock(profile = {}) {
  const p = typeof profile === 'string' ? { other: profile } : profile || {};
  const rows = [
    ['我的数据', p.data],
    ['我会的方法类型', p.methods],
    ['做过的课题', p.projects],
    ['近期研究主线', p.shortTerm],
    ['长期研究问题', p.longTerm],
    ['其他背景', p.other],
  ].filter(([, v]) => v && String(v).trim());
  if (!rows.length) return '（未提供研究者档案——请提醒用户在设置页填写，可获得更贴合的"对我的启发"）';
  return rows.map(([k, v]) => `- ${k}：${String(v).trim()}`).join('\n');
}

function buildSkimInput(page) {
  return [
    `【页面元数据】\n${metaBlock(page)}`,
    `【摘要】\n${page.abstract || '页面未提供摘要'}`,
    `【图表说明（共 ${(page.figures || []).length} 张）】\n${figureBlock(page)}`,
    `【结论部分】\n${page.conclusion || '页面未单独提供结论章节'}`,
    `【正文节选（辅助上下文）】\n${clip(page.fullText, 6000) || '页面未提取到正文'}`,
  ].join('\n\n');
}

function buildDeepInput(page, profile) {
  return [
    `【页面元数据】\n${metaBlock(page)}`,
    `【摘要】\n${page.abstract || '页面未提供摘要'}`,
    `【图表说明（共 ${(page.figures || []).length} 张）】\n${figureBlock(page)}`,
    `【研究者档案】\n${profileBlock(profile)}`,
    `【论文全文】\n${clip(page.fullText, 52000) || '页面未提取到正文'}`,
  ].join('\n\n');
}

function buildReviewInput(page, level, profile) {
  const parts = [
    `【页面元数据】\n${metaBlock(page)}`,
    `【摘要】\n${page.abstract || '页面未提供摘要'}`,
    `【图表说明（共 ${(page.figures || []).length} 张）】\n${figureBlock(page)}`,
  ];
  if ((LEVEL_COVER[level] || LEVEL_COVER[4]).includes(5)) {
    parts.push(`【研究者档案】\n${profileBlock(profile)}`);
  }
  parts.push(
    `【审读任务书（第 ${level} 级，逐题回答，先事实后评价，判断后跟证据）】\n${reviewQuestionBlock(level)}`
  );
  parts.push(`【论文全文】\n${clip(page.fullText, 52000) || '页面未提取到正文'}`);
  return parts.join('\n\n');
}

/**
 * 组装三种模式的消息。
 * @param mode 'skim' | 'deep' | 'review'
 * @param page content script 提取的页面数据
 * @param ctx { profile, level }
 */
export function buildMessages(mode, page, ctx = {}) {
  const { profile, level = 4 } = ctx;
  if (mode === 'review') {
    return [
      { role: 'system', content: REVIEW_SYSTEM },
      { role: 'user', content: buildReviewInput(page, level, profile) },
    ];
  }
  if (mode === 'deep') {
    return [
      { role: 'system', content: DEEP_SYSTEM },
      { role: 'user', content: buildDeepInput(page, profile) },
    ];
  }
  return [
    { role: 'system', content: SKIM_SYSTEM },
    { role: 'user', content: buildSkimInput(page) },
  ];
}

/**
 * 开放式追问：携带论文 + 已有分析结论 + 最近几轮问答。
 * @param page 页面数据
 * @param lastAnalysis 上一次 AI 分析全文（可为空）
 * @param history [{role:'user'|'assistant', content}] 最近追问记录
 * @param question 本次问题
 */
export function buildAskMessages(page, lastAnalysis, history, question, profile) {
  const messages = [
    { role: 'system', content: ASK_SYSTEM },
    {
      role: 'user',
      content: [
        `【页面元数据】\n${metaBlock(page)}`,
        `【摘要】\n${page.abstract || '页面未提供摘要'}`,
        `【图表说明】\n${figureBlock(page)}`,
        `【研究者档案】\n${profileBlock(profile)}`,
        `【论文全文】\n${clip(page.fullText, 42000) || '页面未提取到正文'}`,
        lastAnalysis
          ? `【已完成的 AI 分析】\n${clip(lastAnalysis, 8000)}`
          : '',
      ]
        .filter(Boolean)
        .join('\n\n'),
    },
    { role: 'assistant', content: '（以上是我掌握的论文材料与分析，请讲你的问题。）' },
  ];
  // 最近 4 轮追问历史
  (history || []).slice(-8).forEach((m) => messages.push({ ...m }));
  messages.push({ role: 'user', content: question });
  return messages;
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
