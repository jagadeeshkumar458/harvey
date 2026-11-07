// Thin client for the Claude Messages API, called straight from the browser.

const URL = "https://api.anthropic.com/v1/messages";

export const storage = {
  get(k, d = null) { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
  json(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  setJson(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

export const KEYS = { apiKey: "harvey.apiKey", model: "harvey.model", counsel: "harvey.counsel", caseFile: "harvey.case", spar: "harvey.spar" };
export const DEFAULT_MODEL = "claude-sonnet-5-5";

export class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

function headers() {
  return {
    "content-type": "application/json",
    "x-api-key": storage.get(KEYS.apiKey, ""),
    "anthropic-version": "2023-06-01",
    "anthropic-dangerous-direct-browser-access": "true",
  };
}

async function check(res) {
  if (res.ok) return;
  let msg = `Request failed (HTTP ${res.status}).`;
  try { const j = await res.json(); if (j?.error?.message) msg = j.error.message; } catch {}
  throw new ApiError(msg, res.status);
}

const system = text => [{ type: "text", text, cache_control: { type: "ephemeral" } }];
const model = () => storage.get(KEYS.model, DEFAULT_MODEL);

// Streams plain text; calls onText with the full text so far.
export async function streamText({ prompt, messages, onText, signal, maxTokens = 1500 }) {
  const res = await fetch(URL, {
    method: "POST", signal, headers: headers(),
    body: JSON.stringify({ model: model(), max_tokens: maxTokens, stream: true, system: system(prompt), messages }),
  });
  await check(res);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "", full = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const parts = buf.split("\n\n");
    buf = parts.pop();
    for (const p of parts) {
      const line = p.split("\n").find(l => l.startsWith("data:"));
      if (!line) continue;
      let d; try { d = JSON.parse(line.slice(5)); } catch { continue; }
      if (d.type === "content_block_delta" && d.delta?.type === "text_delta") { full += d.delta.text; onText(full); }
      else if (d.type === "error") throw new ApiError(d.error?.message || "Stream error", 500);
    }
  }
  return full;
}

// Forces a single tool call and returns its structured input.
export async function callTool({ prompt, messages, tool, signal, maxTokens = 2500 }) {
  const res = await fetch(URL, {
    method: "POST", signal, headers: headers(),
    body: JSON.stringify({
      model: model(), max_tokens: maxTokens, system: system(prompt), messages,
      tools: [tool], tool_choice: { type: "tool", name: tool.name },
    }),
  });
  await check(res);
  const data = await res.json();
  const block = data.content?.find(b => b.type === "tool_use" && b.name === tool.name);
  if (!block) throw new ApiError("Harvey didn't return a result. Try again.", 500);
  return block.input;
}

export function describeError(err) {
  if (err?.status === 401 || err?.status === 403) return { title: "That API key didn't work.", detail: err.message, settings: true };
  if (err?.status === 429) return { title: "Too many requests right now.", detail: "Wait a moment, then try again.", retry: true };
  if (err?.status === 529 || err?.status >= 500) return { title: "Anthropic's API is busy.", detail: err.message, retry: true };
  return { title: "Something went wrong.", detail: err?.message || String(err), retry: true };
}
