// ═══════════════════════════════════════════════════════════════
//  ChatGPT Clone — Frontend  (v4 — SQLite backend)
// ═══════════════════════════════════════════════════════════════

// ── Model catalogue ────────────────────────────────────────────
const PROVIDERS = [
  {
    id: "groq", name: "Groq", subtitle: "Free · Ultra-Fast",
    icon: '<i class="fa-solid fa-bolt text-warning"></i>',
    models: [
      { id: "llama-3.1-8b-instant",                      name: "Llama 3.1 8B Instant",  desc: "Meta · Fastest free model",                tags: ["fast","free"],           vision: false },
      { id: "llama-3.3-70b-versatile",                   name: "Llama 3.3 70B",         desc: "Meta · Most capable free model",           tags: ["smart","free"],          vision: false },
      { id: "meta-llama/llama-4-scout-17b-16e-instruct", name: "Llama 4 Scout 17B",     desc: "Meta · Vision + long context, free",       tags: ["vision","smart","free"], vision: true  },
      { id: "qwen/qwen3-32b",                            name: "Qwen 3 32B",            desc: "Alibaba · Reasoning & coding, free",       tags: ["reasoning","free"],      vision: false },
      { id: "openai/gpt-oss-120b",                       name: "GPT-OSS 120B",          desc: "OpenAI open-weight · Most powerful, free", tags: ["smart","long","free"],   vision: false },
    ],
  },
  {
    id: "gemini", name: "Google Gemini", subtitle: "Needs GEMINI_API_KEY",
    icon: '<i class="fa-brands fa-google text-primary"></i>',
    models: [
      { id: "gemini-2.5-flash-lite", name: "Gemini 2.5 Flash Lite", desc: "Google · Fastest, 15 RPM free",        tags: ["fast","vision","free"],         vision: true },
      { id: "gemini-2.5-flash",      name: "Gemini 2.5 Flash",      desc: "Google · Balanced, 10 RPM free",      tags: ["smart","vision","free"],        vision: true },
      { id: "gemini-2.5-pro",        name: "Gemini 2.5 Pro",        desc: "Google · Most capable, 5 RPM free",   tags: ["smart","vision","long","free"], vision: true },
    ],
  },
  {
    id: "deepseek", name: "DeepSeek", subtitle: "Needs DEEPSEEK_API_KEY",
    icon: '<i class="fa-solid fa-brain text-info"></i>',
    models: [
      { id: "deepseek-chat",     name: "DeepSeek V3", desc: "DeepSeek · Very capable, cheap", tags: ["smart","cheap"], vision: false },
      { id: "deepseek-reasoner", name: "DeepSeek R1", desc: "DeepSeek · Reasoning model",     tags: ["reasoning","cheap"], vision: false },
    ],
  },
  {
    id: "image-gen", name: "Image Generation", subtitle: "Free · Powered by Puter.js",
    icon: '<i class="fa-solid fa-image text-success"></i>',
    models: [
      { id: "gemini-2.5-flash-image-preview", name: "Gemini Image", desc: "Puter.js · Google Gemini image model, free", tags: ["image-gen","smart","free"], imageGen: true },
    ],
  },
];

const TAG_CLASS = { fast:"tag-fast", smart:"tag-smart", vision:"tag-vision", reasoning:"tag-reasoning", "image-gen":"tag-image-gen", free:"tag-free", long:"tag-long", cheap:"tag-cheap" };
const TAG_LABEL = { fast:"Fast", smart:"Smart", vision:"Vision", reasoning:"Reasoning", "image-gen":"Image Gen", free:"Free", long:"Long Ctx", cheap:"Cheap" };

const MODEL_KEY = "cgptclone_model";
const THEME_KEY = "cgptclone_theme";

