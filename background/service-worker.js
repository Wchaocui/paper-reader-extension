/**
 * PaperLens 后台 Service Worker：
 * - 点击工具栏图标打开侧边栏
 * - 通过长连接 Port 转发 AI 流式输出（避开 CORS，保持 SW 存活）
 * - 提供设置页的「测试连接」
 */
import { chatStream, chatOnce } from '../lib/ai-client.js';

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(() => {});

let streamSeq = 0;

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'paperlens-ai') return;
  port.onMessage.addListener(async (msg) => {
    if (!msg || msg.type !== 'analyze') return;
    const seq = ++streamSeq;
    const started = Date.now();
    try {
      let chars = 0;
      for await (const delta of chatStream(msg.config, msg.messages, {
        temperature: msg.temperature ?? 0.3,
        maxTokens: msg.maxTokens ?? 8000,
      })) {
        if (seq !== streamSeq) return; // 已有更新的请求，放弃旧流
        chars += delta.length;
        port.postMessage({ type: 'delta', text: delta, chars });
      }
      port.postMessage({
        type: 'done',
        chars,
        elapsed: Date.now() - started,
      });
    } catch (e) {
      port.postMessage({
        type: 'error',
        error: String(e && e.message ? e.message : e),
      });
    }
  });
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === 'TEST_AI') {
    chatOnce(msg.config, '请只回复两个字：连接成功')
      .then((r) => sendResponse({ ok: true, reply: r.trim().slice(0, 50) }))
      .catch((e) =>
        sendResponse({ ok: false, error: String(e && e.message ? e.message : e) })
      );
    return true; // 异步响应
  }
  if (msg && msg.type === 'OPEN_URL') {
    chrome.tabs.create({ url: msg.url, active: true });
    sendResponse({ ok: true });
  }
  return false;
});
