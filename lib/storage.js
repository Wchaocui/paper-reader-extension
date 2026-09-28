/**
 * 笔记与设置的本地存储（chrome.storage.local）。
 */

const NOTES_KEY = 'paperlens_notes';
const SETTINGS_KEY = 'paperlens_settings';

export const PROVIDER_PRESETS = [
  {
    id: 'glm',
    label: '智谱 GLM（推荐，国内直连）',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4.7',
    hint: 'https://open.bigmodel.cn → 控制台 → API Keys',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    hint: 'https://platform.deepseek.com → API Keys',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o',
    hint: 'https://platform.openai.com → API keys',
  },
  {
    id: 'kimi',
    label: '月之暗面 Kimi',
    baseUrl: 'https://api.moonshot.cn/v1',
    model: 'moonshot-v1-128k',
    hint: 'https://platform.moonshot.cn → API Key',
  },
  {
    id: 'custom',
    label: '自定义（任意 OpenAI 兼容接口）',
    baseUrl: '',
    model: '',
    hint: '填写任意兼容 /chat/completions 的服务',
  },
];

export const DEFAULT_SETTINGS = {
  provider: 'glm',
  baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
  apiKey: '',
  model: 'glm-4.7',
  userBackground: '',
  gasUrl: '',
};

export async function getSettings() {
  const o = await chrome.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...(o[SETTINGS_KEY] || {}) };
}

export async function saveSettings(patch) {
  const cur = await getSettings();
  const next = { ...cur, ...patch };
  await chrome.storage.local.set({ [SETTINGS_KEY]: next });
  return next;
}

/* ---------------- 笔记 ---------------- */

export async function getAllNotes() {
  const o = await chrome.storage.local.get(NOTES_KEY);
  return o[NOTES_KEY] || [];
}

export async function addNote(note) {
  const notes = await getAllNotes();
  const full = { ...note, savedAt: Date.now() };
  notes.unshift(full);
  await chrome.storage.local.set({ [NOTES_KEY]: notes });
  return full;
}

export async function updateNote(id, patch) {
  const notes = await getAllNotes();
  const idx = notes.findIndex((n) => n.id === id);
  if (idx === -1) return null;
  notes[idx] = { ...notes[idx], ...patch, updatedAt: Date.now() };
  await chrome.storage.local.set({ [NOTES_KEY]: notes });
  return notes[idx];
}

export async function deleteNote(id) {
  const notes = await getAllNotes();
  const next = notes.filter((n) => n.id !== id);
  await chrome.storage.local.set({ [NOTES_KEY]: next });
  return next;
}

export async function clearNotes() {
  await chrome.storage.local.set({ [NOTES_KEY]: [] });
}

export async function getNote(id) {
  const notes = await getAllNotes();
  return notes.find((n) => n.id === id) || null;
}
