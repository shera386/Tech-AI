// server.js — Tech-AI Backend (Chat + Intent + Vision + FreeLimit/Kulanz)

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const express = require("express");
const OpenAI = require("openai");

const app = express();
app.use(express.json({ limit: "25mb" })); // wichtig für Bilder (base64)
app.use(express.static(path.join(__dirname, "public")));

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const PORT = process.env.PORT || 3000;
const MODEL_CHAT = process.env.MODEL_CHAT || "gpt-4o-mini";
const MODEL_VISION = process.env.MODEL_VISION || "gpt-4o-mini";

// ===== Simple In-Memory Store (Backend) ===================================
// Frontend speichert Chat-Verlauf in localStorage.
// Backend braucht nur: Limit/Kulanz pro session + Thema.
const sessions = {}; // sessionId -> { topicId, topicTitle, answerCount, blockedNewTopics, warnings, lastSolved }
const FREE_LIMIT = 25;          // "gratis Antworten" pro Thema
const HARD_WARNINGS = 3;        // wie oft nett warnen
const KULANZ_EXTRA = 9999;      // Thema wird zu Ende betreut (praktisch unlimitiert), aber neue Themen blockiert

// ===== Tech Tips (nur Betreiber) ==========================================
function loadTechTips() {
  try {
    const file = path.join(__dirname, "tech-tips.txt");
    if (!fs.existsSync(file)) return "";
    const txt = fs.readFileSync(file, "utf-8").trim();
    return txt ? txt : "";
  } catch {
    return "";
  }
}

// ===== App / Settings Deep Links ==========================================
// Hinweis: System-Settings Links funktionieren je nach OS/Browser unterschiedlich.
// Desktop: oft nur Web-Links sinnvoll. Android/iOS: deep links können gehen.
function buildAppLinkCatalog() {
  return [
    // System / Settings
    { key: "bluetooth_settings", label: "Bluetooth öffnen", url: "ms-settings:bluetooth" }, // Windows
    { key: "wifi_settings", label: "WLAN öffnen", url: "ms-settings:network-wifi" },      // Windows
    { key: "sound_settings", label: "Sound öffnen", url: "ms-settings:sound" },           // Windows

    // Web Apps
    { key: "gmail", label: "Gmail", url: "https://mail.google.com/" },
    { key: "google", label: "Google", url: "https://www.google.com/" },
    { key: "tiktok", label: "TikTok", url: "https://www.tiktok.com/" },
    { key: "discord", label: "Discord", url: "https://discord.com/app" },
    { key: "snapchat", label: "Snapchat Web", url: "https://web.snapchat.com/" },
    { key: "instagram", label: "Instagram", url: "https://www.instagram.com/" },
    { key: "youtube", label: "YouTube", url: "https://www.youtube.com/" },

    // Shops / Reviews
    { key: "versus", label: "Vergleichen", url: "https://versus.com/" },
    { key: "geizhals", label: "Preisvergleich", url: "https://geizhals.de/" }
  ];
}

// ===== Helpers =============================================================
function getOrCreateSession(sessionId) {
  if (!sessions[sessionId]) {
    sessions[sessionId] = {
      topicId: "topic-" + Date.now(),
      topicTitle: "",
      answerCount: 0,
      blockedNewTopics: false,
      warnings: 0,
      lastSolved: false
    };
  }
  return sessions[sessionId];
}

function paywallReply() {
  return {
    reply:
      "Kostenlose Sitzung ist abgelaufen. Für unendlich Antworten benötigen Sie ein Abo.\n\n" +
      "• Flex-Abo: 0,24 € / Tag\n" +
      "• Spar-Abo: 2,99 € / 2 Monate\n\n" +
      "Klicken Sie hier:",
    appShortcuts: [
      { label: "Flex-Abo", url: "https://example.com/flex" },
      { label: "Spar-Abo", url: "https://example.com/spar" }
    ]
  };
}

function shortStyleGuide(mode) {
  if (mode === "erfahren") {
    return `
Du bist Tech-AI (Technik-Helfer). Stil:
- Direkt, kurz, hilfreich.
- Fachbegriffe sind OK, aber nicht übertreiben.
- Keine langen Referate.
- Wenn es um Kaufberatung geht: neutral, kurz, mit klarer Empfehlung + Begründung.
- Wenn sinnvoll: 2–3 kurze Follow-up Fragen als Vorschläge (Buttons).
`;
  }
  return `
Du bist Tech-AI (Technik-Helfer). Stil:
- Sehr einfach, keine Fachbegriffe.
- Sehr kurz. 1–6 Sätze.
- Keine langen Erklärungen.
- Erkläre wie für jemanden ohne Technik-Wissen.
- Wenn Kaufberatung: sag Nutzen in Alltagssprache (Multitasking, wird nicht so schnell langsam/warm).
- Wenn sinnvoll: 2–3 kurze Follow-up Fragen als Vorschläge (Buttons).
`;
}

