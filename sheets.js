const { google } = require('googleapis');
const { v4: uuidv4 } = require('uuid');
const { createCalendarEvent, deleteCalendarEvent } = require('./calendar');

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const SHEET_NAME = '予約データ';
const HEADERS = ['予約ID', 'LINEユーザーID', '名前', '電話番号', '日付', '時間', '症状', '作成日時', 'ステータス', 'カレンダーイベントID'];

function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    },
    scopes: SCOPES,
  });
}

async function getSheetsClient() {
  const auth = getAuth();
  return google.sheets({ version: 'v4', auth });
}

// ─── シート初期化（ヘッダー行がなければ追加） ──────────────────────
async function ensureHeaders(sheets) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: `${SHEET_NAME}!A1:J1`,
  });

  if (!res.data.values || res.data.values[0]?.[0] !== '予約ID') {
    await sheets.spreadsheets.values.update({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: `${SHEET_NAME}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [HEADERS] },
    });
  }

  await ensureConditionalFormatting(sheets);
}

// ─── 条件付き書式（ステータス列の色分け） ───────────────────────────
async function ensureConditionalFormatting(sheets) {
  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
  });

  const sheet = spreadsheet.data.sheets.find(s => s.properties.title === SHEET_NAME);
  if (!sheet) return;

  // すでに設定済みならスキップ
  if (sheet.conditionalFormats && sheet.conditionalFormats.length > 0) return;

  const sid = sheet.properties.sheetId;
  const statusRange = { sheetId: sid, startRowIndex: 1, startColumnIndex: 8, endColumnIndex: 9 };

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    requestBody: {
      requests: [
        {
          addConditionalFormatRule: {
            index: 0,
            rule: {
              ranges: [statusRange],
              booleanRule: {
                condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: '確定' }] },
                format: { backgroundColor: { red: 0.714, green: 0.843, blue: 0.659 } }, // 緑
              },
            },
          },
        },
        {
          addConditionalFormatRule: {
            index: 1,
            rule: {
              ranges: [statusRange],
              booleanRule: {
                condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: 'キャンセル済' }] },
                format: { backgroundColor: { red: 0.918, green: 0.6, blue: 0.6 } }, // 赤
              },
            },
          },
        },
      ],
    },
  });
}

// ─── 全行取得 ─────────────────────────────────────────────────────
async function getAllRows(sheets) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: `${SHEET_NAME}!A2:J`,
  });
  return res.data.values || [];
}

function rowToReservation(row) {
  return {
    id: row[0],
    userId: row[1],
    name: row[2],
    phone: row[3],
    date: row[4],
    time: row[5],
    symptoms: row[6],
    createdAt: row[7],
    status: row[8],
    calendarEventId: row[9],
  };
}

// ─── 予約作成 ─────────────────────────────────────────────────────
async function createReservation({ userId, name, phone, date, time, symptoms }) {
  const sheets = await getSheetsClient();
  await ensureHeaders(sheets);

  // 重複チェック
  const rows = await getAllRows(sheets);
  const conflict = rows.find(r => r[4] === date && r[5] === time && r[8] !== 'キャンセル済');
  if (conflict) throw new Error('その時間帯はすでに予約済みです');

  // Googleカレンダーに登録
  const calendarEventId = await createCalendarEvent({ name, phone, date, time, symptoms });

  const id = uuidv4();
  const createdAt = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
  const row = [id, userId, name, phone, date, time, symptoms || '', createdAt, '確定', calendarEventId];

  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: `${SHEET_NAME}!A:J`,
    valueInputOption: 'RAW',
    requestBody: { values: [row] },
  });

  const reservation = { id, userId, name, phone, date, time, symptoms, createdAt, status: '確定' };
  return reservation;
}

// ─── ユーザーの予約一覧 ───────────────────────────────────────────
async function getUserReservations(userId) {
  const sheets = await getSheetsClient();
  const rows = await getAllRows(sheets);

  const today = new Date().toISOString().slice(0, 10);
  return rows
    .filter(r => r[1] === userId && r[4] >= today)
    .map(rowToReservation);
}

// ─── キャンセル ───────────────────────────────────────────────────
async function cancelReservation(userId, reservationId) {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: `${SHEET_NAME}!A:J`,
  });

  const rows = res.data.values || [];
  const rowIndex = rows.findIndex(r => r[0] === reservationId && r[1] === userId);
  if (rowIndex < 0) throw new Error('予約が見つかりません');

  const row = rows[rowIndex];
  if (row[8] === 'キャンセル済') throw new Error('すでにキャンセル済みです');

  // カレンダーから削除
  if (row[9]) {
    try { await deleteCalendarEvent(row[9]); } catch {}
  }

  // シートのステータス更新（9列目 = I列）
  const sheetRow = rowIndex + 1;
  await sheets.spreadsheets.values.update({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: `${SHEET_NAME}!I${sheetRow}`,
    valueInputOption: 'RAW',
    requestBody: { values: [['キャンセル済']] },
  });

  return rowToReservation(row);
}

// ─── 翌日の予約一覧（リマインド用） ──────────────────────────────
async function getTomorrowReservations() {
  const sheets = await getSheetsClient();
  const rows = await getAllRows(sheets);

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);

  return rows
    .filter(r => r[4] === tomorrowStr && r[8] === '確定')
    .map(rowToReservation);
}

module.exports = { createReservation, getUserReservations, cancelReservation, getTomorrowReservations };
