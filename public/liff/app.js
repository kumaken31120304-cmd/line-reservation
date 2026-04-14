// LIFFアプリID（.envのLIFF_IDと同じ値に書き換える）
const LIFF_ID ="2009769390-HDWUsrH8";
const API_BASE = ''; // 同一オリジンなので空でOK

let userId = null;
let currentStep = 1;
let selectedTime = null;
let selectedCourse = null;

// ─── 既往歴「なし」排他制御 ──────────────────────────────────────
document.addEventListener('change', (e) => {
  if (e.target.name !== 'medical_history') return;
  const all = document.querySelectorAll('input[name="medical_history"]');
  const noneBox = document.getElementById('medical-none');
  if (e.target === noneBox && e.target.checked) {
    all.forEach(cb => { if (cb !== noneBox) cb.checked = false; });
    document.getElementById('medical-other-text').classList.add('hidden');
  } else if (e.target !== noneBox && e.target.checked) {
    noneBox.checked = false;
  }
  const otherBox = document.getElementById('medical-other');
  const otherText = document.getElementById('medical-other-text');
  if (e.target === otherBox) {
    otherText.classList.toggle('hidden', !otherBox.checked);
    if (!otherBox.checked) otherText.value = '';
  }
});

// ─── 初期化 ─────────────────────────────────────────────────────
window.addEventListener('load', async () => {
  try {
    await liff.init({ liffId: LIFF_ID });

    if (!liff.isLoggedIn()) {
      liff.login({ redirectUri: location.href });
      return;
    }

    const profile = await liff.getProfile();
    userId = profile.userId;

    showScreen('form-screen');
    initDateInput();
  } catch (e) {
    showError('LIFFの初期化に失敗しました。\nError: ' + e.message);
  }
});

// ─── 日付入力初期化 ──────────────────────────────────────────────
function initDateInput() {
  const dateInput = document.getElementById('date');
  const today = new Date();
  const maxDate = new Date();
  maxDate.setDate(today.getDate() + 30);

  dateInput.min = formatDate(today);
  dateInput.max = formatDate(maxDate);
  dateInput.value = formatDate(today);

  dateInput.addEventListener('change', onDateChange);
  onDateChange();
}

// ─── 日付変更で空き時間を取得 ────────────────────────────────────
async function onDateChange() {
  const date = document.getElementById('date').value;
  if (!date) return;

  selectedTime = null;
  document.getElementById('time').value = '';

  const container = document.getElementById('time-slots');
  container.innerHTML = '<p class="hint">読み込み中...</p>';

  try {
    const res = await fetch(`${API_BASE}/api/slots?date=${date}`);
    const { slots } = await res.json();

    if (!slots || slots.length === 0) {
      container.innerHTML = '<p class="no-slots">この日は空き枠がありません</p>';
      return;
    }

    container.innerHTML = slots.map(slot => `
      <button type="button" class="time-slot-btn" onclick="selectTime('${slot}', this)">
        ${slot}
      </button>
    `).join('');
  } catch (e) {
    container.innerHTML = '<p class="no-slots">空き枠の取得に失敗しました</p>';
  }
}

// ─── 時間選択 ────────────────────────────────────────────────────
function selectTime(time, el) {
  document.querySelectorAll('.time-slot-btn').forEach(b => b.classList.remove('selected'));
  el.classList.add('selected');
  selectedTime = time;
  document.getElementById('time').value = time;
}

