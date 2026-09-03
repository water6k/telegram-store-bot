import { supabase } from '../supabase.js';
import { esc, safeEdit } from '../lib.js';
import { mainMenu } from '../keyboards.js';

export async function showWarranty(ctx, edit = true) {
  await ctx.answerCallbackQuery?.().catch(() => {});

  const { data: orders } = await supabase
    .from('orders')
    .select('id, product_name, delivered_at, status, products(warranty_days)')
    .eq('user_id', ctx.from.id)
    .eq('status', 'delivered')
    .order('delivered_at', { ascending: false })
    .limit(20);

  const covered = (orders || []).filter((o) => Number(o.products?.warranty_days || 0) > 0);

  const empty = '🛡️ <b>WARRANTY</b>\n\nYou have no active warranties right now.\nWarranty coverage starts when an order is delivered.';
  if (!covered.length) {
    if (edit) return safeEdit(ctx, empty, mainMenu());
    return ctx.reply(empty, { parse_mode: 'HTML', reply_markup: mainMenu() });
  }

  const now = Date.now();
  const lines = ['🛡️ <b>WARRANTY STATUS</b>', ''];
  for (const o of covered) {
    const start = new Date(o.delivered_at).getTime();
    const daysTotal = Number(o.products?.warranty_days || 0);
    const remaining = Math.max(0, Math.ceil(daysTotal - (now - start) / 86400000));
    lines.push(`• ${esc(o.product_name)} — <b>${remaining}/${daysTotal} days left</b>`);
  }
  lines.push('', 'Need a warranty claim? Open a 🎫 Support ticket and select "Order Problem".');

  const text = lines.join('\n');
  if (edit) return safeEdit(ctx, text, mainMenu());
  return ctx.reply(text, { parse_mode: 'HTML', reply_markup: mainMenu() });
}
