// 最小 IndexedDB：只在成功构建时存密钥条目（含 CryptoKey）。
// 存的是不可导出的 CryptoKey + 盐 + 版本号：即使有人拿到这台机器的磁盘，
// 也无法从库中直接读出密钥字节；用它只能解密你自己的账本密文。
const DB = 'fp-sync';
const STORE = 'keys';
const ENTRY = 'entry';

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('idb_open_failed'));
  });
}

async function tx(mode, run) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = run(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('idb_failed'));
    t.oncomplete = () => db.close();
    t.onabort = () => { db.close(); reject(new Error('idb_aborted')); };
  });
}

export function loadEntry() {
  return tx('readonly', (s) => s.get(ENTRY)).catch(() => null);
}

export function saveEntry(entry) {
  return tx('readwrite', (s) => s.put(entry, ENTRY));
}

export function clearEntry() {
  return tx('readwrite', (s) => s.delete(ENTRY)).catch(() => null);
}
