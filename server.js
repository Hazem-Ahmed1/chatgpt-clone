require("dotenv").config();
const express = require("express");
const OpenAI  = require("openai");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const Database = require("better-sqlite3");
const path = require("path");

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "25mb" }));
app.use(express.static(path.join(__dirname, "public")));

// ═══════════════════════════════════════════════════════════════
//  DATABASE  (SQLite — stored in chat.db next to server.js)
// ═══════════════════════════════════════════════════════════════
const db = new Database(path.join(__dirname, "chat.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS conversations (
    id         TEXT PRIMARY KEY,
    title      TEXT NOT NULL DEFAULT 'New Chat',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS messages (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role            TEXT NOT NULL,
    content         TEXT NOT NULL,
    created_at      TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_msg_conv ON messages(conversation_id, id);
`);

const q = {
  listConvs:    db.prepare("SELECT id, title, created_at, updated_at FROM conversations ORDER BY updated_at DESC"),
  getConv:      db.prepare("SELECT id, title FROM conversations WHERE id = ?"),
  insertConv:   db.prepare("INSERT OR IGNORE INTO conversations (id, title) VALUES (?, ?)"),
  updateTitle:  db.prepare("UPDATE conversations SET title = ?, updated_at = datetime('now') WHERE id = ?"),
  touchConv:    db.prepare("UPDATE conversations SET updated_at = datetime('now') WHERE id = ?"),
  deleteConv:   db.prepare("DELETE FROM conversations WHERE id = ?"),
  getMsgs:      db.prepare("SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY id ASC"),
  insertMsg:    db.prepare("INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)"),
  deleteLast:   db.prepare(`
    DELETE FROM messages WHERE id IN (
      SELECT id FROM messages WHERE conversation_id = ? ORDER BY id DESC LIMIT ?
    )`),
};

function serializeContent(c) { return typeof c === "string" ? c : JSON.stringify(c); }
function deserializeContent(s) { try { const p = JSON.parse(s); return Array.isArray(p) ? p : s; } catch { return s; } }

// ── GET /api/conversations ────────────────────────────────────
app.get("/api/conversations", (_req, res) => {
  res.json(q.listConvs.all());
});

// ── POST /api/conversations ───────────────────────────────────
app.post("/api/conversations", (req, res) => {
  const { id, title } = req.body;
  if (!id || !title) return res.status(400).json({ error: "id and title required" });
  q.insertConv.run(id, title);
  res.json({ id, title });
});

// ── PUT /api/conversations/:id ────────────────────────────────
app.put("/api/conversations/:id", (req, res) => {
  const { title } = req.body;
  if (!title) return res.status(400).json({ error: "title required" });
  q.updateTitle.run(title, req.params.id);
  res.json({ ok: true });
});

// ── DELETE /api/conversations/:id ─────────────────────────────
app.delete("/api/conversations/:id", (_req, res) => {
  q.deleteConv.run(_req.params.id);
  res.json({ ok: true });
});

// ── GET /api/conversations/:id/messages ──────────────────────
app.get("/api/conversations/:id/messages", (req, res) => {
  const msgs = q.getMsgs.all(req.params.id).map(m => ({
    role:    m.role,
    content: deserializeContent(m.content),
  }));
  res.json(msgs);
});

// ── POST /api/conversations/:id/messages ─────────────────────
app.post("/api/conversations/:id/messages", (req, res) => {
  const { role, content } = req.body;
  if (!role || content === undefined) return res.status(400).json({ error: "role and content required" });
  q.insertMsg.run(req.params.id, role, serializeContent(content));
  q.touchConv.run(req.params.id);
  res.json({ ok: true });
});

// ── DELETE /api/conversations/:id/messages/last/:n ────────────
app.delete("/api/conversations/:id/messages/last/:n", (req, res) => {
  const n = parseInt(req.params.n, 10);
  if (!n || n < 1) return res.status(400).json({ error: "n must be >= 1" });
  q.deleteLast.run(req.params.id, n);
  q.touchConv.run(req.params.id);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════
//  AI PROVIDER CLIENTS
// ═══════════════════════════════════════════════════════════════
const groqClient = process.env.GROQ_API_KEY
  ? new OpenAI({ baseURL: "https://api.groq.com/openai/v1", apiKey: process.env.GROQ_API_KEY })
  : null;

const deepseekClient = process.env.DEEPSEEK_API_KEY
  ? new OpenAI({ baseURL: "https://api.deepseek.com", apiKey: process.env.DEEPSEEK_API_KEY })
  : null;

// ── GET /api/config ───────────────────────────────────────────
app.get("/api/config", (_req, res) => {
  res.json({
    groq:     !!process.env.GROQ_API_KEY,
    gemini:   !!process.env.GEMINI_API_KEY,
    deepseek: !!process.env.DEEPSEEK_API_KEY,
  });
});

// ── POST /api/transcribe — Whisper STT ───────────────────────
app.post("/api/transcribe", async (req, res) => {
  const { audio } = req.body;
  if (!audio) return res.status(400).json({ error: "audio is required." });

  try {
    const base64 = audio.includes(",") ? audio.split(",")[1] : audio;
    const buffer = Buffer.from(base64, "base64");
    let text = "";

    if (process.env.HF_TOKEN) {
      const hfRes = await fetch(
        "https://router.huggingface.co/hf-inference/models/openai/whisper-large-v3-turbo",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${process.env.HF_TOKEN}`, "Content-Type": "audio/webm" },
          body: buffer,
        }
      );
      if (!hfRes.ok) { const e = await hfRes.json().catch(() => ({})); throw new Error(e.error || `HF ${hfRes.status}`); }
      const data = await hfRes.json();
      text = data.text || data[0]?.text || "";
    } else if (groqClient) {
      const file   = new File([buffer], "recording.webm", { type: "audio/webm" });
      const result = await groqClient.audio.transcriptions.create({ file, model: "whisper-large-v3-turbo", response_format: "json" });
      text = result.text;
    } else {
      return res.status(500).json({ error: "No STT provider configured. Add HF_TOKEN or GROQ_API_KEY to .env" });
    }

    res.json({ text });
  } catch (err) {
    console.error("Transcription error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/chat/stream — SSE streaming ────────────────────
app.post("/api/chat/stream", async (req, res) => {
  const { model: fullModel, messages } = req.body;
  if (!fullModel)        return res.status(400).json({ error: "model is required." });
  if (!messages?.length) return res.status(400).json({ error: "messages is required." });

  const colonIdx = fullModel.indexOf(":");
  const provider = fullModel.slice(0, colonIdx);
  const modelId  = fullModel.slice(colonIdx + 1);
  const trimmed  = messages.slice(-10);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
  const done = () => { res.write("data: [DONE]\n\n"); res.end(); };

  try {
    switch (provider) {
      case "groq":     await streamGroq(modelId, trimmed, send);     break;
      case "gemini":   await streamGemini(modelId, trimmed, send);   break;
      case "deepseek": await streamDeepSeek(modelId, trimmed, send); break;
      default:
        send({ error: `Unknown provider: ${provider}` });
        return res.end();
    }
    done();
  } catch (err) {
    console.error(`[${provider}] stream error:`, err.status ?? "", err.message);
    send({ error: err.message || "Something went wrong." });
    res.end();
  }
});

// ── POST /api/chat — non-streaming fallback ───────────────────
app.post("/api/chat", async (req, res) => {
  const { model: fullModel, messages } = req.body;
  if (!fullModel)        return res.status(400).json({ error: "model is required." });
  if (!messages?.length) return res.status(400).json({ error: "messages is required." });

  const colonIdx = fullModel.indexOf(":");
  const provider = fullModel.slice(0, colonIdx);
  const modelId  = fullModel.slice(colonIdx + 1);
  const trimmed  = messages.slice(-10);

  try {
    let reply;
    switch (provider) {
      case "groq":     reply = await callGroq(modelId, trimmed);     break;
      case "gemini":   reply = await callGemini(modelId, trimmed);   break;
      case "deepseek": reply = await callDeepSeek(modelId, trimmed); break;
      default: return res.status(400).json({ error: `Unknown provider: ${provider}` });
    }
    res.json({ message: reply });
  } catch (err) {
    console.error(`[${provider}]`, err.status ?? "", err.message);
    if (err.status === 401 || err.message?.includes("not configured"))
      return res.status(401).json({ error: `${provider.toUpperCase()} API key missing or invalid.` });
    if (err.status === 429)
      return res.status(429).json({ error: "Rate limit reached. Wait a moment and try again." });
    res.status(500).json({ error: err.message || "Something went wrong." });
  }
});

// ═══════════════════════════════════════════════════════════════
//  STREAMING IMPLEMENTATIONS
// ═══════════════════════════════════════════════════════════════
async function streamGroq(model, messages, send) {
  if (!groqClient) throw apiError(401, "GROQ_API_KEY not configured");
  const stream = await groqClient.chat.completions.create({ model, messages, temperature: 0.2, max_tokens: 1024, stream: true });
  for await (const chunk of stream) {
    const c = chunk.choices[0]?.delta?.content;
    if (c) send({ content: c });
  }
}

async function streamDeepSeek(model, messages, send) {
  if (!deepseekClient) throw apiError(401, "DEEPSEEK_API_KEY not configured");
  const stream = await deepseekClient.chat.completions.create({ model, messages, temperature: 0.2, max_tokens: 1024, stream: true });
  for await (const chunk of stream) {
    const c = chunk.choices[0]?.delta?.content;
    if (c) send({ content: c });
  }
}

async function streamGemini(model, messages, send) {
  if (!process.env.GEMINI_API_KEY) throw apiError(401, "GEMINI_API_KEY not configured");
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const m = genAI.getGenerativeModel({ model, generationConfig: { temperature: 0.2, maxOutputTokens: 1024 } });
  const history = messages.slice(0, -1).map(msg => ({
    role:  msg.role === "assistant" ? "model" : "user",
    parts: toGeminiParts(msg.content),
  }));
  const chat   = m.startChat({ history });
  const last   = messages[messages.length - 1];
  const result = await chat.sendMessageStream(toGeminiParts(last.content));
  for await (const chunk of result.stream) {
    const c = chunk.text();
    if (c) send({ content: c });
  }
}

// ═══════════════════════════════════════════════════════════════
//  NON-STREAMING IMPLEMENTATIONS
// ═══════════════════════════════════════════════════════════════
async function callGroq(model, messages) {
  if (!groqClient) throw apiError(401, "GROQ_API_KEY not configured");
  const r = await groqClient.chat.completions.create({ model, messages, temperature: 0.2, max_tokens: 1024 });
  return r.choices[0].message;
}
async function callDeepSeek(model, messages) {
  if (!deepseekClient) throw apiError(401, "DEEPSEEK_API_KEY not configured");
  const r = await deepseekClient.chat.completions.create({ model, messages, temperature: 0.2, max_tokens: 1024 });
  return r.choices[0].message;
}
async function callGemini(model, messages) {
  if (!process.env.GEMINI_API_KEY) throw apiError(401, "GEMINI_API_KEY not configured");
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const m = genAI.getGenerativeModel({ model, generationConfig: { temperature: 0.2, maxOutputTokens: 1024 } });
  const history = messages.slice(0, -1).map(msg => ({
    role:  msg.role === "assistant" ? "model" : "user",
    parts: toGeminiParts(msg.content),
  }));
  const chat   = m.startChat({ history });
  const last   = messages[messages.length - 1];
  const result = await chat.sendMessage(toGeminiParts(last.content));
  return { role: "assistant", content: result.response.text() };
}

// ═══════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════
function toGeminiParts(content) {
  if (typeof content === "string") return [{ text: content }];
  return content.map(p => {
    if (p.type === "text") return { text: p.text };
    if (p.type === "image_url") {
      const [meta, data] = p.image_url.url.split(",");
      return { inlineData: { data, mimeType: meta.match(/:(.*?);/)[1] } };
    }
    return { text: "" };
  });
}

function apiError(status, message) {
  return Object.assign(new Error(message), { status });
}

app.listen(PORT, () => console.log(`Server running → http://localhost:${PORT}`));
