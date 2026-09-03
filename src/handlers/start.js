import { supabase, getSettings } from '../supabase.js';
import { getOrCreateUser, esc } from '../lib.js';
import { mainMenu } from '../keyboards.js';

export async function onStart(ctx) {
  const ref = (ctx.match || '').trim().toUpperCase();
  const user = await getOrCreateUser(ctx);

  if (ref && user) {
    const { data: referrer } = await supabase
      .from('users')
      .select('telegram_id')
      .eq('referral_code', ref)
      .maybeSingle();

    if (referrer && referrer.telegram_id !== user.telegram_id && !user.referred_by) {
      await supabase.from('users').update({ referred_by: referrer.telegram_id }).eq('telegram_id', user.telegram_id);
      await supabase.from('referrals').insert({
        referrer_id: referrer.telegram_id,
        referred_id: user.telegram_id,
        reward_usdt: 0,
        status: 'pending',
      });
    }
  }

  const settings = await getSettings();
  const storeName = settings.store_name || 'Your Store';
  const firstName = ctx.from?.first_name ?? 'there';

  const text = [
    `👋 Welcome to <b>${esc(storeName)}</b>!`,
    '',
    `Hey <b>${esc(firstName)}</b>! 👋`,
    '',
    esc(settings.welcome_text || 'Buy premium digital products at the best prices — fast, secure, and simple.'),
    '',
    '💼 <b>Products</b> — Browse & buy',
    '📦 <b>My Orders</b> — Track purchases',
    '🎁 <b>Refer & Win</b> — Earn rewards',
    '🛡️ <b>Warranty</b> — Check coverage',
    '🆘 <b>Support</b> — Get help',
    '',
    'Choose an option below 👇',
  ].join('\n');

  await ctx.reply(text, {
    parse_mode: 'HTML',
    reply_markup: mainMenu(),
    link_preview_options: { is_disabled: true },
  });
}
