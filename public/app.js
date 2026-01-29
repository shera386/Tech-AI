// public/app.js — Tech-AI Frontend (Sessions, Devices, Stream Screenshot Vision, Kamera, Voice)

const chatEl = document.getElementById("chat");
const inputEl = document.getElementById("message-input");
const sendBtn = document.getElementById("send-btn");
const modeSelect = document.getElementById("mode-select");
const webToggle = document.getElementById("web-search-toggle");
const answerCounterEl = document.getElementById("answer-counter");
const newTopicBtn = document.getElementById("new-topic-btn");
const markSolvedBtn = document.getElementById("mark-solved-btn");
const currentTopicLabel = document.getElementById("current-topic-label");
const sessionListEl = document.getElementById("session-list");
const deviceListEl = document.getElementById("device-list");
const addDeviceBtn = document.getElementById("add-device-btn");
const profileBtn = document.getElementById("profile-btn");
const profileMenu = document.getElementById("profile-menu");
const saveChatsToggle = document.getElementById("save-chats-toggle");
const saveDevicesToggle = document.getElementById("save-devices-toggle");
const clearAllChatsBtn = document.getElementById("clear-all-chats-btn");
const profileEmail = document.getElementById("profile-email");
const ttsToggle = document.getElementById("tts-toggle");
const autoVisionToggle = document.getElementById("auto-vision-toggle");

// Media buttons
const imageInput = document.getElementById("image-input");
const galleryBtn = document.getElementById("gallery-btn");
const camBackBtn = document.getElementById("cam-back-btn");
const camFrontBtn = document.getElementById("cam-front-btn");

// Stream elements
const streamBtn = document.getElementById("stream-toggle-btn");
const streamOverlay = document.getElementById("stream-overlay");
const streamVideo = document.getElementById("stream-video");
const streamCloseBtn = document.getElementById("stream-close-btn");
const overlayMicBtn = document.getElementById("overlay-mic-btn");
const overlayShotBtn = document.getElementById("overlay-shot-btn");
const overlayTtsBtn = document.getElementById("overlay-tts-btn");
const overlayText = document.getElementById("overlay-text");
const overlaySend = document.getElementById("overlay-send");

// Voice
const voiceBtn = document.getElementById("voice-btn");

let recognition = null;
let voiceSynth = window.speechSynthesis || null;
let currentVoice = null;

// Stream state
let isStreaming = false;
let screenStream = null;
let micEnabled = true;

// Pending image
let pendingImageDataUrl = null;

// ===================== Local Storage Keys =====================
const SETTINGS_KEY = "techAiSettings_v2";
const SESSIONS_KEY = "techAiSessions_v2";
const DEVICES_KEY = "techAiDevices_v2";

// ===================== Settings =====================
function loadSettings() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}"); }
  catch { return {}; }
}
function saveSettings(s) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

let settings = loadSettings();
if (settings.saveChats === undefined) settings.saveChats = true;
if (settings.saveDevices === undefined) settings.saveDevices = true;
if (settings.ttsEnabled === undefined) settings.ttsEnabled = false;
if (settings.autoVision === undefined) settings.autoVision = true;

saveChatsToggle.checked = settings.saveChats;
saveDevicesToggle.checked = settings.saveDevices;
ttsToggle.checked = settings.ttsEnabled;
autoVisionToggle.checked = settings.autoVision;

profileEmail.textContent = settings.email
  ? "Angemeldet als: " + settings.email
  : "(Demo: nicht eingeloggt – lokale Speicherung)";

// ===================== Sessions (echte Chats) =====================
function loadSessions() {
  if (!settings.saveChats) return [];
  try { return JSON.parse(localStorage.getItem(SESSIONS_KEY) || "[]"); }
  catch { return []; }
}
function saveSessions(sessions) {
  if (!settings.saveChats) return;
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
}

function createSession() {
  return {
    id: "session-" + Date.now(),
    title: "",
    createdAt: Date.now(),
    answerCount: 0,
    freeLimit: 25,
    messages: [] // {from:"user"|"ai", text, extra}
  };
}

let sessions = loadSessions();
if (!sessions.length && settings.saveChats) {
  const s = createSession();
  sessions.push(s);
  saveSessions(sessions);
}
let currentSessionId = sessions.length ? sessions[sessions.length - 1].id : ("session-" + Date.now());

