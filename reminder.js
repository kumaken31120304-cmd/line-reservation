const cron = require('node-cron');
const { getTomorrowReservations } = require('./sheets');
const { sendReminder } = require('./bot');

// 毎日 10:00 JST にリマインド送信
// Render は UTC なので UTC 01:00 = JST 10:00
cron.schedule('0 1 * * *', async () => {
  console.log('リマインド送信開始...');
  try {
    const reservations = await getTomorrowReservations();
    console.log(`対象予約数: ${reservations.length}`);

    for (const r of reservations) {
      await sendReminder(r.userId, r);
      console.log(`リマインド送信: ${r.userId} (${r.date} ${r.time})`);
    }
  } catch (e) {
    console.error('リマインドエラー:', e);
  }
}, {
  timezone: 'UTC',
});

console.log('リマインドcronジョブを登録しました（毎日10:00 JST）');
