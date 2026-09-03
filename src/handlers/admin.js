import { supabase, getSettings } from '../supabase.js';
import {
  esc, fmtNum, shortId, safeEdit, setPending, clearPending,
  getPending, isAdmin, notifyAdmins, statusLabel, getAdminIds, ack,
} from '../lib.js';
import { mainMenu, homeRow } from '../keyboards.js';
import { adminApprove, adminReject, adminOrderText } from './checkout.js';

export async function showAdmin(ctx, edit = true) {
  const admin = await isAdmin(ctx.from.id);
  if (!admin) return;

  await ack(ctx);

  const [{ count: users }, { count: orders }, { count: pending }, { count: products }, { count: tickets }] =
    await Promise.all([
      supabase.from('users').select('*', { count: 'exact', head: true }),
      supabase.from('orders').select('*', { count: 'exact', head: true }),
      supabase.from('orders').select('*', { count: 'exact', head: true }).in('status', ['awaiting_payment', 'payment_submitted']),
      supabase.from('products').select('*', { count: 'exact', head: true }),
      supabase.from('tickets').select('*', { count: 'exact', head: true }).eq('status', 'open'),
    ]);

  const text = [
    '🛠️ <b>ADMIN PANEL</b>',
    '',
    `👥 Users: <b>${users ?? 0}</b>`,
    `🛒 Orders: <b>${orders ?? 0}</b> (pending: ${pending ?? 0})`,
    `📦 Products: <b>${products ?? 0}</b>`,
    `🎫 Open tickets: <b>${tickets ?? 0}</b>`,
  ].join('\n');

  const keyboard = {
    inline_keyboard: [
      [{ text: `🛒 Pending Orders (${pending ?? 0})`, callback_data: 'adm:orders' }],
      [{ text: '📦 Manage Products', callback_data: 'adm:products' }],
      [{ text: '💳 Payment Methods', callback_data: 'adm:paymethods' }],
      [{ text: '📁 Categories', callback_data: 'adm:cats' }, { text: '⚙️ Settings', callback_data: 'adm:settings' }],
      [{ text: '➕ Add Product', callback_data: 'adm:addproduct' }, { text: '🔑 Add Keys', callback_data: 'adm:addkeys' }],
      [{ text: `🎫 Tickets (${tickets ?? 0})`, callback_data: 'adm:tickets' }],
      [{ text: '📣 Broadcast', callback_data: 'adm:broadcast' }],
      [{ text: '❌ Close', callback_data: 'm:home' }],
    ],
  };

  if (edit) await safeEdit(ctx, text, keyboard);
  else await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
}

export async function showAdminOrders(ctx) {
  await ack(ctx);
  const { data: orders } = await supabase
    .from('orders')
    .select('*')
    .in('status', ['awaiting_payment', 'payment_submitted'])
    .order('created_at', { ascending: false })
    .limit(20);

  if (!orders || !orders.length) {
    return safeEdit(ctx, '🛒 No pending orders. 🎉', { inline_keyboard: [[{ text: '🔙 Back', callback_data: 'adm:panel' }]] });
  }

  const rows = orders.map((o) => [
    {
      text: `#${shortId(o.id)} · ${o.product_name.slice(0, 18)} · ${o.payment_method.toUpperCase()}`,
      callback_data: `adm:order:${o.id}`,
    },
  ]);
  rows.push([{ text: '🔙 Back', callback_data: 'adm:panel' }]);
  await safeEdit(ctx, '🛒 <b>Pending Orders</b>', { inline_keyboard: rows });
}

export async function showAdminOrder(ctx, orderId) {
  await ack(ctx);
  const { data: o } = await supabase.from('orders').select('*').eq('id', orderId).maybeSingle();
  if (!o) return;

  const lines = [
    adminOrderText(o),
    '',
    `📅 ${new Date(o.created_at).toLocaleString('en-GB', { hour12: false })}`,
    `📦 Status: <b>${esc(statusLabel(o.status))}</b>`,
  ];

  const keyboard = ['awaiting_payment', 'payment_submitted', 'paid'].includes(o.status)
    ? {
        inline_keyboard: [
          [{ text: '✅ Approve & Deliver', callback_data: `adm:approve:${o.id}` }, { text: '❌ Reject', callback_data: `adm:reject:${o.id}` }],
          [{ text: '🔙 Back', callback_data: 'adm:orders' }],
        ],
      }
    : { inline_keyboard: [[{ text: '🔙 Back', callback_data: 'adm:orders' }]] };

  await safeEdit(ctx, lines.join('\n'), keyboard);
}