// ===================== Devices =====================
function loadDevices() {
  if (!settings.saveDevices) return [];
  try { return JSON.parse(localStorage.getItem(DEVICES_KEY) || "[]"); }
  catch { return []; }
}
function saveDevices(devs) {
  if (!settings.saveDevices) return;
  localStorage.setItem(DEVICES_KEY, JSON.stringify(devs));
}

let devices = loadDevices();

// Icons + Device types (lange Liste + suchbar)
const DEVICE_TYPES = [
  { label: "Smartphone", ico:"📱" },
  { label: "Tablet", ico:"📲" },
  { label: "Notebook / Laptop", ico:"💻" },
  { label: "PC (Desktop)", ico:"🖥️" },
  { label: "Grafikkarte (GPU)", ico:"🎮" },
  { label: "Konsole", ico:"🕹️" },
  { label: "TV / Monitor", ico:"📺" },
  { label: "Drucker", ico:"🖨️" },
  { label: "Router / WLAN", ico:"📡" },
  { label: "Kopfhörer", ico:"🎧" },
  { label: "Bluetooth Gerät", ico:"🟦" },
  { label: "Smartwatch", ico:"⌚" },
  { label: "E-Scooter", ico:"🛴" },
  { label: "Waschmaschine", ico:"🧺" },
  { label: "Trockner", ico:"🌬️" },
  { label: "Kühlschrank", ico:"🧊" },
  { label: "Kamera", ico:"📷" },
  { label: "Mikrofon", ico:"🎤" },
  { label: "Auto / CarPlay", ico:"🚗" },
  { label: "Sonstiges", ico:"✨" }
];

function iconForType(type) {
  const found = DEVICE_TYPES.find(x => x.label.toLowerCase() === String(type).toLowerCase());
  return found ? found.ico : "🔧";
}

// ===================== UI Render Helpers =====================
function getCurrentSession() {
  sessions = loadSessions(); // refresh
  let s = sessions.find(x => x.id === currentSessionId);
  if (!s) {
    s = createSession();
    sessions.push(s);
    saveSessions(sessions);
    currentSessionId = s.id;
  }
  return s;
}

function updateAnswerCounter() {
  const s = getCurrentSession();
  answerCounterEl.textContent = `Antworten in diesem Thema: ${s.answerCount} / ${s.freeLimit}`;
}

function renderSessionsList() {
  const all = loadSessions();
  sessionListEl.innerHTML = "";

  if (!all.length) {
    sessionListEl.innerHTML = "<p style='font-size:12px; opacity:0.8;'>Noch keine Chats.</p>";
    return;
  }

  [...all].reverse().forEach((s) => {
    const div = document.createElement("div");
    div.className = "session-item" + (s.id === currentSessionId ? " active" : "");

    const title = s.title || "Unbenannter Chat";
    const sub = new Date(s.createdAt).toLocaleString();

    div.innerHTML = `<div><b>${escapeHtml(title)}</b><div class="sub">${escapeHtml(sub)}</div></div>`;

    const actions = document.createElement("div");
    actions.className = "session-actions";

    const rename = document.createElement("button");
    rename.className = "icon-btn";
    rename.textContent = "Umbenennen";
    rename.onclick = (e) => {
      e.stopPropagation();
      const nt = prompt("Neuer Chat-Name:", s.title || "");
      if (nt !== null) {
        const all2 = loadSessions();
        const idx = all2.findIndex(x => x.id === s.id);
        if (idx >= 0) {
          all2[idx].title = nt.trim();
          saveSessions(all2);
          renderSessionsList();
        }
      }
    };

    const del = document.createElement("button");
    del.className = "icon-btn";
    del.textContent = "Löschen";
    del.onclick = (e) => {
      e.stopPropagation();
      if (!confirm("Diesen Chat wirklich löschen?")) return;
      let all2 = loadSessions().filter(x => x.id !== s.id);
      saveSessions(all2);
      if (currentSessionId === s.id) {
        if (!all2.length) {
          const ns = createSession();
          all2 = [ns];
          saveSessions(all2);
        }
        currentSessionId = all2[all2.length - 1].id;
        renderChatFromSession();
      }
      renderSessionsList();
    };

    actions.appendChild(rename);
    actions.appendChild(del);
    div.appendChild(actions);

    div.onclick = () => {
      currentSessionId = s.id;
      renderChatFromSession();
      renderSessionsList();
    };

    sessionListEl.appendChild(div);
  });
}

