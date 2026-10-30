// Run with: node test/handler.test.js
// Mocks the Claude API so no key or network is needed.
const assert = require("node:assert/strict");
const handler = require("../api/generate.js");
const config = require("../api/config.js");

function makeRes() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(k, v) { this.headers[k] = v; },
    status(code) { this.statusCode = code; return this; },
    json(obj) { this.body = obj; return this; },
  };
}

const validBody = {
  businessName: "Ade's Fabrics",
  productName: "Ankara two-piece set",
  details: "Sizes 8 to 20, made to order",
  price: "₦15,000",
  contact: "0803 000 0000",
  tone: "friendly",
  language: "pidgin",
  platform: "Instagram",
};

const goodJson = {
  captions: ["One", "Two", "Three"],
  hashtags: ["#AnkaraStyle", "Lagos Fashion"],
  productDescription: "A lovely set.",
  whatsappMessages: ["Hello!", "Hi!", "Hey!"],
  promo: { headline: "Fresh Ankara", tagline: "Made to fit you", cta: "Order now" },
};

function mockFetch(responder) {
  const calls = [];
  global.fetch = async (url, opts) => {
    calls.push({ url, opts });
    return responder(url, opts);
  };
  return calls;
}

function okResponse(text) {
  return { ok: true, status: 200, json: async () => ({ content: [{ type: "text", text }] }), text: async () => text };
}

async function run(name, fn) {
  const savedKey = process.env.ANTHROPIC_API_KEY;
  const savedCodes = process.env.ACCESS_CODES;
  process.env.ANTHROPIC_API_KEY = "test-key";
  delete process.env.ACCESS_CODES;
  try {
    await fn();
    console.log("ok   " + name);
  } catch (err) {
    console.error("FAIL " + name + "\n" + (err.stack || err));
    process.exitCode = 1;
  } finally {
    if (savedKey === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = savedKey;
    if (savedCodes === undefined) delete process.env.ACCESS_CODES; else process.env.ACCESS_CODES = savedCodes;
  }
}

(async () => {
  await run("rejects non-POST", async () => {
    const res = makeRes();
    await handler({ method: "GET" }, res);
    assert.equal(res.statusCode, 405);
  });

  await run("fails clearly when the API key is missing", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const res = makeRes();
    await handler({ method: "POST", body: validBody }, res);
    assert.equal(res.statusCode, 500);
    assert.match(res.body.error, /ANTHROPIC_API_KEY/);
  });

  await run("requires business name and product", async () => {
    const res = makeRes();
    await handler({ method: "POST", body: { businessName: "", productName: "x" } }, res);
    assert.equal(res.statusCode, 400);
  });

  await run("returns normalised content and sends the right request", async () => {
    const calls = mockFetch(() => okResponse(JSON.stringify(goodJson)));
    const res = makeRes();
    await handler({ method: "POST", body: validBody }, res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body.captions, ["One", "Two", "Three"]);
    assert.deepEqual(res.body.hashtags, ["AnkaraStyle", "LagosFashion"]);
    assert.equal(res.body.promo.cta, "Order now");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://api.anthropic.com/v1/messages");
    assert.equal(calls[0].opts.headers["x-api-key"], "test-key");
    const sent = JSON.parse(calls[0].opts.body);
    assert.equal(sent.model, "claude-haiku-5-5");
    assert.match(sent.messages[0].content, /Ade's Fabrics/);
    assert.match(sent.messages[0].content, /Nigerian Pidgin/);
  });

  await run("accepts JSON wrapped in markdown fences", async () => {
    mockFetch(() => okResponse("```json\n" + JSON.stringify(goodJson) + "\n```"));
    const res = makeRes();
    await handler({ method: "POST", body: validBody }, res);
    assert.equal(res.statusCode, 200);
  });

  await run("accepts a string body", async () => {
    mockFetch(() => okResponse(JSON.stringify(goodJson)));
    const res = makeRes();
    await handler({ method: "POST", body: JSON.stringify(validBody) }, res);
    assert.equal(res.statusCode, 200);
  });

  await run("ignores unknown tone, language and platform values", async () => {
    const calls = mockFetch(() => okResponse(JSON.stringify(goodJson)));
    const res = makeRes();
    await handler({ method: "POST", body: { ...validBody, tone: "evil", language: "klingon", platform: "MySpace" } }, res);
    assert.equal(res.statusCode, 200);
    const prompt = JSON.parse(calls[0].opts.body).messages[0].content;
    assert.match(prompt, /Tone: friendly/);
    assert.match(prompt, /Main platform: Instagram/);
  });

  await run("returns 502 when the Claude API fails", async () => {
    mockFetch(() => ({ ok: false, status: 500, text: async () => "boom" }));
    const res = makeRes();
    await handler({ method: "POST", body: validBody }, res);
    assert.equal(res.statusCode, 502);
  });

  await run("passes rate limits through as 429", async () => {
    mockFetch(() => ({ ok: false, status: 429, text: async () => "slow down" }));
    const res = makeRes();
    await handler({ method: "POST", body: validBody }, res);
    assert.equal(res.statusCode, 429);
  });

  await run("returns 500 when the model output is not JSON", async () => {
    mockFetch(() => okResponse("Sorry, I cannot help with that."));
    const res = makeRes();
    await handler({ method: "POST", body: validBody }, res);
    assert.equal(res.statusCode, 500);
  });

  await run("enforces access codes when ACCESS_CODES is set", async () => {
    process.env.ACCESS_CODES = "ADE-1, CHI-2";
    mockFetch(() => okResponse(JSON.stringify(goodJson)));

    let res = makeRes();
    await handler({ method: "POST", body: validBody }, res);
    assert.equal(res.statusCode, 401);

    res = makeRes();
    await handler({ method: "POST", body: { ...validBody, accessCode: "nope" } }, res);
    assert.equal(res.statusCode, 401);

    res = makeRes();
    await handler({ method: "POST", body: { ...validBody, accessCode: "CHI-2" } }, res);
    assert.equal(res.statusCode, 200);
  });

  await run("config reports whether a code is required", async () => {
    let res = makeRes();
    config({ method: "GET" }, res);
    assert.equal(res.body.requiresAccessCode, false);

    process.env.ACCESS_CODES = "ADE-1";
    res = makeRes();
    config({ method: "GET" }, res);
    assert.equal(res.body.requiresAccessCode, true);
  });
})();
