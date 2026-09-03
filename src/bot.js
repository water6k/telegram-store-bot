import { Bot } from 'grammy';
import { config } from './config.js';
import { onStart } from './handlers/start.js';
import { onText, onNonText } from './handlers/text.js';
import { routeCallback } from './callbacks.js';
import { showCategories, startSearch } from './handlers/catalog.js';
import { showMyOrders } from './handlers/checkout.js';
import { showReferral } from './handlers/referral.js';
import { showWarranty } from './handlers/warranty.js';
import { showSupport } from './handlers/support.js';
import { showAdmin } from './handlers/admin.js';
import { isAdmin, clearPending } from './lib.js';
import { mainMenu } from './keyboards.js';

export const bot = new Bot(config.botToken);

bot.command('start', onStart);

bot.command('menu', (ctx) =>
  ctx.reply('🏠 <b>MAIN MENU</b>\nChoose an option below 👇', {
    parse_mode: 'HTML',
    reply_markup: mainMenu(),
  })
);

bot.command('categories', (ctx) => showCategories({ ...ctx, answerCallbackQuery: async () => {} }));
bot.command('search', startSearch);
bot.command('myorders', (ctx) => showMyOrders({ ...ctx, answerCallbackQuery: async () => {} }));
bot.command('referral', (ctx) => showReferral({ ...ctx, answerCallbackQuery: async () => {} }, false));
bot.command('warranty', (ctx) => showWarranty({ ...ctx, answerCallbackQuery: async () => {} }, false));
bot.command('support', (ctx) => showSupport({ ...ctx, answerCallbackQuery: async () => {} }));

bot.command('admin', async (ctx) => {
  if (!(await isAdmin(ctx.from.id))) return;
  return showAdmin({ ...ctx, answerCallbackQuery: async () => {} }, false);
});

bot.command('cancel', async (ctx) => {
  await clearPending(ctx.from.id);
  return ctx.reply('✅ Current action cancelled.', { reply_markup: mainMenu() });
});

bot.on('callback_query:data', routeCallback);
bot.on('message:text', onText);
bot.on(['message:photo', 'message:document', 'message:voice'], onNonText);

bot.catch((err) => {
  console.error('[BOT ERROR]', err.error || err);
});