// ═══════════════════════════════════════════════════════════════
//  SERVER API  (replaces localStorage)
// ═══════════════════════════════════════════════════════════════
const api = {
  async getConversations() {
    const r = await fetch("/api/conversations");
    return r.ok ? r.json() : [];
  },
  async createConversation(id, title) {
    await fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, title }),
    });
  },
  async deleteConversation(id) {
    await fetch(`/api/conversations/${id}`, { method: "DELETE" });
  },
  async getMessages(id) {
    const r = await fetch(`/api/conversations/${id}/messages`);
    return r.ok ? r.json() : [];
  },
  async addMessage(convId, role, content) {
    await fetch(`/api/conversations/${convId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, content }),
    });
  },
  async deleteLastMessages(convId, n) {
    await fetch(`/api/conversations/${convId}/messages/last/${n}`, { method: "DELETE" });
  },
};

// ── State ──────────────────────────────────────────────────────
let conversations   = [];   // [{id, title, updated_at}] — no messages
let currentMessages = [];   // messages for the open conversation
let currentId       = null;
let selectedModel   = localStorage.getItem(MODEL_KEY) || "groq:llama-3.1-8b-instant";
let isLoading       = false;
let pendingDelId    = null;
let providerConfig  = {};
let attachments     = [];
let mediaRecorder   = null;
let audioChunks     = [];
let isRecording     = false;

// ── DOM refs ───────────────────────────────────────────────────
const sidebar           = document.getElementById("sidebar");
const sidebarBackdrop   = document.getElementById("sidebarBackdrop");
const sidebarToggle     = document.getElementById("sidebarToggle");
const sidebarOpenBtn    = document.getElementById("sidebarOpenBtn");
const newChatBtn        = document.getElementById("newChatBtn");
const historyList       = document.getElementById("historyList");
const modelDropdownMenu = document.getElementById("modelDropdownMenu");
const modelSelectName   = document.getElementById("modelSelectName");
const modelSelectIcon   = document.getElementById("modelSelectIcon");
const footerModelLabel  = document.getElementById("footerModelLabel");
const welcomeScreen     = document.getElementById("welcomeScreen");
const welcomeModelName  = document.getElementById("welcomeModelName");
const capabilityBadges  = document.getElementById("capabilityBadges");
const messagesList      = document.getElementById("messagesList");
const messagesContainer = document.getElementById("messagesContainer");
const topbarTitle       = document.getElementById("topbarTitle");
const clearChatBtn      = document.getElementById("clearChatBtn");
const themeToggle       = document.getElementById("themeToggle");
const themeIcon         = document.getElementById("themeIcon");
const fineTuningBtn     = document.getElementById("fineTuningBtn");
const userInput         = document.getElementById("userInput");
const sendBtn           = document.getElementById("sendBtn");
const micBtn            = document.getElementById("micBtn");
const micIcon           = document.getElementById("micIcon");
const attachImageBtn    = document.getElementById("attachImageBtn");
const imageFileInput    = document.getElementById("imageFileInput");
const attachFileBtn     = document.getElementById("attachFileBtn");
const textFileInput     = document.getElementById("textFileInput");
const attachmentBar     = document.getElementById("attachmentBar");
const attachmentBarItems= document.getElementById("attachmentBarItems");
const clearAttachBtn    = document.getElementById("clearAttachBtn");
const imageGenNotice    = document.getElementById("imageGenNotice");
const confirmDeleteBtn  = document.getElementById("confirmDeleteBtn");

const deleteModal      = bootstrap.Modal.getOrCreateInstance(document.getElementById("deleteModal"));
const fineTuningModal  = bootstrap.Modal.getOrCreateInstance(document.getElementById("fineTuningModal"));

// ═══════════════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════════════
async function init() {
  applyTheme(localStorage.getItem(THEME_KEY) || "dark");
  providerConfig = await fetch("/api/config").then(r => r.json()).catch(() => ({}));
  buildModelDropdown();
  setModel(selectedModel, false);
  conversations = await api.getConversations();
  renderSidebar();
  showWelcome();
  userInput.focus();
}

// ═══════════════════════════════════════════════════════════════
//  THEME
// ═══════════════════════════════════════════════════════════════
function applyTheme(theme) {
  document.documentElement.setAttribute("data-bs-theme", theme);
  themeIcon.className = theme === "dark" ? "fa-solid fa-moon" : "fa-solid fa-sun";
  localStorage.setItem(THEME_KEY, theme);
}
themeToggle.addEventListener("click", () => {
  applyTheme(document.documentElement.getAttribute("data-bs-theme") === "dark" ? "light" : "dark");
});

// ═══════════════════════════════════════════════════════════════
//  MODEL DROPDOWN
// ═══════════════════════════════════════════════════════════════
function buildModelDropdown() {
  modelDropdownMenu.innerHTML = "";
  PROVIDERS.forEach(prov => {
    const active = prov.id === "image-gen" || !!providerConfig[prov.id];
    const header = document.createElement("li");
    header.innerHTML = `<div class="model-provider-header">${prov.icon}<span>${prov.name}</span>
      <span class="provider-status ${active ? "provider-active" : "provider-inactive"}">${active ? "Configured" : "No API Key"}</span></div>`;
    modelDropdownMenu.appendChild(header);

    prov.models.forEach(m => {
      const fullId  = `${prov.id}:${m.id}`;
      const tagsHtml = m.tags.map(t => `<span class="model-tag ${TAG_CLASS[t]||""}">${TAG_LABEL[t]||t}</span>`).join("");
      const li = document.createElement("li");
      li.innerHTML = `<button class="model-item ${!active?"disabled-provider":""} ${selectedModel===fullId?"active":""}"
          data-model="${fullId}" ${!active?"disabled":""}>
        <span class="model-item-name">${m.name}</span>
        <span class="model-item-desc">${m.desc}</span>
        <span class="model-item-tags">${tagsHtml}</span></button>`;
      li.querySelector(".model-item").addEventListener("click", () => {
        if (!active) return;
        setModel(fullId);
        bootstrap.Dropdown.getOrCreateInstance(document.getElementById("modelDropdownBtn")).hide();
      });
      modelDropdownMenu.appendChild(li);
    });

    const divider = document.createElement("li");
    divider.innerHTML = `<hr class="dropdown-divider" style="border-color:var(--divider);margin:4px 6px;">`;
    modelDropdownMenu.appendChild(divider);
  });
}

function getModelInfo(fullId) {
  const [pid, ...rest] = fullId.split(":");
  const mid  = rest.join(":");
  const prov = PROVIDERS.find(p => p.id === pid);
  if (!prov) return null;
  const model = prov.models.find(m => m.id === mid);
  return model ? { ...model, provider: prov, fullId } : null;
}

function setModel(fullId, save = true) {
  selectedModel = fullId;
  if (save) localStorage.setItem(MODEL_KEY, fullId);
  const info = getModelInfo(fullId);
  if (!info) return;
  modelSelectIcon.innerHTML = info.provider.icon;
  modelSelectName.textContent = info.name;
  footerModelLabel.textContent = `${info.provider.name} · ${info.name}`;
  document.querySelectorAll(".model-item").forEach(el => el.classList.toggle("active", el.dataset.model === fullId));
  imageGenNotice.classList.toggle("d-none", !info.imageGen);
  userInput.placeholder = info.imageGen ? "Describe the image you want to generate…" : "Message…";
  attachImageBtn.style.opacity = (info.vision || info.imageGen) ? "1" : "0.35";
  updateWelcome(info);
}

function updateWelcome(info) {
  if (!welcomeModelName) return;
  welcomeModelName.textContent = `${info.provider.name} — ${info.name}`;
  capabilityBadges.innerHTML = info.tags.map(t =>
    `<span class="badge rounded-pill model-tag ${TAG_CLASS[t]||""}">${TAG_LABEL[t]||t}</span>`
  ).join("");
}

// ═══════════════════════════════════════════════════════════════
//  SIDEBAR
// ═══════════════════════════════════════════════════════════════
function renderSidebar() {
  historyList.innerHTML = "";
  if (!conversations.length) {
    historyList.innerHTML = `<p class="small text-muted px-2">No conversations yet.</p>`;
    return;
  }
  conversations.forEach(conv => {
    const div = document.createElement("div");
    div.className = "history-item" + (conv.id === currentId ? " active" : "");
    const label = document.createElement("span");
    label.className = "history-item-label";
    label.textContent = conv.title;
    const del = document.createElement("button");
    del.className = "history-item-del";
    del.innerHTML = '<i class="fa-solid fa-trash-can"></i>';
    del.addEventListener("click", e => { e.stopPropagation(); openDeleteModal(conv.id); });
    div.appendChild(label);
    div.appendChild(del);
    div.addEventListener("click", () => loadConversation(conv.id));
    historyList.appendChild(div);
  });
}

sidebarToggle.addEventListener("click", closeSidebar);
sidebarOpenBtn.addEventListener("click", openSidebar);
sidebarBackdrop.addEventListener("click", closeSidebar);

function openSidebar() {
  if (window.innerWidth < 768) { sidebar.classList.add("mobile-open"); sidebarBackdrop.classList.add("show"); }
  else sidebar.classList.remove("collapsed");
}
function closeSidebar() {
  sidebar.classList.remove("mobile-open");
  sidebarBackdrop.classList.remove("show");
  if (window.innerWidth >= 768) sidebar.classList.add("collapsed");
}

// ═══════════════════════════════════════════════════════════════
//  MESSAGES — render
// ═══════════════════════════════════════════════════════════════
function showWelcome() {
  messagesList.innerHTML = "";
  welcomeScreen.classList.remove("hidden");
  topbarTitle.textContent = "ChatGPT Clone";
  const info = getModelInfo(selectedModel);
  if (info) updateWelcome(info);
}

function renderMessages(messages) {
  welcomeScreen.classList.add("hidden");
  messagesList.innerHTML = "";
  messages.forEach((m, i) => appendMessage(m.role, m.content, false, i));
  markLastMessages();
  scrollBottom();
}

async function loadConversation(id) {
  currentId = id;
  currentMessages = await api.getMessages(id);
  const conv = conversations.find(c => c.id === id);
  topbarTitle.textContent = conv?.title || "Chat";
  renderMessages(currentMessages);
  renderSidebar();
  if (window.innerWidth < 768) closeSidebar();
}

function appendMessage(role, content, animate = true, msgIdx = -1) {
  welcomeScreen.classList.add("hidden");

  const wrap = document.createElement("div");
  wrap.className = `message ${role}`;
  if (msgIdx >= 0) wrap.dataset.msgIdx = msgIdx;

  const avatar = document.createElement("div");
  avatar.className = "msg-avatar";
  avatar.innerHTML = role === "user"
    ? '<i class="fa-solid fa-user"></i>'
    : role === "error"
      ? '<i class="fa-solid fa-triangle-exclamation"></i>'
      : '<i class="fa-solid fa-robot"></i>';

  const body = document.createElement("div");
  body.className = "msg-body";

  const roleLabel = document.createElement("div");
  roleLabel.className = "msg-role";
  roleLabel.textContent = role === "user" ? "You" : role === "error" ? "Error" : "Assistant";

  const textDiv = document.createElement("div");
  textDiv.className = "msg-text";

  if (typeof content === "string") {
    textDiv.innerHTML = formatText(content);
  } else if (Array.isArray(content)) {
    content.forEach(part => {
      if (part.type === "text") {
        const d = document.createElement("div");
        d.innerHTML = formatText(part.text);
        textDiv.appendChild(d);
      } else if (part.type === "image_url") {
        const img = document.createElement("img");
        img.src = part.image_url.url;
        img.className = "msg-attached-image";
        img.alt = "Attached image";
        textDiv.appendChild(img);
      }
    });
  }

  body.appendChild(roleLabel);
  body.appendChild(textDiv);

  const actions = buildActionButtons(role);
  if (actions) body.appendChild(actions);

  wrap.appendChild(avatar);
  wrap.appendChild(body);
  messagesList.appendChild(wrap);
  if (animate) scrollBottom();
  return wrap;
}

function buildActionButtons(role) {
  if (role === "error") return null;
  const div = document.createElement("div");
  div.className = "msg-actions";
  if (role === "user") {
    div.innerHTML = `
      <button class="btn-msg-action" data-action="edit" title="Edit this message">
        <i class="fa-solid fa-pen fa-xs"></i> Edit
      </button>
      <button class="btn-msg-action" data-action="delete" title="Delete this message">
        <i class="fa-solid fa-trash-can fa-xs"></i> Delete
      </button>`;
  } else {
    div.innerHTML = `
      <button class="btn-msg-action" data-action="copy" title="Copy response">
        <i class="fa-solid fa-copy fa-xs"></i> Copy
      </button>
      <button class="btn-msg-action" data-action="regenerate" title="Regenerate response">
        <i class="fa-solid fa-rotate-right fa-xs"></i> Re-generate
      </button>`;
  }
  return div;
}

function markLastMessages() {
  document.querySelectorAll(".message.last-user-msg, .message.last-ai-msg").forEach(el => {
    el.classList.remove("last-user-msg", "last-ai-msg");
  });
  const userMsgs = messagesList.querySelectorAll(".message.user");
  const aiMsgs   = messagesList.querySelectorAll(".message.assistant");
  if (userMsgs.length) userMsgs[userMsgs.length - 1].classList.add("last-user-msg");
  if (aiMsgs.length)   aiMsgs[aiMsgs.length - 1].classList.add("last-ai-msg");
}

// ── Message action delegation ─────────────────────────────────
messagesList.addEventListener("click", async e => {
  const btn = e.target.closest("[data-action]");
  if (!btn || isLoading || !currentId) return;
  const action = btn.dataset.action;
  const msgEl  = btn.closest(".message");

  switch (action) {
    case "edit":        await editLastUserMessage();              break;
    case "delete":      await deleteLastUserMessage();           break;
    case "copy":        copyMessage(msgEl, btn);                 break;
    case "regenerate":  await regenerateLastResponse();          break;
    case "regen-image": await regenImage(msgEl, btn.dataset.prompt); break;
    case "copy-image":  await copyImageToClipboard(msgEl, btn); break;
  }
});

// ── Copy text ─────────────────────────────────────────────────
function copyMessage(msgEl, btn) {
  const text = msgEl.querySelector(".msg-text")?.innerText || "";
  navigator.clipboard.writeText(text).then(() => {
    const orig = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-check fa-xs"></i> Copied';
    btn.classList.add("success");
    setTimeout(() => { btn.innerHTML = orig; btn.classList.remove("success"); }, 2000);
  });
}

// ── Edit last user message ────────────────────────────────────
async function editLastUserMessage() {
  let idx = -1;
  for (let i = currentMessages.length - 1; i >= 0; i--) {
    if (currentMessages[i].role === "user") { idx = i; break; }
  }
  if (idx < 0) return;

  const content = currentMessages[idx].content;
  const text = typeof content === "string"
    ? content
    : content.filter(p => p.type === "text").map(p => p.text).join("\n");

  const deleteCount = currentMessages.length - idx;
  await api.deleteLastMessages(currentId, deleteCount);
  currentMessages.splice(idx);
  renderMessages(currentMessages);
  userInput.value = text;
  autoResize();
  sendBtn.disabled = false;
  userInput.focus();
}

// ── Delete last user message (+ its reply) ────────────────────
async function deleteLastUserMessage() {
  let idx = -1;
  for (let i = currentMessages.length - 1; i >= 0; i--) {
    if (currentMessages[i].role === "user") { idx = i; break; }
  }
  if (idx < 0) return;

  const deleteCount = currentMessages.length - idx;
  await api.deleteLastMessages(currentId, deleteCount);
  currentMessages.splice(idx);

  if (!currentMessages.length) showWelcome();
  else renderMessages(currentMessages);
  renderSidebar();
}

// ── Regenerate last AI response ───────────────────────────────
async function regenerateLastResponse() {
  if (isLoading) return;
  if (currentMessages[currentMessages.length - 1]?.role === "assistant") {
    await api.deleteLastMessages(currentId, 1);
    currentMessages.pop();
  }
  renderMessages(currentMessages);
  await streamResponse();
}

// ── Regen image ───────────────────────────────────────────────
async function regenImage(msgEl, prompt) {
  if (isLoading || !prompt) return;
  if (currentMessages[currentMessages.length - 1]?.role === "assistant") {
    await api.deleteLastMessages(currentId, 1);
    currentMessages.pop();
  }
  msgEl.remove();
  markLastMessages();
  await _doGenerateImage(prompt);
}

// ── Copy image ────────────────────────────────────────────────
async function copyImageToClipboard(msgEl, btn) {
  const img = msgEl.querySelector(".msg-gen-image");
  if (!img) return;
  try {
    const res  = await fetch(img.src);
    const blob = await res.blob();
    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
    const orig = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-check fa-xs"></i> Copied!';
    btn.classList.add("success");
    setTimeout(() => { btn.innerHTML = orig; btn.classList.remove("success"); }, 2000);
  } catch {
    window.open(img.src, "_blank");
  }
}

// ─────────────────────────────────────────────────────────────
function appendTypingIndicator() {
  const wrap = document.createElement("div");
  wrap.className = "message assistant";
  wrap.id = "typingIndicator";
  wrap.innerHTML = `
    <div class="msg-avatar"><i class="fa-solid fa-robot"></i></div>
    <div class="msg-body">
      <div class="msg-role">Assistant</div>
      <div class="typing-dots"><span></span><span></span><span></span></div>
    </div>`;
  messagesList.appendChild(wrap);
  scrollBottom();
}
function removeTypingIndicator() { document.getElementById("typingIndicator")?.remove(); }
function scrollBottom() { messagesContainer.scrollTop = messagesContainer.scrollHeight; }

function formatText(raw) {
  let t = raw.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  t = t.replace(/```[\w]*\n?([\s\S]*?)```/g, (_, c) => `<pre><code>${c.trim()}</code></pre>`);
  t = t.replace(/`([^`\n]+)`/g, "<code>$1</code>");
  t = t.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  t = t.replace(/\*(.+?)\*/g, "<em>$1</em>");
  t = t.replace(/\n/g, "<br>");
  return t;
}

// ═══════════════════════════════════════════════════════════════
//  STREAMING
// ═══════════════════════════════════════════════════════════════
function createStreamingBubble() {
  welcomeScreen.classList.add("hidden");
  const wrap = document.createElement("div");
  wrap.className = "message assistant";

  const avatar = document.createElement("div");
  avatar.className = "msg-avatar";
  avatar.innerHTML = '<i class="fa-solid fa-robot"></i>';

  const body = document.createElement("div");
  body.className = "msg-body";

  const roleLabel = document.createElement("div");
  roleLabel.className = "msg-role";
  roleLabel.textContent = "Assistant";

  const textEl = document.createElement("div");
  textEl.className = "msg-text streaming";

  body.appendChild(roleLabel);
  body.appendChild(textEl);
  wrap.appendChild(avatar);
  wrap.appendChild(body);
  messagesList.appendChild(wrap);
  scrollBottom();
  return { wrap, textEl };
}

async function streamResponse() {
  isLoading = true;
  sendBtn.disabled = true;
  appendTypingIndicator();

  let fullContent = "";
  let streamEl    = null;
  let wrapEl      = null;
  let firstChunk  = true;

  try {
    const resp = await fetch("/api/chat/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: selectedModel, messages: currentMessages.slice(-10) }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${resp.status}`);
    }

    const reader  = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop();

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const raw = line.slice(6).trim();
        if (raw === "[DONE]") continue;
        try {
          const json = JSON.parse(raw);
          if (json.error) throw new Error(json.error);
          if (json.content) {
            if (firstChunk) {
              removeTypingIndicator();
              const result = createStreamingBubble();
              streamEl = result.textEl;
              wrapEl   = result.wrap;
              firstChunk = false;
            }
            fullContent += json.content;
            streamEl.textContent = fullContent;
            scrollBottom();
          }
        } catch (err) {
          if (err.message.includes("JSON")) continue;
          throw err;
        }
      }
    }

    if (streamEl && fullContent) {
      streamEl.classList.remove("streaming");
      streamEl.innerHTML = formatText(fullContent);
      const actions = buildActionButtons("assistant");
      if (actions) wrapEl.querySelector(".msg-body").appendChild(actions);
    }

    const msgIdx = currentMessages.length;
    currentMessages.push({ role: "assistant", content: fullContent });
    if (wrapEl) wrapEl.dataset.msgIdx = msgIdx;
    await api.addMessage(currentId, "assistant", fullContent);
    markLastMessages();

  } catch (err) {
    removeTypingIndicator();
    if (firstChunk) appendMessage("error", err.message);
    else if (streamEl) {
      streamEl.classList.remove("streaming");
      streamEl.innerHTML += `<span style="color:#f87171"> [Error: ${err.message}]</span>`;
    }
  } finally {
    isLoading = false;
    sendBtn.disabled = userInput.value.trim().length === 0 && attachments.length === 0;
  }
}

