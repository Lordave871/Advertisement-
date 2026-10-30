# Naija Content Studio

A web app for Nigerian small businesses. The customer types their business name and product, and the app writes:

- Three captions for Instagram, Facebook, TikTok, X or WhatsApp Status
- Hashtags
- A product description
- Three WhatsApp sales messages, each with a "Send on WhatsApp" button
- A promo image they can download or share, with their own product photo, price sticker and contact details

Tone (friendly, professional, luxury, playful, urgent) and language (English, Pidgin, or English with Pidgin) are selectable.

## How it works

| Part | File | What it does |
| --- | --- | --- |
| Website | `public/index.html`, `styles.css`, `app.js` | The form and results page. Works on phones first. |
| Promo image | `public/poster.js` | Draws the image in the browser. No image API and no extra cost. |
| Backend | `api/generate.js` | Calls the Claude API. Your API key stays on the server. |
| Access control | `api/config.js` | Tells the page whether an access code is required. |

## Deploy to Vercel

You need three things: a Vercel account, a GitHub account, and an Anthropic API key from https://console.anthropic.com.

### Option A: GitHub (easiest to keep updating)

1. Create a new GitHub repository and upload everything in this folder to it.
2. Go to https://vercel.com/new and import that repository.
3. Leave the build settings as they are. Vercel reads `vercel.json`.
4. Open **Environment Variables** and add:
   - `ANTHROPIC_API_KEY` = your key
   - `ACCESS_CODES` = optional, see "Charging customers" below
5. Tap **Deploy**. In about a minute you get a link like `your-project.vercel.app`.

### Option B: Vercel CLI (from a laptop)

```bash
npm i -g vercel
cd naija-content-studio
vercel            # first deploy, answer the prompts
vercel env add ANTHROPIC_API_KEY
vercel --prod
```

If you add or change environment variables later, redeploy for them to take effect.

## Run it on your computer first

```bash
npm i -g vercel
cp .env.example .env.local     # then paste your API key into .env.local
vercel dev
```

Open http://localhost:3000.

Run the backend tests (no API key needed, the Claude API is mocked):

```bash
npm test
```

## Charging customers

The app has no payment system built in. The simplest way to start earning from it:

1. Set `ACCESS_CODES` to a comma-separated list, for example `ADE-4821,CHIOMA-7710`.
2. Customers pay you by bank transfer or Paystack/Flutterwave payment link.
3. You send them a code. They enter it once and the page remembers it on their phone.
4. To stop someone, remove their code from `ACCESS_CODES` and redeploy.

When you outgrow this, add a database and Paystack webhooks so credits are issued and counted automatically.

## Costs and limits

- Each generation is one Claude API call. The default model, `claude-haiku-5-5`, is the cheapest. Set `ANTHROPIC_MODEL=claude-sonnet-5-5` for richer writing.
- Without `ACCESS_CODES`, anyone with the link can use your API key and spend your credit. Set access codes before you share the link publicly, and set a monthly spend limit in the Anthropic console.
- Vercel's free Hobby plan is for non-commercial use. If you charge customers, check Vercel's current terms and consider the Pro plan.

## Customising

- Change the colours and fonts in `public/styles.css` (the `:root` block).
- Change the poster colour sets and layout in `public/poster.js`.
- Change what the AI writes by editing the prompt in `buildPrompt()` in `api/generate.js`.
