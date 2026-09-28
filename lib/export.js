/**
 * 导出工具：Markdown / CSV / TSV / JSON、剪贴板、文件下载、Google Apps Script 同步。
 */

export function fmtDate(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function safeFileName(name) {
  return (name || '未命名')
    .replace(/[\\/:*?"<>|\n\r]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
}

/** 单篇笔记 → 完整 Markdown 文档 */
export function noteToMarkdown(note) {
  const lines = [
    `# ${note.title || '未命名文献'}`,
    '',
    `- **阅读模式**：${note.mode === 'deep' ? '精读' : '略读'}`,
    `- **作者**：${(note.authors || []).join(', ') || '未知'}`,
    `- **发表时间**：${note.publishDate || '未知'}`,
    `- **出版位置**：${note.venue || '未知'}`,
    `- **网页**：${note.url || ''}`,
    `- **关键词**：${(note.keywords || []).join(', ')}`,
    `- **一句话总结**：${note.oneLiner || ''}`,
    `- **保存时间**：${fmtDate(note.savedAt)}`,
    '',
    '---',
    '',
    note.resultMarkdown || '',
  ];
  if (note.userNotes) {
    lines.push('', '## ✍️ 我的笔记', '', note.userNotes);
  }
  return lines.join('\n');
}

/** 多篇笔记 → Markdown 汇总 */
export function notesToMarkdown(notes) {
  return notes.map((n) => noteToMarkdown(n) + '\n\n---\n').join('\n');
}

const CSV_COLUMNS = [
  ['保存时间', (n) => fmtDate(n.savedAt)],
  ['模式', (n) => (n.mode === 'deep' ? '精读' : '略读')],
  ['标题', (n) => n.title],
  ['作者', (n) => (n.authors || []).join(', ')],
  ['发表时间', (n) => n.publishDate],
  ['出版位置', (n) => n.venue],
  ['网页', (n) => n.url],
  ['关键词', (n) => (n.keywords || []).join(', ')],
  ['一句话总结', (n) => n.oneLiner],
  ['我的笔记', (n) => n.userNotes],
  ['AI 分析', (n) => n.resultMarkdown],
];

function cell(value, sep) {
  const v = String(value == null ? '' : value);
  if (sep === ',') {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v.replace(/[\t\n]+/g, ' ');
}

export function notesToCSV(notes) {
  const head = CSV_COLUMNS.map((c) => cell(c[0], ',')).join(',');
  const rows = notes.map((n) =>
    CSV_COLUMNS.map((c) => cell(c[1](n), ',')).join(',')
  );
  return '\ufeff' + [head, ...rows].join('\r\n');
}

/** TSV：直接粘贴到 Google Sheets / Excel 即自动分列 */
export function notesToTSV(notes) {
  const head = CSV_COLUMNS.map((c) => cell(c[0], '\t')).join('\t');
  const rows = notes.map((n) =>
    CSV_COLUMNS.map((c) => cell(c[1](n), '\t')).join('\t')
  );
  return [head, ...rows].join('\n');
}

export function notesToJSON(notes) {
  return JSON.stringify(notes, null, 2);
}

export async function downloadFile(filename, content, mime = 'text/plain') {
  const blob = new Blob([content], { type: mime + ';charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    await chrome.downloads.download({
      url,
      filename,
      saveAs: true,
    });
  } finally {
    // 稍后释放，避免下载未开始就回收
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (_) {
    // 兜底：老式 execCommand
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0;';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

/**
 * 同步到 Google Apps Script Web App（用户自行部署，见 README）。
 * payload: { rows: [[...]], sheetName }
 */
export async function postToGas(gasUrl, payload) {
  const resp = await fetch(gasUrl, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
  });
  return resp.ok || resp.type === 'opaque';
}

/** 组装发往 Apps Script 的行数据 */
export function noteToRow(note) {
  return [
    fmtDate(note.savedAt),
    note.mode === 'deep' ? '精读' : '略读',
    note.title || '',
    (note.authors || []).join(', '),
    note.publishDate || '',
    note.venue || '',
    note.url || '',
    (note.keywords || []).join(', '),
    note.oneLiner || '',
    (note.userNotes || '').replace(/\s+/g, ' '),
    (note.resultMarkdown || '').replace(/\s+/g, ' ').slice(0, 40000),
  ];
}

export const SHEET_HEADER = [
  '保存时间',
  '模式',
  '标题',
  '作者',
  '发表时间',
  '出版位置',
  '网页',
  '关键词',
  '一句话总结',
  '我的笔记',
  'AI 分析',
];