export async function showAdminTickets(ctx) {
  await ack(ctx);
  const { data: tickets } = await supabase
    .from('tickets')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20);

  const open = (tickets || []).filter((t) => t.status === 'open');
  const list = open.length ? open : tickets || [];

  if (!list.length) {
    return safeEdit(ctx, '🎫 No tickets.', { inline_keyboard: [[{ text: '🔙 Back', callback_data: 'adm:panel' }]] });
  }

  const rows = list.map((t) => [
    { text: `#${shortId(t.id)} · ${t.subject.slice(0, 20)} (${t.status})`, callback_data: `adm:ticket:${t.id}` },
  ]);
  rows.push([{ text: '🔙 Back', callback_data: 'adm:panel' }]);
  await safeEdit(ctx, '🎫 <b>Tickets</b>', { inline_keyboard: rows });
}

export async function showAdminTicket(ctx, ticketId) {
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
    `👤 ${esc(ticket.username)} (<code>${ticket.user_id}</code>)`,
    `📌 ${esc(ticket.type)}`,
    `💬 ${esc(ticket.subject)}`,
  ];
  for (const m of msgs || []) {
    lines.push('');
    lines.push(`${m.sender === 'admin' ? '🟢 Support' : '👤 User'}: ${esc(m.text)}`);
  }

  const keyboard = {
    inline_keyboard: [
      [{ text: '💬 Reply', callback_data: `adm:treply:${ticket.id}` }],
      [{ text: '✅ Mark Closed', callback_data: `adm:tclose:${ticket.id}` }],
      [{ text: '🔙 Back', callback_data: 'adm:tickets' }],
    ],
  };
  await safeEdit(ctx, lines.join('\n'), keyboard);
}

export async function closeTicket(ctx, ticketId) {
  await ack(ctx);
  await supabase.from('tickets').update({ status: 'closed' }).eq('id', ticketId);
  const { data: t } = await supabase.from('tickets').select('user_id').eq('id', ticketId).maybeSingle();
  if (t) {
    try {
      await ctx.api.sendMessage(t.user_id, `🎫 Your ticket #${shortId(ticketId)} has been marked <b>closed</b>.`, { parse_mode: 'HTML' });
    } catch {}
  }
  return showAdminTickets(ctx).catch(() => showAdmin(ctx, false));
}

export async function startAdminTicketReply(ctx, ticketId) {
  await ack(ctx);
  await setPending(ctx.from.id, `atickreply|${ticketId}`);
  await safeEdit(ctx, '💬 Send your reply (it will be forwarded to the user):', {
    inline_keyboard: [[{ text: '🚫 Cancel', callback_data: 'adm:ticket:' + ticketId }]],
  });
}

export async function onAdminTicketReply(ctx, pending) {
  const ticketId = pending.state.split('|')[1];
  const text = (ctx.message.text || '').trim();
  await clearPending(ctx.from.id);
  if (!text) return ctx.reply('Reply cancelled.', { reply_markup: mainMenu() });

  await supabase.from('ticket_messages').insert({
    ticket_id: ticketId,
    sender: 'admin',
    user_id: ctx.from.id,
    text,
  });
  await supabase.from('tickets').update({ status: 'replied' }).eq('id', ticketId);

  const { data: t } = await supabase.from('tickets').select('user_id').eq('id', ticketId).maybeSingle();
  if (t) {
    try {
      await ctx.api.sendMessage(t.user_id, `🟢 <b>Support reply — ticket #${shortId(ticketId)}</b>\n\n${esc(text)}`, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: [[{ text: '💬 Reply', callback_data: `ticketreply:${ticketId}` }]] },
      });
    } catch {}
  }
  await ctx.reply('✅ Reply sent to the user.', { reply_markup: mainMenu() });
}

// ---- Add product (name -> desc -> usdt -> inr -> warranty -> category) ----

export async function startAddProduct(ctx) {
  await ack(ctx);
  await setPending(ctx.from.id, 'ap|name');
  await safeEdit(ctx, '➕ <b>Add Product — Step 1/4</b>\n\nSend the product <b>name</b>:', {
    inline_keyboard: [[{ text: '🚫 Cancel', callback_data: 'adm:panel' }]],
  });
}

