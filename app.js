// ============================================================
// アプリ変数
// ============================================================
let reasonList = [];
let currentStudent = null;
let selectedReason = null;
let isSaving = false;
let studentMasterData = null;
let studentMap = null;

// 同期管理
let syncTimer = null;

// ============================================================
// 初期化
// ============================================================
window.onload = async function() {
  setupBarcodeInput();
  setupKeyboardShortcuts();
  setupButtons();
  await loadInitData();
  startSyncTimer();
  updatePendingCount();
};

// ============================================================
// ボタンのイベントリスナー設定
// ============================================================
function setupButtons() {
  document.getElementById('saveBtn').addEventListener('click', function(e) {
    e.preventDefault();
    e.stopPropagation();
    saveRecord();
  });
  
  document.getElementById('cancelBtn').addEventListener('click', function(e) {
    e.preventDefault();
    e.stopPropagation();
    resetForm();
  });
}

// ============================================================
// 初期化データ一括取得
// ============================================================
async function loadInitData() {
  try {
    const result = await callAPI('getInitData');
    
    if (result && result.success) {
      reasonList = result.reasons;
      renderReasons();
      renderTodayRecords(result.todayRecords);
      document.getElementById('gateTime').textContent = result.gateTime;
      await loadStudentMaster();
      updateSyncStatus('同期済み', 'success');
    } else {
      console.error('Init data load failed:', result?.error);
      updateSyncStatus('初期化エラー', 'error');
    }
  } catch (error) {
    console.error('Init error:', error);
    updateSyncStatus('初期化エラー', 'error');
  }
}

// ============================================================
// 生徒マスター読み込み
// ============================================================
async function loadStudentMaster() {
  try {
    const cached = localStorage.getItem('studentMaster');
    const cacheTime = localStorage.getItem('studentMasterTime');
    
    if (cached && cacheTime) {
      const age = Date.now() - parseInt(cacheTime);
      if (age < 24 * 60 * 60 * 1000) {
        studentMasterData = JSON.parse(cached);
        buildStudentMap();
        console.log('Student master loaded from cache:', studentMasterData.length - 1, 'students');
        return;
      }
    }
    
    const result = await callAPI('getStudentMaster');
    
    if (result && result.success) {
      studentMasterData = result.data;
      buildStudentMap();
      localStorage.setItem('studentMaster', JSON.stringify(studentMasterData));
      localStorage.setItem('studentMasterTime', Date.now().toString());
      console.log('Student master loaded from API:', studentMasterData.length - 1, 'students');
    }
  } catch (error) {
    console.error('Student master load error:', error);
  }
}

// ============================================================
// 生徒マップ構築
// ============================================================
function buildStudentMap() {
  studentMap = {};
  if (!studentMasterData) return;
  
  for (let i = 1; i < studentMasterData.length; i++) {
    const row = studentMasterData[i];
    const studentId = row[0] ? row[0].toString() : null;
    if (studentId) {
      studentMap[studentId] = {
        studentId: studentId,
        studentInfo: row[1] || '',
        grade: row[2] || '',
        class: row[3] || '',
        number: row[4] || '',
        name: row[5] || ''
      };
    }
  }
  console.log('Student map built:', Object.keys(studentMap).length, 'students');
}

// ============================================================
// バーコード入力設定
// ============================================================
function setupBarcodeInput() {
  const input = document.getElementById('barcodeInput');
  
  input.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      searchStudent();
    }
  });

  input.addEventListener('input', function(e) {
    let val = e.target.value.trim();
    e.target.value = val.replace(/[^0-9]/g, '');
    if (e.target.value.length === 6) {
      setTimeout(() => {
        if (document.getElementById('barcodeInput').value.length === 6) {
          searchStudent();
        }
      }, 100);
    }
  });
}

