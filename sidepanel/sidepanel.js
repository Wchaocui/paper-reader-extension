/**
 * PaperLens 侧边栏主逻辑：
 * 页面识别 → 略读/精读 AI 分析（流式渲染）→ 文献卡片 → 本地笔记库 → 导出 / Google 同步
 */
import { renderMarkdown } from '../lib/markdown.js';
import {
  getAllNotes,
  addNote,
  deleteNote,
  getSettings,
} from '../lib/storage.js';
import { buildMessages, extractMetaTail, buildAskMessages, LEVEL_INFO, profileBlock } from '../lib/prompts.js';
import {
  noteToMarkdown,
  notesToMarkdown,
  notesToCSV,
  notesToTSV,
  notesToJSON,
  downloadFile,
  copyText,
  postToGas,
  noteToRow,
  SHEET_HEADER,
  safeFileName,
  fmtDate,
} from '../lib/export.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

const MODE_DESC = {
  skim: '⚡ 略读：只看摘要、图表与结论，快速判断这篇文章值不值得读——输出应用场景、重点问题、创新点、方法。',
  deep: '📖 精读：通读全文——输出论文整体框架、问题/方法/发现/结论、核心观点，并结合你的研究档案给出启发。',
  review: '⚖️ 审读：像一个挑剔的同行评审，不总结、只挑刺——每个判断都要求论文证据。用下方等级选择思考深度。',
};

const FLOW_STAGES = [
  {
    num: '①',
    level: 1,
    title: '值不值得读？',
    qs: [
      '核心问题是什么（不重复摘要）？',
      '为什么重要？',
      '真创新：新问题/方法/数据/机制/场景？',
      '最朴素的本质：最笨的办法是什么？',
    ],
  },
  {
    num: '②',
    level: 2,
    title: '挖出没明说的假设',
    qs: [
      '哪条核心假设 fails，文章就没意义？',
      '因果与相关有没有混淆？',
      '有没有替代解释能解释同样的结果？',
    ],
  },
  {
    num: '③',
    level: 3,
    title: '挑研究设计的毛病（nitpick）',
    qs: [
      '选择偏差/遗漏变量/反向因果/测量偏差？',
      '样本边界撑得起结论边界吗？',
      '核心变量怎么测的？换测法结果会变吗？',
      '控制变量有效吗？',
    ],
  },
  {
    num: '④',
    level: 4,
    title: '划结论的边界',
    qs: [
      '显著结果有现实意义吗（非仿真可信度）？',
      '哪条最 robust？哪条最薄弱？',
      '有没有作者没讨论的奇怪结果？',
      '什么情况下结论最可能失败？',
    ],
  },
  {
    num: '⑤',
    level: 4,
    title: '接上我的研究',
    qs: [
      '改什么变量结果会变（异质性）？',
      '作者承认的未解决问题与局限？',
      '作者提出的未来研究方向？',
      '继续深入最值得研究的三个问题？',
      '和我的研究在哪里能接上（对照档案）？',
    ],
  },
];

const state = {
  tabId: null,
  page: null,       // content script 提取结果
  mode: 'skim',
  level: 4,         // 审读等级 1-4
  analyzing: false,
  md: '',           // 当前 AI 输出
  saved: false,
  detailId: null,   // 笔记库正在查看的笔记
  notes: [],
  askHistory: [],   // 追问对话 [{role, content}]
};

/* ================= 通用 ================= */

let toastTimer = null;
function toast(msg, type = '') {
  const el = $('#toast');
  el.textContent = msg;
  el.className = 'toast ' + type;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), type === 'err' ? 5000 : 2600);
}

function openUrl(url) {
  chrome.runtime.sendMessage({ type: 'OPEN_URL', url });
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ================= Tab 切换 ================= */

function switchTab(name) {
  $$('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  $('#tab-analyze').hidden = name !== 'analyze';
  $('#tab-flow').hidden = name !== 'flow';
  $('#tab-notes').hidden = name !== 'notes';
  if (name === 'notes') renderNotesList();
  if (name === 'flow') renderFlow();
}

$$('.tab').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));

/* ================= 页面识别 ================= */