export async function onAddProductStep(ctx, pending) {
  const step = pending.state.split('|')[1];
  const c = pending.context || {};
  const text = (ctx.message.text || '').trim();

  if (step === 'name') {
    const val = text;
    if (!val) return;
    c.name = val;
    await setPending(ctx.from.id, 'ap|desc', c);
    return ctx.reply('Step 2/4 — product <b>description</b> (send "-" to skip):', { parse_mode: 'HTML', reply_markup: mainMenu() });
  }

  if (step === 'desc') {
    c.description = text === '-' ? '' : text;
    await setPending(ctx.from.id, 'ap|usdt', c);
    return ctx.reply('Step 3/4 — price in <b>USDT</b> (number only):', { parse_mode: 'HTML', reply_markup: mainMenu() });
  }

  if (step === 'usdt') {
    const val = Number(text);
    if (!Number.isFinite(val)) return ctx.reply('Please send a valid number (USDT).');
    c.price_usdt = val;
    await setPending(ctx.from.id, 'ap|warranty', c);
    return ctx.reply('Step 4/4 — <b>warranty days</b> (number, 0 = none):', { parse_mode: 'HTML', reply_markup: mainMenu() });
  }

  if (step === 'warranty') {
    const val = parseInt(text, 10);
    if (!Number.isFinite(val)) return ctx.reply('Please send a number of days.');
    c.warranty_days = val;
    await setPending(ctx.from.id, 'ap|cat', c);
    const { data: cats } = await supabase.from('categories').select('*').order('sort_order');
    const rows = (cats || []).map((cat) => [{ text: `${cat.emoji} ${cat.name}`, callback_data: `adm:apcat:${cat.id}` }]);
    return ctx.reply('Choose a <b>category</b>:', { parse_mode: 'HTML', reply_markup: { inline_keyboard: rows } });
  }

  if (step === 'cat') {
    return ctx.reply('Please choose a category from the buttons above.', { reply_markup: mainMenu() });
  }
}

export async function finishAddProduct(ctx, categoryId) {
  await ack(ctx);
  const pending = await getPending(ctx.from.id);
  const c = pending?.context || {};
  if (!c.name) {
    await clearPending(ctx.from.id);
    return safeEdit(ctx, '⚠️ Product data missing. Start again.', mainMenu());
  }

  const { error } = await supabase.from('products').insert({
    category_id: categoryId,
    name: c.name,
    description: c.description || '',
    price_usdt: Number(c.price_usdt) || 0,
    price_inr: 0,
    warranty_days: Number(c.warranty_days) || 0,
    stock: 0,
    is_new: true,
    is_active: true,
    features: [],
  });

  await clearPending(ctx.from.id);
  if (error) return safeEdit(ctx, '⚠️ Failed to add product: ' + esc(error.message), mainMenu());
  await safeEdit(ctx, `✅ Product "<b>${esc(c.name)}</b>" added.\n\nTip: use 🔑 <b>Add Keys</b> to stock it for instant delivery (or set it up from the Supabase dashboard).`, mainMenu());
}

// ---- Add keys ----

export async function startAddKeysList(ctx) {
  await ack(ctx);
  const { data: products } = await supabase.from('products').select('id, name').order('name').limit(50);
  if (!products || !products.length) return safeEdit(ctx, 'No products yet.', mainMenu());
  const rows = products.map((p) => [{ text: p.name, callback_data: `adm:akprod:${p.id}` }]);
  rows.push([{ text: '🔙 Back', callback_data: 'adm:panel' }]);
  await safeEdit(ctx, '🔑 Choose the product to add keys to:', { inline_keyboard: rows });
}

export async function startAddKeys(ctx, productId) {
  await ack(ctx);
  const { data: p } = await supabase.from('products').select('name').eq('id', productId).maybeSingle();
  await setPending(ctx.from.id, `ak|${productId}`);
  await safeEdit(ctx, `🔑 Adding keys to <b>${esc(p?.name || 'product')}</b>\n\nPaste the keys — <b>one per line</b>:`, {
    inline_keyboard: [[{ text: '🚫 Cancel', callback_data: 'adm:panel' }]],
  });
}

