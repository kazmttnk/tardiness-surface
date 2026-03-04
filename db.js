// IndexedDB 管理

const DB_NAME = 'TardinessDB';
const DB_VERSION = 2;  // バージョンアップ
const STORE_NAME = 'pendingRecords';

let db = null;

// ============================================================
// データベース初期化
// ============================================================
async function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => {
      console.error('IndexedDB open error:', request.error);
      reject(request.error);
    };
    
    request.onsuccess = () => {
      db = request.result;
      console.log('IndexedDB initialized');
      resolve(db);
    };
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      // 古いストアがあれば削除
      if (db.objectStoreNames.contains(STORE_NAME)) {
        db.deleteObjectStore(STORE_NAME);
      }
      
      // オブジェクトストアを作成
      const objectStore = db.createObjectStore(STORE_NAME, { 
        keyPath: 'id', 
        autoIncrement: true 
      });
      objectStore.createIndex('timestamp', 'timestamp', { unique: false });
      objectStore.createIndex('synced', 'synced', { unique: false });  // 数値型
      console.log('Object store created');
    };
  });
}

// ============================================================
// レコードをローカル保存
// ============================================================
async function saveToLocal(recordData) {
  if (!db) await initDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const objectStore = transaction.objectStore(STORE_NAME);
    
    const record = {
      ...recordData,
      timestamp: new Date().toISOString(),
      synced: 0  // 0 = 未同期
    };
    
    const request = objectStore.add(record);
    
    request.onsuccess = () => {
      console.log('Record saved locally:', request.result);
      resolve(request.result);
    };
    
    request.onerror = () => {
      console.error('Local save error:', request.error);
      reject(request.error);
    };
  });
}

// ============================================================
// 未送信レコードを取得
// ============================================================
async function getPendingRecords() {
  if (!db) await initDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const objectStore = transaction.objectStore(STORE_NAME);
    const index = objectStore.index('synced');
    
    // synced = 0 のレコードのみ取得
    const request = index.getAll(0);
    
    request.onsuccess = () => {
      console.log('Pending records:', request.result.length);
      resolve(request.result);
    };
    
    request.onerror = () => {
      console.error('Get pending error:', request.error);
      reject(request.error);
    };
  });
}

// ============================================================
// レコードを同期済みにマーク
// ============================================================
async function markAsSynced(id) {
  if (!db) await initDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const objectStore = transaction.objectStore(STORE_NAME);
    
    const request = objectStore.get(id);
    
    request.onsuccess = () => {
      const record = request.result;
      if (record) {
        record.synced = 1;  // 1 = 同期済み
        const updateRequest = objectStore.put(record);
        
        updateRequest.onsuccess = () => {
          console.log('Record marked as synced:', id);
          resolve();
        };
        
        updateRequest.onerror = () => {
          reject(updateRequest.error);
        };
      } else {
        resolve();
      }
    };
    
    request.onerror = () => {
      reject(request.error);
    };
  });
}

// ============================================================
// 同期済みレコードを削除
// ============================================================
async function deleteSyncedRecords() {
  if (!db) await initDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const objectStore = transaction.objectStore(STORE_NAME);
    const index = objectStore.index('synced');
    
    // synced = 1 のレコードのみ削除
    const request = index.openCursor(IDBKeyRange.only(1));
    let deletedCount = 0;
    
    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        cursor.delete();
        deletedCount++;
        cursor.continue();
      } else {
        console.log('Deleted synced records:', deletedCount);
        resolve(deletedCount);
      }
    };
    
    request.onerror = () => {
      reject(request.error);
    };
  });
}

// ============================================================
// 全ての未送信レコードを同期
// ============================================================
async function syncPendingRecords() {
  try {
    const pendingRecords = await getPendingRecords();
    
    if (pendingRecords.length === 0) {
      console.log('No pending records to sync');
      return { success: true, count: 0 };
    }
    
    console.log('Syncing', pendingRecords.length, 'records');
    
    let successCount = 0;
    let failCount = 0;
    
    for (const record of pendingRecords) {
      try {
        // Apps Script に送信
        const result = await callAPI('saveTardinessRecord', { 
          recordData: record 
        });
        
        if (result && result.success) {
          await markAsSynced(record.id);
          successCount++;
        } else {
          console.error('Sync failed for record:', record.id, result.error);
          failCount++;
        }
      } catch (error) {
        console.error('Sync error for record:', record.id, error);
        failCount++;
      }
      
      // 短い待機（API負荷軽減）
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    // 同期済みレコードを削除
    if (successCount > 0) {
      await deleteSyncedRecords();
    }
    
    return { 
      success: true, 
      synced: successCount, 
      failed: failCount,
      total: pendingRecords.length
    };
    
  } catch (error) {
    console.error('Sync error:', error);
    return { success: false, error: error.toString() };
  }
}

// ============================================================
// 未送信レコード数を取得
// ============================================================
async function getPendingCount() {
  try {
    const pendingRecords = await getPendingRecords();
    return pendingRecords.length;
  } catch (error) {
    console.error('Get pending count error:', error);
    return 0;
  }
}

// ページ読み込み時に初期化
window.addEventListener('load', async () => {
  try {
    await initDB();
    
    // 未送信レコードがあれば自動同期
    const count = await getPendingCount();
    if (count > 0) {
      console.log('Found', count, 'pending records, syncing...');
      await syncPendingRecords();
    }
  } catch (error) {
    console.error('DB initialization error:', error);
  }
});