async function loadCurrentPage() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return;
  state.tabId = tab.id;
  state.page = null;

  const card = $('#page-card');
  const isPdf = /\.pdf(\?|#|$)/i.test(tab.url || '');
  $('#page-host').textContent = new URL(tab.url || 'about:blank').host || '未知页面';
  $('#page-dot').className = 'dot';
  $('#page-title').textContent = '正在识别…';
  $('#page-stats').innerHTML = '';
  $('#page-abstract').hidden = true;

  if (tab.url && !/^https?:/.test(tab.url)) {
    $('#page-dot').className = 'dot err';
    $('#page-title').textContent = isPdf
      ? '浏览器内置 PDF 页暂不支持'
      : '此页面类型不支持（请打开论文网页）';
    card.classList.add('unsupported');
    return;
  }

  let resp;
  try {
    resp = await chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_PAPER' });
  } catch (_) {
    resp = null;
  }
  if (!resp || !resp.ok) {
    $('#page-dot').className = 'dot err';
    $('#page-title').textContent = isPdf
      ? 'PDF 查看器无法提取文字'
      : '无法读取此页面，请刷新后重试';
    return;
  }

  state.page = resp.data;
  state.saved = false;
  $('#page-dot').className = 'dot ok';
  $('#page-title').textContent = state.page.title || '（未识别到标题）';
  $('#page-stats').innerHTML = [
    `正文 <b>${(state.page.textLength / 1000).toFixed(1)}k</b> 字`,
    `章节 <b>${state.page.sections.length}</b> 个`,
    `图表 <b>${state.page.figures.length}</b> 张`,
    state.page.meta.venue ? `来源 <b>${esc(state.page.meta.venue)}</b>` : '',
  ]
    .filter(Boolean)
    .join('');

  if (state.page.abstract) {
    const abs = $('#page-abstract');
    abs.textContent = '摘要：' + state.page.abstract;
    abs.hidden = false;
  }

  // 图表画廊
  const figCard = $('#figures-card');
  if (state.page.figures.length) {
    figCard.hidden = false;
    $('#figures-grid').innerHTML = state.page.figures
      .map(
        (f) =>
          `<div class="figure-item" data-src="${esc(f.src)}" title="点击查看原图">
             <img src="${esc(f.src)}" alt="" referrerpolicy="no-referrer" loading="lazy">
             <div class="fig-cap">${esc(f.caption)}</div>
           </div>`
      )
      .join('');
    $$('#figures-grid .figure-item').forEach((el) =>
      el.addEventListener('click', () => openUrl(el.dataset.src))
    );
  } else {
    figCard.hidden = true;
  }

  $('#short-text-warning').hidden = !(state.mode === 'deep' && state.page.textLength < 4000);
  resetResultArea();
}

$('#btn-refresh').addEventListener('click', () => {
  if (state.analyzing) return toast('正在分析中，请稍候', 'err');
  loadCurrentPage();
});
$('#figures-toggle').addEventListener('click', () => {
  const grid = $('#figures-grid');
  const hidden = grid.style.display === 'none';
  grid.style.display = hidden ? '' : 'none';
  $('#figures-toggle').textContent = hidden ? '收起' : '展开';
});

// 用户切换标签页/刷新页面时自动重新识别
chrome.tabs.onActivated.addListener((info) => {
  if (!state.analyzing && info.tabId !== state.tabId) loadCurrentPage();
});
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (!state.analyzing && tabId === state.tabId && info.status === 'complete') {
    loadCurrentPage();
  }
});

/* ================= 模式切换与审读等级 ================= */

function updateModeUI() {
  $('#mode-desc').textContent = MODE_DESC[state.mode];
  const isReview = state.mode === 'review';
  $('#level-bar').hidden = !isReview;
  $('#level-desc').hidden = !isReview;
  if (isReview) {
    $$('.level-btn').forEach((b) =>
      b.classList.toggle('active', +b.dataset.level === state.level)
    );
    $('#level-desc').textContent = LEVEL_INFO[state.level].desc;
    $('#btn-analyze .btn-label').textContent = `⚖️ 开始审读（${LEVEL_INFO[state.level].name}）`;
  } else {
    $('#btn-analyze .btn-label').textContent =
      state.mode === 'skim' ? '⚡ 开始略读分析' : '📖 开始精读分析';
  }
  $('#short-text-warning').hidden = !(
    state.mode !== 'skim' && state.page && state.page.textLength < 4000
  );
}