export async function onAddKeys(ctx, pending) {
  const productId = pending.state.split('|')[1];
  const lines = (ctx.message.text || '').split('\n').map((l) => l.trim()).filter(Boolean);
  await clearPending(ctx.from.id);
  if (!lines.length) return ctx.reply('No keys found. Cancelled.', { reply_markup: mainMenu() });

  const rows = lines.map((k) => ({ product_id: productId, key_text: k }));
  const { error } = await supabase.from('product_keys').insert(rows);
  if (error) return ctx.reply('⚠️ Failed to add keys: ' + esc(error.message));
  await ctx.reply(`✅ Added <b>${lines.length}</b> key(s).`, { parse_mode: 'HTML', reply_markup: mainMenu() });
}

// ---- Broadcast ----

export async function startBroadcast(ctx) {
  await ack(ctx);
  await setPending(ctx.from.id, 'broadcast');
  await safeEdit(ctx, '📣 Send the message to broadcast to <b>all users</b>:', {
    inline_keyboard: [[{ text: '🚫 Cancel', callback_data: 'adm:panel' }]],
  });
}

export async function onBroadcastText(ctx) {
  const text = ctx.message.text || '';
  await clearPending(ctx.from.id);
  if (!text) return ctx.reply('Broadcast cancelled.', { reply_markup: mainMenu() });

  const { data: users } = await supabase.from('users').select('telegram_id').limit(5000);
  let sent = 0;
  for (const u of users || []) {
    try {
      await ctx.api.sendMessage(u.telegram_id, text, { parse_mode: 'HTML', reply_markup: mainMenu() });
      sent++;
    } catch {}
  }
  await ctx.reply(`📣 Broadcast sent to <b>${sent}</b> user(s).`, { parse_mode: 'HTML', reply_markup: mainMenu() });
}

// ---- Manage products (view / edit / delete / toggle) ----

export async function showAdminProducts(ctx) {
  await ack(ctx);
  const { data: products } = await supabase
    .from('products')
    .select('id, name, price_usdt, is_active')
    .order('created_at', { ascending: false })
    .limit(50);

  if (!products || !products.length) {
    return safeEdit(ctx, '📦 No products yet.', {
      inline_keyboard: [
        [{ text: '➕ Add Product', callback_data: 'adm:addproduct' }],
        [{ text: '🔙 Back', callback_data: 'adm:panel' }],
      ],
    });
  }

  const rows = products.map((p) => [
    { text: `${p.is_active ? '🟢' : '🔴'} ${p.name.slice(0, 28)} · ${fmtNum(p.price_usdt)} USDT`, callback_data: `adm:prod:${p.id}` },
  ]);
  rows.push([{ text: '➕ Add Product', callback_data: 'adm:addproduct' }]);
  rows.push([{ text: '🔙 Back', callback_data: 'adm:panel' }]);
  await safeEdit(ctx, '📦 <b>Manage Products</b>\nTap a product to edit it.', { inline_keyboard: rows });
}

export async function showAdminProductMenu(ctx, productId) {
  await ack(ctx);
  const { data: p } = await supabase.from('products').select('*').eq('id', productId).maybeSingle();
  if (!p) return;

  const text = [
    '📦 <b>Product</b>',
    '',
    `🛒 ${esc(p.name)}`,
    `💵 ${fmtNum(p.price_usdt)} USDT`,
    `📦 Stock: ${p.stock}`,
    `🛡️ Warranty: ${p.warranty_days} days`,
    `🔥 Trending: ${p.is_trending ? '✅' : '❌'} · 🆕 New: ${p.is_new ? '✅' : '❌'} · 🟢 Active: ${p.is_active ? '✅' : '❌'}`,
  ].join('\n');

  const keyboard = {
    inline_keyboard: [
      [{ text: '✏️ Name', callback_data: `adm:pedit:name:${p.id}` }, { text: '📝 Description', callback_data: `adm:pedit:desc:${p.id}` }],
      [{ text: '💵 Price (USDT)', callback_data: `adm:pedit:usdt:${p.id}` }, { text: '🛡️ Warranty', callback_data: `adm:pedit:warr:${p.id}` }],
      [{ text: '📦 Stock', callback_data: `adm:pedit:stock:${p.id}` }, { text: '🔑 Add Keys', callback_data: `adm:akprod:${p.id}` }],
      [{ text: p.image_url ? '🖼️ Change Photo' : '🖼️ Set Photo', callback_data: `adm:photo:${p.id}` }],
      [{ text: p.is_active ? '🔴 Deactivate' : '🟢 Activate', callback_data: `adm:ptoggle:active:${p.id}` }],
      [
        { text: p.is_trending ? '⭐ Remove Trending' : '🔥 Mark Trending', callback_data: `adm:ptoggle:trending:${p.id}` },
        { text: p.is_new ? '🆕 Remove New' : '🆕 Mark New', callback_data: `adm:ptoggle:new:${p.id}` },
      ],
      ...(p.image_url ? [[{ text: '❌ Remove Photo', callback_data: `adm:photorm:${p.id}` }]] : []),
      [{ text: '🗑️ Delete', callback_data: `adm:pdel:${p.id}` }],
      [{ text: '🔙 Back', callback_data: 'adm:products' }],
    ],
  };
  await safeEdit(ctx, text, keyboard);
}

