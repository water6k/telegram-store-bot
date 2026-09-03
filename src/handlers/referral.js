import { supabase, getSettings } from '../supabase.js';
import { getOrCreateUser, esc, fmtNum, safeEdit, setPending, clearPending, notifyAdmins } from '../lib.js';
import { mainMenu, homeRow } from '../keyboards.js';

async function referralLink(user) {
  const settings = await getSettings();
  const username = process.env.BOT_USERNAME || settings.bot_username;
  if (username) return `https://t.me/${username}?start=${user.referral_code}`;
  return null;
}

export async function showReferral(ctx, edit = true) {
  await getOrCreateUser(ctx);
  await ctx.answerCallbackQuery?.().catch(() => {});

  const { data: user } = await supabase.from('users').select('*').eq('telegram_id', ctx.from.id).maybeSingle();
  if (!user) return;

  const { count: referredCount } = await supabase
    .from('referrals')
    .select('id', { count: 'exact', head: true })
    .eq('referrer_id', user.telegram_id);

  const settings = await getSettings();
  const pct = settings.referral_percent || 5;
  const link = await referralLink(user);

  const lines = [
    '🎁 <b>REFER & WIN</b>',
    '',
    `Invite friends and earn <b>${esc(pct)}%</b> of their purchases as USDT credit. 🤑`,
    '',
    `🔗 Referral link${link ? ':' : ' (share your code):'}`,
  ];
  if (link) lines.push(esc(link));
  lines.push(`👥 Your code: <code>${esc(user.referral_code)}</code>`);
  lines.push('');
  lines.push(`👛 Wallet balance: <b>${fmtNum(user.balance_usdt)} USDT</b>`);
  lines.push(`👥 Referred friends: <b>${referredCount || 0}</b>`);
  lines.push('');
  lines.push('To withdraw your earnings, tap the button below and send the amount you want to withdraw.');

  const keyboard = {
    inline_keyboard: [
      [{ text: '💸 Request Withdrawal', callback_data: 'withdraw' }],
      [{ text: '🏠 Main Menu', callback_data: 'm:home' }],
    ],
  };

  if (edit) await safeEdit(ctx, lines.join('\n'), keyboard);
  else await ctx.reply(lines.join('\n'), { parse_mode: 'HTML', reply_markup: keyboard, link_preview_options: { is_disabled: true } });
}

export async function startWithdraw(ctx) {
  await ctx.answerCallbackQuery().catch(() => {});
  await setPending(ctx.from.id, 'withdraw');
  await safeEdit(
    ctx,
    '💸 <b>Withdrawal</b>\n\nSend the <b>amount in USDT</b> you want to withdraw.\nOur team will send it to your USDT wallet.\n\nReply with just a number, e.g. <code>5</code>',
    { inline_keyboard: [[{ text: '🚫 Cancel', callback_data: 'cancel' }]] }
  );
}

export async function onWithdrawText(ctx) {
  const raw = (ctx.message.text || '').trim().replace(/,/g, '');
  const amount = Number(raw);
  await clearPending(ctx.from.id);

  if (!Number.isFinite(amount) || amount <= 0) {
    return ctx.reply('Invalid amount. Withdrawal cancelled.', { reply_markup: mainMenu() });
  }

  const { data: user } = await supabase.from('users').select('*').eq('telegram_id', ctx.from.id).maybeSingle();
  const balance = Number(user?.balance_usdt || 0);

  if (amount > balance) {
    return ctx.reply(`❌ Insufficient balance. You have <b>${fmtNum(balance)} USDT</b>.`, {
      parse_mode: 'HTML', reply_markup: mainMenu(),
    });
  }

  await supabase.from('withdrawals').insert({
    user_id: ctx.from.id,
    username: ctx.from.username ?? ctx.from.first_name ?? 'unknown',
    amount_usdt: amount,
    status: 'requested',
  });
  await supabase.rpc('credit_balance', { p_tid: ctx.from.id, p_amt: -amount });

  await ctx.reply(`✅ Withdrawal of <b>${fmtNum(amount)} USDT</b> requested.\nOur team will process it shortly.`, {
    parse_mode: 'HTML', reply_markup: mainMenu(),
  });

  await notifyAdmins(
    ctx,
    `💸 <b>Withdrawal request</b>\n👤 ${esc(ctx.from.username || ctx.from.first_name || '')} (<code>${ctx.from.id}</code>)\n💰 Amount: <b>${fmtNum(amount)} USDT</b>`
  );
}