$$('.mode-btn').forEach((b) =>
  b.addEventListener('click', () => {
    if (state.analyzing) return;
    state.mode = b.dataset.mode;
    $$('.mode-btn').forEach((x) => x.classList.toggle('active', x === b));
    updateModeUI();
  })
);
$$('.level-btn').forEach((b) =>
  b.addEventListener('click', () => {
    if (state.analyzing) return;
    state.level = +b.dataset.level;
    updateModeUI();
  })
);

/* ================= 审稿流程图 ================= */

function renderFlow() {
  const wrap = $('#flow-stages');
  if (wrap.dataset.rendered) return;
  wrap.dataset.rendered = '1';
  wrap.innerHTML = FLOW_STAGES.map(
    (s, i) => `
    ${i > 0 ? '<div class="flow-arrow">↓</div>' : ''}
    <div class="flow-stage">
      <div class="flow-num">${s.num}</div>
      <div class="flow-body">
        <h4>${s.title}<span class="flow-tag">L${s.level}</span></h4>
        <ul class="flow-qs">${s.qs.map((q) => `<li>${q}</li>`).join('')}</ul>
        <button class="btn sm flow-start" data-level="${s.level}">
          ▶ ${s.level === 4 ? 'L4 全审稿（含本阶段）' : `从这里开始审读（L${s.level}）`}
        </button>
      </div>
    </div>`
  ).join('');
}

$('#flow-stages').addEventListener('click', (e) => {
  const btn = e.target.closest('.flow-start');
  if (!btn) return;
  state.level = +btn.dataset.level;
  state.mode = 'review';
  $$('.mode-btn').forEach((x) => x.classList.toggle('active', x.dataset.mode === 'review'));
  updateModeUI();
  switchTab('analyze');
  analyze();
});

/* ================= AI 分析 ================= */

function resetResultArea() {
  state.md = '';
  state.saved = false;
  state.askHistory = [];
  $('#result-card').hidden = true;
  $('#meta-form').hidden = true;
  $('#ask-card').hidden = true;
  $('#ask-thread').innerHTML = '';
  $('#ask-input').value = '';
  $('#result').innerHTML = '';
}

function visibleMarkdown() {
  const idx = state.md.indexOf('---元数据---');
  return idx >= 0 ? state.md.slice(0, idx).trimEnd() : state.md;
}

function renderStream() {
  const result = $('#result');
  const autoScroll = result.scrollHeight - result.scrollTop - result.clientHeight < 120;
  result.innerHTML = renderMarkdown(visibleMarkdown()) + '<span class="cursor-blink"></span>';
  if (autoScroll) result.scrollTop = result.scrollHeight;
}

async function analyze() {
  if (state.analyzing) return;
  if (!state.page) return toast('请先打开一个论文页面', 'err');

  const settings = await getSettings();
  if (!settings.apiKey) {
    toast('请先在设置中配置 AI API Key', 'err');
    chrome.runtime.openOptionsPage();
    return;
  }

  resetResultArea();
  state.analyzing = true;
  const btn = $('#btn-analyze');
  btn.disabled = true;
  btn.querySelector('.btn-label').textContent = '分析中…';
  $('#result-card').hidden = false;
  $('#result-card').classList.add('streaming');
  $('#result').innerHTML = '<p style="color:var(--text-3)">模型正在阅读论文…</p>';
  const progress = $('#progress');
  progress.hidden = false;
  const startTime = Date.now();

  const messages = buildMessages(state.mode, state.page, {
    profile: settings.profile,
    level: state.level,
  });
  const port = chrome.runtime.connect({ name: 'paperlens-ai' });
  port.postMessage({
    type: 'analyze',
    config: {
      baseUrl: settings.baseUrl,
      apiKey: settings.apiKey,
      model: settings.model,
    },
    messages,
  });

  const finish = () => {
    state.analyzing = false;
    btn.disabled = false;
    if (state.mode === 'review') {
      btn.querySelector('.btn-label').textContent = `⚖️ 重新审读（${LEVEL_INFO[state.level].name}）`;
    } else {
      btn.querySelector('.btn-label').textContent =
        state.mode === 'skim' ? '⚡ 重新略读分析' : '📖 重新精读分析';
    }
    progress.hidden = true;
    $('#result-card').classList.remove('streaming');
    try { port.disconnect(); } catch (_) {}
  };

  port.onMessage.addListener((msg) => {
    if (msg.type === 'delta') {
      state.md += msg.text;
      $('#progress-text').textContent =
        `正在分析… 已生成 ${msg.chars} 字，用时 ${Math.round((Date.now() - startTime) / 1000)}s`;
      renderStream();
    } else if (msg.type === 'done') {
      finish();
      $('#result').innerHTML = renderMarkdown(visibleMarkdown());
      $('#btn-copy-result').hidden = false;
      $('#ask-card').hidden = false;
      fillMetaForm();
      toast('分析完成 ✓ 可在下方继续追问', 'ok');
    } else if (msg.type === 'error') {
      finish();
      $('#result').innerHTML =
        `<div class="result-error"><b>分析失败：</b>${esc(msg.error)}</div>` +
        '<p style="font-size:12px;color:var(--text-3)">请检查设置中的 API 配置（Base URL / Key / 模型名），或稍后重试。长文分析可能需要较大上下文的模型。</p>';
      toast('分析失败，请检查 API 配置', 'err');
    }
  });
  port.onDisconnect.addListener(() => {
    if (state.analyzing) {
      finish();
      $('#result').innerHTML =
        '<div class="result-error"><b>连接中断：</b>后台服务意外断开，请重试。</div>';
    }
  });
}

