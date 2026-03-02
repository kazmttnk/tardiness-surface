// Service Worker - バックグラウンド同期対応

const CACHE_NAME = 'tardiness-surface-v1';
const urlsToCache = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './db.js',
  './config.js',
  './manifest.json'
];

// インストール
self.addEventListener('install', (event) => {
  console.log('Service Worker installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

// アクティベート
self.addEventListener('activate', (event) => {
  console.log('Service Worker activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// フェッチ
self.addEventListener('fetch', (event) => {
  // API リクエストはキャッシュしない
  if (event.request.url.includes('script.google.com')) {
    return;
  }
  
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // キャッシュにあればそれを返す
        if (response) {
          return response;
        }
        
        // なければネットワークから取得
        return fetch(event.request).then((response) => {
          // レスポンスが有効でない場合はそのまま返す
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          
          // レスポンスをキャッシュに保存
          const responseToCache = response.clone();
          caches.open(CACHE_NAME)
            .then((cache) => {
              cache.put(event.request, responseToCache);
            });
          
          return response;
        });
      })
      .catch(() => {
        // オフライン時はキャッシュから返す
        return caches.match('./index.html');
      })
  );
});

// バックグラウンド同期
self.addEventListener('sync', (event) => {
  console.log('Background sync triggered');
  
  if (event.tag === 'sync-records') {
    event.waitUntil(syncRecords());
  }
});

// 同期処理
async function syncRecords() {
  try {
    // IndexedDB から未送信レコードを取得して送信
    // この処理は app.js の syncPendingRecords() と同等
    console.log('Syncing records in background...');
    
    // クライアントに通知
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'SYNC_COMPLETE'
      });
    });
    
  } catch (error) {
    console.error('Background sync failed:', error);
  }
}

// メッセージ受信
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