const PRODUCT_FIELDS = {
  name: 'product name',
  desc: 'description ("-" to clear)',
  usdt: 'price in USDT',
  warr: 'warranty days (0 = none)',
  stock: 'stock quantity',
};

export async function startEditProductField(ctx, field, productId) {
  await ack(ctx);
  await setPending(ctx.from.id, `admp|${field}|${productId}`);
  await safeEdit(ctx, `✏️ Send the new <b>${esc(PRODUCT_FIELDS[field] || 'value')}</b>:`, {
    inline_keyboard: [[{ text: '🚫 Cancel', callback_data: `adm:prod:${productId}` }]],
  });
}

export async function onEditProductField(ctx, pending) {
  const parts = pending.state.split('|');
  const field = parts[1];
  const productId = parts[2];
  const raw = (ctx.message.text || '').trim();
  await clearPending(ctx.from.id);

  const update = {};
  if (field === 'name') {
    if (!raw) return ctx.reply('⚠️ Please send a valid name.', { reply_markup: mainMenu() });
    update.name = raw;
  } else if (field === 'desc') {
    update.description = raw === '-' ? '' : raw;
  } else if (field === 'usdt') {
    const num = Number(raw.replace(/,/g, ''));
    if (!Number.isFinite(num) || num < 0) return ctx.reply('⚠️ Invalid number.', { reply_markup: mainMenu() });
    update.price_usdt = num;
  } else if (field === 'warr' || field === 'stock') {
    const num = parseInt(raw, 10);
    if (!Number.isFinite(num) || num < 0) return ctx.reply('⚠️ Invalid number.', { reply_markup: mainMenu() });
    update[field === 'warr' ? 'warranty_days' : 'stock'] = num;
  } else {
    return ctx.reply('Unknown edit.', { reply_markup: mainMenu() });
  }

  const { error } = await supabase.from('products').update(update).eq('id', productId);
  if (error) return ctx.reply(`⚠️ ${esc(error.message)}`, { parse_mode: 'HTML', reply_markup: mainMenu() });
  await ctx.reply('✅ Updated.', { reply_markup: mainMenu() });
}

export async function toggleProductFlag(ctx, field, productId) {
  await ack(ctx);
  const flag = field === 'active' ? 'is_active' : field === 'trending' ? 'is_trending' : 'is_new';
  const { data: p } = await supabase.from('products').select(flag).eq('id', productId).maybeSingle();
  if (!p) return;
  await supabase.from('products').update({ [flag]: !p[flag] }).eq('id', productId);
  return showAdminProductMenu(ctx, productId);
}

export async function confirmDeleteProduct(ctx, productId) {
  await ack(ctx);
  const { data: p } = await supabase.from('products').select('name').eq('id', productId).maybeSingle();
  await safeEdit(ctx, `🗑️ Delete "<b>${esc(p?.name || 'product')}</b>"?\nThis also removes its keys.`, {
    inline_keyboard: [
      [
        { text: '✅ Yes, delete', callback_data: `adm:pdelconfirm:${productId}` },
        { text: '❌ No', callback_data: `adm:prod:${productId}` },
      ],
    ],
  });
}

