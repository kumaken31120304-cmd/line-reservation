const { messagingApi } = require('@line/bot-sdk');
const { buildMenuFlex, buildReservationConfirmFlex, buildReservationListFlex, buildAvailableSlotsFlex } = require('./flexMessage');
const { getAvailableSlots } = require('./calendar');
const { getUserReservations, cancelReservation } = require('./sheets');

const client = new messagingApi.MessagingApiClient({
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
});

async function handleEvent(event) {
  const userId = event.source?.userId;
  if (!userId) { console.warn('userId なし'); return; }

  if (event.type === 'postback') {
    return await handlePostback(event, userId);
  }

  if (event.type !== 'message' || event.message.type !== 'text') return;
  const text = event.message.text.trim();
  console.log(`[handleEvent] userId=${userId}, text="${text}"`);
  try {
    if (text.includes('確認')) return await replyUserReservations(userId);
    if (text.includes('キャンセル')) return await replyUserReservations(userId, true);
    if (text.includes('空き')) return await replyAvailableSlots(userId);
    if (text.includes('予約') || text === 'メニュー') return await replyMenu(userId);
    await push(userId, [{ type: 'text', text: '「予約」と送信すると予約メニューが表示されます😊' }]);
  } catch (e) { logError('handleEvent', e); }
}

async function handlePostback(event, userId) {
  const params = new URLSearchParams(event.postback.data);
  const action = params.get('action');
  const id = params.get('id');

  if (action === 'cancel' && id) {
    try {
      await cancelReservation(userId, id);
      await push(userId, [{ type: 'text', text: '✅ 予約をキャンセルしました。\nまたのご利用をお待ちしております😊' }]);
    } catch (e) {
      logError('handlePostback cancel', e);
      await push(userId, [{ type: 'text', text: `キャンセルに失敗しました。\n${e.message}` }]).catch(() => {});
    }
  }
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
  const today = new Date();
  const daysData = [];
  for (let i = 1; i <= 3; i++) {
    const d = new Date(today); d.setDate(today.getDate() + i);
    const dateStr = formatDate(d);
    const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
    const dateJa = `${d.getMonth() + 1}月${d.getDate()}日（${dayNames[d.getDay()]}）`;
    const label = i === 1 ? `明日  ${dateJa}` : dateJa;
    try {
      const slots = await getAvailableSlots(dateStr);
      daysData.push({ label, slots });
    } catch (e) { daysData.push({ label, slots: [] }); }
  }
  try { await push(userId, [buildAvailableSlotsFlex(daysData)]); }
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