function renderDevices() {
  deviceListEl.innerHTML = "";
  if (!devices.length) {
    deviceListEl.innerHTML = "<p style='font-size:12px; opacity:0.8;'>Noch keine Geräte hinterlegt.</p>";
    return;
  }

  devices.forEach((d, idx) => {
    const div = document.createElement("div");
    div.className = "device-item";
    div.innerHTML = `<span class="ico">${iconForType(d.type)}</span><div>${escapeHtml(d.type)}: ${escapeHtml(d.name)}</div>`;

    div.onclick = () => {
      const action = prompt(
        "Gerät bearbeiten:\n" +
        `${d.type}: ${d.name}\n\n` +
        "1 = bearbeiten, 2 = löschen, Abbrechen = nichts",
        "1"
      );
      if (action === "1") {
        // quick edit
        const newName = prompt("Neuer Name/Modell:", d.name);
        if (newName === null) return;
        devices[idx].name = newName.trim();
        saveDevices(devices);
        renderDevices();
      } else if (action === "2") {
        if (!confirm("Dieses Gerät löschen?")) return;
        devices.splice(idx, 1);
        saveDevices(devices);
        renderDevices();
      }
    };

    deviceListEl.appendChild(div);
  });
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function appendMessageUI(text, from, extra = {}) {
  const wrapper = document.createElement("div");

  const meta = document.createElement("div");
  meta.className = "msg-meta";
  meta.textContent =
    (from === "user" ? "Du" : "Tech-AI") +
    " · " +
    new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  wrapper.appendChild(meta);

  const msg = document.createElement("div");
  msg.className = "msg " + (from === "user" ? "msg-user" : "msg-ai");
  msg.textContent = text;
  wrapper.appendChild(msg);

  // App shortcuts (buttons)
  if (from === "ai" && extra.appShortcuts && extra.appShortcuts.length) {
    const appsDiv = document.createElement("div");
    appsDiv.className = "app-shortcuts";
    extra.appShortcuts.slice(0, 6).forEach((app) => {
      const btn = document.createElement("button");
      btn.className = "pill";
      btn.textContent = app.label;
      btn.onclick = () => window.open(app.url, "_blank");
      appsDiv.appendChild(btn);
    });
    wrapper.appendChild(appsDiv);
  }

  // Suggestions (klickbare Folgefragen)
  if (from === "ai" && extra.suggestions && extra.suggestions.length) {
    const sugDiv = document.createElement("div");
    sugDiv.className = "suggestions";
    extra.suggestions.slice(0, 3).forEach((q) => {
      const btn = document.createElement("button");
      btn.className = "pill";
      btn.textContent = q;
      btn.onclick = () => {
        inputEl.value = q;
        inputEl.focus();
      };
      sugDiv.appendChild(btn);
    });
    wrapper.appendChild(sugDiv);
  }

  chatEl.appendChild(wrapper);
  chatEl.scrollTop = chatEl.scrollHeight;

  // TTS: nur wenn aktiviert
  if (from === "ai" && settings.ttsEnabled) speakText(text);
}

function saveMessageToSession(from, text, extra = {}) {
  const all = loadSessions();
  const idx = all.findIndex(x => x.id === currentSessionId);
  if (idx < 0) return;

  all[idx].messages = all[idx].messages || [];
  all[idx].messages.push({ from, text, extra, at: Date.now() });

  // auto title
  if (!all[idx].title && from === "user" && text) {
    all[idx].title = text.slice(0, 60);
  }
  saveSessions(all);
}

function renderChatFromSession() {
  chatEl.innerHTML = "";
  const s = getCurrentSession();

  currentTopicLabel.textContent = "Thema: " + (s.title || "Unbenannt");
  (s.messages || []).forEach(m => appendMessageUI(m.text, m.from, m.extra || {}));
  updateAnswerCounter();
}

// ===================== Voice (SpeechRecognition + TTS) =====================
function initVoices() {
  if (!voiceSynth) return;
  const voices = voiceSynth.getVoices();
  if (!voices.length) return;
  currentVoice = voices.find(v => v.lang && v.lang.startsWith("de")) || voices[0];
}
if (voiceSynth) {
  voiceSynth.onvoiceschanged = initVoices;
  initVoices();
}

function speakText(text) {
  if (!voiceSynth || !currentVoice) return;
  try {
    voiceSynth.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.voice = currentVoice;
    utter.rate = 1.0;
    utter.pitch = 1.0;
    voiceSynth.speak(utter);
  } catch {}
}

function stopVoiceInput() {
  try { if (recognition) recognition.stop(); } catch {}
  recognition = null;
}

function startVoiceInputOnce() {
  if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
    appendMessageUI("Dein Browser unterstützt Sprachaufnahme nicht direkt. 😔", "ai");
    saveMessageToSession("ai", "Dein Browser unterstützt Sprachaufnahme nicht direkt. 😔");
    return;
  }
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  recognition.lang = "de-DE";
  recognition.interimResults = false;
  recognition.continuous = false;

  recognition.onresult = (event) => {
    const text = event.results[0][0].transcript;
    inputEl.value = text;
    sendMessage({ explicitText: text });
  };
  recognition.onerror = () => {};
  recognition.onend = () => { recognition = null; };

  recognition.start();
}

