import { supabase, getSettings } from '../supabase.js';
import { esc, fmtNum, shortId, safeEdit, setPending, clearPending, notifyAdmins, statusLabel, ack } from '../lib.js';
import { supportMenuKeyboard, mainMenu, homeRow } from '../keyboards.js';

const TYPES = {
  payment: '💳 Payment Problem',
  order: '📦 Order Problem',
  account: '🔑 Account Problem',
  other: '❓ Other',
};

export async function showSupport(ctx) {
  await ack(ctx);
  const settings = await getSettings();
  const support = (settings.support_username || 'scratch1m').replace(/^@/, '');
  const text = '🎫 <b>SUPPORT CENTER</b>\nChoose the type of issue — or contact support directly.';
  await safeEdit(ctx, text, supportMenuKeyboard(support));
}

export async function chooseTicketType(ctx, type) {
  await ack(ctx);
  if (type === 'order' || type === 'payment') {
    return showOrderPicker(ctx, type);
  }
  await setPending(ctx.from.id, `ticket|${type}`);
  await safeEdit(ctx, `${TYPES[type] || '❓ Support'}\n\nPlease describe your issue in one message.`, {
    inline_keyboard: [[{ text: '🚫 Cancel', callback_data: 'cancel' }]],
  });
}

export async function showOrderPicker(ctx, type) {
  await ack(ctx);
  const { data: orders } = await supabase
    .from('orders')
    .select('id, product_name, status, created_at')
    .eq('user_id', ctx.from.id)
    .order('created_at', { ascending: false })
    .limit(8);

  if (!orders || !orders.length) {
    await setPending(ctx.from.id, `ticket|${type}`);
    return safeEdit(ctx, `${TYPES[type]}\n\nYou have no orders yet — please describe your issue:`, {
      inline_keyboard: [[{ text: '🚫 Cancel', callback_data: 'cancel' }]],
    });
  }

  const rows = orders.map((o) => [
    { text: `#${shortId(o.id)} · ${o.product_name.slice(0, 18)} (${statusLabel(o.status).split(' ')[0]})`, callback_data: `tickord:${type}:${o.id}` },
  ]);
  rows.push([{ text: '📝 None of these / other issue', callback_data: `ticketplain:${type}` }]);
  rows.push([{ text: '🚫 Cancel', callback_data: 'm:support' }]);

  await safeEdit(ctx, '📦 <b>Which order</b> is this about?', { inline_keyboard: rows });
}

export async function chooseTicketOrder(ctx, type, orderId) {
  await ack(ctx);
  await setPending(ctx.from.id, `ticketord|${type}|${orderId}`);
  await safeEdit(ctx, `${TYPES[type]}\n\nDescribe the issue (send <b>-</b> to skip):`, {
    inline_keyboard: [[{ text: '🚫 Cancel', callback_data: 'cancel' }]],
  });
}

export async function setFreeFormTicket(ctx, type) {
  await ack(ctx);
  await setPending(ctx.from.id, `ticket|${type}`);
  await safeEdit(ctx, `${TYPES[type]}\n\nPlease describe your issue in one message.`, {
    inline_keyboard: [[{ text: '🚫 Cancel', callback_data: 'cancel' }]],
  });
}

export async function onCreateTicketText(ctx, pending) {
  const parts = pending.state.split('|'); // 'ticket|type' or 'ticketord|type|orderId'
  await clearPending(ctx.from.id);

  let type = parts[1] || 'other';
  let order = null;
  let desc = (ctx.message.text || '').trim();

  if (parts[0] === 'ticketord') {
    const orderId = parts[2];
    const { data: o } = await supabase.from('orders').select('*').eq('id', orderId).maybeSingle();
    order = o || null;
    if (desc === '-') desc = '';
  } else {
    if (!desc) return ctx.reply('Ticket cancelled.', { reply_markup: mainMenu() });
  }

  let subject = desc;
  if (order) {
    subject = `Order #${shortId(order.id)} · ${order.product_name}` + (desc ? `\n${desc}` : '');
  }

  const { data: ticket, error } = await supabase
    .from('tickets')
    .insert({
      user_id: ctx.from.id,
      username: ctx.from.username ?? ctx.from.first_name ?? 'unknown',
      type,
      subject: subject || TYPES[type],
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

  const lines = [
    `🎫 <b>New ticket #${shortId(ticket.id)}</b>`,
    `👤 ${esc(ticket.username)} (<code>${ticket.user_id}</code>)`,
    `📌 Type: ${esc(TYPES[type] || type)}`,
  ];
  if (order) {
    lines.push(
      `🛒 <b>${esc(order.product_name)}</b>`,
      `💳 ${esc(order.payment_method || 'USDT')} — ${fmtNum(order.amount_usdt)} USDT`,
      `📦 ${esc(statusLabel(order.status))}`
    );
    if (order.tx_id) lines.push(`🔑 Ref/TXID: <code>${esc(order.tx_id)}</code>`);
  }
  if (desc) lines.push(`💬 ${esc(desc)}`);

  await notifyAdmins(ctx, lines.join('\n'), { inline_keyboard: [[{ text: '💬 Reply', callback_data: `adm:treply:${ticket.id}` }]] });
}

export async function showMyTickets(ctx) {
  await ack(ctx);
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
  await ack(ctx);
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
  await ack(ctx);
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
