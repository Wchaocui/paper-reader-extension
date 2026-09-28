/**
 * 轻量 Markdown 渲染器（无第三方依赖，输出前全部转义，可安全 innerHTML）。
 * 支持：标题、粗体/斜体、行内代码、代码块、有序/无序列表、引用、
 * 分隔线、链接、图片、表格、删除线。
 */

function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function safeUrl(u) {
  const t = String(u || '').trim();
  if (/^(https?:|mailto:|data:image\/)/i.test(t)) return t;
  return '#';
}

function inline(text) {
  let s = escapeHtml(text);
  // 行内代码先处理，避免内部再被格式化
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (_, c) => {
    codes.push(c);
    return `\x00${codes.length - 1}\x00`;
  });
  // 图片
  s = s.replace(
    /!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g,
    (_, alt, src) =>
      `<img src="${safeUrl(src)}" alt="${alt}" loading="lazy" referrerpolicy="no-referrer">`
  );
  // 链接
  s = s.replace(
    /\[([^\]]+)\]\(([^)\s]+)[^)]*\)/g,
    (_, txt, href) =>
      `<a href="${safeUrl(href)}" target="_blank" rel="noopener noreferrer">${txt}</a>`
  );
  // 粗斜体、粗体、斜体、删除线
  s = s.replace(/(\*\*\*|___)(.+?)\1/g, '<strong><em>$2</em></strong>');
  s = s.replace(/(\*\*|__)(.+?)\1/g, '<strong>$2</strong>');
  s = s.replace(/(\*|_)([^*_]+?)\1/g, '<em>$2</em>');
  s = s.replace(/~~(.+?)~~/g, '<del>$1</del>');
  s = s.replace(/\x00(\d+)\x00/g, (_, i) => `<code>${codes[+i]}</code>`);
  return s;
}

function renderTable(lines) {
  const rows = lines
    .filter((l) => !/^\s*\|?\s*:?-{2,}/.test(l))
    .map((l) =>
      l
        .replace(/^\s*\|/, '')
        .replace(/\|\s*$/, '')
        .split('|')
        .map((c) => c.trim())
    );
  if (!rows.length) return '';
  const [head, ...body] = rows;
  const thead = `<tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr>`;
  const tbody = body
    .map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`)
    .join('');
  return `<div class="md-table-wrap"><table><thead>${thead}</thead><tbody>${tbody}</tbody></table></div>`;
}

export function renderMarkdown(src) {
  if (!src) return '';
  const lines = String(src).replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let listStack = []; // 'ul' | 'ol'
  let inQuote = false;
  let para = [];
  let codeBlock = null;

  const closeLists = () => {
    while (listStack.length) out.push(`</${listStack.pop()}>`);
  };
  const closeQuote = () => {
    if (inQuote) {
      out.push('</blockquote>');
      inQuote = false;
    }
  };
  const flushPara = () => {
    if (para.length) {
      out.push(`<p>${inline(para.join(' '))}</p>`);
      para = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 代码块
    const fence = line.match(/^\s*```\s*(\S*)/);
    if (codeBlock !== null) {
      if (fence) {
        out.push(`<pre><code>${escapeHtml(codeBlock.join('\n'))}</code></pre>`);
        codeBlock = null;
      } else {
        codeBlock.push(line);
      }
      continue;
    }
    if (fence) {
      flushPara();
      closeLists();
      closeQuote();
      codeBlock = [];
      continue;
    }

    // 表格（当前行含 | 且下一行是分隔行）
    if (
      /\|/.test(line) &&
      i + 1 < lines.length &&
      /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i + 1])
    ) {
      flushPara();
      closeLists();
      closeQuote();
      const tbl = [line, lines[i + 1]];
      let j = i + 2;
      while (j < lines.length && /\|/.test(lines[j])) tbl.push(lines[j++]);
      out.push(renderTable(tbl));
      i = j - 1;
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flushPara();
      closeLists();
      closeQuote();
      const lvl = heading[1].length;
      out.push(`<h${lvl}>${inline(heading[2])}</h${lvl}>`);
      continue;
    }

    if (/^\s*(---+|\*\*\*+)\s*$/.test(line)) {
      flushPara();
      closeLists();
      closeQuote();
      out.push('<hr>');
      continue;
    }

    const ul = line.match(/^\s*[-*+]\s+(.*)$/);
    const ol = line.match(/^\s*(\d+)[.、)]\s+(.*)$/);
    if (ul || ol) {
      flushPara();
      closeQuote();
      const type = ul ? 'ul' : 'ol';
      if (listStack[listStack.length - 1] !== type) {
        closeLists();
        listStack.push(type);
        out.push(`<${type}>`);
      }
      const content = ul ? ul[1] : ol[2];
      const cb = content.match(/^\[( |x|X)\]\s+(.*)$/);
      if (cb) {
        const checked = cb[1].toLowerCase() === 'x' ? ' checked' : '';
        out.push(
          `<li><span class="md-check${checked ? ' done' : ''}">${checked ? '☑' : '☐'}</span> ${inline(cb[2])}</li>`
        );
      } else {
        out.push(`<li>${inline(content)}</li>`);
      }
      continue;
    }

    const quote = line.match(/^\s*>\s?(.*)$/);
    if (quote) {
      flushPara();
      closeLists();
      if (!inQuote) {
        out.push('<blockquote>');
        inQuote = true;
      }
      if (quote[1]) out.push(`<p>${inline(quote[1])}</p>`);
      continue;
    }

    if (!line.trim()) {
      flushPara();
      closeLists();
      closeQuote();
      continue;
    }

    para.push(line.trim());
  }
  if (codeBlock !== null && codeBlock.length) {
    out.push(`<pre><code>${escapeHtml(codeBlock.join('\n'))}</code></pre>`);
  }
  flushPara();
  closeLists();
  closeQuote();
  return out.join('\n');
}
