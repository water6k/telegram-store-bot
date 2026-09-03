# 🛍️ Telegram Store Bot (Softools-style)

A complete, self-hosted Telegram store bot — categories, product pages, USDT/UPI checkout,
orders, warranty, referral program, and a support ticket system — just like the reference
store in your screenshots. Runs **24/7 for free** on Vercel + Supabase.

## Features

- 👋 Welcome + main menu (Trending, New Products, All Products, My Orders, Refer & Win, Warranty, Support)
- 📁 Product categories with live item counts + 🔍 search
- 🛒 Product pages: USDT (Binance) + ₹ (UPI) price, stock, warranty days, feature checklist
- 💳 Checkout in **USDT** or **UPI** → payment reference → admin verification → **instant delivery**
- 🔑 Serial-key auto delivery (one key per order, atomic stock claiming)
- 📦 Order tracking with statuses
- 🎁 Refer & Win (earn % of referred purchases as USDT credit + withdrawal requests)
- 🛡️ Warranty status per delivered order
- 🎫 Support tickets (Payment / Order / Account / Other) with two-way chat
- 🛠️ Admin panel: approve/reject orders, add/edit/delete products & keys, manage categories, change store settings (USDT address, store name, referral %, etc.), reply to tickets, broadcast

---

## Architecture (why 24/7 is free)

| Piece | Role | Free tier |
|-------|------|-----------|
| **Vercel** | Hosts the bot as a serverless webhook (no always-on server needed) | ✅ Hobby |
| **Supabase** | Postgres database (users, products, orders, tickets) | ✅ Free |
| **Telegram Bot API** | Delivers updates to Vercel via webhook | ✅ Free |

Telegram *pushes* every message/button tap to your Vercel endpoint, so the bot answers
instantly whenever someone interacts — no 24/7 process to keep alive. A daily Vercel cron
auto-expires abandoned orders.

---

## Prerequisites

1. A **Telegram account**.
2. **Node.js 20.6+** installed locally (only for one-time setup commands).
3. Free accounts on **Vercel** and **Supabase** (GitHub login works for both).
4. `git` (optional, for deploying from a repo).

---

## Step 1 — Create the Telegram bot

1. Open Telegram → search **@BotFather** → press `/newbot`.
2. Pick a name (e.g. `My Store`) and a username ending in `bot` (e.g. `mystore_bot`).
3. BotFather replies with your **HTTP API token** — save it (this is `BOT_TOKEN`).
4. Set the menu commands — send this to BotFather (replace `mystore_bot`):

```
/setcommands
mystore_bot
start - 🏠 Start the store
menu - Open main menu
categories - Browse categories
search - Search products
myorders - 📦 My orders
referral - 🎁 Refer & Win
warranty - 🛡️ Warranty
support - 🎫 Support
admin - 🛠️ Admin panel (admins only)
cancel - Cancel current action
```

5. 📌 Get **your own Telegram user ID** (you are the admin): message **@userinfobot** → it
   returns "Id: 123456789". That number is your `ADMIN_TELEGRAM_ID`.

---

## Step 2 — Set up Supabase (database)

1. Go to https://supabase.com → **New project** → pick a name + strong password → create.
2. Open **SQL Editor → New query**, paste the **entire contents of `supabase/schema.sql`**, Run.
   - Before running, edit the seeded values at the bottom:
     - `usdt_address` → your USDT (TRC20) wallet address
     - `upi_id` / `upi_name` → your UPI ID
     - `store_name` / `welcome_text`
     - `referral_percent`
3. In **Project Settings → API**, copy:
   - **Project URL** → this is `SUPABASE_URL`
   - **service_role** key → this is `SUPABASE_SERVICE_ROLE_KEY`
     (⚠️ service_role bypasses all security — it stays server-side only, never in the bot chat.)

---

## Step 3 — Deploy to Vercel

### Option A — Deploy from a GitHub repo (recommended)

1. Push this folder to a GitHub repo.
2. Vercel → **Add New → Project** → import the repo (root is the `telegram-store-bot` folder).
3. Framework preset: **Other**. Build command: none (just `npm install` happens automatically
   from `package.json`).
4. Add the **Environment Variables** below.

### Option B — Deploy from CLI

```bash
npm install -g vercel
cd telegram-store-bot
vercel          # first time: login + create project
```

### Environment variables (set in Vercel → Settings → Environment Variables)