function buildSystemPrompt({ mode, devicesText, techTips, platformHint }) {
  const base = `
Du bist "Tech-AI". Du erklärst nur Technik-Kram (Hardware, Software, Apps, Settings, Accounts).
Wenn jemand Smalltalk macht: kurz antworten und dann freundlich fragen, ob es ein Technikproblem gibt.

WICHTIG:
- Keine gefährlichen/illegalen Anleitungen.
- Keine Passwörter erfragen. Wenn Account: "Passwort nicht schicken. Schreiben Sie es sich auf."
- Wenn du Schritte gibst: nummeriert, sehr klar.

KONTEXT:
- Plattform: ${platformHint || "unbekannt"}
- Geräte vom Nutzer (wenn vorhanden): ${devicesText || "keine angegeben"}

TECH-TIPS (nur Betreiber-Notizen, nutze sie wenn passend):
${techTips ? techTips : "(keine)"}

OUTPUT-REGEL:
Antworte als JSON in diesem Format:
{
  "reply": "Text...",
  "suggestions": ["Frage 1", "Frage 2", "Frage 3"],
  "appShortcuts": [{"label":"...", "url":"..."}]
}

SUGGESTIONS:
- genau 2–3 Vorschläge, passend zum Thema.
- Wenn nichts passt: gib leere Liste.

APP LINKS:
- Wenn der Nutzer "Einstellungen öffnen / Bluetooth / Gmail / TikTok / Discord / Google" etc. braucht,
  gib passende appShortcuts aus dem Katalog oder Web-Link.
- Wenn du unsicher bist: gib einen sicheren Web-Link (z.B. Google Suche).
`;
  return base + "\n" + shortStyleGuide(mode);
}

// Intent: "VISUAL_HELP" wenn User nach Klick/Stream/Bild fragt
async function detectIntent(message) {
  const sys = {
    role: "system",
    content:
      `Du klassifizierst eine Nachricht. Antworte NUR JSON.\n` +
      `Kategorien:\n` +
      `- "VISUAL_HELP": Nutzer will, dass du etwas am Bildschirm/Bild erkennst (z.B. "wo klicken?", "siehst du das?", "im stream", "screenshot").\n` +
      `- "NEW_TOPIC": Nutzer wechselt klar das Thema (anderes Problem).\n` +
      `- "NORMAL": alles andere.\n\n` +
      `JSON: {"intent":"VISUAL_HELP|NEW_TOPIC|NORMAL"}`
  };

  try {
    const r = await client.responses.create({
      model: MODEL_CHAT,
      input: [
        { role: "system", content: sys.content },
        { role: "user", content: message }
      ],
      temperature: 0
    });
    const text = (r.output_text || "").trim();
    const obj = JSON.parse(text);
    return obj.intent || "NORMAL";
  } catch {
    // fallback simple keywords
    const m = (message || "").toLowerCase();
    if (m.includes("wo") && m.includes("klick")) return "VISUAL_HELP";
    if (m.includes("screenshot") || m.includes("stream") || m.includes("bild")) return "VISUAL_HELP";
    return "NORMAL";
  }
}