// ============================================================
// キーボードショートカット
// ============================================================
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', function(e) {
    if (document.getElementById('modalOverlay').classList.contains('show')) return;
    
    if (document.activeElement.tagName === 'INPUT' || 
        document.activeElement.tagName === 'TEXTAREA') {
      if (e.key === 'Escape') {
        e.preventDefault();
        resetForm();
        return;
      }
      if (e.key === 'Enter' && document.activeElement.id !== 'barcodeInput') {
        e.preventDefault();
        saveRecord();
        return;
      }
      return;
    }
    
    if (!currentStudent) return;
    
    if (e.key >= '1' && e.key <= '9') {
      const index = parseInt(e.key) - 1;
      if (index < reasonList.length) selectReason(index);
    }
    if (e.key === 'Enter') { e.preventDefault(); saveRecord(); }
    if (e.key === 'Escape') { e.preventDefault(); resetForm(); }
  });
}

// ============================================================
// 生徒検索
// ============================================================
async function searchStudent() {
  const val = document.getElementById('barcodeInput').value.trim();
  
  if (val.length !== 6) {
    flashInput('error');
    showAlert('error', '生徒証番号は6桁で入力してください');
    return;
  }

  if (studentMap && studentMap[val]) {
    currentStudent = studentMap[val];
    displayStudent(currentStudent);
    flashInput('success');
    return;
  }
  
  showAlert('info', '検索中...');
  const result = await callAPI('getStudentInfo', { studentId: val });
  
  if (result && result.success) {
    currentStudent = result;
    displayStudent(currentStudent);
    flashInput('success');
    document.getElementById('alertBox').className = 'hidden';
  } else {
    flashInput('error');
    showAlert('error', result?.error || '生徒が見つかりません');
    resetForm();
  }
}

// ============================================================
// 生徒情報表示
// ============================================================
function displayStudent(student) {
  document.getElementById('studentDisplay').textContent = student.studentInfo;
}

// ============================================================
// フラッシュ効果
// ============================================================
function flashInput(type) {
  const input = document.getElementById('barcodeInput');
  input.classList.add(type);
  setTimeout(() => input.classList.remove(type), 300);
}

// ============================================================
// 遅刻理由表示
// ============================================================
function renderReasons() {
  const grid = document.getElementById('reasonGrid');
  grid.innerHTML = '';
  
  for (let i = 0; i < reasonList.length; i++) {
    (function(reason, index) {
      const btn = document.createElement('button');
      btn.className = 'reason-btn';
      btn.type = 'button';
      btn.tabIndex = 2 + index;
      
      if (index < 9) {
        const shortcutKey = document.createElement('span');
        shortcutKey.className = 'shortcut-key';
        shortcutKey.textContent = (index + 1).toString();
        btn.appendChild(shortcutKey);
      }
      
      btn.appendChild(document.createTextNode(reason.display));
      btn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        selectReason(index);
      });
      grid.appendChild(btn);
    })(reasonList[i], i);
  }
}

// ============================================================
// 理由選択
// ============================================================
function selectReason(index) {
  if (index < 0 || index >= reasonList.length) return;
  selectedReason = reasonList[index];
  
  const allBtns = document.querySelectorAll('.reason-btn');
  for (let i = 0; i < allBtns.length; i++) allBtns[i].classList.remove('selected');
  allBtns[index].classList.add('selected');
  
  const detailInput = document.getElementById('detailInput');
  if (selectedReason.display === 'その他') {
    detailInput.placeholder = '詳細（必須）';
    detailInput.style.borderColor = '#e74c3c';
    detailInput.focus();
  } else {
    detailInput.placeholder = '詳細（任意）';
    detailInput.style.borderColor = '#e0e0e0';
  }
}

// ============================================================
// 記録保存
// ============================================================
async function saveRecord() {
  if (isSaving) return;
  if (!currentStudent) { showAlert('error', '生徒情報が取得されていません'); return; }
  if (!selectedReason) { showAlert('error', '遅刻理由を選択してください'); return; }

  const detail = document.getElementById('detailInput').value.trim();
  if (selectedReason.display === 'その他' && !detail) {
    showModalAlert('詳細の入力が必要です', '「その他」を選択した場合は、詳細欄に遅刻理由を具体的に入力してください。');
    return;
  }

  isSaving = true;
  const saveBtn = document.getElementById('saveBtn');
  const cancelBtn = document.getElementById('cancelBtn');
  saveBtn.disabled = true;
  cancelBtn.disabled = true;
  saveBtn.textContent = '保存中...';

  const recordData = {
    studentId: currentStudent.studentId,
    studentInfo: currentStudent.studentInfo,
    grade: currentStudent.grade,
    class: currentStudent.class,
    number: currentStudent.number,
    name: currentStudent.name,
    reasonNumber: selectedReason.number,
    reasonText: selectedReason.text,
    detail: detail,
    hasPhoneCall: document.getElementById('hasPhoneCall').checked,
    hasStudentCard: document.getElementById('hasStudentCard').checked
  };

  try {
    await saveToLocal(recordData);
    addRecordToUI(recordData);
    showAlert('success', '✓ 記録を保存しました');
    flashInput('success');
    await printReceipt(recordData);
    resetForm();
    syncInBackground();
  } catch (error) {
    showAlert('error', '保存に失敗しました: ' + error.toString());
    saveBtn.disabled = false;
    cancelBtn.disabled = false;
    saveBtn.textContent = '記録を保存';
  }
  
  isSaving = false;
}

