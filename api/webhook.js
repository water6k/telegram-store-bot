import { bot } from '../src/bot.js';

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method === 'GET') {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/plain');
    res.end('Telegram store bot is running');
    return;
  }

  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.end('Method not allowed');
    return;
  }

  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks);
    if (raw.length === 0) {
      res.statusCode = 400;
      res.end();
      return;
    }
    const update = JSON.parse(raw.toString('utf-8'));

    // Load bot info once per cold start (cached after the first call)
    await bot.init();
    await bot.handleUpdate(update);

    res.statusCode = 200;
    res.end('ok');
  } catch (err) {
    console.error('[WEBHOOK ERROR]', err);
    res.statusCode = 200; // always 200 so Telegram doesn't retry forever
    res.end();
  }
}
