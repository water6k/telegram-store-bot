import { supabase, getSettings } from '../supabase.js';
import {
  esc, fmtNum, shortId, safeEdit, setPending, clearPending,
  availableStock, hasKeys, notifyAdmins, statusLabel, getOrCreateUser, ack,
  announceToChannel,
} from '../lib.js';
import { mainMenu, paymentMethodKeyboard } from '../keyboards.js';

async function adminOrderKeyboard(order) {
  return {
    inline_keyboard: [
      [
        { text: '✅ Approve & Deliver', callback_data: `adm:approve:${order.id}` },
        { text: '❌ Reject', callback_data: `adm:reject:${order.id}` },
      ],
    ],
  };
}

export function adminOrderText(order) {
  return [
    '📥 <b>New payment submitted</b>',
    `🧾 Order #${shortId(order.id)}`,
    `👤 ${esc(order.username || 'unknown')} (<code>${order.user_id}</code>)`,
    `🛒 ${esc(order.product_name)}`,
    `💳 ${esc(order.payment_method || 'USDT')} — ${fmtNum(order.amount_usdt)} USDT`,
    `🔑 Ref/TXID: <code>${esc(order.tx_id || '—')}</code>`,
  ].join('\n');
}

function paymentLines(label, detail) {
  const l = label || 'USDT';
  const code = `<code>${esc(detail || '')}</code>`;
  if (/^usdt/i.test(l)) return [`💳 Pay via <b>${esc(l)}</b>`, code];
  if (/paypal/i.test(l)) return ['🅿️ Send the amount to your <b>PayPal</b>:', code];
  if (/binance/i.test(l)) return ['🔶 Send the amount via <b>Binance Pay</b> to:', code];
  return ['💳 Pay to:', code];
}

export async function createOrder(ctx, productId, methodId) {
  await ack(ctx);
  const { data: p } = await supabase.from('products').select('*').eq('id', productId).maybeSingle();
  if (!p) return;

  const stock = await availableStock(p);
  if (stock <= 0) {
    await safeEdit(ctx, '😢 Sorry, this product just went out of stock.', mainMenu());
    return;
  }

  // Resolve the payment method (supports multiple wallets/networks)
  const { data: methods, error: pmErr } = await supabase
    .from('payment_methods')
    .select('*')
    .eq('is_active', true)
    .order('is_default', { ascending: false })
    .order('sort_order')
    .order('created_at');

  let method = null;
  if (!pmErr && methods && methods.length > 0) {
    if (methodId !== undefined && methodId !== null && methodId !== '') {
      const idx = parseInt(methodId, 10);
      method = methods[idx] || null;
    } else if (methods.length === 1) {
      method = methods[0];
    } else {
      // several active methods → let the buyer pick
      await safeEdit(
        ctx,
        `💳 <b>Checkout</b>\n\n🛒 ${esc(p.name)}\n💵 <b>${fmtNum(p.price_usdt)} USDT</b>\n\nChoose a payment method:`,
        paymentMethodKeyboard(p.id, methods)
      );
      return;
    }
  }

  if (!method) {
    // Legacy fallback (payment_methods table missing or empty)
    const settings = await getSettings();
    const legacyAddr = settings.usdt_address;
    const legacyNet = settings.usdt_network || 'TRC20';
    const isPlaceholder = !legacyAddr || legacyAddr === 'TKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' || legacyAddr.includes('xxxx');
    if (isPlaceholder) {
      await safeEdit(ctx, '⚠️ This store has no payment method configured yet.', mainMenu());
      return;
    }
    method = { id: null, label: `USDT (${legacyNet})`, network: legacyNet, address: legacyAddr };
  }

  const order = {
    user_id: ctx.from.id,
    username: ctx.from.username ?? ctx.from.first_name ?? 'unknown',
    product_id: p.id,
    product_name: p.name,
    category_name: null,
    payment_method: method.label,
    amount_usdt: p.price_usdt,
    amount_inr: p.price_inr,
    wallet_snapshot: method.address,
    status: 'awaiting_payment',
  };

  const { data: created, error } = await supabase.from('orders').insert(order).select().single();
  if (error || !created) {
    return safeEdit(ctx, 'Something went wrong creating your order. Please try again.', mainMenu());
  }

  await supabase.from('order_events').insert({ order_id: created.id, status: 'awaiting_payment', note: 'Order created' });

  await setPending(ctx.from.id, `pay|${created.id}`);

  const text = [
    `🧾 <b>Order #${shortId(created.id)}</b>`,
    '',
    `🛒 ${esc(p.name)}`,
    `💵 Amount: <b>${fmtNum(p.price_usdt)} USDT</b>`,
    '',
    ...paymentLines(method.label, method.address),
    '',
    'After sending, paste your <b>transaction reference / ID</b> here.',
    '⏳ Your order is reserved for 24 hours.',
  ].join('\n');

  const keyboard = {
    inline_keyboard: [
      [{ text: '🚫 Cancel Order', callback_data: `ordcancel:${created.id}` }],
      [{ text: '🏠 Main Menu', callback_data: 'm:home' }],
    ],
  };

  await ctx.deleteMessage().catch(() => {});
  await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard, link_preview_options: { is_disabled: true } });
}

