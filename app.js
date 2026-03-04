// ============================================================
// アプリ変数
// ============================================================
let reasonList = [];
let currentStudent = null;
let selectedReason = null;
let isSaving = false;
let studentMasterData = null; // 生徒マスター全データ（メモリ保持）
let studentMap = null; // 生徒ID → 生徒情報のマップ（高速検索用）

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
  // 保存ボタン
  document.getElementById('saveBtn').addEventListener('click', function(e) {
    e.preventDefault();
    e.stopPropagation();
    saveRecord();
  });
  
  // キャンセルボタン
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
      // 遅刻理由リスト
      reasonList = result.reasons;
      renderReasons();
      
      // 本日の記録
      renderTodayRecords(result.todayRecords);
      
      // 門限時刻
      document.getElementById('gateTime').textContent = result.gateTime;
      
      // 生徒マスター読み込み
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
// 生徒マスター読み込み（メモリ保持）
// ============================================================
async function loadStudentMaster() {
  try {
    // ローカルストレージから読み込み
    const cached = localStorage.getItem('studentMaster');
    const cacheTime = localStorage.getItem('studentMasterTime');
    
    // キャッシュが24時間以内なら使用
    if (cached && cacheTime) {
      const age = Date.now() - parseInt(cacheTime);
      if (age < 24 * 60 * 60 * 1000) {
        studentMasterData = JSON.parse(cached);
        buildStudentMap();
        console.log('Student master loaded from cache:', studentMasterData.length - 1, 'students');
        return;
      }
    }
    
    // API から取得
    const result = await callAPI('getStudentMaster');
    
    if (result && result.success) {
      studentMasterData = result.data;
      buildStudentMap();
      
      // ローカルストレージに保存
      localStorage.setItem('studentMaster', JSON.stringify(studentMasterData));
      localStorage.setItem('studentMasterTime', Date.now().toString());
      
      console.log('Student master loaded from API:', studentMasterData.length - 1, 'students');
    }
  } catch (error) {
    console.error('Student master load error:', error);
  }
}