// Stream-mode Voice (simple, stable)
function startStreamVoiceLoop() {
  if (!isStreaming) return;
  if (!micEnabled) return;

  if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) return;

  // Start recognition in a loop
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const r = new SpeechRecognition();
  recognition = r;
  r.lang = "de-DE";
  r.interimResults = false;
  r.continuous = false;

  r.onresult = (event) => {
    const text = event.results[0][0].transcript;
    // In streaming mode: send as normal message
    sendMessage({ explicitText: text });
  };
  r.onerror = () => {};
  r.onend = () => {
    recognition = null;
    // restart loop if still streaming & mic on
    setTimeout(() => {
      if (isStreaming && micEnabled) startStreamVoiceLoop();
    }, 300);
  };

  try { r.start(); } catch {}
}

// ===================== Image helpers =====================
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });
}

// Capture screenshot from stream video
function captureStreamScreenshotDataUrl() {
  if (!streamVideo || !streamVideo.videoWidth) return null;
  const canvas = document.createElement("canvas");
  const w = streamVideo.videoWidth;
  const h = streamVideo.videoHeight;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(streamVideo, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", 0.8);
}

// Camera capture (front/back)
async function captureCameraPhoto(facingMode) {
  // facingMode: "user" (front) or "environment" (back)
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: facingMode } },
    audio: false
  });

  // create temp video
  const vid = document.createElement("video");
  vid.srcObject = stream;
  vid.muted = true;
  await vid.play();

  // wait a tick for frame
  await new Promise(r => setTimeout(r, 300));

  const canvas = document.createElement("canvas");
  canvas.width = vid.videoWidth || 1280;
  canvas.height = vid.videoHeight || 720;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.85);

  // cleanup
  stream.getTracks().forEach(t => t.stop());

  return dataUrl;
}

// ===================== API calls =====================
function getPlatformHint() {
  const ua = navigator.userAgent || "";
  if (/Windows/i.test(ua)) return "Windows";
  if (/Android/i.test(ua)) return "Android";
  if (/iPhone|iPad/i.test(ua)) return "iOS";
  if (/Mac/i.test(ua)) return "macOS";
  return "Unknown";
}

async function apiIntent(message) {
  const res = await fetch("/api/intent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message })
  });
  const data = await res.json().catch(() => ({}));
  return data.intent || "NORMAL";
}

async function apiChat(payload) {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || res.statusText);
  }
  return await res.json();
}

async function apiVision(payload) {
  const res = await fetch("/api/vision", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || res.statusText);
  }
  return await res.json();
}

