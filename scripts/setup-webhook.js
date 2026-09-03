/**
 * Point your Telegram bot at your Vercel webhook endpoint.
 *
 * Usage (Node 20.6+):
 *   1. copy .env.example to .env and fill it in (set VERCEL_URL)
 *   2. npm run setup-webhook
 *
 * Or directly:
 *   BOT_TOKEN=... node scripts/setup-webhook.js https://your-app.vercel.app
 */

const token = process.env.BOT_TOKEN;
const base = process.env.VERCEL_URL || process.argv[2];

if (!token) {
  console.error('ERROR: BOT_TOKEN is not set. Copy .env.example to .env and fill it in.');
  process.exit(1);
}
if (!base) {
  console.error('ERROR: VERCEL_URL is not set (or pass it as an argument).');
  process.exit(1);
}

const webhookUrl = `${String(base).replace(/\/$/, '')}/api/webhook`;

const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    url: webhookUrl,
    drop_pending_updates: false,
    allowed_updates: ['message', 'callback_query'],
  }),
});

const data = await res.json();
console.log('Setting webhook to:', webhookUrl);
console.log(JSON.stringify(data, null, 2));

if (data.ok) {
  console.log('\n✅ Webhook set successfully.');
} else {
  console.error('\n❌ Failed to set webhook. Check your BOT_TOKEN and that the Vercel app is deployed.');
}
