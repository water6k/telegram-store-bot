export function mainMenu() {
  return {
    inline_keyboard: [
      [{ text: '🔥 Trending', callback_data: 'm:trending' }, { text: '🆕 New Products', callback_data: 'm:new' }],
      [{ text: '🛍️ All Products', callback_data: 'm:all' }],
      [{ text: '📦 My Orders', callback_data: 'm:orders' }, { text: '🎁 Refer & Win', callback_data: 'm:referral' }],
      [{ text: '🛡️ Warranty', callback_data: 'm:warranty' }, { text: '🎫 Support', callback_data: 'm:support' }],
    ],
  };
}

export function homeRow() {
  return [{ text: '🏠 Main Menu', callback_data: 'm:home' }];
}

export function categoriesKeyboard(categories, countBy, withSearch = true) {
  const rows = (categories || []).map((c) => [
    { text: `${c.emoji || '📁'} ${c.name} (${countBy[c.id] || 0})`, callback_data: `cat:${c.id}` },
  ]);
  if (withSearch) rows.push([{ text: '🔍 Search Product', callback_data: 'cat:search' }]);
  rows.push(homeRow());
  return { inline_keyboard: rows };
}

export function productKeyboard(productId, stock) {
  if (stock <= 0) {
    return {
      inline_keyboard: [
        [{ text: '😢 Out of Stock', callback_data: 'none' }],
        [{ text: '👈 Back', callback_data: 'm:categories' }, { text: '🏠 Main Menu', callback_data: 'm:home' }],
      ],
    };
  }
  return {
    inline_keyboard: [
      [{ text: '💥 Buy Now', callback_data: `buy:${productId}` }],
      [{ text: '👈 Back', callback_data: 'm:categories' }, { text: '🏠 Main Menu', callback_data: 'm:home' }],
    ],
  };
}

export function productListKeyboard(products) {
  const rows = (products || []).map((p) => [
    { text: `${p.name} — 💵 ${fmtNum(p.price_usdt)} USDT`, callback_data: `prod:${p.id}` },
  ]);
  rows.push(homeRow());
  return { inline_keyboard: rows };
}

export function supportMenuKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '💳 Payment Problem', callback_data: 'ticktype:payment' }, { text: '📦 Order Problem', callback_data: 'ticktype:order' }],
      [{ text: '🔑 Account Problem', callback_data: 'ticktype:account' }, { text: '❓ Other', callback_data: 'ticktype:other' }],
      [{ text: '📋 My Tickets', callback_data: 'mytickets' }],
      homeRow(),
    ],
  };
}

function fmtNum(n) {
  const num = Number(n);
  if (Number.isInteger(num)) return String(num);
  return Number(num || 0).toFixed(2).replace(/\.?0+$/, '');
}