export async function cancelOrder(ctx, orderId) {
  await ack(ctx);
  const { data: order } = await supabase.from('orders').select('*').eq('id', orderId).maybeSingle();
  if (!order) return;

  if (['awaiting_payment'].includes(order.status)) {
    await supabase.from('orders').update({ status: 'cancelled' }).eq('id', orderId);
    await supabase.from('order_events').insert({ order_id: orderId, status: 'cancelled', note: 'Cancelled by user' });
  }

  await clearPending(ctx.from.id);
  await safeEdit(ctx, '🚫 Order cancelled.', mainMenu());
}

export async function onPaymentText(ctx, pending) {
  const orderId = pending.state.split('|')[1];
  const { data: order } = await supabase.from('orders').select('*').eq('id', orderId).maybeSingle();

  if (!order) {
    await clearPending(ctx.from.id);
    await ctx.reply('Order not found.', { reply_markup: mainMenu() });
    return;
  }
  if (order.status !== 'awaiting_payment') {
    await clearPending(ctx.from.id);
    await ctx.reply('This order is no longer awaiting payment.', { reply_markup: mainMenu() });
    return;
  }

  const ref = (ctx.message.text || '').trim();
  await supabase.from('orders').update({ tx_id: ref, status: 'payment_submitted' }).eq('id', orderId);
  await supabase.from('order_events').insert({ order_id: orderId, status: 'payment_submitted', note: ref });
  await clearPending(ctx.from.id);

  await ctx.reply(
    '✅ <b>Payment submitted!</b>\n\nOur team will verify it shortly and deliver your product here. 🚀\nTrack it in 📦 My Orders.',
    { parse_mode: 'HTML', reply_markup: mainMenu() }
  );

  const fresh = { ...order, tx_id: ref, status: 'payment_submitted' };
  await notifyAdmins(ctx, adminOrderText(fresh), adminOrderKeyboard(fresh));
}

export async function showMyOrders(ctx) {
  await getOrCreateUser(ctx);
  await ack(ctx);
  const { data: orders } = await supabase
    .from('orders')
    .select('*')
    .eq('user_id', ctx.from.id)
    .order('created_at', { ascending: false })
    .limit(10);

  if (!orders || !orders.length) {
    return ctx.reply('📦 <b>My Orders</b>\n\nYou have no orders yet.\nStart shopping! 🛍️', {
      parse_mode: 'HTML', reply_markup: mainMenu(),
    });
  }

  const rows = orders.map((o) => [
    { text: `${statusLabel(o.status).split(' ')[0]} #${shortId(o.id)} · ${o.product_name.slice(0, 22)}`, callback_data: `ord:${o.id}` },
  ]);
  rows.push([{ text: '🏠 Main Menu', callback_data: 'm:home' }]);

  await ctx.reply('📦 <b>My Orders</b>\nTap an order to see details:', {
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: rows },
  });
}