$('#btn-analyze').addEventListener('click', analyze);
$('#btn-copy-result').addEventListener('click', () => {
  copyText(state.md + askAppendix()).then((ok) =>
    ok ? toast('已复制完整分析结果（含追问）', 'ok') : toast('复制失败', 'err')
  );
});

/* ================= 开放式追问 ================= */

function askAppendix() {
  if (!state.askHistory.length) return '';
  const parts = state.askHistory.map((h, i) =>
    h.role === 'user' ? `**Q：${h.content}**` : h.content
  );
  return '\n\n---\n\n## 💬 追问记录\n\n' + parts.join('\n\n---\n\n');
}

function appendAskPair(question) {
  const item = document.createElement('div');
  item.className = 'ask-item';
  item.innerHTML = `
    <div class="ask-q">${esc(question)}</div>
    <div class="ask-a"><div class="md-body"><span class="cursor-blink"></span></div></div>`;
  $('#ask-thread').appendChild(item);
  item.scrollIntoView({ behavior: 'smooth', block: 'end' });
  return item.querySelector('.ask-a .md-body');
}

async function ask() {
  if (state.analyzing) return toast('请等待当前输出完成', 'err');
  if (!state.page) return toast('请先打开并分析一篇论文', 'err');
  const input = $('#ask-input');
  const q = input.value.trim();
  if (!q) return;
  if (!state.md) toast('提示：尚未做过分析，将直接基于论文原文回答', '');

  const settings = await getSettings();
  if (!settings.apiKey) {
    toast('请先在设置中配置 AI API Key', 'err');
    chrome.runtime.openOptionsPage();
    return;
  }

  input.value = '';
  $('#ask-card').hidden = false;
  const answerEl = appendAskPair(q);
  state.analyzing = true;
  $('#btn-ask').disabled = true;

  const messages = buildAskMessages(
    state.page,
    state.md,
    state.askHistory,
    q,
    settings.profile
  );
  const port = chrome.runtime.connect({ name: 'paperlens-ai' });
  port.postMessage({
    type: 'analyze',
    config: {
      baseUrl: settings.baseUrl,
      apiKey: settings.apiKey,
      model: settings.model,
    },
    messages,
    maxTokens: 4000,
  });

  let acc = '';
  const finishAsk = () => {
    state.analyzing = false;
    $('#btn-ask').disabled = false;
    try { port.disconnect(); } catch (_) {}
  };

  port.onMessage.addListener((msg) => {
    if (msg.type === 'delta') {
      acc += msg.text;
      const nearBottom =
        $('#ask-thread').scrollHeight - $('#ask-card').scrollTop < 400;
      answerEl.innerHTML = renderMarkdown(acc) + '<span class="cursor-blink"></span>';
      if (nearBottom) answerEl.scrollIntoView({ behavior: 'smooth', block: 'end' });
    } else if (msg.type === 'done') {
      answerEl.innerHTML = renderMarkdown(acc);
      state.askHistory.push({ role: 'user', content: q });
      state.askHistory.push({ role: 'assistant', content: acc });
      finishAsk();
    } else if (msg.type === 'error') {
      answerEl.innerHTML = `<div class="result-error">追问失败：${esc(msg.error)}</div>`;
      finishAsk();
    }
  });
  port.onDisconnect.addListener(() => {
    if (state.analyzing) {
      answerEl.innerHTML = '<div class="result-error">连接中断，请重试。</div>';
      finishAsk();
    }
  });
}

