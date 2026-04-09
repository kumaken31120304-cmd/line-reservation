// ─── 予約メニュー Flex Message ─────────────────────────────────────
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
        paddingAll: '20px',
        contents: [
          {
            type: 'text',
            text: '🌿 整体院 予約メニュー',
            color: '#ffffff',
            size: 'lg',
            weight: 'bold',
            align: 'center',
          },
          {
            type: 'text',
            text: 'ご希望のメニューをお選びください',
            color: '#E8F5E9',
            size: 'sm',
            align: 'center',
            margin: 'sm',
          },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        paddingAll: '16px',
        contents: [
          menuButton('📅 予約する', '#4CAF50', '#ffffff', { type: 'uri', uri: liffUrl }),
          menuButton('🕐 空き時間を見る', '#ffffff', '#4CAF50', { type: 'message', text: '空き時間を見る' }, '#4CAF50'),
          menuButton('📋 予約確認', '#ffffff', '#333333', { type: 'message', text: '予約確認' }, '#333333'),
          menuButton('❌ キャンセル', '#ffffff', '#e53935', { type: 'message', text: 'キャンセル' }, '#e53935'),
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: '営業時間 9:00〜20:00',
            color: '#999999',
            size: 'xs',
            align: 'center',
          },
        ],
      },
    },
  };
}

function menuButton(label, bgColor, textColor, action, borderColor = null) {
  const btn = {
    type: 'button',
    style: 'primary',
    color: bgColor,
    action,
    height: 'sm',
    margin: 'sm',
  };
  if (borderColor) {
    btn.style = 'secondary';
    btn.color = borderColor;
  }
  return {
    type: 'box',
    layout: 'vertical',
    contents: [
      {
        type: 'button',
        style: bgColor === '#ffffff' ? 'secondary' : 'primary',
        color: bgColor === '#ffffff' ? undefined : bgColor,
        action,
        height: 'sm',
        label,
      },
    ],
  };
}

// ─── 予約確定 Flex Message ─────────────────────────────────────────
function buildReservationConfirmFlex(r) {
  return {
    type: 'flex',
    altText: '予約が確定しました',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#4CAF50',
        paddingAll: '20px',
        contents: [
          {
            type: 'text',
            text: '✅ 予約が確定しました',
            color: '#ffffff',
            size: 'lg',
            weight: 'bold',
            align: 'center',
          },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        paddingAll: '16px',
        contents: [
          infoRow('お名前', r.name),
          infoRow('日付', r.date),
          infoRow('時間', r.time),
          infoRow('電話番号', r.phone),
          r.symptoms ? infoRow('症状', r.symptoms) : null,
          {
            type: 'separator',
            margin: 'md',
          },
          {
            type: 'text',
            text: 'ご来院をお待ちしております😊',
            color: '#4CAF50',
            size: 'sm',
            align: 'center',
            margin: 'md',
          },
        ].filter(Boolean),
      },
    },
  };
}

// ─── 予約一覧 Flex Message ────────────────────────────────────────
function buildReservationListFlex(reservations, showCancel = false) {
  const baseUrl = process.env.BASE_URL;

  const bubbles = reservations.map(r => ({
    type: 'bubble',
    size: 'kilo',
    header: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#4CAF50',
      paddingAll: '12px',
      contents: [
        {
          type: 'text',
          text: `📅 ${r.date} ${r.time}`,
          color: '#ffffff',
          weight: 'bold',
          size: 'md',
        },
      ],
    },
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      paddingAll: '12px',
      contents: [
        infoRow('お名前', r.name),
        infoRow('予約ID', r.id.slice(0, 8) + '...'),
        r.symptoms ? infoRow('症状', r.symptoms) : null,
      ].filter(Boolean),
    },
    footer: showCancel
      ? {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'button',
              style: 'secondary',
              color: '#e53935',
              label: 'この予約をキャンセル',
              action: {
                type: 'postback',
                label: 'キャンセル',
                data: `action=cancel&id=${r.id}`,
                displayText: `予約ID:${r.id.slice(0, 8)}をキャンセル`,
              },
            },
          ],
        }
      : undefined,
  }));

  return {
    type: 'flex',
    altText: '予約一覧',
    contents: {
      type: 'carousel',
      contents: bubbles,
    },
  };
}

function infoRow(label, value) {
  return {
    type: 'box',
    layout: 'horizontal',
    contents: [
      {
        type: 'text',
        text: label,
        size: 'sm',
        color: '#888888',
        flex: 2,
      },
      {
        type: 'text',
        text: value || '-',
        size: 'sm',
        color: '#333333',
        flex: 3,
        wrap: true,
      },
    ],
  };
}

module.exports = { buildMenuFlex, buildReservationConfirmFlex, buildReservationListFlex };