export async function showOrder(ctx, orderId) {
  await ack(ctx);
  const { data: o } = await supabase.from('orders').select('*').eq('id', orderId).maybeSingle();
  if (!o) return ack(ctx, { text: 'Order not found', show_alert: true });

  const lines = [
    `🧾 <b>Order #${shortId(o.id)}</b>`,
    '',
    `🛒 ${esc(o.product_name)}`,
    `💳 ${esc(o.payment_method || 'USDT')}`,
    `💰 ${fmtNum(o.amount_usdt)} USDT`,
    `📦 Status: <b>${esc(statusLabel(o.status))}</b>`,
    `📅 ${new Date(o.created_at).toLocaleString('en-GB', { hour12: false })}`,
  ];

  if (o.tx_id) lines.push(`🔑 Ref/TXID: <code>${esc(o.tx_id)}</code>`);

  let keyboard;
  if (o.status === 'awaiting_payment') {
    keyboard = {
      inline_keyboard: [
        [{ text: '🚫 Cancel Order', callback_data: `ordcancel:${o.id}` }],
        [{ text: '🏠 Main Menu', callback_data: 'm:home' }],
      ],
    };
    lines.push('');
    lines.push(...paymentLines(o.payment_method, o.wallet_snapshot));
    lines.push('Then paste the transaction reference / ID here.');
    await setPending(ctx.from.id, `pay|${o.id}`);
  } else if (o.status === 'delivered' && o.delivered_text) {
    lines.push('', '🎁 <b>Your product:</b>');
    lines.push(`<code>${esc(o.delivered_text)}</code>`);
    keyboard = {
      inline_keyboard: [
        [{ text: '🎫 Open Support', callback_data: 'm:support' }],
        [{ text: '🏠 Main Menu', callback_data: 'm:home' }],
      ],
    };
  } else {
    keyboard = { inline_keyboard: [{ text: '🏠 Main Menu', callback_data: 'm:home' }] };
  }

  await safeEdit(ctx, lines.join('\n'), keyboard);
}

// ---- Admin approval/rejection ----

export async function showApproveConfirm(ctx, orderId) {
  await ack(ctx);
  const { data: o } = await supabase.from('orders').select('*').eq('id', orderId).maybeSingle();
  if (!o) return;

  let stockNote = '';
  if (o.product_id) {
    const keyBased = await hasKeys({ id: o.product_id });
    if (keyBased) {
      const { count: keys } = await supabase.from('product_keys').select('id', { count: 'exact', head: true }).eq('product_id', o.product_id).eq('is_sold', false);
      stockNote = keys > 0
        ? `🔑 Keys in stock: <b>${keys}</b>`
        : '⚠️ <b>No keys left</b> — add keys (🔑 Add Keys) before delivering.';
    } else {
      const { data: prod } = await supabase.from('products').select('delivery_instructions, stock').eq('id', o.product_id).maybeSingle();
      stockNote = `📦 Stock left: <b>${prod?.stock ?? 0}</b>\n` + (prod?.delivery_instructions
        ? '📄 Delivery via stored instructions.'
        : '⚠️ No instructions set — delivery will say "contact support".');
    }
  }

  const text = [
    adminOrderText(o),
    '',
    stockNote,
    '',
    'Tap <b>✅ Confirm & Deliver</b> to send it to the buyer now.',
  ].filter(Boolean).join('\n');

  const kb = {
    inline_keyboard: [
      [{ text: '✅ Confirm & Deliver', callback_data: `adm:deliver:${o.id}` }],
      [{ text: '🔙 Back', callback_data: `adm:order:${o.id}` }],
    ],
  };
  await safeEdit(ctx, text, kb);
}

export async function showRejectConfirm(ctx, orderId) {
  await ack(ctx);
  const { data: o } = await supabase.from('orders').select('*').eq('id', orderId).maybeSingle();
  if (!o) return;

  const text = [
    adminOrderText(o),
    '',
    '❌ <b>Reject this order?</b>\nThe customer will be notified and stock restored.',
  ].join('\n');

  const kb = {
    inline_keyboard: [
      [{ text: '✅ Confirm Reject', callback_data: `adm:doreject:${orderId}` }],
      [{ text: '🔙 Back', callback_data: `adm:order:${orderId}` }],
    ],
  };
  await safeEdit(ctx, text, kb);
}

