/* ===================== BASIS ===================== */
const chatEl = document.getElementById("chat");
const inputEl = document.getElementById("message-input");
const sendBtn = document.getElementById("send-btn");
const imageInput = document.getElementById("image-input");

const galleryBtn = document.getElementById("gallery-btn");
const camBackBtn = document.getElementById("cam-back-btn");
const camFrontBtn = document.getElementById("cam-front-btn");
const voiceBtn = document.getElementById("voice-btn");

const answerCounter = document.getElementById("answer-counter");
const modeSelect = document.getElementById("mode-select");

const ttsToggle = document.getElementById("tts-toggle");
let ttsEnabled = false;
let speaking = false;

/* ===================== SESSION ===================== */
let sessionId = localStorage.getItem("techai_session") || crypto.randomUUID();
localStorage.setItem("techai_session", sessionId);

let answerCount = 0;
let lastImageContext = null; // === NEU: Bild-Kontext bleibt erhalten

/* ===================== UI HELPERS ===================== */
function addMessage(text, type = "ai", options = {}) {
  const msg = document.createElement("div");
  msg.className = `msg msg-${type}`;

  if (options.meta) {
    const meta = document.createElement("div");
    meta.className = "msg-meta";
    meta.textContent = options.meta;
    msg.appendChild(meta);
  }

  const content = document.createElement("div");
  content.textContent = text;
  msg.appendChild(content);

  // === NEU: Bildanzeige statt filename ===
  if (options.imageUrl) {
    const img = document.createElement("img");
    img.src = options.imageUrl;
    img.style.maxWidth = "220px";
    img.style.borderRadius = "10px";
    img.style.display = "block";
    img.style.marginTop = "6px";
    msg.appendChild(img);
  }

  // === NEU: Vorschlags-Buttons ===
  if (options.suggestions?.length) {
    const wrap = document.createElement("div");
    wrap.className = "suggestions";

    options.suggestions.forEach(s => {
      const b = document.createElement("button");
      b.className = "pill";
      b.textContent = s;
      b.onclick = () => {
        sendMessage(s); // 🔥 direkt senden
      };
      wrap.appendChild(b);
    });

    msg.appendChild(wrap);
  }

  // === App-Shortcuts ===
  if (options.appShortcuts?.length) {
    const wrap = document.createElement("div");
    wrap.className = "app-shortcuts";

    options.appShortcuts.forEach(a => {
      const b = document.createElement("button");
      b.className = "pill";
      b.textContent = a.label;
      b.onclick = () => window.open(a.url, "_blank");
      wrap.appendChild(b);
    });

    msg.appendChild(wrap);
  }

  chatEl.appendChild(msg);
  chatEl.scrollTop = chatEl.scrollHeight;

  if (type === "ai" && ttsEnabled) speak(text);
}

/* ===================== TTS ===================== */
function speak(text) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  speaking = true;

  const u = new SpeechSynthesisUtterance(text);
  u.lang = "de-DE";
  u.onend = () => (speaking = false);
  speechSynthesis.speak(u);
}

/* ===================== SEND ===================== */
async function sendMessage(text, imageDataUrl = null) {
  if (!text && !imageDataUrl) return;

  addMessage(text || "📷 Foto gesendet", "user", {
    imageUrl: imageDataUrl || null
  });

  inputEl.value = "";

  const payload = {
    sessionId,
    mode: modeSelect.value,
    message: text || "Analysiere bitte das Bild",
    imageDataUrl: imageDataUrl || lastImageContext
  };

  const endpoint = imageDataUrl || lastImageContext ? "/api/vision" : "/api/chat";

  try {
    const r = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await r.json();

    // === Antwort zählen ===
    answerCount++;
    answerCounter.textContent = `Antworten in diesem Thema: ${answerCount} / 25`;

    addMessage(data.reply, "ai", {
      suggestions: data.suggestions,
      appShortcuts: data.appShortcuts
    });
  } catch {
    addMessage("❌ Fehler – bitte später erneut versuchen.", "ai");
  }
}

/* ===================== EVENTS ===================== */
sendBtn.onclick = () => sendMessage(inputEl.value);

inputEl.addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage(inputEl.value);
  }
});

/* ===================== IMAGE UPLOAD ===================== */
galleryBtn.onclick = () => imageInput.click();

imageInput.onchange = () => {
  const file = imageInput.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    lastImageContext = reader.result; // 🔒 Bild bleibt im Kontext
    addMessage("📎 Bild hinzugefügt", "user", {
      imageUrl: reader.result
    });

    // === NEU: Vorschläge NACH Upload ===
    addMessage(
      "Ich habe das Bild. Wobei soll ich dir helfen?",
      "ai",
      {
        suggestions: [
          "Was ist das für ein Kabel?",
          "Ist das ein Defekt?",
          "Was kann ich jetzt tun?"
        ]
      }
    );
  };
  reader.readAsDataURL(file);
};

/* ===================== KAMERA ===================== */
async function openCamera(facing = "environment") {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: facing }
  });

  const video = document.createElement("video");
  video.srcObject = stream;
  video.autoplay = true;

  const overlay = document.createElement("div");
  overlay.style.position = "fixed";
  overlay.style.inset = "0";
  overlay.style.background = "rgba(0,0,0,0.8)";
  overlay.style.zIndex = "999";
  overlay.appendChild(video);

  const snap = document.createElement("button");
  snap.textContent = "📸 Foto aufnehmen";
  snap.style.position = "absolute";
  snap.style.bottom = "20px";
  snap.style.left = "50%";
  snap.style.transform = "translateX(-50%)";

  snap.onclick = () => {
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);

    const img = canvas.toDataURL("image/png");
    lastImageContext = img;

    stream.getTracks().forEach(t => t.stop());
    overlay.remove();

    addMessage("📷 Foto aufgenommen", "user", { imageUrl: img });

    addMessage(
      "Ich sehe mir das Foto an. Was möchtest du wissen?",
      "ai",
      {
        suggestions: [
          "Was genau sehe ich hier?",
          "Ist das kaputt?",
          "Sollte ich damit in einen Laden gehen?"
        ]
      }
    );
  };

  overlay.appendChild(snap);
  document.body.appendChild(overlay);
}

camBackBtn.onclick = () => openCamera("environment");
camFrontBtn.onclick = () => openCamera("user");

/* ===================== VOICE ===================== */
voiceBtn.onclick = () => {
  if (!("webkitSpeechRecognition" in window)) {
    alert("Spracherkennung nicht verfügbar");
    return;
  }

  const rec = new webkitSpeechRecognition();
  rec.lang = "de-DE";
  rec.onresult = e => {
    if (speaking) speechSynthesis.cancel(); // 🔇 KI hört auf
    sendMessage(e.results[0][0].transcript);
  };
  rec.start();
};

/* ===================== TTS TOGGLE ===================== */
ttsToggle.onchange = e => {
  ttsEnabled = e.target.checked;
};