// ═══════════════════════════════════════════════════════════════
//  SEND MESSAGE
// ═══════════════════════════════════════════════════════════════
async function sendMessage() {
  const text = userInput.value.trim();
  const info = getModelInfo(selectedModel);
  if ((!text && !attachments.length) || isLoading) return;

  if (info?.imageGen) {
    if (!text) return;
    await generateImage(text);
    return;
  }

  if (!currentId) {
    const id    = genId();
    const title = text.slice(0, 44) || "New Chat";
    await api.createConversation(id, title);
    conversations.unshift({ id, title });
    currentId = id;
    topbarTitle.textContent = title;
    renderSidebar();
  }

  // Build content
  let msgContent;
  if (!attachments.length) {
    msgContent = text;
  } else {
    const parts = [];
    attachments.filter(a => a.type === "file").forEach(a =>
      parts.push({ type: "text", text: `[File: ${a.name}]\n\`\`\`\n${a.content}\n\`\`\`` })
    );
    if (text) parts.push({ type: "text", text });
    attachments.filter(a => a.type === "image").forEach(a =>
      parts.push({ type: "image_url", image_url: { url: a.content } })
    );
    msgContent = parts;
  }

  const msgIdx = currentMessages.length;
  currentMessages.push({ role: "user", content: msgContent });
  await api.addMessage(currentId, "user", msgContent);

  clearAttachments();
  userInput.value = "";
  autoResize();
  sendBtn.disabled = true;

  appendMessage("user", msgContent, true, msgIdx);
  markLastMessages();
  renderSidebar();

  await streamResponse();
}

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