// OpenAI: Chat JSON output
async function askTechAI_JSON({ mode, message, devicesText, platformHint, useWebSearch }) {
  const techTips = loadTechTips();
  const sysPrompt = buildSystemPrompt({ mode, devicesText, techTips, platformHint });

  // Websuche: hier nur Stub. (Du kannst später SerpAPI / eigene Suche einbauen)
  // Wir lassen KI nur wissen, ob Websuche an ist.
  const webHint = useWebSearch
    ? "Websuche ist AN (Tests/Bewertungen). Wenn sinnvoll: empfehle vs.-Vergleich + Preisvergleich Links."
    : "Websuche ist AUS.";

  const input = [
    { role: "system", content: sysPrompt + "\n" + webHint },
    { role: "user", content: message }
  ];

  const r = await client.responses.create({
    model: MODEL_CHAT,
    input,
    temperature: 0.4
  });

  const raw = (r.output_text || "").trim();

  let obj;
  try {
    obj = JSON.parse(raw);
  } catch {
    obj = { reply: raw, suggestions: [], appShortcuts: [] };
  }

  // normalize
  if (!Array.isArray(obj.suggestions)) obj.suggestions = [];
  obj.suggestions = obj.suggestions.slice(0, 3);
  if (!Array.isArray(obj.appShortcuts)) obj.appShortcuts = [];

  // If user wants reviews/prices, give standard links when webSearch enabled
  if (useWebSearch) {
    const cat = buildAppLinkCatalog();
    // keep existing but append if missing
    const needVersus = /vergleich|versus|gegenüber|besser als|unterschied/i.test(message);
    if (needVersus && !obj.appShortcuts.some(x => String(x.url).includes("versus.com"))) {
      const v = cat.find(x => x.key === "versus");
      if (v) obj.appShortcuts.push({ label: v.label, url: v.url });
    }
    const needPrice = /preis|günstig|teuer|kosten|angebot/i.test(message);
    if (needPrice && !obj.appShortcuts.some(x => String(x.url).includes("geizhals"))) {
      const g = cat.find(x => x.key === "geizhals");
      if (g) obj.appShortcuts.push({ label: g.label, url: g.url });
    }
  }

  // Kataloglinks: falls KI nichts liefert, aber message danach schreit
  if (obj.appShortcuts.length === 0) {
    const cat = buildAppLinkCatalog();
    const m = message.toLowerCase();
    const pick = [];
    if (m.includes("bluetooth")) pick.push(cat.find(x => x.key === "bluetooth_settings"));
    if (m.includes("wlan") || m.includes("wifi")) pick.push(cat.find(x => x.key === "wifi_settings"));
    if (m.includes("gmail")) pick.push(cat.find(x => x.key === "gmail"));
    if (m.includes("tiktok")) pick.push(cat.find(x => x.key === "tiktok"));
    if (m.includes("discord")) pick.push(cat.find(x => x.key === "discord"));
    if (m.includes("google")) pick.push(cat.find(x => x.key === "google"));
    obj.appShortcuts = pick.filter(Boolean).slice(0, 4).map(x => ({ label: x.label, url: x.url }));
  }

  return obj;
}

// Vision: Screenshot/Bild + Text
async function askTechAI_Vision_JSON({ mode, message, imageDataUrl, devicesText, platformHint }) {
  const techTips = loadTechTips();
  const sysPrompt = buildSystemPrompt({ mode, devicesText, techTips, platformHint });

  const input = [
    {
      role: "system",
      content:
        sysPrompt +
        "\n\nDu bekommst jetzt ein Bild (Screenshot/Foto). " +
        "Gib sehr klare Klick-Schritte. Wenn du etwas nicht sicher erkennst: sag 'Ich bin nicht 100% sicher' und frag 1 kurze Nachfrage."
    },
    {
      role: "user",
      content: [
        { type: "input_text", text: message || "Bitte sag mir, wo ich klicken muss." },
        { type: "input_image", image_url: imageDataUrl }
      ]
    }
  ];

  const r = await client.responses.create({
    model: MODEL_VISION,
    input,
    temperature: 0.3
  });

  const raw = (r.output_text || "").trim();

  let obj;
  try {
    obj = JSON.parse(raw);
  } catch {
    obj = { reply: raw, suggestions: [], appShortcuts: [] };
  }

  if (!Array.isArray(obj.suggestions)) obj.suggestions = [];
  obj.suggestions = obj.suggestions.slice(0, 3);
  if (!Array.isArray(obj.appShortcuts)) obj.appShortcuts = [];
  return obj;
}

// ===== API ================================================================

// Intent endpoint
app.post("/api/intent", async (req, res) => {
  const { message } = req.body || {};
  if (!message) return res.json({ intent: "NORMAL" });
  const intent = await detectIntent(message);
  res.json({ intent });
});

