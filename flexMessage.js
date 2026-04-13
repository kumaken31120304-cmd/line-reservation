function buildMenuFlex() {
  const liffUrl = `https://liff.line.me/${process.env.LIFF_ID}`;
  return {
    type: 'flex',
    altText: '予約メニュー',
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#4CAF50',
        paddingAll: 'lg',
        contents: [
          { type: 'text', text: '🌿 整体院 予約メニュー', color: '#ffffff', size: 'lg', weight: 'bold', align: 'center' },
          { type: 'text', text: 'ご希望のメニューをお選びください', color: '#E8F5E9', size: 'sm', align: 'center', margin: 'sm' },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        paddingAll: 'lg',
        contents: [
          menuButton('📅 予約する',      '#4CAF50', { type: 'uri',     label: '📅 予約する',      uri: liffUrl }),
          menuButton('🕐 直近の空き時間', '#ffffff', { type: 'message', label: '🕐 直近の空き時間', text: '空き時間を見る' }, '#4CAF50'),
          menuButton('📋 予約確認',      '#ffffff', { type: 'message', label: '📋 予約確認',      text: '予約確認' },       '#333333'),
          menuButton('❌ キャンセル',    '#ffffff', { type: 'message', label: '❌ キャンセル',    text: 'キャンセル' },     '#e53935'),
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        paddingAll: 'md',
        contents: [
          { type: 'text', text: '営業時間 9:00〜20:00', color: '#999999', size: 'xs', align: 'center' },
        ],
      },
    },
  };
}

function menuButton(label, bgColor, action, borderColor) {
  const isPrimary = bgColor !== '#ffffff';
  const btn = { type: 'button', action, height: 'sm' };
  if (isPrimary) { btn.style = 'primary'; btn.color = bgColor; }
  else           { btn.style = 'secondary'; }
  return { type: 'box', layout: 'vertical', margin: 'sm', contents: [btn] };
}

function buildReservationConfirmFlex(r) {
  return {
    type: 'flex',
    altText: '予約が確定しました',
    contents: {
      type: 'bubble',
      header: {
        type: 'box', layout: 'vertical', backgroundColor: '#4CAF50', paddingAll: 'lg',
        contents: [{ type: 'text', text: '✅ 予約が確定しました', color: '#ffffff', size: 'lg', weight: 'bold', align: 'center' }],
      },
      body: {
        type: 'box', layout: 'vertical', spacing: 'md', paddingAll: 'lg',
        contents: [
          infoRow('お名前', r.name), infoRow('日付', r.date), infoRow('時間', r.time), infoRow('電話番号', r.phone),
          ...(r.symptoms ? [infoRow('症状', r.symptoms)] : []),
          { type: 'separator', margin: 'md' },
          { type: 'text', text: 'ご来院をお待ちしております😊', color: '#4CAF50', size: 'sm', align: 'center', margin: 'md' },
        ],
      },
    },
  };
}

function buildReservationListFlex(reservations, showCancel = false) {
  const bubbles = reservations.map(r => {
    const bubble = {
      type: 'bubble', size: 'kilo',
      header: {
        type: 'box', layout: 'vertical', backgroundColor: '#4CAF50', paddingAll: 'md',
        contents: [{ type: 'text', text: `📅 ${r.date} ${r.time}`, color: '#ffffff', weight: 'bold', size: 'md' }],
      },
      body: {
        type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: 'md',
        contents: [infoRow('お名前', r.name), infoRow('予約ID', r.id.slice(0, 8) + '...'), ...(r.symptoms ? [infoRow('症状', r.symptoms)] : [])],
      },
    };
    if (showCancel) {
      bubble.footer = {
        type: 'box', layout: 'vertical',
        contents: [{ type: 'button', style: 'secondary', action: { type: 'postback', label: 'この予約をキャンセル', data: `action=cancel&id=${r.id}`, displayText: `予約ID:${r.id.slice(0, 8)}をキャンセル` } }],
      };
    }
    return bubble;
  });
  return { type: 'flex', altText: '予約一覧', contents: { type: 'carousel', contents: bubbles } };
}

function infoRow(label, value) {
  return {
    type: 'box', layout: 'horizontal',
    contents: [
      { type: 'text', text: label,        size: 'sm', color: '#888888', flex: 2 },
      { type: 'text', text: value || '-', size: 'sm', color: '#333333', flex: 3, wrap: true },
    ],
  };
}

function buildAvailableSlotsFlex(daysData) {
  const liffUrl = `https://liff.line.me/${process.env.LIFF_ID}`;
  const dayContents = [];

  daysData.forEach((day, i) => {
    if (i > 0) dayContents.push({ type: 'separator', margin: 'md' });
    dayContents.push({
      type: 'box',
      layout: 'vertical',
      margin: i > 0 ? 'md' : 'none',
      spacing: 'xs',
      contents: [
        { type: 'text', text: day.label, weight: 'bold', size: 'sm', color: '#4CAF50' },
        day.slots.length === 0
          ? { type: 'text', text: '😔 満席', size: 'sm', color: '#999999' }
          : { type: 'text', text: '🕐 ' + day.slots.join('  /  '), size: 'sm', color: '#333333', wrap: true },
      ],
    });
  });

  return {
    type: 'flex',
    altText: '直近の空き時間',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#4CAF50',
        paddingAll: 'lg',
        contents: [
          { type: 'text', text: '📅 直近の空き時間', color: '#ffffff', size: 'lg', weight: 'bold', align: 'center' },
          { type: 'text', text: '今後3日間の空き状況', color: '#E8F5E9', size: 'xs', align: 'center', margin: 'sm' },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: 'lg',
        contents: dayContents,
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        paddingAll: 'md',
        contents: [
          { type: 'button', style: 'primary', color: '#4CAF50', action: { type: 'uri', label: '📅 今すぐ予約する', uri: liffUrl } },
        ],
      },
    },
  };
}

module.exports = { buildMenuFlex, buildReservationConfirmFlex, buildReservationListFlex, buildAvailableSlotsFlex };