$('#btn-ask').addEventListener('click', ask);
$('#ask-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.isComposing) ask();
});

/* ================= 文献卡片 ================= */

function fillMetaForm() {
  const p = state.page;
  const tail = extractMetaTail(state.md);
  const m = p.meta || {};

  const pageKw = (m.keywords || '')
    .split(/[,;，；]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const aiKw = (tail.keywords || '')
    .split(/[,，]/)
    .map((s) => s.trim())
    .filter(Boolean);

  $('#f-title').value = p.title || '';
  $('#f-date').value = m.publishDate || '';
  $('#f-venue').value = m.venue || '';
  $('#f-authors').value = (m.authors || []).join(', ');
  $('#f-url').value = p.url || '';
  $('#f-keywords').value = (aiKw.length ? aiKw : pageKw).join(', ');
  $('#f-oneliner').value = tail.oneLiner || '';
  renderKwChips();
  $('#meta-form').hidden = false;
  $('#meta-form').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function renderKwChips() {
  const kws = $('#f-keywords')
    .value.split(/[,，]/)
    .map((s) => s.trim())
    .filter(Boolean);
  $('#kw-chips').innerHTML = kws.map((k) => `<span class="chip"># ${esc(k)}</span>`).join('');
}
$('#f-keywords').addEventListener('input', renderKwChips);

function modeLabel(n) {
  if (n.mode === 'review') return `审读·L${n.level || 4}`;
  return n.mode === 'deep' ? '精读' : '略读';
}

function modeBadgeClass(n) {
  return n.mode === 'review' ? 'review' : n.mode;
}

function collectNote() {
  const kws = $('#f-keywords')
    .value.split(/[,，]/)
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    id: crypto.randomUUID(),
    mode: state.mode,
    level: state.mode === 'review' ? state.level : undefined,
    url: $('#f-url').value.trim() || state.page?.url || '',
    title: $('#f-title').value.trim(),
    authors: $('#f-authors')
      .value.split(/[,，]/)
      .map((s) => s.trim())
      .filter(Boolean),
    publishDate: $('#f-date').value.trim(),
    venue: $('#f-venue').value.trim(),
    keywords: kws,
    oneLiner: $('#f-oneliner').value.trim(),
    userNotes: $('#f-notes').value.trim(),
    resultMarkdown: state.md + askAppendix(),
    figures: (state.page?.figures || []).slice(0, 6),
    pageHost: state.page?.host || '',
  };
}

async function saveNote(alsoGas = false) {
  if (!state.md) return toast('还没有分析结果', 'err');
  const note = collectNote();
  if (!note.title) return toast('请填写标题', 'err');
  await addNote(note);
  refreshNotesCount();
  $('#btn-save').textContent = '✓ 已保存到本地';
  setTimeout(() => ($('#btn-save').textContent = '💾 保存到本地笔记库'), 2000);

  if (alsoGas) await syncToGas([note]);
  else toast('已保存到本地笔记库 ✓', 'ok');
}

$('#btn-save').addEventListener('click', () => saveNote(false));
$('#btn-save-gas').addEventListener('click', () => saveNote(true));

/* ================= Google 同步 ================= */

async function syncToGas(notes) {
  const settings = await getSettings();
  if (!notes.length) return toast('没有笔记可同步', 'err');

  if (settings.gasUrl) {
    try {
      const ok = await postToGas(settings.gasUrl, {
        sheetName: '文献笔记',
        header: SHEET_HEADER,
        rows: notes.map(noteToRow),
      });
      toast(ok ? '已发送到 Google 表格（稍后刷新查看） ✓' : '发送失败，请检查 Web App 配置', ok ? 'ok' : 'err');
      return;
    } catch (e) {
      toast('同步失败：' + e.message + '，已改为复制模式', 'err');
    }
  }

  // 兜底：复制 TSV + 打开在线表格，Ctrl+V 即可
  const ok = await copyText(notesToTSV(notes));
  if (ok) {
    openUrl('https://sheets.new');
    toast('已复制表格数据，请在打开的 Google 表格中 Ctrl+V 粘贴', 'ok');
  } else {
    toast('复制失败，请手动导出 CSV', 'err');
  }
}

/* ================= 笔记库 ================= */

async function refreshNotesCount() {
  state.notes = await getAllNotes();
  const badge = $('#notes-count');
  badge.textContent = state.notes.length;
  badge.hidden = !state.notes.length;
}

function noteActionsHtml(id) {
  return `
    <button class="link-btn" data-act="view" data-id="${id}">查看全文</button>
    <button class="link-btn" data-act="copy" data-id="${id}">复制 MD</button>
    <button class="link-btn" data-act="doc" data-id="${id}">→ Google Docs</button>
    <button class="link-btn" data-act="sheet" data-id="${id}">→ Google 表格</button>
    <button class="link-btn" data-act="export" data-id="${id}">导出 MD</button>
    <button class="link-btn del" data-act="del" data-id="${id}">删除</button>
  `;
}

async function renderNotesList() {
  await refreshNotesCount();
  const list = $('#notes-list');
  const q = ($('#search-input').value || '').trim().toLowerCase();

  const notes = q
    ? state.notes.filter((n) =>
        [n.title, n.oneLiner, (n.keywords || []).join(' '), n.venue, n.userNotes]
          .join(' ')
          .toLowerCase()
          .includes(q)
      )
    : state.notes;

  if (!notes.length) {
    list.innerHTML = `<div class="empty">
        <span class="empty-icon">🗂</span>
        ${q ? '没有匹配的笔记' : '还没有笔记。<br>去「阅读」页分析一篇论文并保存吧！'}
      </div>`;
    return;
  }

  list.innerHTML = notes
    .map(
      (n) => `
      <div class="card note-item">
        <div class="note-title">
          <span class="badge ${modeBadgeClass(n)}">${modeLabel(n)}</span>
          ${esc(n.title || '未命名')}
        </div>
        <div class="note-meta">
          <span>📅 ${esc(fmtDate(n.savedAt))}</span>
          ${n.venue ? `<span>📍 ${esc(n.venue)}</span>` : ''}
          ${n.publishDate ? `<span>🕒 ${esc(n.publishDate)}</span>` : ''}
        </div>
        ${n.oneLiner ? `<div class="note-oneliner">💡 ${esc(n.oneLiner)}</div>` : ''}
        ${(n.keywords || []).length ? `<div class="chips">${n.keywords.map((k) => `<span class="chip"># ${esc(k)}</span>`).join('')}</div>` : ''}
        <div class="note-actions">${noteActionsHtml(n.id)}</div>
      </div>`
    )
    .join('');
}

$('#search-input').addEventListener('input', () => renderNotesList());

$('#notes-list').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const id = btn.dataset.id;
  const note = state.notes.find((n) => n.id === id);
  if (!note) return;
  const act = btn.dataset.act;

  if (act === 'view') {
    renderNoteDetail(note);
  } else if (act === 'copy') {
    (await copyText(noteToMarkdown(note)))
      ? toast('已复制 Markdown', 'ok')
      : toast('复制失败', 'err');
  } else if (act === 'doc') {
    (await copyText(noteToMarkdown(note)))
      ? (openUrl('https://docs.new'), toast('已复制，在 Google Docs 中 Ctrl+V（支持 Markdown 粘贴）', 'ok'))
      : toast('复制失败', 'err');
  } else if (act === 'sheet') {
    syncToGas([note]);
  } else if (act === 'export') {
    downloadFile(
      `PaperLens-${safeFileName(note.title)}.md`,
      noteToMarkdown(note),
      'text/markdown'
    );
  } else if (act === 'del') {
    if (confirm(`确定删除「${note.title}」？`)) {
      state.notes = await deleteNote(id);
      refreshNotesCount();
      renderNotesList();
      toast('已删除');
    }
  }
});