export async function adminApprove(ctx, orderId) {
  await ack(ctx);
  const { data: order } = await supabase.from('orders').select('*').eq('id', orderId).maybeSingle();
  if (!order) return;

  if (['delivered', 'rejected', 'cancelled', 'expired'].includes(order.status)) {
    return safeEdit(ctx, `Order #${shortId(orderId)} is already ${order.status}.`, mainMenu());
  }

  // Deliver: consume stock only on approval. Key-based → claim key; manual → decrement stock.
  let deliveredText = null;
  if (order.product_id) {
    const keyBased = await hasKeys({ id: order.product_id });
    if (keyBased) {
      const { data: key } = await supabase.rpc('claim_product_key', { p_product_id: order.product_id, p_order_id: order.id });
      deliveredText = key || null;
      if (!deliveredText) {
        return safeEdit(ctx, `⚠️ <b>No keys available</b> for this product.\nAdd keys via 🔑 <b>Add Keys</b>, then approve again.`, mainMenu());
      }
    } else {
      const { data: decremented } = await supabase.rpc('decrement_stock', { p_id: order.product_id });
      if (!decremented) {
        return safeEdit(ctx, `⚠️ <b>Out of stock</b> — cannot deliver this order.`, mainMenu());
      }
    }
  }
  if (!deliveredText) {
    const { data: p } = await supabase.from('products').select('delivery_instructions').eq('id', order.product_id).maybeSingle();
    deliveredText = p?.delivery_instructions || 'Manual delivery — please contact support.';
  }

  await supabase.from('orders').update({
    status: 'delivered',
    delivered_text: deliveredText,
    delivered_at: new Date().toISOString(),
    paid_at: order.paid_at || new Date().toISOString(),
  }).eq('id', orderId);

  await supabase.from('order_events').insert({ order_id: orderId, status: 'delivered', note: 'Delivered by admin' });

  await announceToChannel(ctx, `✅ <b>Order #${shortId(orderId)} delivered</b>\n🛒 ${esc(order.product_name)} — ${fmtNum(order.amount_usdt)} USDT`);

  // Referral reward
  try {
    const { data: buyer } = await supabase.from('users').select('referred_by').eq('telegram_id', order.user_id).maybeSingle();
    if (buyer?.referred_by) {
      const settings = await getSettings();
      const pct = Number(settings.referral_percent || 0);
      const reward = Number((Number(order.amount_usdt) * pct / 100).toFixed(2));
      if (reward > 0) {
        await supabase.rpc('credit_balance', { p_tid: buyer.referred_by, p_amt: reward });
        await supabase.from('referrals').insert({
          referrer_id: buyer.referred_by,
          referred_id: order.user_id,
          reward_usdt: reward,
          status: 'credited',
          order_id: order.id,
        });
      }
    }
  } catch (e) {
    console.error('[REFERRAL]', e);
  }

  // Notify customer
  const { data: p } = await supabase.from('products').select('warranty_days').eq('id', order.product_id).maybeSingle();
  const warranty = p?.warranty_days || 0;

  const customerText = [
    '🎉 <b>Payment confirmed — your order is delivered!</b>',
    '',
    `🧾 Order #${shortId(order.id)}`,
    `🛒 ${esc(order.product_name)}`,
    '',
    '🔑 <b>Your key / credentials:</b>',
    `<code>${esc(deliveredText)}</code>`,
  ];
  if (warranty) customerText.push('', `🛡️ Warranty: <b>${warranty} days</b> from today.`);
  customerText.push('', 'Need help? Open a 🎫 Support ticket from the menu.');

  try {
    await ctx.api.sendMessage(order.user_id, customerText.join('\n'), {
      parse_mode: 'HTML',
      reply_markup: mainMenu(),
      link_preview_options: { is_disabled: true },
    });
  } catch (e) {
    console.error('[DELIVER NOTIFY]', e);
  }

  await safeEdit(ctx, `✅ Order #${shortId(orderId)} delivered.`, mainMenu());
}

export async function adminReject(ctx, orderId) {
  await ack(ctx);
  const { data: order } = await supabase.from('orders').select('*').eq('id', orderId).maybeSingle();
  if (!order) return;

  if (!['payment_submitted', 'awaiting_payment', 'paid'].includes(order.status)) {
    return safeEdit(ctx, `Order #${shortId(orderId)} is already ${order.status}.`, mainMenu());
  }

  await supabase.from('orders').update({ status: 'rejected' }).eq('id', orderId);
  await supabase.from('order_events').insert({ order_id: orderId, status: 'rejected', note: 'Rejected by admin' });
  await clearPending(order.user_id);

  try {
    await ctx.api.sendMessage(order.user_id, `❌ Your order #${shortId(orderId)} was <b>rejected</b>.\n\nIf you already paid, open a 🎫 Support ticket and provide your payment reference.`, {
      parse_mode: 'HTML',
      reply_markup: mainMenu(),
    });
  } catch (e) {
    console.error('[REJECT NOTIFY]', e);
  }

  await safeEdit(ctx, `❌ Order #${shortId(orderId)} rejected.`, mainMenu());
}
