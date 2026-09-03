/**
 * Optional: seed a few sample products into the first category so you can test.
 * Usage: npm install && npm run seed
 */
import { supabase } from '../src/supabase.js';
import { config } from '../src/config.js';

if (!process.env.BOT_TOKEN && !config.botToken) {
  throw new Error('Missing BOT_TOKEN');
}

const { data: cat } = await supabase.from('categories').select('id').order('sort_order').limit(1).maybeSingle();
const categoryId = cat?.id;

const samples = [
  {
    name: 'Napkin AI — 1 Month Pro',
    description: 'Premium Napkin AI subscription with full export features.',
    price_usdt: 1.5,
    price_inr: 150,
    warranty_days: 20,
    is_trending: true,
    is_new: true,
    features: [
      '10,000 AI Credits/month',
      'Unlimited PPT & SVG Export',
      '3 Brand Styles',
      'Bold Icons',
      'Remove Branding',
    ],
  },
  {
    name: 'YouTube Premium — 3 Months',
    description: 'Works on your own Google account.',
    price_usdt: 3,
    price_inr: 299,
    warranty_days: 90,
    is_new: true,
    features: ['Ad-free', 'Background play', 'Official activation'],
  },
];

for (const s of samples) {
  const { data: p, error } = await supabase
    .from('products')
    .insert({ ...s, category_id: categoryId, stock: 0, is_active: true })
    .select()
    .single();

  if (error) {
    console.error('Failed to insert', s.name, error.message);
    continue;
  }

  // Add a couple of dummy keys so "in stock" and instant delivery work
  await supabase.from('product_keys').insert([
    { product_id: p.id, key_text: `DEMO-KEY-${p.id.slice(0, 6)}-001` },
    { product_id: p.id, key_text: `DEMO-KEY-${p.id.slice(0, 6)}-002` },
  ]);

  console.log('✅ Seeded:', s.name);
}

console.log('\nDone. Remove or ignore this script in production.');