// ═══════════════════════════════════════════════════════════════
//  IMAGE GENERATION  (Puter.js — free, no API key)
// ═══════════════════════════════════════════════════════════════
async function generateImage(prompt) {
  if (!currentId) {
    const id    = genId();
    const title = `🖼 ${prompt.slice(0, 38)}`;
    await api.createConversation(id, title);
    conversations.unshift({ id, title });
    currentId = id;
    topbarTitle.textContent = title;
    renderSidebar();
  }

  const msgIdx = currentMessages.length;
  currentMessages.push({ role: "user", content: prompt });
  await api.addMessage(currentId, "user", prompt);

  appendMessage("user", prompt, true, msgIdx);
  markLastMessages();
  userInput.value = "";
  autoResize();
  sendBtn.disabled = true;

  await _doGenerateImage(prompt);
}

async function _doGenerateImage(prompt) {
  isLoading = true;
  appendTypingIndicator();

  try {
    const [, modelId] = selectedModel.split(":");
    const imgEl = await puter.ai.txt2img(prompt, { model: modelId });
    imgEl.className = "msg-gen-image";
    imgEl.alt       = prompt;
    imgEl.title     = "Click to open full size";
    imgEl.onclick   = () => window.open(imgEl.src, "_blank");
    imgEl.onload    = scrollBottom;

    const aiIdx = currentMessages.length;
    currentMessages.push({ role: "assistant", content: `Generated: ${prompt}` });
    await api.addMessage(currentId, "assistant", `Generated: ${prompt}`);
    removeTypingIndicator();
    welcomeScreen.classList.add("hidden");

    const wrap = document.createElement("div");
    wrap.className = "message assistant";
    wrap.dataset.msgIdx     = aiIdx;
    wrap.dataset.imagePrompt = prompt;

    const avatar = document.createElement("div");
    avatar.className = "msg-avatar";
    avatar.innerHTML = '<i class="fa-solid fa-robot"></i>';

    const body = document.createElement("div");
    body.className = "msg-body";
    body.innerHTML = `<div class="msg-role">Assistant</div>
      <div class="msg-text">Here is your generated image:</div>`;

    body.appendChild(imgEl);

    const attr = document.createElement("div");
    attr.className = "small mt-2";
    attr.style.color = "var(--text-muted-c)";
    attr.innerHTML = `<i class="fa-solid fa-wand-magic-sparkles me-1"></i>
      Powered by <a href="https://puter.com" target="_blank" class="text-muted">Puter.js</a>
      &nbsp;·&nbsp; <code style="font-size:.72rem">${modelId}</code>`;
    body.appendChild(attr);

    const actions = document.createElement("div");
    actions.className = "msg-actions";
    actions.innerHTML = `
      <button class="btn-msg-action" data-action="regen-image"
          data-prompt="${prompt.replace(/"/g,'&quot;')}" title="Generate a new image">
        <i class="fa-solid fa-rotate-right fa-xs"></i> Regenerate image
      </button>
      <button class="btn-msg-action" data-action="copy-image" title="Copy image to clipboard">
        <i class="fa-solid fa-copy fa-xs"></i> Copy image
      </button>`;
    body.appendChild(actions);

    wrap.appendChild(avatar);
    wrap.appendChild(body);
    messagesList.appendChild(wrap);
    scrollBottom();
    markLastMessages();
  } catch (err) {
    removeTypingIndicator();
    appendMessage("error", `Image generation failed: ${err.message}`);
  } finally {
    isLoading = false;
    sendBtn.disabled = userInput.value.trim().length === 0;
  }
}