// ============================================================
// バックグラウンド同期
// ============================================================
async function syncInBackground() {
  updateSyncStatus('同期中...', 'syncing');
  try {
    const result = await syncPendingRecords();
    if (result.success) {
      if (result.synced > 0) {
        console.log('Synced', result.synced, 'records');
        updateSyncStatus('同期済み', 'success');
      }
    } else {
      console.error('Sync failed:', result.error);
      updateSyncStatus('同期エラー', 'error');
    }
    await updatePendingCount();
  } catch (error) {
    console.error('Sync error:', error);
    updateSyncStatus('同期エラー', 'error');
  }
}

// ============================================================
// 定期同期タイマー
// ============================================================
function startSyncTimer() {
  syncTimer = setInterval(async () => {
    const count = await getPendingCount();
    if (count > 0) {
      console.log('Auto sync triggered');
      await syncInBackground();
    }
  }, 30000);
}

// ============================================================
// UIに記録を追加
// ============================================================
function addRecordToUI(recordData) {
  const list = document.getElementById('recordsList');
  const count = document.getElementById('recordCount');
  
  const loading = list.querySelector('.loading');
  if (loading) loading.remove();
  
  const item = document.createElement('div');
  item.className = 'record-item pending';
  
  const now = new Date();
  const hh = now.getHours();
  const mm = String(now.getMinutes()).padStart(2, '0');
  
  item.innerHTML = `
    <div class="record-info">
      <div class="record-student">${recordData.studentInfo} ${recordData.name}</div>
      <div class="record-detail">${recordData.reasonText}</div>
    </div>
    <div class="record-time">${hh}:${mm}</div>
  `;
  list.insertBefore(item, list.firstChild);
  
  const currentCount = parseInt(count.textContent) || 0;
  count.textContent = (currentCount + 1) + '件';
}

// ============================================================
// フォームリセット
// ============================================================
function resetForm() {
  currentStudent = null;
  selectedReason = null;
  document.getElementById('barcodeInput').value = '';
  document.getElementById('studentDisplay').textContent = '－';
  
  document.querySelectorAll('.reason-btn').forEach(btn => {
    btn.classList.remove('selected');
    btn.blur();
  });
  
  const detailInput = document.getElementById('detailInput');
  detailInput.value = '';
  detailInput.placeholder = '詳細（任意）';
  detailInput.style.borderColor = '#e0e0e0';
  
  document.getElementById('hasPhoneCall').checked = false;
  document.getElementById('hasStudentCard').checked = false;
  document.getElementById('saveBtn').disabled = false;
  document.getElementById('cancelBtn').disabled = false;
  document.getElementById('saveBtn').textContent = '記録を保存';
  document.getElementById('barcodeInput').focus();
}

// ============================================================
// 本日の記録表示
// ============================================================
function renderTodayRecords(records) {
  const list = document.getElementById('recordsList');
  const count = document.getElementById('recordCount');
  count.textContent = records.length + '件';
  
  if (records.length === 0) {
    list.innerHTML = '<div class="loading">まだ記録がありません</div>';
    return;
  }
  
  list.innerHTML = '';
  records.forEach(rec => {
    const item = document.createElement('div');
    item.className = 'record-item';
    const time = new Date(rec.timestamp);
    const hh = time.getHours();
    const mm = String(time.getMinutes()).padStart(2, '0');
    item.innerHTML = `
      <div class="record-info">
        <div class="record-student">${rec.studentInfo} ${rec.name}</div>
        <div class="record-detail">${rec.reasonText}</div>
      </div>
      <div class="record-time">${hh}:${mm}</div>
    `;
    list.appendChild(item);
  });
}