// ─── ステップ移動 ────────────────────────────────────────────────
function goToStep(step) {
  if (step === 2 && !validateStep1()) return;
  if (step === 3 && !validateStep2()) return;

  if (step === 3) buildConfirm();

  // ステップ表示切替
  document.querySelectorAll('.step-content').forEach(el => el.classList.add('hidden'));
  document.getElementById(`step-${step}`).classList.remove('hidden');

  // インジケーター更新
  for (let i = 1; i <= 3; i++) {
    const dot = document.getElementById(`step-dot-${i}`);
    dot.classList.remove('active', 'done');
    if (i < step) dot.classList.add('done');
    else if (i === step) dot.classList.add('active');
  }

  currentStep = step;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ─── バリデーション ──────────────────────────────────────────────
function validateStep1() {
  selectedCourse = document.querySelector('input[name="course"]:checked')?.value || null;
  if (!selectedCourse) {
    alert('コースを選択してください');
    return false;
  }
  const date = document.getElementById('date').value;
  if (!date) {
    alert('日付を選択してください');
    return false;
  }
  if (!selectedTime) {
    alert('時間を選択してください');
    return false;
  }
  return true;
}

function validateStep2() {
  const name = document.getElementById('name').value.trim();
  const phone = document.getElementById('phone').value.trim();

  if (!name) {
    alert('お名前を入力してください');
    document.getElementById('name').focus();
    return false;
  }
  if (!phone) {
    alert('電話番号を入力してください');
    document.getElementById('phone').focus();
    return false;
  }
  if (!/^[\d\-+()\\s]+$/.test(phone)) {
    alert('電話番号の形式が正しくありません');
    document.getElementById('phone').focus();
    return false;
  }
  return true;
}

// ─── 確認画面の組み立て ──────────────────────────────────────────
function buildConfirm() {
  const date = document.getElementById('date').value;
  const time = document.getElementById('time').value;
  const name = document.getElementById('name').value.trim();
  const phone = document.getElementById('phone').value.trim();
  const symptoms = document.getElementById('symptoms').value.trim();

  const otherTextVal = document.getElementById('medical-other-text').value.trim();
  const medicalChecked = [...document.querySelectorAll('input[name="medical_history"]:checked')].map(cb => {
    if (cb.value === 'その他' && otherTextVal) return `その他（${otherTextVal}）`;
    return cb.value;
  });
  const medicalHistory = medicalChecked.length > 0 ? medicalChecked.join('、') : '';

  document.getElementById('confirm-course').textContent = selectedCourse;
  document.getElementById('confirm-date').textContent = formatDateJa(date);
  document.getElementById('confirm-time').textContent = time;
  document.getElementById('confirm-name').textContent = name;
  document.getElementById('confirm-phone').textContent = phone;

  const symptomsRow = document.getElementById('confirm-symptoms-row');
  if (symptoms) {
    document.getElementById('confirm-symptoms').textContent = symptoms;
    symptomsRow.classList.remove('hidden');
  } else {
    symptomsRow.classList.add('hidden');
  }

  const medicalRow = document.getElementById('confirm-medical-row');
  if (medicalHistory) {
    document.getElementById('confirm-medical').textContent = medicalHistory;
    medicalRow.classList.remove('hidden');
  } else {
    medicalRow.classList.add('hidden');
  }
}

// ─── フォーム送信 ────────────────────────────────────────────────
document.getElementById('reservation-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const submitBtn = document.getElementById('submit-btn');
  const submitLabel = document.getElementById('submit-label');
  const submitSpinner = document.getElementById('submit-spinner');

  submitBtn.disabled = true;
  submitLabel.classList.add('hidden');
  submitSpinner.classList.remove('hidden');

  const otherText = document.getElementById('medical-other-text').value.trim();
  const medicalChecked = [...document.querySelectorAll('input[name="medical_history"]:checked')].map(cb => {
    if (cb.value === 'その他' && otherText) return `その他（${otherText}）`;
    return cb.value;
  });
  const payload = {
    userId,
    course: selectedCourse,
    date: document.getElementById('date').value,
    time: document.getElementById('time').value,
    name: document.getElementById('name').value.trim(),
    phone: document.getElementById('phone').value.trim(),
    symptoms: document.getElementById('symptoms').value.trim(),
    medicalHistory: medicalChecked.join('、'),
  };

  try {
    const res = await fetch(`${API_BASE}/api/reserve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '予約に失敗しました');

    showSuccess(data.reservation);
  } catch (err) {
    alert(`エラー: ${err.message}`);
    submitBtn.disabled = false;
    submitLabel.classList.remove('hidden');
    submitSpinner.classList.add('hidden');
  }
});

// ─── 完了画面表示 ────────────────────────────────────────────────
function showSuccess(r) {
  document.getElementById('success-detail').innerHTML = `
    <div class="confirm-row">
      <span class="confirm-label">日付</span>
      <span class="confirm-value">${formatDateJa(r.date)}</span>
    </div>
    <div class="confirm-row">
      <span class="confirm-label">時間</span>
      <span class="confirm-value">${r.time}</span>
    </div>
    <div class="confirm-row">
      <span class="confirm-label">お名前</span>
      <span class="confirm-value">${r.name}</span>
    </div>
  `;
  showScreen('success-screen');
}

// ─── ユーティリティ ──────────────────────────────────────────────
function showScreen(id) {
  document.getElementById('loading').classList.add('hidden');
  ['form-screen', 'success-screen', 'error-screen'].forEach(s => {
    document.getElementById(s).classList.toggle('hidden', s !== id);
  });
}

function showError(msg) {
  document.getElementById('error-msg').textContent = msg;
  showScreen('error-screen');
}

function formatDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDateJa(dateStr) {
  const d = new Date(dateStr + 'T00:00:00+09:00');
  const days = ['日', '月', '火', '水', '木', '金', '土'];
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${days[d.getDay()]}）`;
}
