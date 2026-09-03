import { supabase } from '../supabase.js';
import { esc, safeEdit, setPending, clearPending, notifyAdmins, shortId } from '../lib.js';
import { supportMenuKeyboard, mainMenu, homeRow } from '../keyboards.js';

const TYPES = {
  payment: '💳 Payment Problem',
  order: '📦 Order Problem',
  account: '🔑 Account Problem',
  other: '❓ Other',
};

export async function showSupport(ctx) {
  await ctx.answerCallbackQuery?.().catch(() => {});
  const text = '🎫 <b>SUPPORT CENTER</b>\nChoose the type of issue.';
  await safeEdit(ctx, text, supportMenuKeyboard());
}

export async function chooseTicketType(ctx, type) {
  await ctx.answerCallbackQuery().catch(() => {});
  await setPending(ctx.from.id, `ticket|${type}`);
  await safeEdit(
    ctx,
    `${TYPES[type] || '❓ Support'}\n\nPlease describe your issue in one message. You can include your Order ID.`,
    { inline_keyboard: [[{ text: '🚫 Cancel', callback_data: 'cancel' }]] }
  );
}

export async function onCreateTicketText(ctx, pending) {
  const type = pending.state.split('|')[1] || 'other';
  const subject = (ctx.message.text || '').trim();
  await clearPending(ctx.from.id);

  if (!subject) return ctx.reply('Ticket cancelled.', { reply_markup: mainMenu() });

  const { data: ticket, error } = await supabase
    .from('tickets')
    .insert({
      user_id: ctx.from.id,
      username: ctx.from.username ?? ctx.from.first_name ?? 'unknown',
      type,
      subject,
      status: 'open',
    })
    .select()
    .single();

  if (error || !ticket) {
    return ctx.reply('Could not create ticket. Please try again.', { reply_markup: mainMenu() });
  }

  await ctx.reply(
    `✅ Ticket <b>#${shortId(ticket.id)}</b> created.\nOur support team will reply here soon.`,
    { parse_mode: 'HTML', reply_markup: mainMenu() }
  );

  await notifyAdmins(
    ctx,
    `🎫 <b>New ticket #${shortId(ticket.id)}</b>\n👤 ${esc(ticket.username)} (<code>${ticket.user_id}</code>)\n📌 Type: ${esc(TYPES[type] || type)}\n💬 ${esc(subject)}`,
    { inline_keyboard: [[{ text: '💬 Reply', callback_data: `adm:treply:${ticket.id}` }]] }
  );
}

export async function showMyTickets(ctx) {
  await ctx.answerCallbackQuery().catch(() => {});
  const { data: tickets } = await supabase
    .from('tickets')
    .select('id, subject, status, type, created_at')
    .eq('user_id', ctx.from.id)
    .order('created_at', { ascending: false })
    .limit(15);

  if (!tickets || !tickets.length) {
    return safeEdit(ctx, '📋 <b>My Tickets</b>\n\nYou have no tickets.', mainMenu());
  }

  const rows = tickets.map((t) => [
    {
      text: `#${shortId(t.id)} · ${t.subject.slice(0, 24)} (${t.status})`,
      callback_data: `tick:${t.id}`,
    },
  ]);
  rows.push(homeRow());

  await safeEdit(ctx, '📋 <b>My Tickets</b>', { inline_keyboard: rows });
}

export async function showTicket(ctx, ticketId) {
  await ctx.answerCallbackQuery().catch(() => {});
  const { data: ticket } = await supabase.from('tickets').select('*').eq('id', ticketId).maybeSingle();
  if (!ticket) return;

  const { data: msgs } = await supabase
    .from('ticket_messages')
    .select('*')
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true });

  const lines = [
    `🎫 <b>Ticket #${shortId(ticket.id)}</b> (${esc(ticket.status)})`,
    `📌 ${esc(TYPES[ticket.type] || ticket.type)}`,
    `💬 ${esc(ticket.subject)}`,
  ];
  for (const m of msgs || []) {
    lines.push('');
    lines.push(`${m.sender === 'admin' ? '🟢 Support' : '👤 You'}: ${esc(m.text)}`);
  }

  const keyboard = {
    inline_keyboard: [
      [{ text: '💬 Reply', callback_data: `ticketreply:${ticket.id}` }],
      [{ text: '🏠 Main Menu', callback_data: 'm:home' }],
    ],
  };

  await safeEdit(ctx, lines.join('\n'), keyboard);
}

export async function startUserReply(ctx, ticketId) {
  await ctx.answerCallbackQuery().catch(() => {});
  await setPending(ctx.from.id, `utickreply|${ticketId}`);
  await safeEdit(
    ctx,
    '💬 Send your reply for this ticket:',
    { inline_keyboard: [[{ text: '🚫 Cancel', callback_data: 'cancel' }]] }
  );
}

export async function onUserReply(ctx, pending) {
  const ticketId = pending.state.split('|')[1];
  const text = (ctx.message.text || '').trim();
  await clearPending(ctx.from.id);
  if (!text) return ctx.reply('Reply cancelled.', { reply_markup: mainMenu() });

  await supabase.from('ticket_messages').insert({
    ticket_id: ticketId,
    sender: 'user',
    user_id: ctx.from.id,
    text,
  });
  await supabase.from('tickets').update({ status: 'open' }).eq('id', ticketId);

  await ctx.reply('✅ Reply sent. Support will get back to you here.', { reply_markup: mainMenu() });

  const { data: ticket } = await supabase.from('tickets').select('*').eq('id', ticketId).maybeSingle();
  if (ticket) {
    await notifyAdmins(
      ctx,
      `💬 <b>New reply on ticket #${shortId(ticketId)}</b>\n👤 ${esc(ctx.from.username || ctx.from.first_name || '')} (<code>${ctx.from.id}</code>)\n💬 ${esc(text)}`,
      { inline_keyboard: [[{ text: '💬 Reply', callback_data: `adm:treply:${ticketId}` }]] }
    );
  }
}