// ===================== Send logic (with Intent + Auto screenshot) =====================
async function sendMessage({ markSolved = false, explicitText = null, forceVision = false } = {}) {
  const text = (explicitText ?? inputEl.value).trim();
  if (!text && !pendingImageDataUrl && !forceVision) return;

  const s = getCurrentSession();

  // show user text
  if (text) {
    appendMessageUI(text, "user");
    saveMessageToSession("user", text);
  }

  inputEl.value = "";
  sendBtn.disabled = true;

  const mode = modeSelect.value === "erfahren" ? "erfahren" : "unerfahren";
  const platform = getPlatformHint();
  const devs = devices || [];

  try {
    // Decide if we should use vision
    let useVision = false;
    let visionImage = pendingImageDataUrl;

    // If user selected gallery/camera image -> vision
    if (visionImage) useVision = true;

    // If streaming active and autoVision enabled -> detect intent
    if (!useVision && isStreaming && settings.autoVision && text) {
      const intent = await apiIntent(text);
      if (intent === "VISUAL_HELP") {
        const shot = captureStreamScreenshotDataUrl();
        if (shot) {
          useVision = true;
          visionImage = shot;
        }
      }
    }

    // ForceVision (overlay screenshot button)
    if (forceVision && isStreaming) {
      const shot = captureStreamScreenshotDataUrl();
      if (shot) {
        useVision = true;
        visionImage = shot;
      }
    }

    let data;

    if (useVision) {
      data = await apiVision({
        mode,
        message: text || "Bitte sag mir, wo ich klicken muss.",
        sessionId: currentSessionId,
        imageDataUrl: visionImage,
        devices: devs,
        platform
      });
      // clear pending
      pendingImageDataUrl = null;
    } else {
      data = await apiChat({
        mode,
        message: text,
        sessionId: currentSessionId,
        newTopic: false,
        markSolved,
        useWebSearch: webToggle.checked,
        topicTitle: s.title || "",
        devices: devs,
        platform
      });
    }

    // update session counts
    const all = loadSessions();
    const idx = all.findIndex(x => x.id === currentSessionId);
    if (idx >= 0) {
      all[idx].answerCount = data.answerCount ?? all[idx].answerCount;
      all[idx].freeLimit = data.freeLimit ?? all[idx].freeLimit;
      // keep title
      saveSessions(all);
    }

    updateAnswerCounter();

    const extra = {
      appShortcuts: data.appShortcuts || [],
      suggestions: data.suggestions || []
    };

    appendMessageUI(data.reply || "Keine Antwort erhalten.", "ai", extra);
    saveMessageToSession("ai", data.reply || "Keine Antwort erhalten.", extra);

    renderSessionsList();
    renderChatFromSession(); // keeps scroll + shows suggestions properly
  } catch (err) {
    const msg = "Fehler: " + (err.message || "Unbekannt");
    appendMessageUI(msg, "ai");
    saveMessageToSession("ai", msg);
  } finally {
    sendBtn.disabled = false;
    inputEl.focus();
  }
}

// ===================== Buttons / Events =====================
sendBtn.addEventListener("click", () => sendMessage());
inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

newTopicBtn.addEventListener("click", () => {
  // create brand-new session (echter Chat)
  const all = loadSessions();
  const ns = createSession();
  all.push(ns);
  saveSessions(all);
  currentSessionId = ns.id;

  currentTopicLabel.textContent = "Neues Thema gestartet. Beschreibe dein nächstes Problem.";
  renderSessionsList();
  renderChatFromSession();
});

markSolvedBtn.addEventListener("click", () => {
  sendMessage({ markSolved: true, explicitText: "Mein aktuelles Problem ist gelöst." });
});

// Profile menu
let profileOpen = false;
profileBtn.addEventListener("click", () => {
  profileOpen = !profileOpen;
  profileMenu.style.display = profileOpen ? "block" : "none";
});

saveChatsToggle.addEventListener("change", () => {
  settings.saveChats = saveChatsToggle.checked;
  saveSettings(settings);
  if (!settings.saveChats) {
    if (confirm("Chats speichern deaktiviert. Alle bisherigen Chats werden gelöscht. Fortfahren?")) {
      localStorage.removeItem(SESSIONS_KEY);
      sessions = [];
      const ns = createSession();
      sessions.push(ns);
      saveSessions(sessions);
      currentSessionId = ns.id;
      renderSessionsList();
      renderChatFromSession();
    } else {
      settings.saveChats = true;
      saveChatsToggle.checked = true;
      saveSettings(settings);
    }
  }
});