// Main chat endpoint
app.post("/api/chat", async (req, res) => {
  const {
    mode = "unerfahren",
    message = "",
    sessionId = "",
    newTopic = false,
    markSolved = false,
    useWebSearch = false,
    topicTitle = "",
    devices = [],
    platform = ""
  } = req.body || {};

  if (!sessionId) {
    return res.status(400).json({ error: "sessionId fehlt" });
  }

  const s = getOrCreateSession(sessionId);

  // Topic handling
  const intent = newTopic ? "NEW_TOPIC" : "NORMAL";

  // Wenn neues Thema gestartet werden soll, aber blockiert:
  if (intent === "NEW_TOPIC" && s.blockedNewTopics) {
    // paywall mode (no more tokens wasted)
    return res.json({
      answerCount: s.answerCount,
      freeLimit: FREE_LIMIT,
      ...paywallReply(),
      suggestions: [],
      webResults: [],
      appShortcuts: paywallReply().appShortcuts
    });
  }

  // Mark solved: Thema wird abgeschlossen, neue Themen danach blockieren wenn Limit erreicht ist
  if (markSolved) {
    s.lastSolved = true;
  }

  // Free-limit logic:
  // - Solange Thema aktiv: wir antworten weiter (Kulanz), aber nach FREE_LIMIT werden neue Themen gesperrt.
  // - Wenn Nutzer klar neues Thema will und wir >= FREE_LIMIT: block new topics.
  if (s.answerCount >= FREE_LIMIT) {
    s.blockedNewTopics = true;
  }

  // Devices text to prompt
  const devicesText = Array.isArray(devices) && devices.length
    ? devices.map(d => `${d.type}: ${d.name}`).join(" | ")
    : "";

  // If user tries to start new topic after blocked:
  if (newTopic && s.blockedNewTopics) {
    // warn a few times
    s.warnings += 1;
    if (s.warnings <= HARD_WARNINGS) {
      return res.json({
        answerCount: s.answerCount,
        freeLimit: FREE_LIMIT,
        reply:
          `Hinweis: Die kostenlose Sitzung ist für neue Themen begrenzt.\n` +
          `Ich kann das aktuelle Problem zu Ende lösen. Für ein neues Thema brauchst du ein Abo.\n\n` +
          `Sag mir bitte: Geht es noch um das gleiche Problem?`,
        suggestions: ["Ja, gleiches Problem", "Nein, neues Thema", "Ich brauche Preisvergleich"],
        webResults: [],
        appShortcuts: buildAppLinkCatalog().filter(x => ["versus","geizhals"].includes(x.key))
          .map(x => ({ label: x.label, url: x.url }))
      });
    }
    return res.json({
      answerCount: s.answerCount,
      freeLimit: FREE_LIMIT,
      ...paywallReply(),
      suggestions: [],
      webResults: [],
      appShortcuts: paywallReply().appShortcuts
    });
  }

  // Normal answer (Kulanz: auch nach Limit, wenn es noch zum Thema gehört)
  try {
    const out = await askTechAI_JSON({
      mode,
      message,
      devicesText,
      platformHint: platform,
      useWebSearch: !!useWebSearch
    });

    s.answerCount += 1;

    res.json({
      reply: out.reply || "Keine Antwort erhalten.",
      suggestions: out.suggestions || [],
      appShortcuts: out.appShortcuts || [],
      webResults: [], // stub
      answerCount: s.answerCount,
      freeLimit: FREE_LIMIT
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "KI Fehler. Prüfe API Key / Modell." });
  }
});

// Vision endpoint
app.post("/api/vision", async (req, res) => {
  const {
    mode = "unerfahren",
    message = "",
    sessionId = "",
    imageDataUrl = "",
    devices = [],
    platform = ""
  } = req.body || {};

  if (!sessionId) return res.status(400).json({ error: "sessionId fehlt" });
  if (!imageDataUrl) return res.status(400).json({ error: "imageDataUrl fehlt" });

  const s = getOrCreateSession(sessionId);

  // Kulanz: Vision zählt auch als Antwort (dein Counter)
  if (s.answerCount >= FREE_LIMIT) s.blockedNewTopics = true;

  const devicesText = Array.isArray(devices) && devices.length
    ? devices.map(d => `${d.type}: ${d.name}`).join(" | ")
    : "";

  try {
    const out = await askTechAI_Vision_JSON({
      mode,
      message,
      imageDataUrl,
      devicesText,
      platformHint: platform
    });

    s.answerCount += 1;

    res.json({
      reply: out.reply || "Keine Antwort erhalten.",
      suggestions: out.suggestions || [],
      appShortcuts: out.appShortcuts || [],
      answerCount: s.answerCount,
      freeLimit: FREE_LIMIT
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Vision KI Fehler. Prüfe Modell/API Key." });
  }
});

app.listen(PORT, () => {
  console.log(`Tech-AI läuft: http://localhost:${PORT}`);
});