export async function deleteProduct(ctx, productId) {
  await ack(ctx);
  await supabase.from('products').delete().eq('id', productId);
  await safeEdit(ctx, '🗑️ Product deleted.', {
    inline_keyboard: [[{ text: '🔙 Back', callback_data: 'adm:products' }]],
  });
}

// ---- Categories ----

export async function showAdminCategories(ctx) {
  await ack(ctx);
  const { data: cats } = await supabase.from('categories').select('*').order('sort_order').order('name');
  const rows = (cats || []).map((c) => [
    { text: `${c.emoji || '📁'} ${c.name}`, callback_data: `adm:cat:${c.id}` },
  ]);
  rows.push([{ text: '➕ Add Category', callback_data: 'adm:catadd' }]);
  rows.push([{ text: '🔙 Back', callback_data: 'adm:panel' }]);
  await safeEdit(ctx, '📁 <b>Categories</b>', { inline_keyboard: rows });
}

export async function startAddCategory(ctx) {
  await ack(ctx);
  await setPending(ctx.from.id, 'admcatadd');
  await safeEdit(ctx, '➕ Send the new category <b>name</b>:', {
    inline_keyboard: [[{ text: '🚫 Cancel', callback_data: 'adm:cats' }]],
  });
}

export async function onAddCategory(ctx) {
  const name = (ctx.message.text || '').trim();
  await clearPending(ctx.from.id);
  if (!name) return ctx.reply('Category cancelled.', { reply_markup: mainMenu() });
  const { error } = await supabase.from('categories').insert({ name, emoji: '📁' });
  if (error) return ctx.reply(`⚠️ Could not add: ${esc(error.message)} (names must be unique).`, { parse_mode: 'HTML', reply_markup: mainMenu() });
  await ctx.reply(`✅ Category "<b>${esc(name)}</b>" added.`, { parse_mode: 'HTML', reply_markup: mainMenu() });
}

export async function showAdminCategory(ctx, catId) {
  await ack(ctx);
  const { data: cat } = await supabase.from('categories').select('*').eq('id', catId).maybeSingle();
  if (!cat) return;
  const { count } = await supabase.from('products').select('id', { count: 'exact', head: true }).eq('category_id', catId);
  await safeEdit(ctx, `📁 <b>${esc(cat.name)}</b>\nProducts: ${count || 0}`, {
    inline_keyboard: [
      [{ text: '✏️ Rename', callback_data: `adm:catrename:${cat.id}` }, { text: '🗑️ Delete', callback_data: `adm:catdel:${cat.id}` }],
      [{ text: '🔙 Back', callback_data: 'adm:cats' }],
    ],
  });
}

export async function startRenameCategory(ctx, catId) {
  await ack(ctx);
  await setPending(ctx.from.id, `admcatrename|${catId}`);
  await safeEdit(ctx, '✏️ Send the new name:', {
    inline_keyboard: [[{ text: '🚫 Cancel', callback_data: `adm:cat:${catId}` }]],
  });
}

export async function onRenameCategory(ctx, pending) {
  const catId = pending.state.split('|')[1];
  const name = (ctx.message.text || '').trim();
  await clearPending(ctx.from.id);
  if (!name) return ctx.reply('Cancelled.', { reply_markup: mainMenu() });
  await supabase.from('categories').update({ name }).eq('id', catId);
  await ctx.reply('✅ Renamed.', { reply_markup: mainMenu() });
}

export async function deleteCategory(ctx, catId) {
  await ack(ctx);
  await supabase.from('categories').delete().eq('id', catId);
  await safeEdit(ctx, '🗑️ Category deleted (its products are now uncategorized).', {
    inline_keyboard: [[{ text: '🔙 Back', callback_data: 'adm:cats' }]],
  });
}

// ---- Store settings ----

const EDITABLE_SETTINGS = [
  { key: 'store_name', label: '🏪 Store Name' },
  { key: 'welcome_text', label: '👋 Welcome Message' },
  { key: 'referral_percent', label: '🎁 Referral %' },
  { key: 'support_username', label: '🆘 Support @username' },
  { key: 'admin_ids', label: '👑 Admin IDs', hint: 'comma separated' },
];