// ============================================================
// 同期ステータス更新
// ============================================================
function updateSyncStatus(text, status) {
  const statusEl = document.getElementById('syncStatus');
  statusEl.textContent = text;
  statusEl.className = 'sync-status';
  if (status) statusEl.classList.add(status);
}

// ============================================================
// 未送信件数表示
// ============================================================
async function updatePendingCount() {
  const count = await getPendingCount();
  const pendingEl = document.getElementById('pendingCount');
  if (count > 0) {
    pendingEl.textContent = `未送信: ${count}件`;
    pendingEl.classList.remove('hidden');
  } else {
    pendingEl.classList.add('hidden');
  }
}

// ============================================================
// UI ヘルパー
// ============================================================
function showAlert(type, message) {
  const box = document.getElementById('alertBox');
  box.className = 'alert alert-' + type;
  box.textContent = message;
  setTimeout(() => { if (type !== 'info') box.className = 'hidden'; }, 5000);
}

function showModalAlert(title, message) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalMessage').textContent = message;
  document.getElementById('modalOverlay').classList.add('show');
}

function closeModalAlert() {
  document.getElementById('modalOverlay').classList.remove('show');
  document.getElementById('barcodeInput').focus();
}

// ============================================================
// バッチモード関連
// ============================================================
let isBatchMode = false;
let batchProcessedCount = 0;

function switchToBatchMode() {
  isBatchMode = true;
  batchProcessedCount = 0;
  document.getElementById('normalMode').classList.add('hidden');
  document.getElementById('batchMode').classList.remove('hidden');
  document.getElementById('batchBarcodeInput').focus();
  setupBatchBarcodeInput();
}

function switchToNormalMode() {
  isBatchMode = false;
  batchProcessedCount = 0;
  document.getElementById('batchMode').classList.add('hidden');
  document.getElementById('normalMode').classList.remove('hidden');
  document.getElementById('batchBarcodeInput').value = '';
  document.getElementById('batchRecordsList').innerHTML = '<div class="batch-empty">まだ処理されていません</div>';
  document.getElementById('batchProcessedCount').textContent = '0';
  document.getElementById('barcodeInput').focus();
}

function setupBatchBarcodeInput() {
  const input = document.getElementById('batchBarcodeInput');
  const newInput = input.cloneNode(true);
  input.parentNode.replaceChild(newInput, input);
  
  newInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') { e.preventDefault(); processBatchBarcode(); }
  });
  
  newInput.addEventListener('input', function(e) {
    let val = e.target.value.trim();
    e.target.value = val.replace(/[^0-9]/g, '');
    if (e.target.value.length === 6) {
      setTimeout(() => {
        if (document.getElementById('batchBarcodeInput').value.length === 6) processBatchBarcode();
      }, 100);
    }
  });
}

async function processBatchBarcode() {
  const val = document.getElementById('batchBarcodeInput').value.trim();
  if (val.length !== 6) { showAlert('error', '生徒証番号は6桁で入力してください'); return; }
  
  let student = null;
  if (studentMap && studentMap[val]) {
    student = studentMap[val];
  } else {
    const result = await callAPI('getStudentInfo', { studentId: val });
    if (result && result.success) {
      student = result;
    } else {
      showAlert('error', '生徒が見つかりません');
      document.getElementById('batchBarcodeInput').value = '';
      return;
    }
  }
  
  let delayReason = null;
  for (let i = 0; i < reasonList.length; i++) {
    if (reasonList[i].display.includes('遅延') && reasonList[i].display.includes('15分以上')) {
      delayReason = reasonList[i];
      break;
    }
  }
  
  if (!delayReason) { showAlert('error', '遅延（15分以上）の理由が見つかりません'); return; }
  
  const recordData = {
    studentId: student.studentId,
    studentInfo: student.studentInfo,
    grade: student.grade,
    class: student.class,
    number: student.number,
    name: student.name,
    reasonNumber: delayReason.number,
    reasonText: delayReason.text,
    detail: '',
    hasPhoneCall: false,
    hasStudentCard: false
  };
  
  try {
    await saveToLocal(recordData);
    await printReceipt(recordData);
    addBatchRecordToUI(recordData);
    addRecordToUI(recordData);
    batchProcessedCount++;
    document.getElementById('batchProcessedCount').textContent = batchProcessedCount;
    document.getElementById('batchBarcodeInput').value = '';
    syncInBackground();
  } catch (error) {
    showAlert('error', '保存に失敗しました: ' + error.toString());
  }
}

