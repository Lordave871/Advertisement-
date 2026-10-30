// Vercel serverless function: POST /api/generate
// Calls the Claude API and returns structured marketing content.

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-5-5";

const TONES = ["friendly", "professional", "luxury", "playful", "urgent"];
const LANGUAGES = {
  english: "clear Nigerian English",
  pidgin: "Nigerian Pidgin English (natural, not exaggerated)",
  mixed: "Nigerian English with light Pidgin flavour where it feels natural",
};
const PLATFORMS = ["Instagram", "Facebook", "TikTok", "X (Twitter)", "WhatsApp Status"];

function clean(value, max) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function validAccessCode(code) {
  const allowed = (process.env.ACCESS_CODES || "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
  if (allowed.length === 0) return true; // open access
  return allowed.includes(String(code || "").trim());
}

function buildPrompt(input) {
  const lang = LANGUAGES[input.language] || LANGUAGES.english;
  return `You are a marketing copywriter for small and medium businesses in Nigeria.
Write persuasive, honest, ready-to-post content for the business below.

BUSINESS
- Name: ${input.businessName}
- Type: ${input.businessType || "not specified"}
- Product or service: ${input.productName}
- Details: ${input.details || "not specified"}
- Price: ${input.price || "not specified"}
- Contact / WhatsApp: ${input.contact || "not specified"}
- Location: ${input.location || "not specified"}

STYLE
- Tone: ${input.tone}
- Language: ${lang}
- Main platform: ${input.platform}

RULES
- Use only facts given above. Do not invent discounts, awards, delivery times, or guarantees.
- Prices are in Naira; write them with the ₦ sign if a price is provided.
- Captions suit ${input.platform}: include emojis sparingly and end with a clear call to action.
- WhatsApp messages are short, personal, and mention how to order. Include the contact only if provided.
- Hashtags have no spaces and no # prefix in the JSON (the app adds it).

Respond with ONLY a JSON object, no markdown fences, in exactly this shape:
{
  "captions": ["caption 1", "caption 2", "caption 3"],
  "hashtags": ["tag1", "tag2", "tag3", "tag4", "tag5", "tag6", "tag7", "tag8"],
  "productDescription": "60 to 100 words",
  "whatsappMessages": ["message 1", "message 2", "message 3"],
  "promo": {
    "headline": "max 6 words",
    "tagline": "max 12 words",
    "cta": "max 5 words"
  }
}`;
}

function extractJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) throw new Error("No JSON in model output");
  return JSON.parse(text.slice(start, end + 1));
}

function normalise(data) {
  const arr = (v, n) => (Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean).slice(0, n) : []);
  const promo = data.promo || {};
  return {
    captions: arr(data.captions, 5),
    hashtags: arr(data.hashtags, 12).map((h) => h.replace(/^#+/, "").replace(/\s+/g, "")),
    productDescription: String(data.productDescription || ""),
    whatsappMessages: arr(data.whatsappMessages, 5),
    promo: {
      headline: String(promo.headline || ""),
      tagline: String(promo.tagline || ""),
      cta: String(promo.cta || ""),
    },
  };
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "Server is missing ANTHROPIC_API_KEY." });
  }

  const body = typeof req.body === "string" ? safeParse(req.body) : req.body || {};

  if (!validAccessCode(body.accessCode)) {
    return res.status(401).json({ error: "Invalid access code." });
  }

  const input = {
    businessName: clean(body.businessName, 80),
    businessType: clean(body.businessType, 80),
    productName: clean(body.productName, 120),
    details: clean(body.details, 600),
    price: clean(body.price, 40),
    contact: clean(body.contact, 40),
    location: clean(body.location, 80),
    tone: TONES.includes(body.tone) ? body.tone : "friendly",
    language: LANGUAGES[body.language] ? body.language : "english",
    platform: PLATFORMS.includes(body.platform) ? body.platform : "Instagram",
  };

  if (!input.businessName || !input.productName) {
    return res.status(400).json({ error: "Business name and product are required." });
  }

  try {
    const upstream = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1800,
        temperature: 0.8,
        messages: [{ role: "user", content: buildPrompt(input) }],
      }),
    });

    if (!upstream.ok) {
      const detail = await upstream.text();
      console.error("Anthropic API error", upstream.status, detail.slice(0, 500));
      const status = upstream.status === 429 ? 429 : 502;
      return res.status(status).json({
        error: status === 429 ? "Too many requests. Try again shortly." : "The AI service failed. Try again.",
      });
    }

    const payload = await upstream.json();
    const text = (payload.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");

    const result = normalise(extractJson(text));
    if (result.captions.length === 0) throw new Error("Empty result");
    return res.status(200).json(result);
  } catch (err) {
    console.error("generate failed:", err);
    return res.status(500).json({ error: "Could not generate content. Please try again." });
  }
};

function safeParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}

// Expose helpers for local testing.
module.exports._internal = { extractJson, normalise, buildPrompt, validAccessCode };
