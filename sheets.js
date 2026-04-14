const { google } = require('googleapis');
const { v4: uuidv4 } = require('uuid');
const { createCalendarEvent, deleteCalendarEvent } = require('./calendar');

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const SHEET_NAME = '予約データ';
// 列順: A=ステータス B=日付 C=時間 D=コース E=名前 F=電話番号 G=症状 H=作成日時 I=予約ID J=LINEユーザーID K=カレンダーイベントID
const HEADERS = ['ステータス', '日付', '時間', 'コース', '名前', '電話番号', '症状', '作成日時', '予約ID', 'LINEユーザーID', 'カレンダーイベントID'];

// 列インデックス定数
const COL = { STATUS: 0, DATE: 1, TIME: 2, COURSE: 3, NAME: 4, PHONE: 5, SYMPTOMS: 6, CREATED_AT: 7, ID: 8, USER_ID: 9, CALENDAR_ID: 10 };

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
    range: `${SHEET_NAME}!A1:K1`,
  });

  if (!res.data.values || res.data.values[0]?.length !== HEADERS.length || res.data.values[0]?.[0] !== 'ステータス') {
    await sheets.spreadsheets.values.update({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: `${SHEET_NAME}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [HEADERS] },
    });
  }

  await ensureConditionalFormatting(sheets);
}

// ─── 条件付き書式（ステータス列 A列 の色分け） ──────────────────────
async function ensureConditionalFormatting(sheets) {
  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
  });

  const sheet = spreadsheet.data.sheets.find(s => s.properties.title === SHEET_NAME);
  if (!sheet) return;

  const sid = sheet.properties.sheetId;
  const existingFormats = sheet.conditionalFormats || [];

  // A列（index 0）に正しい書式が既にあればスキップ
  const alreadyCorrect = existingFormats.some(f =>
    f.ranges?.some(r => r.startColumnIndex === 0 && r.sheetId === sid)
  );
  if (alreadyCorrect) return;

  const requests = [];

  // 古い書式を全削除（インデックス0を繰り返し削除）
  for (let i = 0; i < existingFormats.length; i++) {
    requests.push({ deleteConditionalFormatRule: { sheetId: sid, index: 0 } });
  }

  // ステータス列（A列 = index 0）に新しい書式を追加
  const statusRange = { sheetId: sid, startRowIndex: 1, startColumnIndex: 0, endColumnIndex: 1 };
  requests.push({
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
  });
  requests.push({
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
  });

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    requestBody: { requests },
  });
}

// ─── 全行取得 ─────────────────────────────────────────────────────
async function getAllRows(sheets) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: `${SHEET_NAME}!A2:K`,
  });
  return res.data.values || [];
}

function rowToReservation(row) {
  return {
    id:            row[COL.ID],
    userId:        row[COL.USER_ID],
    name:          row[COL.NAME],
    phone:         row[COL.PHONE],
    date:          row[COL.DATE],
    time:          row[COL.TIME],
    course:        row[COL.COURSE],
    symptoms:      row[COL.SYMPTOMS],
    createdAt:     row[COL.CREATED_AT],
    status:        row[COL.STATUS],
    calendarEventId: row[COL.CALENDAR_ID],
  };
}

// ─── 予約作成 ─────────────────────────────────────────────────────
async function createReservation({ userId, name, phone, date, time, course, symptoms }) {
  const sheets = await getSheetsClient();
  await ensureHeaders(sheets);

  // 重複チェック
  const rows = await getAllRows(sheets);
  const conflict = rows.find(r => r[COL.DATE] === date && r[COL.TIME] === time && r[COL.STATUS] !== 'キャンセル済');
  if (conflict) throw new Error('その時間帯はすでに予約済みです');

  // Googleカレンダーに登録
  const calendarEventId = await createCalendarEvent({ name, phone, date, time, symptoms });

  const id = uuidv4();
  const createdAt = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
  // 列順: ステータス, 日付, 時間, コース, 名前, 電話番号, 症状, 作成日時, 予約ID, LINEユーザーID, カレンダーイベントID
  const row = ['確定', date, time, course || '', name, phone, symptoms || '', createdAt, id, userId, calendarEventId];

  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: `${SHEET_NAME}!A:K`,
    valueInputOption: 'RAW',
    requestBody: { values: [row] },
  });

  return { id, userId, name, phone, date, time, course, symptoms, createdAt, status: '確定' };
}

// ─── ユーザーの予約一覧 ───────────────────────────────────────────
async function getUserReservations(userId) {
  const sheets = await getSheetsClient();
  const rows = await getAllRows(sheets);

  const today = new Date().toISOString().slice(0, 10);
  return rows
    .filter(r => r[COL.USER_ID] === userId && r[COL.DATE] >= today)
    .map(rowToReservation);
}

// ─── キャンセル ───────────────────────────────────────────────────
async function cancelReservation(userId, reservationId) {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: `${SHEET_NAME}!A:K`,
  });

  const rows = res.data.values || [];
  const rowIndex = rows.findIndex(r => r[COL.ID] === reservationId && r[COL.USER_ID] === userId);
  if (rowIndex < 0) throw new Error('予約が見つかりません');

  const row = rows[rowIndex];
  if (row[COL.STATUS] === 'キャンセル済') throw new Error('すでにキャンセル済みです');

  // カレンダーから削除
  if (row[COL.CALENDAR_ID]) {
    try { await deleteCalendarEvent(row[COL.CALENDAR_ID]); } catch {}
  }

  // シートのステータス更新（A列 = ステータス）
  const sheetRow = rowIndex + 1;
  await sheets.spreadsheets.values.update({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: `${SHEET_NAME}!A${sheetRow}`,
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
    .filter(r => r[COL.DATE] === tomorrowStr && r[COL.STATUS] === '確定')
    .map(rowToReservation);
}

module.exports = { createReservation, getUserReservations, cancelReservation, getTomorrowReservations };
