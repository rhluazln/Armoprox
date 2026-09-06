/**
 * ArmoProx backend
 * ------------------------------------------------------------
 * - Fetches a source VPN subscription link
 * - Base64-decodes it and validates vmess/vless/trojan/ss lines
 * - Stores the merged config list under a new UUID
 * - Serves it back, re-encoded as base64, at GET /sub/:id
 *
 * Requires Node.js 18+ (uses global fetch and crypto.randomUUID).
 */

const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, "data.json");

const CONFIG_PREFIXES = ["vmess://", "vless://", "trojan://", "ss://"];
const FETCH_TIMEOUT_MS = 15000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ---------- Tiny JSON file "database" ----------
function loadDB() {
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
  } catch {
    return {};
  }
}

function saveDB(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf-8");
}

// ---------- Subscription parsing helpers ----------
function decodeSubscriptionContent(raw) {
  const trimmed = raw.trim();

  // Many subscription servers return base64-encoded content.
  // Some return plain-text config lists directly. Handle both.
  try {
    const asText = Buffer.from(trimmed, "base64").toString("utf-8");
    if (CONFIG_PREFIXES.some((p) => asText.includes(p))) {
      return asText;
    }
  } catch {
    // fall through to raw text
  }

  return trimmed;
}

function extractConfigs(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => CONFIG_PREFIXES.some((p) => line.startsWith(p)));
}

function countByProtocol(configs) {
  return configs.reduce((acc, line) => {
    const proto = CONFIG_PREFIXES.find((p) => line.startsWith(p)).replace("://", "");
    acc[proto] = (acc[proto] || 0) + 1;
    return acc;
  }, {});
}

// ---------- Routes ----------
app.post("/api/generate", async (req, res) => {
  const { url } = req.body || {};

  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "آدرس ساب‌لینک نامعتبر است." });
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      throw new Error("invalid protocol");
    }
  } catch {
    return res.status(400).json({ error: "آدرس وارد شده یک URL معتبر نیست." });
  }

  let response;
  try {
    response = await fetch(parsedUrl.toString(), {
      headers: { "User-Agent": "v2rayN/6.23 ArmoProx/1.0" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch {
    return res.status(502).json({
      error: "دسترسی به سرور ساب‌لینک اصلی ممکن نشد. آدرس یا اتصال شبکه رو بررسی کن.",
    });
  }

  if (!response.ok) {
    return res.status(502).json({
      error: `سرور مبدا با خطا پاسخ داد (کد ${response.status}).`,
    });
  }

  const rawText = await response.text();
  const decoded = decodeSubscriptionContent(rawText);
  const configs = extractConfigs(decoded);

  if (configs.length === 0) {
    return res.status(422).json({
      error: "هیچ کانفیگ معتبری (vmess, vless, trojan, ss) در این لینک پیدا نشد.",
    });
  }

  const id = crypto.randomUUID();
  const db = loadDB();
  db[id] = {
    configs,
    createdAt: new Date().toISOString(),
    sourceUrl: parsedUrl.toString(),
  };
  saveDB(db);

  const subUrl = `${req.protocol}://${req.get("host")}/sub/${id}`;

  res.json({
    id,
    subUrl,
    count: configs.length,
    counts: countByProtocol(configs),
  });
});

app.get("/sub/:id", (req, res) => {
  const db = loadDB();
  const entry = db[req.params.id];

  if (!entry) {
    return res.status(404).type("text/plain").send("لینک یافت نشد یا حذف شده است.");
  }

  const merged = entry.configs.join("\n");
  const encoded = Buffer.from(merged, "utf-8").toString("base64");
  res.type("text/plain; charset=utf-8").send(encoded);
});

app.listen(PORT, () => {
  console.log(`ArmoProx در حال اجرا روی http://localhost:${PORT}`);
});
