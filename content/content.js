/**
 * PaperLens 内容提取脚本
 * 注入到普通网页，按需提取论文页面的元数据、摘要、章节、全文与图表。
 * 仅在收到侧边栏的 EXTRACT_PAPER 消息时工作，平时零开销。
 */
(() => {
  if (window.__paperlensInjected) return;
  window.__paperlensInjected = true;

  const MAX_SECTIONS = 40;
  const MAX_SECTION_TEXT = 6000;
  const MAX_FIGURES = 12;
  const MAX_ABSTRACT = 4000;

  /* ---------------- 元数据 ---------------- */

  function metaContent(key) {
    const el =
      document.querySelector(`meta[name="${key}"]`) ||
      document.querySelector(`meta[property="${key}"]`);
    return el ? (el.getAttribute('content') || '').trim() : '';
  }

  function collectMeta() {
    const authors = [...document.querySelectorAll('meta[name="citation_author"]')]
      .map((m) => (m.getAttribute('content') || '').trim())
      .filter(Boolean);

    let publishDate =
      metaContent('citation_publication_date') ||
      metaContent('citation_online_date') ||
      metaContent('citation_date') ||
      metaContent('article:published_time') ||
      metaContent('og:article:published_time') ||
      metaContent('date');

    let venue =
      metaContent('citation_journal_title') ||
      metaContent('citation_conference_title') ||
      metaContent('citation_conference') ||
      metaContent('prism.publicationName') ||
      metaContent('citation_technical_report_institution');

    const url = location.href;
    const host = location.hostname;
    if (!venue) {
      if (/arxiv\.org/i.test(host)) venue = 'arXiv 预印本';
      else if (/biorxiv\.org/i.test(host)) venue = 'bioRxiv 预印本';
      else if (/medrxiv\.org/i.test(host)) venue = 'medRxiv 预印本';
      else if (/ssrn\.com/i.test(host)) venue = 'SSRN 预印本';
      else if (/pubmed\.ncbi\.nlm\.nih\.gov/i.test(host)) venue = 'PubMed';
      else if (/semanticscholar\.org/i.test(host)) venue = 'Semantic Scholar';
      else if (/openreview\.net/i.test(host)) venue = 'OpenReview';
      else if (/scholar\.google/i.test(host)) venue = 'Google Scholar';
      else venue = host.replace(/^www\./, '');
    }

    const arxivId =
      metaContent('citation_arxiv_id') ||
      (url.match(/arxiv\.org\/(?:abs|html|pdf)\/([0-9]+\.[0-9]+)/i) || [])[1] ||
      '';
    if (arxivId && !publishDate) publishDate = `arXiv:${arxivId}`;

    const keywords =
      metaContent('citation_keywords') ||
      metaContent('keywords') ||
      metaContent('article:tag') ||
      '';

    return {
      authors,
      publishDate,
      venue,
      doi: metaContent('citation_doi') || metaContent('prism.doi') || '',
      keywords,
      arxivId,
    };
  }

  /* ---------------- 摘要 ---------------- */

  function extractAbstract() {
    const selectors = [
      'blockquote.abstract',
      'div.abstract',
      'section.abstract',
      '#abstract',
      'section#abs',
      'div#abs',
      '[class*="abstract" i]',
      '[id*="abstract" i]',
    ];
    for (const sel of selectors) {
      try {
        const el = document.querySelector(sel);
        if (!el) continue;
        let t = (el.innerText || el.textContent || '')
          .replace(/\s+/g, ' ')
          .replace(/^\s*(abstract|摘要)\s*[:：]?\s*/i, '')
          .trim();
        if (t.length >= 80) return t.slice(0, MAX_ABSTRACT);
      } catch (_) {
        /* ignore */
      }
    }
    const desc = metaContent('description') || metaContent('og:description');
    return desc ? desc.slice(0, MAX_ABSTRACT) : '';
  }

  /* ---------------- 正文与章节 ---------------- */

  const STRIP_SELECTOR =
    'script,style,noscript,nav,footer,header,aside,form,button,select,option,iframe,svg,figure,figcaption,template';

  function cleanClone(root) {
    const clone = root.cloneNode(true);
    clone.querySelectorAll(STRIP_SELECTOR).forEach((n) => n.remove());
    return clone;
  }

  function blockTexts(root) {
    const parts = [];
    const blocks = root.querySelectorAll(
      'h1,h2,h3,h4,h5,h6,p,li,blockquote,dt,dd'
    );
    blocks.forEach((el) => {
      // 若元素内部还包含块级子元素则跳过，避免重复采集
      if (el.querySelector('p,li,h1,h2,h3,h4,h5,h6,blockquote')) return;
      const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (t && t.length > 1) parts.push(t);
    });
    // 某些站点整段都在 div 里，无 p 标签
    if (parts.join('').length < 300) {
      const t = (root.textContent || '').replace(/[ \t]+/g, ' ');
      return t
        .split(/\n{2,}/)
        .map((s) => s.trim())
        .filter(Boolean);
    }
    return parts;
  }

  function pickMainRoot() {
    const candidates = document.querySelectorAll(
      'article, main, [role="main"], #content, .content, .fulltext, #fulltext, .paper, #paper'
    );
    let best = null;
    let bestLen = 0;
    candidates.forEach((c) => {
      const len = (c.innerText || c.textContent || '').length;
      if (len > bestLen) {
        bestLen = len;
        best = c;
      }
    });
    return bestLen > 800 ? best : document.body;
  }

  function extractSections() {
    const sections = [];
    const root = pickMainRoot();
    const headings = root.querySelectorAll('h1,h2,h3,h4');
    headings.forEach((h) => {
      const heading = (h.innerText || h.textContent || '').replace(/\s+/g, ' ').trim();
      if (!heading || heading.length > 120) return;
      const buf = [];
      let node = h.nextElementSibling;
      let steps = 0;
      while (node && steps < 600) {
        if (/^H[1-4]$/i.test(node.tagName)) break;
        const t = (node.innerText || node.textContent || '')
          .replace(/\s+/g, ' ')
          .trim();
        if (t && !buf.includes(t)) buf.push(t);
        node = node.nextElementSibling;
        steps++;
      }
      const text = buf.join('\n').slice(0, MAX_SECTION_TEXT);
      if (text.length > 60) sections.push({ heading, text });
    });
    return sections.slice(0, MAX_SECTIONS);
  }

  function extractMainText() {
    const root = cleanClone(pickMainRoot());
    const lines = blockTexts(root);
    return lines.join('\n');
  }

  function findConclusionSections(sections) {
    const re = /^(结论|总结|结语|小结|结论与|summary|conclusion|conclusions|discussion and conclusion)/i;
    return sections.filter((s) => re.test(s.heading));
  }

  /* ---------------- 图表 ---------------- */

  function isJunkImage(src, alt) {
    return /logo|icon|avatar|favicon|sprite|badge|button|banner|ad[_-]|\.svg(\?|$)/i.test(
      src + ' ' + (alt || '')
    );
  }

  function extractFigures() {
    const figs = [];
    const seen = new Set();

    document.querySelectorAll('figure').forEach((f) => {
      const img = f.querySelector('img');
      if (!img || !img.src) return;
      const cap = f.querySelector('figcaption');
      const caption = (cap ? cap.innerText : img.alt || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 600);
      if (seen.has(img.src)) return;
      seen.add(img.src);
      figs.push({ src: img.src, caption: caption || '（无说明文字）' });
    });

    document.querySelectorAll('img').forEach((img) => {
      if (figs.length >= MAX_FIGURES) return;
      if (!img.src || seen.has(img.src)) return;
      const w = img.naturalWidth || img.width || 0;
      const h = img.naturalHeight || img.height || 0;
      const alt = img.alt || '';
      if (w >= 260 && h >= 140 && !isJunkImage(img.src, alt)) {
        seen.add(img.src);
        figs.push({ src: img.src, caption: alt.slice(0, 600) || '（无说明文字）' });
      }
    });

    return figs.slice(0, MAX_FIGURES);
  }

  /* ---------------- 页面标题 ---------------- */

  function pageTitle() {
    const h1 = document.querySelector('h1');
    return (
      metaContent('citation_title') ||
      metaContent('og:title') ||
      (h1 ? h1.innerText.trim() : '') ||
      document.title ||
      ''
    ).replace(/\s+/g, ' ').slice(0, 300);
  }

  /* ---------------- 汇总 ---------------- */

  function extractPaper() {
    const meta = collectMeta();
    const abstract = extractAbstract();
    const sections = extractSections();
    const fullText = extractMainText();
    const figures = extractFigures();
    return {
      url: location.href,
      host: location.hostname.replace(/^www\./, ''),
      title: pageTitle(),
      meta,
      abstract,
      sections,
      conclusion: findConclusionSections(sections)
        .map((s) => `【${s.heading}】\n${s.text}`)
        .join('\n\n'),
      fullText,
      textLength: fullText.length,
      truncated: fullText.length > 52000,
      figures,
      extractedAt: Date.now(),
    };
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.type === 'EXTRACT_PAPER') {
      try {
        sendResponse({ ok: true, data: extractPaper() });
      } catch (e) {
        sendResponse({ ok: false, error: String(e && e.message ? e.message : e) });
      }
    }
    return false;
  });
})();
