import { supabase } from '../supabase.js';
import { esc, fmtNum, safeEdit, availableStock, setPending, clearPending, ack } from '../lib.js';
import {
  categoriesKeyboard,
  productListKeyboard,
  productKeyboard,
  mainMenu,
  homeRow,
} from '../keyboards.js';

function productText(p, stock) {
  const lines = [`🛒 <b>${esc(p.name)}</b>`, ''];
  if (p.description) lines.push(esc(p.description), '');
  lines.push(`💵 Price: <b>${fmtNum(p.price_usdt)} USDT</b>`);
  lines.push(`📦 In Stock: <b>${stock}</b>`);
  if (p.warranty_days) lines.push(`🛡️ Warranty: <b>${p.warranty_days} Days</b>`);
  const features = Array.isArray(p.features) ? p.features : [];
  if (features.length) {
    lines.push('');
    for (const f of features) lines.push(`✅ ${esc(f)}`);
  }
  return lines.join('\n');
}

export async function showCategories(ctx) {
  await ack(ctx);
  const { data: cats } = await supabase.from('categories').select('*').order('sort_order').order('name');
  const { data: products } = await supabase.from('products').select('category_id').eq('is_active', true);

  const countBy = {};
  for (const p of products || []) countBy[p.category_id] = (countBy[p.category_id] || 0) + 1;

  const text = '🛍️ <b>PRODUCT CATEGORIES</b>\nChoose a category or search.';
  await safeEdit(ctx, text, categoriesKeyboard(cats || [], countBy));
}

export async function showCategory(ctx, categoryId) {
  await ack(ctx);
  const { data: cat } = await supabase.from('categories').select('*').eq('id', categoryId).maybeSingle();
  const { data: products } = await supabase
    .from('products')
    .select('*')
    .eq('category_id', categoryId)
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  const title = `🛍️ <b>${esc(cat?.name || 'Products')}</b>\nChoose a product.`;
  const keyboard = (products || []).length
    ? productListKeyboard(products)
    : { inline_keyboard: [[{ text: '👈 Back', callback_data: 'm:categories' }], homeRow()] };

  await safeEdit(ctx, title, keyboard);
}

export async function showProduct(ctx, productId) {
  await ack(ctx);
  const { data: p } = await supabase.from('products').select('*').eq('id', productId).maybeSingle();
  if (!p) return ack(ctx, { text: 'Product not found', show_alert: true });
  const stock = await availableStock(p);
  await safeEdit(ctx, productText(p, stock), productKeyboard(p.id, stock));
}

async function listByFlag(ctx, title, field, count = 20) {
  await ack(ctx);
  const { data: products } = await supabase
    .from('products')
    .select('id, name, price_usdt')
    .eq('is_active', true)
    .eq(field, true)
    .order('created_at', { ascending: false })
    .limit(count);

  if (!products || !products.length) {
    return safeEdit(ctx, `${title}\n\nNothing here yet — check back soon! 🔜`, mainMenu());
  }
  await safeEdit(ctx, title, productListKeyboard(products));
}

export async function showTrending(ctx) {
  return listByFlag(ctx, '🔥 <b>TRENDING PRODUCTS</b>', 'is_trending');
}

export async function showNew(ctx) {
  return listByFlag(ctx, '🆕 <b>NEW PRODUCTS</b>', 'is_new');
}

export async function showAll(ctx) {
  await ack(ctx);
  const { data: products } = await supabase
    .from('products')
    .select('id, name, price_usdt')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(30);
  if (!products || !products.length) {
    return safeEdit(ctx, '🛍️ <b>All Products</b>\n\nNo products yet.', mainMenu());
  }
  await safeEdit(ctx, '🛍️ <b>ALL PRODUCTS</b>', productListKeyboard(products));
}

export async function startSearch(ctx) {
  await ack(ctx);
  await setPending(ctx.from.id, 'search');
  await safeEdit(ctx, '🔍 Type the product name you are looking for:', mainMenu());
}

export async function onSearchText(ctx) {
  const q = (ctx.message.text || '').trim();
  await clearPending(ctx.from.id);
  if (!q) return ctx.reply('Search cancelled.', { reply_markup: mainMenu() });

  const { data: products } = await supabase
    .from('products')
    .select('id, name, price_usdt')
    .eq('is_active', true)
    .ilike('name', `%${q}%`)
    .limit(20);

  if (!products || !products.length) {
    return ctx.reply(`🔍 No products found for "<b>${esc(q)}</b>".`, {
      parse_mode: 'HTML',
      reply_markup: mainMenu(),
    });
  }
  await ctx.reply(`🔍 Results for "<b>${esc(q)}</b>":`, {
    parse_mode: 'HTML',
    reply_markup: productListKeyboard(products),
  });
}
