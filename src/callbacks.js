import {
  showCategories, showCategory, showProduct, showTrending, showNew, showAll, startSearch,
} from './handlers/catalog.js';
import {
  createOrder, cancelOrder, showMyOrders, showOrder, adminApprove, adminReject,
} from './handlers/checkout.js';
import { showReferral, startWithdraw } from './handlers/referral.js';
import { showWarranty } from './handlers/warranty.js';
import {
  showSupport, chooseTicketType, showMyTickets, showTicket, startUserReply,
} from './handlers/support.js';
import {
  showAdmin, showAdminOrders, showAdminOrder, showAdminTickets, showAdminTicket,
  closeTicket, startAdminTicketReply, startAddProduct, finishAddProduct,
  startAddKeysList, startAddKeys, startBroadcast,
  showAdminProducts, showAdminProductMenu, startEditProductField, toggleProductFlag,
  confirmDeleteProduct, deleteProduct, showAdminCategories, startAddCategory,
  showAdminCategory, startRenameCategory, deleteCategory, showAdminSettings, startEditSetting,
  startProductPhoto, removeProductPhoto,
} from './handlers/admin.js';
import { clearPending, isAdmin, ack } from './lib.js';
import { mainMenu } from './keyboards.js';

function home(ctx) {
  ack(ctx);
  return ctx.editMessageText('🏠 <b>MAIN MENU</b>\nChoose an option below 👇', {
    parse_mode: 'HTML',
    reply_markup: mainMenu(),
  }).catch(() => ctx.reply('🏠 <b>MAIN MENU</b>', { parse_mode: 'HTML', reply_markup: mainMenu() }));
}

export async function routeCallback(ctx) {
  const data = ctx.callbackQuery?.data;
  if (!data) return ack(ctx);

  try {
    const d = data;

    // ---- main menu ----
    if (d === 'm:home') return home(ctx);
    if (d === 'm:trending') return showTrending(ctx);
    if (d === 'm:new') return showNew(ctx);
    if (d === 'm:all') return showAll(ctx);
    if (d === 'm:categories') return showCategories(ctx);
    if (d === 'm:orders') return showMyOrders(ctx);
    if (d === 'm:referral') return showReferral(ctx, true);
    if (d === 'm:warranty') return showWarranty(ctx, true);
    if (d === 'm:support') return showSupport(ctx);

    // ---- catalog ----
    if (d.startsWith('cat:')) {
      const arg = d.slice(4);
      if (arg === 'search') return startSearch(ctx);
      return showCategory(ctx, arg);
    }
    if (d.startsWith('prod:')) return showProduct(ctx, d.slice(5));
    if (d.startsWith('buy:')) return createOrder(ctx, d.slice(4));
    if (d.startsWith('pay:')) {
      const [, pid] = d.split(':');
      return createOrder(ctx, pid);
    }
    if (d.startsWith('ordcancel:')) return cancelOrder(ctx, d.slice(10));
    if (d.startsWith('ord:')) return showOrder(ctx, d.slice(4));

    // ---- support ----
    if (d.startsWith('ticktype:')) return chooseTicketType(ctx, d.slice(9));
    if (d === 'mytickets') return showMyTickets(ctx);
    if (d.startsWith('tick:')) return showTicket(ctx, d.slice(5));
    if (d.startsWith('ticketreply:')) return startUserReply(ctx, d.slice(12));

    // ---- referral ----
    if (d === 'withdraw') return startWithdraw(ctx);
    if (d === 'cancel') {
      await ack(ctx);
      await clearPending(ctx.from.id);
      return home(ctx);
    }

    // ---- admin ----
    if (d === 'adm:panel') {
      if (await isAdmin(ctx.from.id)) return showAdmin(ctx, true);
      return ack(ctx, { text: 'You are not authorised', show_alert: true });
    }
    if (d === 'adm:orders') return adminGuard(ctx, showAdminOrders);
    if (d.startsWith('adm:order:')) return adminGuard(ctx, (c) => showAdminOrder(c, d.slice(10)));
    if (d.startsWith('adm:approve:')) return adminGuard(ctx, (c) => adminApprove(c, d.slice(12)));
    if (d.startsWith('adm:reject:')) return adminGuard(ctx, (c) => adminReject(c, d.slice(11)));
    if (d === 'adm:tickets') return adminGuard(ctx, showAdminTickets);
    if (d.startsWith('adm:ticket:')) return adminGuard(ctx, (c) => showAdminTicket(c, d.slice(11)));
    if (d.startsWith('adm:tclose:')) return adminGuard(ctx, (c) => closeTicket(c, d.slice(11)));
    if (d.startsWith('adm:treply:')) return adminGuard(ctx, (c) => startAdminTicketReply(c, d.slice(11)));
    if (d === 'adm:addproduct') return adminGuard(ctx, startAddProduct);
    if (d === 'adm:addkeys') return adminGuard(ctx, startAddKeysList);
    if (d.startsWith('adm:akprod:')) return adminGuard(ctx, (c) => startAddKeys(c, d.slice(11)));
    if (d.startsWith('adm:apcat:')) return adminGuard(ctx, (c) => finishAddProduct(c, d.slice(10)));
    if (d === 'adm:broadcast') return adminGuard(ctx, startBroadcast);
    if (d === 'adm:products') return adminGuard(ctx, showAdminProducts);
    if (d.startsWith('adm:prod:')) return adminGuard(ctx, (c) => showAdminProductMenu(c, d.split(':')[2]));
    if (d.startsWith('adm:pedit:')) {
      const [, , field, pid] = d.split(':');
      return adminGuard(ctx, (c) => startEditProductField(c, field, pid));
    }
    if (d.startsWith('adm:ptoggle:')) {
      const [, , flag, pid] = d.split(':');
      return adminGuard(ctx, (c) => toggleProductFlag(c, flag, pid));
    }
    if (d.startsWith('adm:pdelconfirm:')) return adminGuard(ctx, (c) => deleteProduct(c, d.split(':')[2]));
    if (d.startsWith('adm:pdel:')) return adminGuard(ctx, (c) => confirmDeleteProduct(c, d.split(':')[2]));
    if (d === 'adm:cats') return adminGuard(ctx, showAdminCategories);
    if (d === 'adm:catadd') return adminGuard(ctx, startAddCategory);
    if (d.startsWith('adm:catrename:')) return adminGuard(ctx, (c) => startRenameCategory(c, d.split(':')[2]));
    if (d.startsWith('adm:catdel:')) return adminGuard(ctx, (c) => deleteCategory(c, d.split(':')[2]));
    if (d.startsWith('adm:cat:')) return adminGuard(ctx, (c) => showAdminCategory(c, d.split(':')[2]));
    if (d === 'adm:settings') return adminGuard(ctx, showAdminSettings);
    if (d.startsWith('adm:set:')) return adminGuard(ctx, (c) => startEditSetting(c, d.split(':')[2]));
    if (d.startsWith('adm:photorm:')) return adminGuard(ctx, (c) => removeProductPhoto(c, d.split(':')[2]));
    if (d.startsWith('adm:photo:')) return adminGuard(ctx, (c) => startProductPhoto(c, d.split(':')[2]));

    // unknown / no-op (e.g. "Out of stock" button)
    return ack(ctx);
  } catch (err) {
    console.error('[CALLBACK ERROR]', err);
    return ack(ctx, { text: 'Something went wrong', show_alert: true });
  }
}

async function adminGuard(ctx, fn) {
  if (!(await isAdmin(ctx.from.id))) {
    return ack(ctx, { text: 'You are not authorised', show_alert: true });
  }
  return fn(ctx);
}
