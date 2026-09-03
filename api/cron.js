import { supabase } from '../src/supabase.js';

// Daily cleanup: expire orders stuck in "awaiting_payment" for over 24h
export default async function handler(req, res) {
  if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    res.statusCode = 401;
    res.end('unauthorized');
    return;
  }

  const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  const { data: expired } = await supabase
    .from('orders')
    .select('id')
    .eq('status', 'awaiting_payment')
    .lt('created_at', cutoff);

  for (const o of expired || []) {
    await supabase.from('orders').update({ status: 'expired' }).eq('id', o.id);
    await supabase.from('order_events').insert({ order_id: o.id, status: 'expired', note: 'Auto-expired after 24h' });
  }

  // Heartbeat: a real DB write so the Supabase Free project never gets paused
  // for inactivity (Free projects pause after ~7 days with no DB activity).
  await supabase.from('settings').upsert({
    key: 'last_cron_heartbeat',
    value: new Date().toISOString(),
  });

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ expired: (expired || []).length, heartbeat: true }));
}