saveDevicesToggle.addEventListener("change", () => {
  settings.saveDevices = saveDevicesToggle.checked;
  saveSettings(settings);
  if (!settings.saveDevices) {
    if (confirm("Geräte speichern deaktiviert. Alle gespeicherten Geräte werden gelöscht. Fortfahren?")) {
      devices = [];
      localStorage.removeItem(DEVICES_KEY);
      renderDevices();
    } else {
      settings.saveDevices = true;
      saveDevicesToggle.checked = true;
      saveSettings(settings);
    }
  }
});

ttsToggle.addEventListener("change", () => {
  settings.ttsEnabled = ttsToggle.checked;
  saveSettings(settings);
  overlayTtsBtn.textContent = settings.ttsEnabled ? "🔊 Vorlesen an" : "🔊 Vorlesen aus";
});

autoVisionToggle.addEventListener("change", () => {
  settings.autoVision = autoVisionToggle.checked;
  saveSettings(settings);
});

clearAllChatsBtn.addEventListener("click", () => {
  if (!confirm("Wirklich alle gespeicherten Chats löschen?")) return;
  localStorage.removeItem(SESSIONS_KEY);
  const ns = createSession();
  saveSessions([ns]);
  currentSessionId = ns.id;
  renderSessionsList();
  renderChatFromSession();
});

// Gallery
galleryBtn.addEventListener("click", () => imageInput.click());
imageInput.addEventListener("change", async () => {
  if (imageInput.files && imageInput.files[0]) {
    const f = imageInput.files[0];
    pendingImageDataUrl = await fileToDataUrl(f);
    appendMessageUI(`Bild ausgewählt („${f.name}“). Schreib kurz dazu, was ich prüfen soll.`, "ai");
    saveMessageToSession("ai", `Bild ausgewählt („${f.name}“). Schreib kurz dazu, was ich prüfen soll.`);
  }
});

// Camera back/front
camBackBtn.addEventListener("click", async () => {
  try {
    pendingImageDataUrl = await captureCameraPhoto("environment");
    appendMessageUI("Foto (hinten) aufgenommen. Schreib kurz, was ich prüfen soll.", "ai");
    saveMessageToSession("ai", "Foto (hinten) aufgenommen. Schreib kurz, was ich prüfen soll.");
  } catch {
    appendMessageUI("Kamera (hinten) ging nicht. Erlaube Kamera-Zugriff im Browser.", "ai");
    saveMessageToSession("ai", "Kamera (hinten) ging nicht. Erlaube Kamera-Zugriff im Browser.");
  }
});

camFrontBtn.addEventListener("click", async () => {
  try {
    pendingImageDataUrl = await captureCameraPhoto("user");
    appendMessageUI("Foto (vorne) aufgenommen. Schreib kurz, was ich prüfen soll.", "ai");
    saveMessageToSession("ai", "Foto (vorne) aufgenommen. Schreib kurz, was ich prüfen soll.");
  } catch {
    appendMessageUI("Kamera (vorne) ging nicht. Erlaube Kamera-Zugriff im Browser.", "ai");
    saveMessageToSession("ai", "Kamera (vorne) ging nicht. Erlaube Kamera-Zugriff im Browser.");
  }
});

// Voice button (single)
voiceBtn.addEventListener("click", () => startVoiceInputOnce());

// ===================== Streaming =====================
async function startStreaming() {
  if (isStreaming) return;
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    screenStream = stream;
    streamVideo.srcObject = stream;
    streamOverlay.style.display = "flex";
    isStreaming = true;
    streamBtn.textContent = "Streaming stoppen";

    // Start stream voice loop (handsfree) if mic enabled
    micEnabled = true;
    overlayMicBtn.classList.add("on");
    overlayMicBtn.textContent = "🎙️ an";

    // Auto voice loop
    stopVoiceInput();
    startStreamVoiceLoop();

    appendMessageUI(
      "Streaming gestartet. Wenn du 'wo klicken?' schreibst, mache ich automatisch einen Screenshot und sage dir den nächsten Klick.",
      "ai"
    );
    saveMessageToSession("ai",
      "Streaming gestartet. Wenn du 'wo klicken?' schreibst, mache ich automatisch einen Screenshot und sage dir den nächsten Klick."
    );
  } catch (err) {
    appendMessageUI("Ich konnte den Bildschirm nicht freigeben. Bitte erlaube Zugriff im Browser.", "ai");
    saveMessageToSession("ai", "Ich konnte den Bildschirm nicht freigeben. Bitte erlaube Zugriff im Browser.");
  }
}

