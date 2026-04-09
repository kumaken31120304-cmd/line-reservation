const { google } = require('googleapis');

const SCOPES = ['https://www.googleapis.com/auth/calendar'];

// 予約可能時間帯（9〜20時、1時間単位）
const ALL_HOURS = ['9:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00'];

function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    },
    scopes: SCOPES,
  });
}

// ─── 空き枠取得 ───────────────────────────────────────────────────
async function getAvailableSlots(dateStr) {
  const auth = getAuth();
  const calendar = google.calendar({ version: 'v3', auth });

  // 日付の開始・終了時刻（JST = UTC+9）
  const timeMin = new Date(`${dateStr}T00:00:00+09:00`).toISOString();
  const timeMax = new Date(`${dateStr}T23:59:59+09:00`).toISOString();

  const response = await calendar.freebusy.query({
    requestBody: {
      timeMin,
      timeMax,
      timeZone: 'Asia/Tokyo',
      items: [{ id: process.env.GOOGLE_CALENDAR_ID }],
    },
  });

  const busyRanges = response.data.calendars[process.env.GOOGLE_CALENDAR_ID].busy;

  // 各時間帯が埋まっているか確認
  const available = ALL_HOURS.filter(hour => {
    const [h] = hour.split(':').map(Number);
    const slotStart = new Date(`${dateStr}T${String(h).padStart(2, '0')}:00:00+09:00`);
    const slotEnd = new Date(`${dateStr}T${String(h + 1).padStart(2, '0')}:00:00+09:00`);

    return !busyRanges.some(busy => {
      const busyStart = new Date(busy.start);
      const busyEnd = new Date(busy.end);
      return slotStart < busyEnd && slotEnd > busyStart;
    });
  });

  // 過去の時間は除外
  const now = new Date();
  return available.filter(hour => {
    const [h] = hour.split(':').map(Number);
    const slotTime = new Date(`${dateStr}T${String(h).padStart(2, '0')}:00:00+09:00`);
    return slotTime > now;
  });
}

// ─── カレンダーに予定作成 ─────────────────────────────────────────
async function createCalendarEvent({ name, phone, date, time, symptoms }) {
  const auth = getAuth();
  const calendar = google.calendar({ version: 'v3', auth });

  const [h] = time.split(':').map(Number);
  const startTime = `${date}T${String(h).padStart(2, '0')}:00:00+09:00`;
  const endTime = `${date}T${String(h + 1).padStart(2, '0')}:00:00+09:00`;

  const event = {
    summary: `【予約】${name}`,
    description: `電話: ${phone}\n症状: ${symptoms || 'なし'}`,
    start: { dateTime: startTime, timeZone: 'Asia/Tokyo' },
    end: { dateTime: endTime, timeZone: 'Asia/Tokyo' },
  };

  const response = await calendar.events.insert({
    calendarId: process.env.GOOGLE_CALENDAR_ID,
    requestBody: event,
  });

  return response.data.id;
}

// ─── カレンダーの予定を削除 ───────────────────────────────────────
async function deleteCalendarEvent(eventId) {
  const auth = getAuth();
  const calendar = google.calendar({ version: 'v3', auth });

  await calendar.events.delete({
    calendarId: process.env.GOOGLE_CALENDAR_ID,
    eventId,
  });
}

module.exports = { getAvailableSlots, createCalendarEvent, deleteCalendarEvent };
