// Apps Script のデプロイURL
// TODO: 実際のデプロイURLに置き換えてください
const API_URL = 'https://script.google.com/macros/s/AKfycbwCJAZiNNbfuVQ4Obr7uq1tidytgxAhaE1dlpXsDJOx1uzV6xVMI36wjn6xGHV_3GMpyA/exec';

// 認証トークン
const API_TOKEN = 'tardiness-auth-2025-x8k9mP2qR7nL';

// API呼び出し関数（GET方式）
async function callAPI(action, data = {}) {
  console.log('API呼び出し開始:', action, data);
  
  try {
    // URLパラメータを構築
    var params = new URLSearchParams({
      action: action,
      token: API_TOKEN
    });
    
    // データをパラメータに追加
    for (var key in data) {
      if (data.hasOwnProperty(key)) {
        var value = data[key];
        // オブジェクトの場合はJSON文字列化
        if (typeof value === 'object') {
          params.append(key, JSON.stringify(value));
        } else {
          params.append(key, value);
        }
      }
    }
    
    var url = API_URL + '?' + params.toString();
    
    const response = await fetch(url, {
      method: 'GET'
    });
    
    if (!response.ok) {
      throw new Error('HTTP error! status: ' + response.status);
    }
    
    const result = await response.json();
    console.log('API結果:', result);
    return result;
    
  } catch (error) {
    console.error('API Error:', error);
    return { success: false, error: error.toString() };
  }
}