// ═══════════════════════════════════════════════════════════════
//  ATTACHMENTS
// ═══════════════════════════════════════════════════════════════
attachImageBtn.addEventListener("click", () => {
  const info = getModelInfo(selectedModel);
  if (!info?.vision && !info?.imageGen) {
    alert("This model doesn't support vision. Switch to a Vision model (e.g. Llama 4 Scout or Gemini).");
    return;
  }
  imageFileInput.click();
});
imageFileInput.addEventListener("change", e => { [...e.target.files].forEach(handleImageFile); e.target.value = ""; });
attachFileBtn.addEventListener("click", () => textFileInput.click());
textFileInput.addEventListener("change", e => { [...e.target.files].forEach(handleTextFile); e.target.value = ""; });

function handleImageFile(file) {
  const r = new FileReader();
  r.onload = e => { attachments.push({ type:"image", name:file.name, content:e.target.result }); renderAttachmentBar(); };
  r.readAsDataURL(file);
}
function handleTextFile(file) {
  if (file.size > 100_000) { alert("File too large (max 100 KB)"); return; }
  const r = new FileReader();
  r.onload = e => { attachments.push({ type:"file", name:file.name, content:e.target.result }); renderAttachmentBar(); };
  r.readAsText(file);
}
function renderAttachmentBar() {
  if (!attachments.length) { attachmentBar.classList.add("d-none"); return; }
  attachmentBar.classList.remove("d-none");
  attachmentBarItems.innerHTML = "";
  attachments.forEach((a, i) => {
    const chip = document.createElement("div");
    chip.className = "attach-chip";
    chip.innerHTML = a.type === "image"
      ? `<img src="${a.content}" alt="${a.name}" />${a.name}`
      : `<i class="fa-solid fa-file-lines small"></i>${a.name}`;
    const del = document.createElement("button");
    del.className = "attach-chip-del";
    del.innerHTML = '<i class="fa-solid fa-xmark"></i>';
    del.addEventListener("click", () => { attachments.splice(i,1); renderAttachmentBar(); });
    chip.appendChild(del);
    attachmentBarItems.appendChild(chip);
  });
}
function clearAttachments() { attachments = []; renderAttachmentBar(); }
clearAttachBtn.addEventListener("click", clearAttachments);