export async function showAdminSettings(ctx) {
  await ack(ctx);
  const settings = await getSettings();
  const rows = EDITABLE_SETTINGS.map((s) => [
    { text: `${s.label} — ${String(settings[s.key] ?? '').slice(0, 22) || '—'}`, callback_data: `adm:set:${s.key}` },
  ]);
  rows.push([{ text: '🔙 Back', callback_data: 'adm:panel' }]);
  await safeEdit(ctx, '⚙️ <b>Store Settings</b>\nTap a setting to change it.', { inline_keyboard: rows });
}

export async function startEditSetting(ctx, key) {
  await ack(ctx);
  const s = EDITABLE_SETTINGS.find((x) => x.key === key);
  const hint = s?.hint ? ` (${s.hint})` : '';
  await setPending(ctx.from.id, `admset|${key}`);
  await safeEdit(ctx, `⚙️ Send the new value for <b>${esc(s?.label || key)}</b>${esc(hint)}:`, {
    inline_keyboard: [[{ text: '🚫 Cancel', callback_data: 'adm:settings' }]],
  });
}

export async function onEditSetting(ctx, pending) {
  const key = pending.state.split('|')[1];
  const value = (ctx.message.text || '').trim();
  await clearPending(ctx.from.id);
  await supabase.from('settings').upsert({ key, value });
  await ctx.reply('✅ Setting saved.', { reply_markup: mainMenu() });
}

export async function startProductPhoto(ctx, productId) {
  await ack(ctx);
  await setPending(ctx.from.id, `admphoto|${productId}`);
  await safeEdit(ctx, '🖼️ Send the <b>photo</b> for this product (just send it as a normal Telegram photo):', {
    inline_keyboard: [[{ text: '🚫 Cancel', callback_data: `adm:prod:${productId}` }]],
  });
}

export async function onProductPhoto(ctx, pending) {
  const productId = pending.state.split('|')[1];
  await clearPending(ctx.from.id);
  const photos = ctx.message?.photo;
  if (!photos || !photos.length) {
    return ctx.reply('⚠️ Please send a photo (not a file or text).', { reply_markup: mainMenu() });
  }
  const fileId = photos[photos.length - 1].file_id;
  const { error } = await supabase.from('products').update({ image_url: fileId }).eq('id', productId);
  if (error) return ctx.reply(`⚠️ ${esc(error.message)}`, { parse_mode: 'HTML', reply_markup: mainMenu() });
  await ctx.reply('✅ Photo saved! It will now show on the product page.', { reply_markup: mainMenu() });
}

export async function removeProductPhoto(ctx, productId) {
  await ack(ctx);
  await supabase.from('products').update({ image_url: null }).eq('id', productId);
  return showAdminProductMenu(ctx, productId);
}

// ---- Payment methods (add / edit / delete wallets) ----

function maskAddr(a) {
  if (!a) return '—';
  if (a.length <= 10) return a;
  return a.slice(0, 6) + '…' + a.slice(-4);
}

export async function showPaymentMethods(ctx) {
  await ack(ctx);
  const { data: methods } = await supabase
    .from('payment_methods')
    .select('*')
    .order('is_default', { ascending: false })
    .order('created_at');

  const rows = (methods || []).map((m) => [
    { text: `${m.is_default ? '⭐ ' : ''}${m.is_active ? '🟢' : '🔴'} ${m.label} — ${maskAddr(m.address)}`, callback_data: `adm:pm:${m.id}` },
  ]);
  rows.push([{ text: '➕ Add Payment Method', callback_data: 'adm:addpm' }]);
  rows.push([{ text: '🔙 Back', callback_data: 'adm:panel' }]);

  await safeEdit(ctx, '💳 <b>Payment Methods</b>\nTap a method to manage it.\n\nBuyers pay via the <b>⭐ default</b> (or pick one if several are enabled).', { inline_keyboard: rows });
}

export async function startAddPaymentMethod(ctx) {
  await ack(ctx);
  await safeEdit(ctx, '💳 <b>Add Payment Method</b>\n\nChoose the <b>network</b>:', {
    inline_keyboard: [
      [{ text: 'TRC20', callback_data: 'adm:pmnet:TRC20' }, { text: 'BEP20', callback_data: 'adm:pmnet:BEP20' }],
      [{ text: 'ERC20', callback_data: 'adm:pmnet:ERC20' }, { text: 'TON', callback_data: 'adm:pmnet:TON' }],
      [{ text: '🔙 Back', callback_data: 'adm:paymethods' }],
    ],
  });
}