| Name | Value |
|------|-------|
| `BOT_TOKEN` | your BotFather token |
| `BOT_USERNAME` | your bot username (without @) |
| `SUPABASE_URL` | your Supabase Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | your Supabase service_role key |
| `ADMIN_TELEGRAM_ID` | your Telegram user id (comma-separate multiple admins) |
| `CRON_SECRET` | any long random string |

---

## Step 4 — Point Telegram at your bot

1. After Vercel finishes, copy your app URL (e.g. `https://my-store.vercel.app`).
2. Locally:

```bash
cd telegram-store-bot
cp .env.example .env        # fill in BOT_TOKEN, VERCEL_URL=https://my-store.vercel.app
npm install
npm run setup-webhook
```

You should see `"ok": true`. Your bot is now live.

> Alternatively run this one-liner (replace values):
> ```bash
> curl "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=https://my-store.vercel.app/api/webhook"
> ```

3. Open your bot in Telegram and send `/start`. 🎉

---

## Step 5 — Add your products

Option A — **Admin panel in Telegram**: send `/admin` to the bot, then:
- ➕ **Add Product** → walks you through name → description → USDT price → INR price → warranty → category.
- 🔑 **Add Keys** → paste your serials/accounts (one per line) so each order delivers one automatically.

Option B — **Supabase Dashboard**: edit the `products`, `categories` and `product_keys`
tables directly (set `is_trending`, `is_new`, `features` (JSON array), etc.).

For products that *don't* use serial keys (e.g. a manual activation service), leave
`product_keys` empty and put instructions in the `delivery_instructions` column — that text
is what gets delivered to the buyer.

---

## Payment setup (IMPORTANT)

This bot uses a **manual-verification** flow (zero fees, works immediately):

1. Buyer picks USDT/UPI and is shown **your** wallet address / UPI ID.
2. Buyer pays and sends back their **TXID / UTR**.
3. You (admin) get an inline "✅ Approve & Deliver / ❌ Reject" message, verify the payment,
   and tap Approve → the key/credentials are delivered to the buyer automatically.

**For fully automatic crypto confirmation** (no manual check), connect a payment gateway to
the same webhook style. Recommended options:
- **Cryptomus** (~1% fee) — USDT/TRC20/ERC20/BEP20, sends a webhook when paid; you'd map its
  webhook to a new `/api/payment-gateway` endpoint that calls the same deliver logic.
- **NowPayments** / **CoinPayments** — same idea.
- **Telegram Payments (Stars)** — native, but currency/withdrawal rules differ from USDT.

For auto-UPI, Indian gateways (Razorpay / Cashfree / Paytm) require business KYC. Manual UPI
with UTR verification is the standard zero-fee approach for small digital-vendor stores (and is
exactly what the reference store does).

---

## Going live & what to watch

- **Set the bot's picture / description / about** in BotFather for a professional look.
- **Test a full order end-to-end** with your own account before promoting it.
- **Free-tier limits:** Supabase free projects pause after ~7 days with no *database* activity
  (reactivate from the dashboard; data is never lost). Your workaround is built-in: the daily
  Vercel cron writes a heartbeat row to the `settings` table every day, which counts as DB
  activity and keeps the project from pausing. Vercel Hobby allows cron jobs once/day only —
  this build uses exactly one, so it's within every free limit. ~100GB bandwidth and 60s
  function timeout are far more than a store bot needs.
- **Multiple admins:** put comma-separated IDs in the `admin_ids` setting **or** `ADMIN_TELEGRAM_ID`.
- **Store name / prices / addresses:** edit the `settings` table anytime (cached up to 60s).

---

## Project structure

```
telegram-store-bot/
├── api/
│   ├── webhook.js        # Telegram webhook entry (serverless)
│   └── cron.js           # daily order-expiry cleanup
├── src/
│   ├── bot.js            # bot wiring + commands
│   ├── callbacks.js      # inline-button router
│   ├── config.js         # env config
│   ├── supabase.js       # Supabase client + settings cache
│   ├── lib.js            # shared helpers
│   ├── keyboards.js      # inline keyboards
│   └── handlers/
│       ├── start.js      # welcome + referral onboarding
│       ├── catalog.js    # categories / products / search
│       ├── checkout.js   # buy → pay → verify → deliver
│       ├── referral.js   # refer & win + withdrawals
│       ├── warranty.js   # warranty status
│       ├── support.js    # tickets
│       ├── admin.js      # admin panel
│       └── text.js       # free-text message router
├── supabase/schema.sql   # full DB schema + seed
├── scripts/
│   ├── setup-webhook.js
│   └── seed.js           # optional demo products
├── vercel.json
├── package.json
└── .env.example
```

Happy selling! 🚀
