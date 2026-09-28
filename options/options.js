/**
 * 设置页逻辑：加载/保存配置、服务商预设切换、连接测试。
 */
import { getSettings, saveSettings, PROVIDER_PRESETS } from '../lib/storage.js';
import { copyText } from '../lib/export.js';

const $ = (id) => document.getElementById(id);

function setResult(el, ok, msg) {
  el.textContent = msg;
  el.className = 'test-result ' + (ok ? 'ok' : 'err');
}

async function load() {
  const s = await getSettings();
  // 预设下拉
  $('provider').innerHTML = PROVIDER_PRESETS.map(
    (p) => `<option value="${p.id}">${p.label}</option>`
  ).join('');
  $('provider').value = s.provider;
  if (!$('provider').value) $('provider').value = 'custom';

  $('baseUrl').value = s.baseUrl || '';
  $('model').value = s.model || '';
  $('apiKey').value = s.apiKey || '';
  $('userBackground').value = s.userBackground || '';
  $('gasUrl').value = s.gasUrl || '';
  updateHint();
}

function updateHint() {
  const preset = PROVIDER_PRESETS.find((p) => p.id === $('provider').value);
  const el = $('provider-hint');
  if (!preset) {
    el.innerHTML = '';
    return;
  }
  const url = (preset.hint.match(/https?:\/\/\S+/) || [''])[0];
  el.innerHTML = url
    ? `Key 获取：<a href="${url}" target="_blank" rel="noopener">${preset.hint} ↗</a>`
    : preset.hint;
}

/** 粘贴内容自动识别：完整 JSON / 智谱 Key（32hex.16hex）/ 普通 sk- Key */
$('btn-import').addEventListener('click', async () => {
  const el = $('test-result');
  let text = '';
  try {
    text = (await navigator.clipboard.readText() || '').trim();
  } catch (_) {
    setResult(el, false, '✗ 无法读取剪贴板，请手动粘贴到输入框');
    return;
  }
  if (!text) {
    setResult(el, false, '✗ 剪贴板是空的：先去复制 API Key（或 JSON 配置）再点导入');
    return;
  }

  // 1) 完整 JSON 配置
  if (text.startsWith('{')) {
    try {
      const j = JSON.parse(text);
      if (j.apiKey) $('apiKey').value = String(j.apiKey).trim();
      if (j.baseUrl) $('baseUrl').value = String(j.baseUrl).trim();
      if (j.model) $('model').value = String(j.model).trim();
      updateHint();
      setResult(el, true, '✓ 已导入完整 JSON 配置，记得点「保存设置」');
      return;
    } catch (_) {
      setResult(el, false, '✗ 剪贴板是 JSON 但解析失败，请检查格式');
      return;
    }
  }

  // 2) 智谱 GLM Key：32位hex.16位hex（独有格式，可确定服务商）
  if (/^[0-9a-f]{32}\.[0-9a-f]{16}$/i.test(text)) {
    $('provider').value = 'glm';
    applyPreset(true);
    $('apiKey').value = text;
    setResult(el, true, '✓ 识别为智谱 GLM Key，已自动填好服务商 / 地址 / 模型，点「保存设置」即可');
    return;
  }

  // 3) 其他 Key（sk- 开头等）：套用当前选中的服务商，自动补全地址与模型
  if (/^sk-[A-Za-z0-9_-]{16,}$/.test(text) || /^[A-Za-z0-9_.-]{24,}$/.test(text)) {
    applyPreset(true);
    $('apiKey').value = text;
    setResult(el, true, `✓ 已导入 Key（按当前服务商「${$('provider').selectedOptions[0].textContent.split('（')[0]}」配置），点「保存设置」即可`);
    return;
  }

  setResult(el, false, '✗ 无法识别剪贴板内容：请复制 API Key（或 JSON 配置）后重试');
});

function applyPreset(overwrite) {
  const preset = PROVIDER_PRESETS.find((p) => p.id === $('provider').value);
  if (!preset) return;
  if (overwrite || !$('baseUrl').value) $('baseUrl').value = preset.baseUrl;
  if (overwrite || !$('model').value) $('model').value = preset.model;
  updateHint();
}

$('provider').addEventListener('change', () => applyPreset(true));

$('btn-test').addEventListener('click', async () => {
  const el = $('test-result');
  el.className = 'test-result';
  el.textContent = '测试中…';
  const config = {
    baseUrl: $('baseUrl').value.trim(),
    apiKey: $('apiKey').value.trim(),
    model: $('model').value.trim(),
  };
  if (!config.apiKey || !config.baseUrl || !config.model) {
    setResult(el, false, '请先填写 Base URL、模型与 API Key');
    return;
  }
  try {
    const resp = await chrome.runtime.sendMessage({ type: 'TEST_AI', config });
    if (resp && resp.ok) setResult(el, true, `✓ 连接成功：${resp.reply || 'OK'}`);
    else setResult(el, false, `✗ ${resp ? resp.error : '无响应'}`);
  } catch (e) {
    setResult(el, false, '✗ ' + e.message);
  }
});

$('btn-copy-gas').addEventListener('click', async () => {
  (await copyText($('gas-code-block').textContent))
    ? setResult($('save-result'), true, '✓ 已复制 Apps Script 代码')
    : setResult($('save-result'), false, '复制失败，请手动选择复制');
});

$('btn-save').addEventListener('click', async () => {
  await saveSettings({
    provider: $('provider').value,
    baseUrl: $('baseUrl').value.trim(),
    apiKey: $('apiKey').value.trim(),
    model: $('model').value.trim(),
    userBackground: $('userBackground').value,
    gasUrl: $('gasUrl').value.trim(),
  });
  setResult($('save-result'), true, '✓ 已保存');
  setTimeout(() => ($('save-result').textContent = ''), 2400);
});

load();