// ═══════════════════════════════════════════════════════════════
//  VOICE INPUT  (MediaRecorder → HF / Groq Whisper)
// ═══════════════════════════════════════════════════════════════
micBtn.addEventListener("click", () => {
  isRecording ? stopRecording() : startRecording();
});

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];
    mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunks.push(e.data); };
    mediaRecorder.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      await transcribeAudio();
    };
    mediaRecorder.start();
    isRecording = true;
    micBtn.classList.add("recording");
    micIcon.className = "fa-solid fa-stop";
    micBtn.title = "Click to stop recording";
  } catch {
    alert("Microphone access denied. Please allow microphone access in your browser.");
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== "inactive") mediaRecorder.stop();
  isRecording = false;
  micBtn.classList.remove("recording");
  micIcon.className = "fa-solid fa-microphone-lines";
  micBtn.title = "Processing…";
}

async function transcribeAudio() {
  try {
    const blob   = new Blob(audioChunks, { type: "audio/webm" });
    const base64 = await blobToBase64(blob);
    const resp   = await fetch("/api/transcribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audio: base64 }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || "Transcription failed");
    if (data.text) {
      userInput.value = (userInput.value + " " + data.text).trim();
      autoResize();
      sendBtn.disabled = false;
    }
  } catch (err) {
    alert(`Voice transcription failed: ${err.message}`);
  } finally {
    micIcon.className = "fa-solid fa-microphone";
    micBtn.title = "Voice input";
  }
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload  = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

// ═══════════════════════════════════════════════════════════════
//  CHAT CONTROLS
// ═══════════════════════════════════════════════════════════════
newChatBtn.addEventListener("click", () => {
  currentId       = null;
  currentMessages = [];
  showWelcome();
  renderSidebar();
  clearAttachments();
  userInput.focus();
  if (window.innerWidth < 768) closeSidebar();
});

clearChatBtn.addEventListener("click", async () => {
  if (!currentId) return;
  await fetch(`/api/conversations/${currentId}/messages/last/${currentMessages.length}`, { method: "DELETE" });
  currentMessages = [];
  showWelcome();
});

document.querySelectorAll(".starter-card").forEach(btn =>
  btn.addEventListener("click", () => {
    userInput.value = btn.dataset.prompt;
    autoResize();
    sendBtn.disabled = false;
    userInput.focus();
  })
);

fineTuningBtn.addEventListener("click", () => fineTuningModal.show());

// ═══════════════════════════════════════════════════════════════
//  DELETE MODAL
// ═══════════════════════════════════════════════════════════════
function openDeleteModal(id) { pendingDelId = id; deleteModal.show(); }

confirmDeleteBtn.addEventListener("click", async () => {
  if (!pendingDelId) return;
  await api.deleteConversation(pendingDelId);
  conversations = conversations.filter(c => c.id !== pendingDelId);
  if (currentId === pendingDelId) {
    currentId = null;
    currentMessages = [];
    showWelcome();
  }
  renderSidebar();
  pendingDelId = null;
  deleteModal.hide();
});

// ═══════════════════════════════════════════════════════════════
//  INPUT
// ═══════════════════════════════════════════════════════════════
function autoResize() {
  userInput.style.height = "auto";
  userInput.style.height = Math.min(userInput.scrollHeight, 200) + "px";
}
userInput.addEventListener("input", () => {
  autoResize();
  sendBtn.disabled = userInput.value.trim().length === 0 && attachments.length === 0;
});
userInput.addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (!sendBtn.disabled) sendMessage(); }
});
sendBtn.addEventListener("click", sendMessage);
document.getElementById("modelDropdownMenu").addEventListener("click", e => e.stopPropagation());

// ── Boot ──────────────────────────────────────────────────────
init();
