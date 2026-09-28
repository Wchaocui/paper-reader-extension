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
  $('provider-hint').textContent = preset
    ? `Key 获取地址：${preset.hint}`
    : '';
}

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
