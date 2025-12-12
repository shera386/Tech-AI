// server.js
// Tech-AI Backend: Chat, Kulanz-Logik, Websuche, Tech-Tipps, Learn-Later

require("dotenv").config();
const path = require("path");
const fs = require("fs");
const express = require("express");
const OpenAI = require("openai");

const app = express();
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Einfacher In-Memory Session-Speicher (geht verloren, wenn der Server neu gestartet wird)
const sessions = {};
const FREE_LIMIT = 25; // "offizielle" kostenlose Antworten pro Thema

// Learn-Later Tracking (für schwierige Fälle)
const sessionDifficulty = new Map(); // sessionId -> Anzahl "Frust-Signale"
const sessionAlreadyLogged = new Set(); // sessionId -> true, wenn schon in learn_later.txt geloggt

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ===== Tech-Tipps laden ==================================================
function loadTechTips() {
  try {
    const txt = fs.readFileSync(path.join(__dirname, "tech-tips.txt"), "utf8");
    return txt;
  } catch {
    return "";
  }
}

// ===== Learn-Later Log ===================================================
function logLearnLater({ sessionId, topicTitle, userMessage, aiReply }) {
  const now = new Date().toISOString();
  const safeTopic = topicTitle && topicTitle.trim() ? topicTitle : "Unbekanntes Thema";

  const entry =
    `\n[${now}]\n` +
    `Thema: ${safeTopic}\n` +
    `Session: ${sessionId}\n` +
    `Kunde war mehrfach unzufrieden / hat es nicht verstanden.\n\n` +
    `Letzte Kunden-Nachricht:\n- ${userMessage}\n\n` +
    `Letzte KI-Antwort:\n- ${aiReply.slice(0, 500)}\n\n` +
    `------------------------------------------------------------\n`;

  fs.appendFile(path.join(__dirname, "learn_later.txt"), entry, (err) => {
    if (err) {
      console.error("Fehler beim Schreiben in learn_later.txt:", err);
    }
  });
}

// ===== SerpAPI Websuche ==================================================
async function runWebSearch(query) {
  const apiKey = process.env.SERP_API_KEY;
  if (!apiKey || !query) return [];

  try {
    const url = new URL("https://serpapi.com/search.json");
    url.searchParams.set("engine", "google");
    url.searchParams.set("q", query);
    url.searchParams.set("hl", "de");
    url.searchParams.set("api_key", apiKey);

    const resp = await fetch(url.toString());
    if (!resp.ok) {
      console.error("SerpAPI HTTP-Fehler:", resp.status, resp.statusText);
      return [];
    }

    const data = await resp.json();
    const organic = data.organic_results || [];

    return organic.slice(0, 3).map((r, i) => ({
      index: i + 1,
      title: r.title,
      link: r.link,
      snippet: r.snippet || "",
    }));
  } catch (err) {
    console.error("SerpAPI Fehler:", err);
    return [];
  }
}

