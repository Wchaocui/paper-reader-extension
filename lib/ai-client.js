/**
 * OpenAI 兼容 Chat Completions 流式客户端。
 * 适用于智谱 GLM / DeepSeek / OpenAI / Kimi 等所有兼容 /chat/completions 的服务。
 * 在 Service Worker 中运行（利用 host_permissions 绕过 CORS）。
 */

export async function* chatStream(
  { baseUrl, apiKey, model },
  messages,
  { temperature = 0.3, maxTokens = 8000, signal } = {}
) {
  if (!apiKey) throw new Error('未配置 API Key，请先在设置页填写');
  if (!baseUrl) throw new Error('未配置 API Base URL');
  if (!model) throw new Error('未配置模型名称');

  const url = baseUrl.replace(/\/+$/, '') + '/chat/completions';
  let resp;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
        stream: true,
      }),
      signal,
    });
  } catch (e) {
    throw new Error(`网络请求失败：${e.message}（检查 Base URL 与网络）`);
  }

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    let hint = '';
    if (resp.status === 401) hint = '（API Key 无效或未授权）';
    else if (resp.status === 404) hint = '（Base URL 或模型名可能有误）';
    else if (resp.status === 429) hint = '（请求过于频繁或额度不足）';
    throw new Error(`API 错误 ${resp.status}${hint}：${text.slice(0, 300)}`);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() || '';
    for (const line of lines) {
      const s = line.trim();
      if (!s.startsWith('data:')) continue;
      const payload = s.slice(5).trim();
      if (payload === '[DONE]') return;
      try {
        const json = JSON.parse(payload);
        const delta = json.choices && json.choices[0] && json.choices[0].delta;
        const content = delta && delta.content;
        if (content) yield content;
      } catch (_) {
        /* 忽略不完整/非 JSON 行 */
      }
    }
  }
}

/** 非流式小请求，用于设置页「测试连接」 */
export async function chatOnce(config, prompt) {
  const url = config.baseUrl.replace(/\/+$/, '') + '/chat/completions';
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 16,
      temperature: 0,
    }),
  });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`API 错误 ${resp.status}：${text.slice(0, 200)}`);
  const json = JSON.parse(text);
  return (json.choices && json.choices[0].message.content) || '';
}
