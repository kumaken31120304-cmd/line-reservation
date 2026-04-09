const { Client } = require('@line/bot-sdk');
const { buildMenuFlex, buildReservationConfirmFlex, buildReservationListFlex } = require('./flexMessage');
const { getAvailableSlots } = require('./calendar');
const { getUserReservations } = require('./sheets');

const client = new Client({
  channelSecret: process.env.CHANNEL_SECRET,
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
});

// ─── メインイベントハンドラー ──────────────────────────────────────
async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') return;

  const text = event.message.text.trim();
  const replyToken = event.replyToken;
  const userId = event.source.userId;

  if (text.includes('予約') || text === 'メニュー') {
    return replyMenu(replyToken);
  }
  if (text.includes('空き') || text.includes('空き時間')) {
    return replyAvailableSlots(replyToken);
  }
  if (text.includes('確認') || text.includes('予約確認')) {
    return replyUserReservations(replyToken, userId);
  }
  if (text.includes('キャンセル')) {
    return replyUserReservations(replyToken, userId, true);
  }

  // デフォルト返答
  return client.replyMessage(replyToken, {
    type: 'text',
    text: '「予約」と送信すると予約メニューが表示されます😊',
  });
}

// ─── 予約メニュー ─────────────────────────────────────────────────
async function replyMenu(replyToken) {
  return client.replyMessage(replyToken, buildMenuFlex());
}

// ─── 空き時間案内（今日〜3日分） ──────────────────────────────────
async function replyAvailableSlots(replyToken) {
  const lines = ['📅 *直近の空き時間*\n'];
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
    } catch {
      lines.push(`${label}（${dateStr}）：取得失敗`);
    }
  }

  lines.push('\n詳細はこちら👇');

  return client.replyMessage(replyToken, [
    { type: 'text', text: lines.join('\n') },
    buildMenuFlex(),
  ]);
}

// ─── 予約確認 ─────────────────────────────────────────────────────
async function replyUserReservations(replyToken, userId, showCancel = false) {
  try {
    const reservations = await getUserReservations(userId);
    const upcoming = reservations.filter(r => r.status !== 'キャンセル済');

    if (upcoming.length === 0) {
      return client.replyMessage(replyToken, {
        type: 'text',
        text: '現在の予約はありません。\n「予約」と送信して予約してください😊',
      });
    }

    return client.replyMessage(replyToken, buildReservationListFlex(upcoming, showCancel));
  } catch (e) {
    console.error(e);
    return client.replyMessage(replyToken, {
      type: 'text',
      text: '予約情報の取得に失敗しました。しばらく経ってから再度お試しください。',
    });
  }
}

// ─── 予約確定通知（APIから呼ばれる） ─────────────────────────────
async function sendReservationConfirm(userId, reservation) {
  try {
    await client.pushMessage(userId, buildReservationConfirmFlex(reservation));
  } catch (e) {
    console.error('確定通知送信エラー:', e);
  }
}

// ─── リマインド送信（reminderから呼ばれる） ───────────────────────
async function sendReminder(userId, reservation) {
  try {
    await client.pushMessage(userId, {
      type: 'text',
      text: `🔔 明日は整体のご予約日です！\n\n📅 ${reservation.date}（${reservation.time}）\n\nご来院をお待ちしております😊\nご変更はLINEからどうぞ。`,
    });
  } catch (e) {
    console.error('リマインド送信エラー:', e);
  }
}

function formatDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

module.exports = { handleEvent, sendReservationConfirm, sendReminder };
