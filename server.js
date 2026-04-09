require('dotenv').config();
const express = require('express');
const path = require('path');
const { validateSignature } = require('@line/bot-sdk');
const { handleEvent, sendReservationConfirm } = require('./bot');
const { getAvailableSlots } = require('./calendar');
const { createReservation, getUserReservations, cancelReservation } = require('./sheets');
try { require('./reminder'); } catch (e) { console.warn('reminder初期化スキップ:', e.message); }

const app = express();

// LIFF静的ファイル配信
app.use(express.static(path.join(__dirname, 'public')));

// API用JSONパーサー（/api/* のみ）
app.use('/api', express.json());

// ─── LINE Webhook ────────────────────────────────────────────────
app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const rawBody = req.body;
  const signature = req.headers['x-line-signature'];

  if (!Buffer.isBuffer(rawBody)) {
    console.error('rawBodyがBufferではありません:', typeof rawBody);
    return res.status(200).end();
  }

  if (!validateSignature(rawBody.toString(), process.env.CHANNEL_SECRET, signature)) {
    console.error('署名検証失敗');
    return res.status(200).end();
  }

  const events = JSON.parse(rawBody.toString()).events;
  try {
    await Promise.all(events.map(handleEvent));
  } catch (e) {
    console.error('イベント処理エラー:', e);
  }
  res.status(200).end();
});

// ─── API: 空き枠取得 ──────────────────────────────────────────────
app.get('/api/slots', async (req, res) => {
  const { date } = req.query; // 例: 2026-04-10
  if (!date) return res.status(400).json({ error: 'dateが必要です' });

  try {
    const slots = await getAvailableSlots(date);
    res.json({ slots });
  } catch (e) {
    console.error('空き枠取得エラー:', e);
    res.status(500).json({ error: '空き枠の取得に失敗しました' });
  }
});

// ─── API: 予約作成 ────────────────────────────────────────────────
app.post('/api/reserve', async (req, res) => {
  const { userId, name, phone, date, time, symptoms } = req.body;
  if (!userId || !name || !phone || !date || !time) {
    return res.status(400).json({ error: '必須項目が不足しています' });
  }

  try {
    const reservation = await createReservation({ userId, name, phone, date, time, symptoms });
    // 予約確定通知をLINEに送信
    sendReservationConfirm(userId, reservation).catch(e => console.error('LINE通知エラー:', e));
    res.json({ success: true, reservation });
  } catch (e) {
    console.error('予約作成エラー:', e);
    res.status(500).json({ error: e.message || '予約の作成に失敗しました' });
  }
});

// ─── API: 予約確認 ────────────────────────────────────────────────
app.get('/api/reservations', async (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: 'userIdが必要です' });

  try {
    const reservations = await getUserReservations(userId);
    res.json({ reservations });
  } catch (e) {
    console.error('予約確認エラー:', e);
    res.status(500).json({ error: '予約の取得に失敗しました' });
  }
});

// ─── API: キャンセル ──────────────────────────────────────────────
app.post('/api/cancel', async (req, res) => {
  const { userId, reservationId } = req.body;
  if (!userId || !reservationId) {
    return res.status(400).json({ error: '必須項目が不足しています' });
  }

  try {
    await cancelReservation(userId, reservationId);
    res.json({ success: true });
  } catch (e) {
    console.error('キャンセルエラー:', e);
    res.status(500).json({ error: e.message || 'キャンセルに失敗しました' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`サーバー起動: ポート ${PORT}`));