function addBatchRecordToUI(recordData) {
  const list = document.getElementById('batchRecordsList');
  const empty = list.querySelector('.batch-empty');
  if (empty) empty.remove();
  
  const item = document.createElement('div');
  item.className = 'batch-record-item';
  const now = new Date();
  const hh = now.getHours();
  const mm = String(now.getMinutes()).padStart(2, '0');
  item.innerHTML = `
    <div class="batch-record-info">
      <div class="batch-record-student">${recordData.studentInfo} ${recordData.name}</div>
    </div>
    <div class="batch-record-time">${hh}:${mm}</div>
  `;
  list.insertBefore(item, list.firstChild);
}

/* ========================================
   印刷処理（ローカルサーバー経由）
======================================== */

async function sendESCPOS(commands) {
  try {
    const res = await fetch('http://localhost:3000/print', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: commands })
    });
    const result = await res.json();
    if (!result.ok) {
      console.error('印刷サーバーエラー:', result.error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('印刷エラー（サーバー未起動?）:', err);
    return false;
  }
}

async function printReceipt(record) {
  const ESC = '\x1B';
  const GS = '\x1D';
  
  let receipt = '';
  
  // 初期化
  receipt += ESC + '@';
  
  // 左揃え
  receipt += ESC + 'a' + '\x00';
  
  // 文字コードページ: Shift-JIS
  receipt += ESC + 't' + '\x08';
  
  // 漢字モードON
  receipt += '\x1C' + '&';
  
  const now = new Date();
  const dateStr = `${now.getFullYear()}/${String(now.getMonth()+1).padStart(2,'0')}/${String(now.getDate()).padStart(2,'0')}`;
  const timeStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  
  receipt += '================================\n';
  receipt += `登録時間: ${dateStr} ${timeStr}\n`;
  receipt += '--------------------------------\n';
  receipt += `生徒情報: ${record.studentInfo}\n`;
  receipt += '--------------------------------\n';
  receipt += `遅刻理由: ${record.reasonText}\n`;
  receipt += '--------------------------------\n';
  
  if (record.detail && record.detail.trim()) {
    receipt += `備考: ${record.detail}\n`;
    receipt += '--------------------------------\n';
  }
  
  receipt += `電話連絡: ${record.hasPhoneCall ? 'あり' : 'なし'}\n`;
  receipt += `生徒証  : ${record.hasStudentCard ? 'あり' : 'なし'}\n`;
  receipt += '================================\n';
  receipt += '\n\n\n';
  
  // カット
  receipt += GS + 'V' + '\x00';
  
  const success = await sendESCPOS(receipt);
  if (success) console.log('レシート印刷完了');
}

// プリンター状態表示（UI互換のため残す）
function updatePrinterStatus(connected) {
  const statusEl = document.getElementById('printerStatus');
  const btnEl = document.getElementById('connectPrinterBtn');
  if (connected) {
    statusEl.textContent = '接続済み';
    statusEl.className = 'printer-status-text connected';
    btnEl.textContent = '🖨️ 接続済み';
    btnEl.disabled = true;
  } else {
    statusEl.textContent = '未接続';
    statusEl.className = 'printer-status-text';
    btnEl.textContent = '🖨️ プリンター接続';
    btnEl.disabled = false;
  }
}

async function connectPrinter() {
  try {
    const res = await fetch('http://localhost:3000/print', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: '' })
    });
    updatePrinterStatus(true);
    console.log('印刷サーバー接続確認OK');
  } catch (err) {
    alert('印刷サーバーに接続できません。\nサーバーが起動しているか確認してください。\n(node server.js)');
    updatePrinterStatus(false);
  }
}
