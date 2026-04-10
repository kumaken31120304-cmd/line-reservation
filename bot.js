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

  if (!userId) {
    console.warn('userId が取得できませんでした');
    return;
  }

  console.log(`[handleEvent] userId=${userId}, text="${text}"`);

  try {
    if (text.includes('予約') || text === 'メニュー') {
      return await replyMenu(userId);
    }
    if (text.includes('空き') || text.includes('空き時間')) {
      return await replyAvailableSlots(userId);
    }
    if (text.includes('確認') || text.includes('予約確認')) {
      return await replyUserReservations(userId);
    }
    if (text.includes('キャンセル')) {
      return await replyUserReservations(userId, true);
    }
    await client.pushMessage({
      to: userId,
      messages: [{ type: 'text', text: '「予約」と送信すると予約メニューが表示されます😊' }],
    });
  } catch (e) {
    console.error('[handleEvent] エラー:', e.message || e);
  }
}

async function replyMenu(userId) {
  try {
    await client.pushMessage({
      to: userId,
      messages: [buildMenuFlex()],
    });
  } catch (e) {
    console.error('[replyMenu] エラー:', e.message || e);
    await client.pushMessage({
      to: userId,
      messages: [{ type: 'text', text: 'メニューの表示に失敗しました。しばらく経ってから再度お試しください。' }],
    }).catch(err => console.error('[replyMenu] フォールバックも失敗:', err.message));
  }
}

async function replyAvailableSlots(userId) {
  const lines = ['�� 直近の空き時間\n'];
  const today = new Date();
  for (let i = 0; i < 3; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const dateStr = formatDate(d);
    const label = i === 0 ? '今日' : i === 1 ? '明日' : dateStr;
    try {
      const slots = await getAvailableSlots(dateStr);
      if (slots.length === 0) {
        lines.push(`${label}（${dateStr}）：満席`);
      } else {
        lines.push(`${label}（${dateStr}）：${slots.join(' / ')}`);
      }
    } catch (e) {
      console.error(`[replyAvailableSlots] ${dateStr} 取得失敗:`, e.message || e);
      lines.push(`${label}（${dateStr}）：取得失敗`);
    }
  }
  lines.push('\n詳細はこちら👇');
  try {
    await client.pushMessage({
      to: userId,
      messages: [
        { type: 'text', text: lines.join('\n') },
        buildMenuFlex(),
      ],
    });
  } catch (e) {
    console.error('[replyAvailableSlots] 送信エラー:', e.message || e);
  }
}

async function replyUserReservations(userId, showCancel = false) {
  try {
    const reservations = await getUserReservations(userId);
    const upcoming = reservations.filter(r => r.status !== 'キャンセル済');
    if (upcoming.length === 0) {
      await client.pushMessage({
        to: userId,
        messages: [{ type: 'text', text: '現在の予約はありません。\n「予約」と送信して予約してください😊' }],
      });
      return;
    }
    await client.pushMessage({
      to: userId,
      messages: [buildReservationListFlex(upcoming, showCancel)],
    });
  } catch (e) {
    console.error('[replyUserReservations] エラー:', e.message || e);
    await client.pushMessage({
      to: userId,
      messages: [{ type: 'text', text: '予約情報の取得に失敗しました。しばらく経ってから再度お試しください。' }],
    }).catch(err => console.error('[replyUserReservations] フォールバックも失敗:', err.message));
  }
}

async function sendReservationConfirm(userId, reservation) {
  try {
    await client.pushMessage({
      to: userId,
      messages: [buildReservationConfirmFlex(reservation)],
    });
  } catch (e) {
    console.error('[sendReservationConfirm] 確定通知送信エラー:', e.message || e);
  }
}

async function sendReminder(userId, reservation) {
  try {
    await client.pushMessage({
      to: userId,
      messages: [{
        type: 'text',
        text: `🔔 明日は整体のご予約日です！\n\n📅 ${reservation.date}（${reservation.time}）\n\nご来院をお待ちしております😊\nご変更はLINEからどうぞ。`,
      }],
    });
  } catch (e) {
    console.error('[sendReminder] リマインド送信エラー:', e.message || e);
  }
}

function formatDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

module.exports = { handleEvent, sendReservationConfirm, sendReminder };