function stopStreaming() {
  if (screenStream) {
    screenStream.getTracks().forEach((t) => t.stop());
    screenStream = null;
  }
  streamOverlay.style.display = "none";
  isStreaming = false;
  streamBtn.textContent = "Streaming starten";
  stopVoiceInput();
  appendMessageUI("Streaming beendet.", "ai");
  saveMessageToSession("ai", "Streaming beendet.");
}

streamBtn.addEventListener("click", () => {
  if (!isStreaming) startStreaming();
  else stopStreaming();
});
streamCloseBtn.addEventListener("click", stopStreaming);

overlayMicBtn.addEventListener("click", () => {
  micEnabled = !micEnabled;
  if (!micEnabled) {
    overlayMicBtn.classList.remove("on");
    overlayMicBtn.textContent = "🎙️ aus";
    stopVoiceInput();
  } else {
    overlayMicBtn.classList.add("on");
    overlayMicBtn.textContent = "🎙️ an";
    stopVoiceInput();
    startStreamVoiceLoop();
  }
});

overlayShotBtn.addEventListener("click", () => {
  sendMessage({ explicitText: "Okay, wo muss ich jetzt drauf klicken?", forceVision: true });
});

overlayTtsBtn.addEventListener("click", () => {
  settings.ttsEnabled = !settings.ttsEnabled;
  ttsToggle.checked = settings.ttsEnabled;
  saveSettings(settings);
  overlayTtsBtn.textContent = settings.ttsEnabled ? "🔊 Vorlesen an" : "🔊 Vorlesen aus";
});

overlaySend.addEventListener("click", () => {
  const t = overlayText.value.trim();
  if (!t) return;
  overlayText.value = "";
  sendMessage({ explicitText: t });
});

// ===================== Devices Modal =====================
const deviceModal = document.getElementById("device-modal");
const deviceClose = document.getElementById("device-close");
const deviceSearch = document.getElementById("device-search");
const deviceTypeList = document.getElementById("device-type-list");
const deviceNameInput = document.getElementById("device-name");
const deviceSave = document.getElementById("device-save");

let selectedDeviceType = null;

function openDeviceModal() {
  selectedDeviceType = null;
  deviceNameInput.value = "";
  deviceSearch.value = "";
  renderDeviceTypeList("");
  deviceModal.style.display = "flex";
}
function closeDeviceModal() {
  deviceModal.style.display = "none";
}

function renderDeviceTypeList(q) {
  const query = (q || "").toLowerCase().trim();
  deviceTypeList.innerHTML = "";

  const filtered = DEVICE_TYPES.filter(x => x.label.toLowerCase().includes(query));
  filtered.forEach(item => {
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `<div class="ico">${item.ico}</div><div>${escapeHtml(item.label)}</div>`;
    row.onclick = () => {
      selectedDeviceType = item;
      // highlight selection
      [...deviceTypeList.querySelectorAll(".row")].forEach(r => r.style.outline = "none");
      row.style.outline = "2px solid rgba(34,197,94,0.75)";
      row.style.borderRadius = "12px";
      deviceNameInput.focus();
    };
    deviceTypeList.appendChild(row);
  });
}

addDeviceBtn.addEventListener("click", openDeviceModal);
deviceClose.addEventListener("click", closeDeviceModal);
deviceModal.addEventListener("click", (e) => {
  if (e.target === deviceModal) closeDeviceModal();
});
deviceSearch.addEventListener("input", () => renderDeviceTypeList(deviceSearch.value));

deviceSave.addEventListener("click", () => {
  if (!selectedDeviceType) {
    alert("Bitte zuerst eine Geräteart auswählen.");
    return;
  }
  const name = deviceNameInput.value.trim();
  if (!name) {
    alert("Bitte Modell/Name eintragen.");
    return;
  }
  devices.push({ type: selectedDeviceType.label, name });
  saveDevices(devices);
  renderDevices();
  closeDeviceModal();
});

// ===================== Init =====================
function syncOverlayTtsLabel() {
  overlayTtsBtn.textContent = settings.ttsEnabled ? "🔊 Vorlesen an" : "🔊 Vorlesen aus";
}
syncOverlayTtsLabel();

renderSessionsList();
renderDevices();
renderChatFromSession();
updateAnswerCounter();

