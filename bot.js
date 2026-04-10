const { messagingApi } = require('@line/bot-sdk');
const { buildMenuFlex, buildReservationConfirmFlex, buildReservationListFlex } = require('./flexMessage');
const { getAvailableSlots } = require('./calendar');
const { getUserReservations } = require('./sheets');

const client = new messagingApi.MessagingApiClient({
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
});

async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') return;
  const text = event.message.text.trim();
  const userId = event.source.userId;
  if (!userId) { console.warn('userId なし'); return; }
  console.log(`[handleEvent] userId=${userId}, text="${text}"`);
  try {
    if (text.includes('予約') || text === 'メニュー') return await replyMenu(userId);
    if (text.includes('空き')) return await replyAvailableSlots(userId);
    if (text.includes('確認')) return await replyUserReservations(userId);
    if (text.includes('キャンセル')) return await replyUserReservations(userId, true);
    await push(userId, [{ type: 'text', text: '「予約」と送信すると予約メニューが表示されます😊' }]);
  } catch (e) { logError('handleEvent', e); }
}

async function push(userId, messages) {
  return client.pushMessage({ to: userId, messages });
}

function logError(tag, e) {
  const body = e.body ?? e.responseData ?? '';
  console.error(`[${tag}] エラー:`, e.status ?? e.statusCode ?? '', e.message ?? e);
  if (body) console.error(`[${tag}] LINE詳細:`, JSON.stringify(body));
}

async function replyMenu(userId) {
  let flex;
  try { flex = buildMenuFlex(); } catch (buildErr) {
    console.error('[replyMenu] buildMenuFlex失敗:', buildErr.message);
    await push(userId, [{ type: 'text', text: 'メニューの構築に失敗しました。' }]).catch(() => {});
    return;
  }
  console.log('[replyMenu] Flexメッセージ:', JSON.stringify(flex).slice(0, 300));
  try {
    await push(userId, [flex]);
  } catch (e) {
    logError('replyMenu', e);
    await push(userId, [{ type: 'text', text: 'メニューの表示に失敗しました。しばらく経ってから再度お試しください。' }]).catch(() => {});
  }
}

async function replyAvailableSlots(userId) {
  const lines = ['📅 直近の空き時間\n'];
  const today = new Date();
  for (let i = 0; i < 3; i++) {
    const d = new Date(today); d.setDate(today.getDate() + i);
    const dateStr = formatDate(d);
    const label = i === 0 ? '今日' : i === 1 ? '明日' : dateStr;
    try {
      const slots = await getAvailableSlots(dateStr);
      lines.push(slots.length === 0 ? `${label}（${dateStr}）：満席` : `${label}（${dateStr}）：${slots.join(' / ')}`);
    } catch (e) { lines.push(`${label}（${dateStr}）：取得失敗`); }
  }
  lines.push('\n詳細はこちら👇');
  try { await push(userId, [{ type: 'text', text: lines.join('\n') }, buildMenuFlex()]); }
  catch (e) { logError('replyAvailableSlots', e); }
}

async function replyUserReservations(userId, showCancel = false) {
  try {
    const reservations = await getUserReservations(userId);
    const upcoming = reservations.filter(r => r.status !== 'キャンセル済');
    if (upcoming.length === 0) {
      await push(userId, [{ type: 'text', text: '現在の予約はありません。\n「予約」と送信して予約してください😊' }]);
      return;
    }
    await push(userId, [buildReservationListFlex(upcoming, showCancel)]);
  } catch (e) {
    logError('replyUserReservations', e);
    await push(userId, [{ type: 'text', text: '予約情報の取得に失敗しました。' }]).catch(() => {});
  }
}

async function sendReservationConfirm(userId, reservation) {
  try { await push(userId, [buildReservationConfirmFlex(reservation)]); }
  catch (e) { logError('sendReservationConfirm', e); }
}

async function sendReminder(userId, reservation) {
  try {
    await push(userId, [{
      type: 'text',
      text: `🔔 明日は整体のご予約日です！\n\n📅 ${reservation.date}（${reservation.time}）\n\nご来院をお待ちしております😊`,
    }]);
  } catch (e) { logError('sendReminder', e); }
}

function formatDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

module.exports = { handleEvent, sendReservationConfirm, sendReminder };