/* ---------- 笔记详情 ---------- */

function renderNoteDetail(note) {
  state.detailId = note.id;
  $('#notes-list-wrap').hidden = true;
  $('#notes-detail').hidden = false;

  const tailIdx = (note.resultMarkdown || '').indexOf('---元数据---');
  const bodyMd = tailIdx >= 0 ? note.resultMarkdown.slice(0, tailIdx) : note.resultMarkdown;

  $('#note-detail-body').innerHTML = `
    <div class="card">
      <div class="detail-head">
        <span class="badge ${modeBadgeClass(note)}">${modeLabel(note)}</span>
        <div class="detail-title">${esc(note.title || '未命名')}</div>
      </div>
      <div class="note-meta">
        <span>👤 ${esc((note.authors || []).join(', ') || '未知作者')}</span>
        <span>🕒 ${esc(note.publishDate || '时间未知')}</span>
        <span>📍 ${esc(note.venue || '来源未知')}</span>
        <span>💾 保存于 ${esc(fmtDate(note.savedAt))}</span>
      </div>
      <div class="detail-url"><a href="${esc(note.url)}" target="_blank" rel="noopener">${esc(note.url)}</a></div>
      ${note.oneLiner ? `<blockquote style="margin:8px 0">💡 ${esc(note.oneLiner)}</blockquote>` : ''}
      ${(note.keywords || []).length ? `<div class="chips">${note.keywords.map((k) => `<span class="chip"># ${esc(k)}</span>`).join('')}</div>` : ''}
      <div class="detail-actions">
        <button class="btn sm" data-act="copy">📋 复制 Markdown</button>
        <button class="btn sm" data-act="doc">📝 Google Docs</button>
        <button class="btn sm" data-act="sheet">📊 Google 表格</button>
        <button class="btn sm" data-act="export">📤 导出 MD</button>
      </div>
      ${note.figures && note.figures.length ? `
        <details>
          <summary style="font-size:12px;color:var(--text-2);cursor:pointer">🖼 论文图表（${note.figures.length}）</summary>
          <div class="figures-grid" style="margin-top:8px">
            ${note.figures.map((f) => `<div class="figure-item" data-src="${esc(f.src)}"><img src="${esc(f.src)}" loading="lazy" referrerpolicy="no-referrer"><div class="fig-cap">${esc(f.caption)}</div></div>`).join('')}
          </div>
        </details>` : ''}
      <div class="md-body" style="margin-top:10px">${renderMarkdown(bodyMd)}</div>
      ${note.userNotes ? `
        <div style="margin-top:12px;padding:10px;background:#fffbe8;border-radius:8px">
          <b style="font-size:12px">✍️ 我的笔记</b>
          <div style="font-size:12.5px;margin-top:4px;white-space:pre-wrap">${esc(note.userNotes)}</div>
        </div>` : ''}
    </div>
  `;

  $('#note-detail-body')
    .querySelectorAll('.figure-item')
    .forEach((el) => el.addEventListener('click', () => openUrl(el.dataset.src)));

  $('#note-detail-body')
    .querySelectorAll('.detail-actions [data-act]')
    .forEach((b) =>
      b.addEventListener('click', async () => {
        const act = b.dataset.act;
        if (act === 'copy') {
          (await copyText(noteToMarkdown(note))) ? toast('已复制 Markdown', 'ok') : toast('复制失败', 'err');
        } else if (act === 'doc') {
          if (await copyText(noteToMarkdown(note))) {
            openUrl('https://docs.new');
            toast('已复制，在 Google Docs 中 Ctrl+V', 'ok');
          }
        } else if (act === 'sheet') {
          syncToGas([note]);
        } else if (act === 'export') {
          downloadFile(`PaperLens-${safeFileName(note.title)}.md`, noteToMarkdown(note), 'text/markdown');
        }
      })
    );
}