// ============================================================
// 生徒マップ構築（高速検索用）
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
  
  // Enter キーで検索
  input.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      searchStudent();
    }
  });

  // 6桁入力で自動検索
  input.addEventListener('input', function(e) {
    let val = e.target.value.trim();
    e.target.value = val.replace(/[^0-9]/g, '');
    
    // バーコードリーダーからの入力を想定（高速入力）
    if (e.target.value.length === 6) {
      // 少し待ってから検索（バーコードリーダーの Enter を待つ）
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
    // モーダルが開いている場合は無視
    if (document.getElementById('modalOverlay').classList.contains('show')) {
      return;
    }
    
    // 入力欄にフォーカスがある場合は無視
    if (document.activeElement.tagName === 'INPUT' || 
        document.activeElement.tagName === 'TEXTAREA') {
      // ただし Esc と Enter は処理する
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
    
    // 生徒情報が表示されている場合のみ
    if (!document.getElementById('studentInfo').classList.contains('show')) {
      return;
    }
    
    // 数字キー 1〜9 で理由選択
    if (e.key >= '1' && e.key <= '9') {
      const index = parseInt(e.key) - 1;
      if (index < reasonList.length) {
        selectReason(index);
      }
    }
    
    // Enter で保存
    if (e.key === 'Enter') {
      e.preventDefault();
      saveRecord();
    }
    
    // Esc でキャンセル
    if (e.key === 'Escape') {
      e.preventDefault();
      resetForm();
    }
  });
}

// ============================================================
// 生徒検索（メモリ内検索）
// ============================================================
async function searchStudent() {
  const val = document.getElementById('barcodeInput').value.trim();
  const input = document.getElementById('barcodeInput');
  
  if (val.length !== 6) {
    flashInput('error');
    showAlert('error', '生徒証番号は6桁で入力してください');
    return;
  }

  // メモリ内検索（超高速）
  if (studentMap && studentMap[val]) {
    currentStudent = studentMap[val];
    displayStudent(currentStudent);
    flashInput('success');
    return;
  }
  
  // メモリになければ API で検索
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
  document.getElementById('displayStudentId').textContent = student.studentId;
  document.getElementById('displayName').textContent = student.name;
  document.getElementById('displayClass').textContent = student.studentInfo;
  document.getElementById('studentInfo').classList.add('show');
  
  // 最初の理由にフォーカス（タブキーで操作可能）
  const firstReason = document.querySelector('.reason-btn');
  if (firstReason) {
    firstReason.focus();
  }
}

// ============================================================
// 入力欄のフラッシュ効果
// ============================================================
function flashInput(type) {
  const input = document.getElementById('barcodeInput');
  input.classList.add(type);
  setTimeout(() => {
    input.classList.remove(type);
  }, 300);
}

// ============================================================
// 遅刻理由読み込み
// ============================================================
function renderReasons() {
  const grid = document.getElementById('reasonGrid');
  grid.innerHTML = '';
  
  for (let i = 0; i < reasonList.length; i++) {
    (function(reason, index) {
      const btn = document.createElement('button');
      btn.className = 'reason-btn';
      btn.type = 'button';  // 重要：type="button" を設定
      btn.tabIndex = 2 + index;
      
      // ショートカットキー表示（1〜9のみ）
      if (index < 9) {
        const shortcutKey = document.createElement('span');
        shortcutKey.className = 'shortcut-key';
        shortcutKey.textContent = (index + 1).toString();
        btn.appendChild(shortcutKey);
      }
      
      const text = document.createTextNode(reason.display);
      btn.appendChild(text);
      
      // イベントリスナーで処理
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
  
  // 選択状態を更新
  const allBtns = document.querySelectorAll('.reason-btn');
  for (let i = 0; i < allBtns.length; i++) {
    allBtns[i].classList.remove('selected');
  }
  allBtns[index].classList.add('selected');
  
  // 詳細入力の必須チェック
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
// 記録保存（IndexedDB + 非同期送信）
// ============================================================
async function saveRecord() {
  if (isSaving) return;
  if (!currentStudent) {
    showAlert('error', '生徒情報が取得されていません');
    return;
  }
  if (!selectedReason) {
    showAlert('error', '遅刻理由を選択してください');
    return;
  }

  const detail = document.getElementById('detailInput').value.trim();
  if (selectedReason.display === 'その他' && !detail) {
    showModalAlert(
      '詳細の入力が必要です',
      '「その他」を選択した場合は、詳細欄に遅刻理由を具体的に入力してください。'
    );
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
    // 1. IndexedDB に即座に保存
    await saveToLocal(recordData);
    
    // 2. 本日の記録に追加（UI更新）
    addRecordToUI(recordData);
    
    // 3. 成功表示
    showAlert('success', '✓ 記録を保存しました');
    flashInput('success');
    
    // 4. フォームリセット
    resetForm();
    
    // 5. バックグラウンドで同期（非同期）
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
  // 30秒ごとに同期
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
  
  // ローディング削除
  const loading = list.querySelector('.loading');
  if (loading) loading.remove();
  
  // 新しいレコードを追加
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
  
  // 先頭に追加
  list.insertBefore(item, list.firstChild);
  
  // カウント更新
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
  document.getElementById('studentInfo').classList.remove('show');
  
  const reasonBtns = document.querySelectorAll('.reason-btn');
  for (let i = 0; i < reasonBtns.length; i++) {
    reasonBtns[i].classList.remove('selected');
  }
  
  const detailInput = document.getElementById('detailInput');
  detailInput.value = '';
  detailInput.placeholder = '詳細（任意）';
  detailInput.style.borderColor = '#e0e0e0';
  
  document.getElementById('hasPhoneCall').checked = false;
  document.getElementById('hasStudentCard').checked = false;
  
  document.getElementById('saveBtn').disabled = false;
  document.getElementById('cancelBtn').disabled = false;
  document.getElementById('saveBtn').textContent = '記録を保存';
  
  // フォーカスを戻す
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
  if (status) {
    statusEl.classList.add(status);
  }
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
  setTimeout(() => {
    if (type !== 'info') box.className = 'hidden';
  }, 5000);
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
