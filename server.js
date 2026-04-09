require('dotenv').config();
const express = require('express');
const path = require('path');
const { validateSignature } = require('@line/bot-sdk');

const app = express();

// ─── 静的ファイル配信 ─────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ─── Webhook用ボディパーサー（先に登録）────────────────────────────
app.use('/webhook', express.raw({ type: '*/*' }));

// ─── API用JSONパーサー ────────────────────────────────────────────
app.use('/api', express.json());

// ─── ヘルスチェック ───────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// ─── LINE Webhook ────────────────────────────────────────────────
app.post('/webhook', async (req, res) => {
  try {
    const rawBody = req.body;
    const signature = req.headers['x-line-signature'];

    if (!rawBody || rawBody.length === 0) {
      console.log('空のボディ（検証リクエスト）');
      return res.status(200).end();
    }

    const bodyStr = Buffer.isBuffer(rawBody) ? rawBody.toString() : String(rawBody);

    if (!validateSignature(bodyStr, process.env.CHANNEL_SECRET, signature)) {
      console.error('署名検証失敗');
      return res.status(200).end();
    }

    const { events } = JSON.parse(bodyStr);
    const { handleEvent } = require('./bot');
    await Promise.all((events || []).map(handleEvent));

    res.status(200).end();
  } catch (e) {
    console.error('Webhookエラー:', e.message);
    res.status(200).end(); // LINEには必ず200を返す
  }
});

// ─── API: 空き枠取得 ──────────────────────────────────────────────
app.get('/api/slots', async (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'dateが必要です' });
  try {
    const { getAvailableSlots } = require('./calendar');
    const slots = await getAvailableSlots(date);
    res.json({ slots });
  } catch (e) {
    console.error('空き枠取得エラー:', e.message);
    res.status(500).json({ error: '空き枠の取得に失敗しました' });
  }
});

// ─── API: 予約作成 ────────────────────────────────────────────────
app.post('/api/reserve', async (req, res) => {
  const { userId, name, phone, date, time, symptoms } = req.body || {};
  if (!userId || !name || !phone || !date || !time) {
    return res.status(400).json({ error: '必須項目が不足しています' });
  }
  try {
    const { createReservation } = require('./sheets');
    const { sendReservationConfirm } = require('./bot');
    const reservation = await createReservation({ userId, name, phone, date, time, symptoms });
    sendReservationConfirm(userId, reservation).catch(e => console.error('LINE通知エラー:', e.message));
    res.json({ success: true, reservation });
  } catch (e) {
    console.error('予約作成エラー:', e.message);
    res.status(500).json({ error: e.message || '予約の作成に失敗しました' });
  }
});

// ─── API: 予約確認 ────────────────────────────────────────────────
app.get('/api/reservations', async (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: 'userIdが必要です' });
  try {
    const { getUserReservations } = require('./sheets');
    const reservations = await getUserReservations(userId);
    res.json({ reservations });
  } catch (e) {
    console.error('予約確認エラー:', e.message);
    res.status(500).json({ error: '予約の取得に失敗しました' });
  }
});

// ─── API: キャンセル ──────────────────────────────────────────────
app.post('/api/cancel', async (req, res) => {
  const { userId, reservationId } = req.body || {};
  if (!userId || !reservationId) {
    return res.status(400).json({ error: '必須項目が不足しています' });
  }
  try {
    const { cancelReservation } = require('./sheets');
    await cancelReservation(userId, reservationId);
    res.json({ success: true });
  } catch (e) {
    console.error('キャンセルエラー:', e.message);
    res.status(500).json({ error: e.message || 'キャンセルに失敗しました' });
  }
});

// ─── リマインダー起動 ─────────────────────────────────────────────
try { require('./reminder'); } catch (e) { console.warn('reminder初期化スキップ:', e.message); }

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`サーバー起動: ポート ${PORT}`));