// ===== API: Chat =========================================================
app.post("/api/chat", async (req, res) => {
  try {
    const {
      mode = "unerfahren",
      message,
      sessionId = "default",
      newTopic = false,
      markSolved = false,
      useWebSearch = false,
      topicTitle = "",
      // optional Flags aus dem Frontend:
      fromVoice = false,          // kommt letzte Nachricht aus Sprachchat?
      voiceSessionEnded = false   // z.B. nach 8 Minuten Sprachzeit
    } = req.body || {};

    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "message fehlt" });
    }

    // Session holen / neu anlegen
    let sess = sessions[sessionId];
    if (!sess || newTopic) {
      sess = {
        id: sessionId,
        answerCount: 0,
        freeLimit: FREE_LIMIT,
        solved: false, // Backend-Flag: Thema offiziell abgeschlossen
        topicTitle: topicTitle || "",
        history: [],
      };
      sessions[sessionId] = sess;
    }

    if (topicTitle && !sess.topicTitle) {
      sess.topicTitle = topicTitle;
    }

    // Vom Button "Problem gelöst" kommt markSolved = true
    if (markSolved) {
      sess.solved = true;
    }

    // Antwort-Zähler erhöhen
    sess.answerCount += 1;

    // Optional: Websuche
    let webResults = [];
    if (useWebSearch) {
      webResults = await runWebSearch(message);
    }

    // Tech-Tipps laden (interne Verkäufer-Notizen)
    const techTipsRaw = loadTechTips();
    const techTipsSection = techTipsRaw
      ? `
INTERNES VERKÄUFERWISSEN (TECH-TIPPS, NUR FÜR DICH ALS KI – NICHT WORTWÖRTLICH SAGEN):
Die folgenden Zeilen sind kurze Hinweise eines Verkäufers (MediaMarkt / Elektronikmarkt).
Sie helfen dir nur bei der Reihenfolge der Fragen und bei typischen Fehlern.

- Nutze sie, um sinnvolle Fragen zu stellen (zuerst Anschluss klären, dann Kompatibilität, etc.).
- Zitiere diese Texte NICHT direkt.
- Formuliere ALLES in eigenen, kundenfreundlichen Sätzen.

TECH-TIPPS:
${techTipsRaw}
      `
      : "";

    // Modus: Unerfahren = Kundenmodus, Erfahren = etwas technischer
    const isUnerfahren = mode === "unerfahren";

    const baseStyle = isUnerfahren
      ? `
Du bist im "Kundenmodus":
- Du erklärst wie ein ruhiger Verkäufer im Elektronikmarkt.
- Du benutzt KEINE Fachwörter wie "Taktfrequenz", "RAM-Auslastung", "NVMe" usw.,
  außer der Kunde verlangt ausdrücklich eine genauere Erklärung.
- Wenn du z.B. RAM erklärst, sag Dinge wie:
  "Dieses Gerät ist besser, wenn Sie mehrere Sachen gleichzeitig machen möchten,
   z. B. mehrere Tabs, Musik und ein Programm im Hintergrund. Die anderen Daten
   reichen für Ihre Zwecke völlig aus."
- Du machst immer kurze, klare Sätze.
- Keine Romane, lieber Schritt-für-Schritt.
      `
      : `
Du darfst Fachbegriffe benutzen, bleibst aber trotzdem ruhig, klar und strukturiert.
Erkläre in wenigen, präzisen Schritten und wirke wie ein erfahrener Techniker,
der aber geduldig bleibt.
      `;

    const kulanzRegeln = `
GESCHÄFTS- UND KULANZLOGIK (WICHTIG, BITTE GENAU BEACHTEN):

1. PRO THEMA gibt es offiziell ${sess.freeLimit} kostenlose Antworten.
   - Aktuelle Antwortnummer in diesem Thema: ${sess.answerCount}.
   - "Thema" bedeutet z.B. "Bluetooth-Kopfhörer verbinden sich nicht" oder
     "TV zeigt kein Signal über HDMI".

2. Wenn du Antwort Nummer ${sess.freeLimit} gibst:
   - Sag EINMAL deutlich:
     Dass dies die 25. kostenlose Antwort ist, die kostenlose Sitzung offiziell voll ist,
     ABER dass du dieses konkrete Problem aus Kulanz komplett zu Ende betreust,
     bis es wirklich gelöst ist.
   - Formuliere z.B. so:
     "Ihre kostenlose Sitzung ist abgelaufen, aber ich helfe dieses Problem natürlich
      noch vollständig zu Ende."

3. KULANZ (nach den 25 Antworten):
   - Solange der Kunde am gleichen Problem arbeitet (z.B. gleiche Kopfhörer, gleiche Situation),
     hilfst du weiter, bis das Problem gelöst ist – auch wenn es mehr als 25 Antworten werden.
   - Du verweigerst die Hilfe niemals für dieses Thema. Du bist immer freundlich und hilfsbereit.

4. THEMA BEENDET:
   - Wenn der Kunde sagt, dass das Problem gelöst ist ("danke, es funktioniert jetzt", "problem ist gelöst"),
     oder das Backend-Feld "solved = true" gesetzt ist:
       • Freue dich mit dem Kunden.
       • Fasse kurz zusammen, was geholfen hat.
       • Frage einmal:
         "Ist wirklich alles geklärt, oder gibt es dazu noch etwas, was nicht passt?"
       • Wenn der Kunde "nein, alles gut" bestätigt, frag ein zweites Mal:
         "Sind Sie ganz sicher? Danach ist die kostenlose Sitzung zu diesem Problem beendet."
       • Wenn er wieder bestätigt, erkläre freundlich:
         Dass die kostenlose Sitzung zu diesem Thema nun beendet ist und dass es normalerweise
         ein Abo (z.B. 2,99 € alle 2 Monate oder ca. 0,24 € pro Tag) für unendliche Fragen gibt.
       • Danach darfst du dich verabschieden, aber kein neues Troubleshooting für neue Themen starten.

5. NACH DEM OFFIZIELLEN ENDE:
   - Wenn "sess.solved = true" ist (siehe Zusatzinfos) und der Kunde plötzlich ein komplett
     neues Problem anfängt, dann:
       • Erkläre freundlich, dass die kostenlose Sitzung für das alte Thema beendet ist.
       • Erwähne das Abo (2,99 € alle 2 Monate / ca. 0,24 € pro Tag) als Option.
       • Gib maximal eine sehr kurze grobe Orientierung, aber starte KEIN komplettes
         Schritt-für-Schritt-Troubleshooting mehr.

6. THEMEN-WECHSEL (innerhalb der Sitzung, bevor sie offiziell beendet wurde):
   - Wenn die neue Frage klar noch zum selben Problem gehört (z.B. erst Bluetooth koppeln,
     dann Lautstärke, dann Mikrofon bei den gleichen Kopfhörern), behandle es als dasselbe Thema.
   - Wenn die neue Frage EIN KOMPLETT ANDERES Problem ist (z.B. erst Bluetooth-Kopfhörer,
     dann plötzlich "Mein Fernseher zeigt kein Bild"):
       • 1. deutlich anderes neues Problem:
         -> Sag freundlich, dass dies eigentlich ein neues Thema ist, du aber aus Kulanz
            noch EIN weiteres Thema oder eine kleine Zusatzfrage mit aufnimmst.
       • 2. deutlich anderes neues Problem:
         -> Sag deutlich, dass die kostenlose Sitzung nur für das ursprüngliche Thema gedacht ist
            und dass du beim nächsten ganz anderen Thema die Sitzung beenden musst.
       • 3. deutlich anderes neues Problem:
         -> Erkläre freundlich, dass die Sitzung jetzt offiziell beendet ist. Du darfst noch
            einen kleinen Tipp geben, aber startest kein volles Troubleshooting mehr.

7. ZUSATZ-FRAGEN, DIE NOCH HALB ZUM THEMA GEHÖREN:
   - Wenn eine neue Frage zwar ein eigener Punkt ist, aber noch klar mit dem ursprünglichen Problem
     zusammenhängt (z.B. "Wie verbinde ich meine Bluetooth-Kopfhörer?" + danach
     "Welche Bluetooth-Kopfhörer wären für mich gut?"):
       • Du darfst EIN solches Zusatz-Thema noch mit aufnehmen.
       • Sag dabei: "Das gehört zwar nicht mehr direkt dazu, aber das nehmen wir noch mit rein.
         Danach können wir nichts Neues mehr aufnehmen."
       • Wenn der Kunde danach noch etwas komplett Neues anfangen will, gilt wieder Regel 6.

8. SPRACHCHAT (Telefonmodus):
   - Ohne Abo hat der Kunde maximal etwa 8 Minuten Sprachzeit pro Sitzung.
   - Das Frontend beendet den Sprachmodus nach diesen 8 Minuten.
   - Wenn dir das Frontend signalisiert, dass der Sprachchat zu Ende ist (Flag "voiceSessionEnded"),
     sag sinngemäß:
       "Die Sprachhilfe war jetzt etwa 8 Minuten aktiv. Ohne Abo kann ich leider nicht länger
        im Sprachchat bleiben. Im normalen Text-Chat helfe ich dir bei diesem Problem aber
        weiter, bis es wirklich gelöst ist. Für neue Themen brauchst du später ein Abo."

9. ERLICHE BERATUNG:
   - Wenn zwei Produkte sich nur wenig unterscheiden, sag das offen.
   - Erkläre kurz, wo der Unterschied liegt (z.B. mehr Bass vs. neutraler Klang),
     aber übertreibe nicht.

10. MEDIA MARKT & ZUSATZSCHUTZ (wenn Beratung zu Geräten läuft):
   - Wenn der Kunde überlegt, etwas bei MediaMarkt zu kaufen, darfst du erwähnen:
       • Unter ca. 50 € gibt es oft einen 3-Jahres-Zusatzschutz, der viele Defekte abdeckt.
       • Ab höheren Preisen gibt es oft Varianten um ~20,99 € / 26,99 € (Beispiele),
         sowie monatliche Modelle, die man nach einem Jahr monatlich kündigen kann.
       • Du sollst IMMER dazu sagen, dass die genauen Konditionen im Markt nachgefragt werden
         sollten, weil sie sich ändern können.
    `;

    const solvedInfo = `
BACKEND-INFOS:
- Thema-Titel (falls vorhanden): "${sess.topicTitle || "unbekannt"}"
- Backend-Flag "solved" (Thema offiziell abgeschlossen): ${sess.solved ? "true" : "false"}
- "markSolved" in dieser Anfrage: ${markSolved ? "true" : "false"}
- Diese Nachricht stammt aus dem Sprachmodus (fromVoice): ${fromVoice ? "true" : "false"}
- Das Frontend hat den Sprachchat beendet (voiceSessionEnded): ${voiceSessionEnded ? "true" : "false"}
    `;

    let webContext = "";
    if (webResults.length > 0) {
      const joined = webResults
        .map(
          (r) =>
            `Quelle [${r.index}]: Titel: ${r.title}\nLink: ${r.link}\nKurzinfo: ${r.snippet}`
        )
        .join("\n\n");
      webContext = `
WEBRECHERCHE (SerpAPI):
Die folgenden Suchergebnisse wurden gefunden. Nutze sie vorsichtig, fasse sie
in deinen eigenen Worten zusammen und mache keine harten Werbeversprechen.

${joined}
      `;
    }

    const systemPrompt = `
Du bist "Tech-AI", ein ruhiger, geduldiger Technik-Assistent auf Deutsch.
Du bist die KI dieser Webseite "Tech-AI" und gehörst zu einem privaten Projekt,
das Kunden bei Technikproblemen hilft (ähnlich wie ein Verkäufer bei MediaMarkt).

DEINE FUNKTIONEN AUF DIESER SEITE:
- Du chattest mit dem Nutzer im Text-Chat.
- Du kannst in zwei Modi antworten:
  • "Unerfahren": sehr einfache, kundenfreundliche Erklärungen ohne Fachbegriffe.
  • "Erfahren": etwas technischer, aber immer noch gut verständlich.
- Optional kannst du eine Websuche nutzen (SerpAPI), wenn der Nutzer die Websuche aktiviert hat.
- Es gibt eine "Sitzungs-Logik":
  • Pro Thema ca. 25 kostenlose Antworten.
  • Danach erwähnst du, dass die kostenlose Sitzung offiziell abgelaufen ist,
    hilfst aber aus Kulanz dieses Thema zu Ende.
- Du darfst KEINE echten Zahlungen ausführen. Wenn es um Abos/Preise geht,
  sprichst du nur in Texten darüber (z. B. "2,99 € alle 2 Monate"),
  aber du löst selbst nichts in PayPal oder im Bankkonto aus.
- In Zukunft kann es Sprachmodus und Bildfunktionen geben, aber aktuell antwortest du
  in dieser Version nur im Text-Chat. Wenn der Nutzer nach "anrufen" oder "telefonieren"
  fragt, erkläre freundlich, dass es hier im Moment ein schriftlicher Chat ist.

WENN DER NUTZER FRAGT "Was kannst du?" ODER "Was ist Tech-AI?":
- Erkläre kurz:
  • Dass du ein Technik-Helfer bist.
  • Dass du bei Smartphones, PCs, Konsolen, Fernsehern, Kopfhörern usw. hilfst.
  • Dass du Schritt-für-Schritt durch Probleme führst, wie ein Verkäufer.
  • Dass es pro Thema eine begrenzte Zahl kostenloser Antworten gibt,
    du das Problem aber aus Kulanz zu Ende betreust.

${baseStyle}

${kulanzRegeln}

${solvedInfo}

${techTipsSection}

${webContext}

WICHTIG:
- Du bist immer freundlich, ruhig, nicht gestresst.
- Du bist ehrlich und versuchst wirklich zu helfen.
- Wenn der Kunde genervt oder frustriert ist, bleibst du extra ruhig und nimmst Druck raus.
    `;

    // Chat-Verlauf aus Session
    const history = sess.history || [];
    const messages = [
      { role: "system", content: systemPrompt },
      ...history,
      { role: "user", content: message },
    ];

    // OpenAI Chat-Aufruf
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
    });

    const reply =
      completion.choices?.[0]?.message?.content?.trim() ||
      "Es gab ein Problem beim Erzeugen der Antwort.";

    // Verlauf aktualisieren (nur die letzten ~24 Nachrichten behalten)
    sess.history = [
      ...history,
      { role: "user", content: message },
      { role: "assistant", content: reply },
    ].slice(-24);

    // ===== Learn-Later-Trigger (Frust des Kunden) =======================
    try {
      const text = (message || "").toLowerCase();

      const difficultySignals = [
        "versteh ich nicht",
        "verstehe ich nicht",
        "versteh das nicht",
        "check ich nicht",
        "check das nicht",
        "hilft mir nicht",
        "bringt mir nichts",
        "funktioniert immer noch nicht",
        "funktioniert immernoch nicht",
        "geht immer noch nicht",
        "geht immernoch nicht",
        "ich blick da nicht durch",
        "ich blick nicht durch",
        "komm nicht klar",
        "komme nicht klar",
      ];

      const hasSignal = difficultySignals.some((s) => text.includes(s));

      if (hasSignal && sessionId) {
        const currentScore = (sessionDifficulty.get(sessionId) ?? 0) + 1;
        sessionDifficulty.set(sessionId, currentScore);

        // Ab 3 Frust-Signalen und nur einmal pro Session in learn_later.txt loggen
        if (currentScore >= 3 && !sessionAlreadyLogged.has(sessionId)) {
          logLearnLater({
            sessionId,
            topicTitle: sess.topicTitle || topicTitle || "",
            userMessage: message,
            aiReply: reply,
          });
          sessionAlreadyLogged.add(sessionId);
        }
      }
    } catch (err) {
      console.error("Fehler in der Learn-Later-Logik:", err);
    }

    // Antwort an Frontend
    return res.json({
      reply,
      answerCount: sess.answerCount,
      freeLimit: sess.freeLimit,
      webResults,
    });
  } catch (err) {
    console.error("Fehler in /api/chat:", err);
    return res.status(500).json({ error: "Serverfehler", details: String(err) });
  }
});

// ===== Serverstart ======================================================
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`🚀 Tech-AI läuft auf http://localhost:${port}`);
});
