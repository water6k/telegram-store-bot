import { getPending, clearPending } from '../lib.js';
import { mainMenu } from '../keyboards.js';
import { onSearchText } from './catalog.js';
import { onPaymentText } from './checkout.js';
import { onCreateTicketText, onUserReply } from './support.js';
import { onWithdrawText } from './referral.js';
import {
  onAdminTicketReply, onAddProductStep, onAddKeys, onBroadcastText,
  onEditProductField, onAddCategory, onRenameCategory, onEditSetting,
} from './admin.js';

export async function onText(ctx) {
  const tgId = ctx.from.id;
  const pending = await getPending(tgId);

  if (!pending) {
    // No active conversation — just remind the user of the menu
    return ctx.reply('Use the menu buttons below 👇', { reply_markup: mainMenu() });
  }

  const state = pending.state;
  const kind = state.split('|')[0];

  switch (kind) {
    case 'search':
      return onSearchText(ctx);
    case 'pay':
      return onPaymentText(ctx, pending);
    case 'ticket':
      return onCreateTicketText(ctx, pending);
    case 'utickreply':
      return onUserReply(ctx, pending);
    case 'withdraw':
      return onWithdrawText(ctx);
    case 'atickreply':
      return onAdminTicketReply(ctx, pending);
    case 'ap':
      return onAddProductStep(ctx, pending);
    case 'ak':
      return onAddKeys(ctx, pending);
    case 'broadcast':
      return onBroadcastText(ctx);
    case 'admp':
      return onEditProductField(ctx, pending);
    case 'admcatadd':
      return onAddCategory(ctx);
    case 'admcatrename':
      return onRenameCategory(ctx, pending);
    case 'admset':
      return onEditSetting(ctx, pending);
    default:
      await clearPending(tgId);
      return ctx.reply('Action cancelled.', { reply_markup: mainMenu() });
  }
}

export async function onNonText(ctx) {
  const tgId = ctx.from.id;
  const pending = await getPending(tgId);
  if (pending && pending.state.startsWith('pay')) {
    return ctx.reply(
      '📸 Screenshot received! To complete payment verification, please also send the <b>transaction hash / UTR as text</b>.',
      { parse_mode: 'HTML' }
    );
  }
  return ctx.reply('Please send text like a transaction reference, or use the menu buttons below 👇', {
    reply_markup: mainMenu(),
  });
}