$('#btn-back').addEventListener('click', () => {
  $('#notes-detail').hidden = true;
  $('#notes-list-wrap').hidden = false;
  state.detailId = null;
});

/* ---------- 全部导出 / 同步 ---------- */

$('#btn-export').addEventListener('click', async () => {
  const notes = await getAllNotes();
  if (!notes.length) return toast('没有笔记可导出', 'err');
  const fmt = $('#export-select').value;
  const stamp = new Date().toISOString().slice(0, 10);
  if (fmt === 'md') {
    await downloadFile(`PaperLens-全部笔记-${stamp}.md`, notesToMarkdown(notes), 'text/markdown');
  } else if (fmt === 'csv') {
    await downloadFile(`PaperLens-全部笔记-${stamp}.csv`, notesToCSV(notes), 'text/csv');
  } else {
    await downloadFile(`PaperLens-全部笔记-${stamp}.json`, notesToJSON(notes), 'application/json');
  }
});

$('#btn-gas-all').addEventListener('click', async () => {
  const notes = await getAllNotes();
  if (!notes.length) return toast('没有笔记可同步', 'err');
  syncToGas(notes);
});

/* ================= 其他 ================= */

$('#btn-settings').addEventListener('click', () => chrome.runtime.openOptionsPage());

/* ================= 初始化 ================= */

(async function init() {
  refreshNotesCount();
  updateModeUI();
  loadCurrentPage();
})();