export async function choosePaymentNetwork(ctx, network) {
  await ack(ctx);
  await setPending(ctx.from.id, `addpm|${network}`);
  await safeEdit(ctx, `💳 Send the <b>USDT (${esc(network)})</b> wallet <b>address</b>:`, {
    inline_keyboard: [[{ text: '🚫 Cancel', callback_data: 'adm:paymethods' }]],
  });
}

export async function onAddPaymentAddress(ctx, pending) {
  const network = pending.state.split('|')[1];
  const address = (ctx.message.text || '').trim();
  await clearPending(ctx.from.id);
  if (!address || address.length < 6) {
    return ctx.reply('⚠️ Invalid address. Try again.', { reply_markup: mainMenu() });
  }
  const { count } = await supabase.from('payment_methods').select('id', { count: 'exact', head: true });
  const { error } = await supabase.from('payment_methods').insert({
    label: `USDT (${network})`,
    type: 'usdt',
    network,
    address,
    is_active: true,
    is_default: (count || 0) === 0,
  });
  if (error) return ctx.reply(`⚠️ ${esc(error.message)}`, { parse_mode: 'HTML', reply_markup: mainMenu() });
  await ctx.reply('✅ Payment method added.', { reply_markup: mainMenu() });
}

export async function showPaymentMethodMenu(ctx, methodId) {
  await ack(ctx);
  const { data: m } = await supabase.from('payment_methods').select('*').eq('id', methodId).maybeSingle();
  if (!m) return;

  const text = [
    '💳 <b>Payment Method</b>',
    '',
    `🏷️ <b>${esc(m.label)}</b>`,
    `🌐 Network: <b>${esc(m.network)}</b>`,
    `📍 <code>${esc(m.address)}</code>`,
    `Status: ${m.is_active ? '🟢 Active' : '🔴 Inactive'}${m.is_default ? ' · ⭐ Default' : ''}`,
  ].join('\n');

  const kb = {
    inline_keyboard: [
      [
        { text: m.is_default ? '⭐ Default' : '⭐ Set Default', callback_data: `adm:pmsetdefault:${m.id}` },
        { text: m.is_active ? '🔴 Disable' : '🟢 Enable', callback_data: `adm:pmtoggle:${m.id}` },
      ],
      [{ text: '🗑️ Delete', callback_data: `adm:pmdel:${m.id}` }],
      [{ text: '🔙 Back', callback_data: 'adm:paymethods' }],
    ],
  };
  await safeEdit(ctx, text, kb);
}

export async function setDefaultPaymentMethod(ctx, methodId) {
  await ack(ctx);
  await supabase.from('payment_methods').update({ is_default: false }).neq('id', methodId);
  await supabase.from('payment_methods').update({ is_default: true }).eq('id', methodId);
  return showPaymentMethodMenu(ctx, methodId);
}

export async function togglePaymentMethod(ctx, methodId) {
  await ack(ctx);
  const { data: m } = await supabase.from('payment_methods').select('is_active').eq('id', methodId).maybeSingle();
  if (!m) return;
  await supabase.from('payment_methods').update({ is_active: !m.is_active }).eq('id', methodId);
  return showPaymentMethodMenu(ctx, methodId);
}

export async function confirmDeletePaymentMethod(ctx, methodId) {
  await ack(ctx);
  await safeEdit(ctx, '🗑️ Delete this payment method?', {
    inline_keyboard: [
      [{ text: '✅ Yes, delete', callback_data: `adm:pmdelconfirm:${methodId}` }, { text: '❌ No', callback_data: `adm:pm:${methodId}` }],
    ],
  });
}

export async function deletePaymentMethod(ctx, methodId) {
  await ack(ctx);
  await supabase.from('payment_methods').delete().eq('id', methodId);
  const { count } = await supabase.from('payment_methods').select('id', { count: 'exact', head: true }).eq('is_default', true);
  if ((count || 0) === 0) {
    const { data: first } = await supabase.from('payment_methods').select('id').order('created_at').limit(1).maybeSingle();
    if (first) await supabase.from('payment_methods').update({ is_default: true }).eq('id', first.id);
  }
  await safeEdit(ctx, '🗑️ Payment method deleted.', {
    inline_keyboard: [[{ text: '🔙 Back', callback_data: 'adm:paymethods' }]],
  });
}
