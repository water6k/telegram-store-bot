import { supabase, getSettings } from './supabase.js';
import { config } from './config.js';

export const esc = (s = '') =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

export function fmtNum(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return '0';
  if (Number.isInteger(num)) return String(num);
  return num.toFixed(2).replace(/\.?0+$/, '');
}

export function shortId(id = '') {
  return String(id).split('-')[0].slice(0, 8).toUpperCase();
}

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

async function genReferralCode() {
  for (let i = 0; i < 10; i++) {
    const code = Array.from({ length: 6 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');
    const { data } = await supabase.from('users').select('telegram_id').eq('referral_code', code).maybeSingle();
    if (!data) return code;
  }
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export async function getOrCreateUser(ctx) {
  const tg = ctx.from;
  if (!tg) return null;
  const { data } = await supabase.from('users').select('*').eq('telegram_id', tg.id).maybeSingle();
  if (data) return data;
  const code = await genReferralCode();
  const user = {
    telegram_id: tg.id,
    username: tg.username ?? null,
    first_name: tg.first_name ?? null,
    last_name: tg.last_name ?? null,
    referral_code: code,
  };
  await supabase.from('users').insert(user);
  return user;
}

export async function isAdmin(telegramId) {
  if (config.adminIds.includes(telegramId)) return true;
  const settings = await getSettings();
  const ids = (settings.admin_ids || '')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter(Boolean);
  return ids.includes(telegramId);
}

export async function getAdminIds() {
  const settings = await getSettings();
  const dbIds = (settings.admin_ids || '').split(',').map((s) => Number(s.trim())).filter(Boolean);
  return [...new Set([...config.adminIds, ...dbIds])];
}

export async function notifyAdmins(ctx, text, keyboard) {
  const ids = await getAdminIds();
  for (const id of ids) {
    try {
      await ctx.api.sendMessage(id, text, {
        parse_mode: 'HTML',
        reply_markup: keyboard,
        link_preview_options: { is_disabled: true },
      });
    } catch (e) {
      // admin probably blocked the bot — ignore
    }
  }
}

export async function announceToChannel(ctx, text) {
  const settings = await getSettings();
  const channel = (settings.order_channel || '').trim();
  if (!channel) return;
  try {
    await ctx.api.sendMessage(channel, text, {
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
    });
  } catch (e) {
    // bot probably isn't an admin of the channel — ignore silently
  }
}

export async function safeEdit(ctx, text, keyboard) {
  try {
    await ctx.editMessageText(text, {
      parse_mode: 'HTML',
      reply_markup: keyboard,
      link_preview_options: { is_disabled: true },
    });
  } catch (e) {
    try {
      await ctx.reply(text, {
        parse_mode: 'HTML',
        reply_markup: keyboard,
        link_preview_options: { is_disabled: true },
      });
    } catch {}
  }
}

export async function ack(ctx, opts) {
  if (!ctx.callbackQuery) return;
  try {
    await ctx.answerCallbackQuery(opts);
  } catch {}
}

export async function setPending(telegramId, state, context = {}) {
  await supabase.from('pending_inputs').upsert({
    telegram_id: telegramId,
    state,
    context,
    updated_at: new Date().toISOString(),
  });
}

export async function getPending(telegramId) {
  const { data } = await supabase
    .from('pending_inputs')
    .select('*')
    .eq('telegram_id', telegramId)
    .maybeSingle();
  return data;
}

export async function clearPending(telegramId) {
  await supabase.from('pending_inputs').delete().eq('telegram_id', telegramId);
}

// Stock = unsold keys when keys exist, otherwise manual products.stock counter
export async function availableStock(product) {
  if (!product) return 0;
  const { count: unsold } = await supabase
    .from('product_keys')
    .select('id', { count: 'exact', head: true })
    .eq('product_id', product.id)
    .eq('is_sold', false);
  const { count: total } = await supabase
    .from('product_keys')
    .select('id', { count: 'exact', head: true })
    .eq('product_id', product.id);
  if (total > 0) return unsold ?? 0;
  return Number(product.stock) || 0;
}

export async function hasKeys(product) {
  const { count } = await supabase
    .from('product_keys')
    .select('id', { count: 'exact', head: true })
    .eq('product_id', product.id);
  return (count || 0) > 0;
}

export const STATUS = {
  awaiting_payment: '🕓 Awaiting payment',
  payment_submitted: '⏳ Payment submitted',
  paid: '✅ Paid',
  delivered: '📦 Delivered',
  rejected: '❌ Rejected',
  cancelled: '🚫 Cancelled',
  expired: '⏰ Expired',
};

export function statusLabel(s) {
  return STATUS[s] || s || '…';
}
