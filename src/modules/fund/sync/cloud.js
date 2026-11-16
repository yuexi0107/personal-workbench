// ============================================================
// 云端同步层：口令派生密钥 → AES-GCM 加密整本账 → 只把密文推上云
// 密钥只在本机（内存 + 可选 IndexedDB 记住），服务器只见密文信封
// ============================================================
import { deriveKey, encryptJson, decryptEnvelope, newSalt, available } from './crypto.js';
import { ApiError, requestJson, messageFor } from './api.js';
import { loadEntry, saveEntry, clearEntry } from './idb.js';

const KEYS = {
  lastStatus: 'fp:cloud:lastStatus',
  unlockedAt: 'fp:cloud:unlockedAt',
  seenVersion: 'fp:cloud:seenVersion',
};

export const SCHEMA_VERSION = 1;

// ---------------- 本地账 ↔ localStorage ----------------
function parse(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}

export function readLocalLedger() {
  return {
    schema: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    modules: parse('fp:modules', []),
    items: parse('fp:items', []),
    snapshots: parse('fp:snapshots', []),
    investments: parse('fp:investments', []),
  };
}

export function writeLocalLedger(ledger) {
  if (!ledger || typeof ledger !== 'object') throw new Error('invalid_ledger');
  for (const key of ['modules', 'items', 'snapshots', 'investments']) {
    if (!Array.isArray(ledger[key])) throw new Error('invalid_' + key);
    localStorage.setItem('fp:' + key, JSON.stringify(ledger[key]));
  }
  localStorage.setItem('fp:seeded', '1'); // 已有云端账，不再种示例数据
  localStorage.setItem(KEYS.unlockedAt, new Date().toISOString());
}

// ---------------- 状态机（发布订阅）----------------
// status: checking | unavailable | ready_setup | locked | on | syncing | synced | conflict | error | offline
let state = { status: 'checking', message: '', version: null, dirtyAt: null, remember: false };
const listeners = new Set();
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function set(patch) {
  state = { ...state, ...patch };
  for (const fn of listeners) fn(state);
}
export function getState() { return state; }

/** 会话密钥：{key, salt, version} */
let session = null;
export function isUnlocked() { return !!session; }
export function cloudVersion() { return session ? session.version : null; }

const ERRORS = {
  decrypt_failed: '口令不正确，或云端数据已损坏，没能解开。',
  no_webcrypto: '当前环境不支持所需加密：请用 HTTPS 或 localhost 打开。',
  not_ready: '云端还没准备好，先在本地继续记账。',
};

/** 取错误码：ApiError 用 code，普通 Error 的 message 本身就是码 */
function codeFor(error) {
  if (error instanceof ApiError) return error.code;
  return error instanceof Error ? error.message : String(error || '');
}

export function friendlyError(error) {
  // ApiError 已按错误码本地化成中文文案，直接用
  if (error instanceof ApiError) return error.message;
  const code = codeFor(error);
  if (ERRORS[code]) return ERRORS[code];
  // 其余：形如 snake_case 的当作已知码取文案，否则视为可直接展示的提示语
  if (/^[a-z0-9_]+$/.test(code)) return messageFor(code);
  return code || messageFor('request_failed');
}

// ---------------- 网络动作 ----------------
async function ping() { return requestJson('/functions/v1/app?action=ping'); }
async function pullEnvelope() { return requestJson('/functions/v1/app?action=pull'); }
async function pushEnvelope({ ciphertext, salt, iv, baseVersion }) {
  return requestJson('/functions/v1/app?action=push', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ciphertext, salt, iv, base_version: baseVersion }),
  });
}
async function resetEnvelope() {
  return requestJson('/functions/v1/app?action=reset', { method: 'POST' });
}

// ---------------- 启动检查 ----------------
/** 探测云端可用性；若本机记住了密钥则自动解开并套用云端账本 */
export async function bootstrap() {
  if (!available()) {
    set({ status: 'unavailable', message: friendlyError('no_webcrypto') });
    return state;
  }
  set({ status: 'checking', message: '' });
  let pinged;
  try {
    pinged = await ping();
  } catch (error) {
    // 网络不通仍可本地记账；接口/加密不可用则明确说"云端暂不可用"
    if (codeFor(error) === 'network_error') {
      set({ status: 'offline', message: '连不上云端，已按本地账本运行。' });
    } else {
      set({ status: 'unavailable', message: '云端同步组件当前不可用，本机记账不受影响。' });
    }
    return state;
  }
  if (!pinged.signed_in) {
    set({ status: 'unavailable', message: '需要登录你的 Qoder 账号后才能云同步（手机和电脑用同一账号）。' });
    return state;
  }
  let env;
  try { env = await pullEnvelope(); }
  catch (e) { set({ status: 'error', message: friendlyError(e) }); return state; }

  if (!env.found) {
    set({ status: 'ready_setup', message: '云端还没有你的账本，设一个口令即可把本机账本加密上传。' });
    return state;
  }
  localStorage.setItem(KEYS.seenVersion, String(env.version));

  const entry = await loadEntry();
  if (entry && entry.salt === env.salt) {
    try {
      const ledger = await decryptEnvelope(entry.key, env.ciphertext, env.iv);
      writeLocalLedger(ledger);
      session = { key: entry.key, salt: entry.salt, version: env.version };
      set({ status: 'on', message: '', version: env.version, remember: true });
      return state;
    } catch { /* 记住的密钥解不开（口令换过/数据更新）→ 走手动解锁 */ }
  }
  set({ status: 'locked', message: '输入口令即可解开云端账本（云端为准，会覆盖本机显示）。' });
  return state;
}

// ---------------- 建立 / 解锁 ----------------
/** 首次上云：本机账本 + 口令 → 云端密文 v1 */
export async function setup(passphrase, remember = true) {
  if (!available()) throw new Error('no_webcrypto');
  if (!passphrase || passphrase.length < 6) throw new Error('口令至少 6 个字符');
  set({ status: 'syncing', message: '正在加密并上传第一版…' });
  try {
    const salt = newSalt();
    const key = await deriveKey(passphrase, salt);
    const envelope = await encryptJson(key, readLocalLedger());
    const res = await pushEnvelope({ ...envelope, salt, baseVersion: 0 });
    session = { key, salt, version: res.version };
    await storeSession(remember);
    set({ status: 'synced', message: '云端账本已建立，此后改动会自动加密上传。', version: res.version });
    return res;
  } catch (error) {
    // 首建失败：回到"待建立"，本机账本未受影响
    if (codeFor(error) === 'version_conflict') {
      set({ status: 'locked', message: '云端已有你的账本，请输入口令解锁（本机改动暂未上传）。' });
    } else {
      set({ status: 'ready_setup', message: friendlyError(error) });
    }
    throw error;
  }
}

/** 用口令解开云端账本；成功后调用方应 reload 让界面重读本机存储 */
export async function unlock(passphrase, remember = true) {
  if (!available()) throw new Error('no_webcrypto');
  if (!passphrase) throw new Error('请输入口令');
  set({ status: 'syncing', message: '正在解密云端账本…' });
  let env;
  try { env = await pullEnvelope(); }
  catch (error) { set({ status: 'locked', message: friendlyError(error) }); throw error; }
  if (!env.found) {
    set({ status: 'ready_setup', message: '云端还没有账本，可直接把本机数据加密上传。' });
    return { created: false, missing: true };
  }
  const key = await deriveKey(passphrase, env.salt);
  let ledger;
  try { ledger = await decryptEnvelope(key, env.ciphertext, env.iv); }
  catch { set({ status: 'locked', message: friendlyError('decrypt_failed') }); throw new Error('decrypt_failed'); }
  try {
    writeLocalLedger(ledger);
    session = { key, salt: env.salt, version: env.version };
    await storeSession(remember);
    set({ status: 'on', message: '', version: env.version });
    return { applied: true, version: env.version, updated_at: env.updated_at };
  } catch (error) {
    set({ status: 'locked', message: friendlyError(error) });
    throw error;
  }
}

async function storeSession(remember) {
  if (remember && session) await saveEntry({ key: session.key, salt: session.salt, savedAt: Date.now() }).catch(() => null);
  else await clearEntry();
  set({ remember: !!remember });
}

/** 退出记住的解锁状态 */
export async function forget() {
  session = null;
  await clearEntry();
  set({ status: 'locked', remember: false, message: '已忘记本机解锁状态，下次需要重新输口令。' });
}

/** 清空云端密文账本（本机数据不动）：换口令、或旧账本不要了时用 */
export async function resetCloud() {
  set({ status: 'syncing', message: '正在清空云端账本…' });
  try {
    const res = await resetEnvelope();
    session = null;
    await clearEntry();
    localStorage.removeItem(KEYS.seenVersion);
    set({
      status: 'ready_setup', version: null, remember: false, dirtyAt: null,
      message: res.state === 'deleted'
        ? '云端账本已清空，本机数据未受影响，可重新设置口令建账。'
        : '云端本来就没有你的账本，可直接设置口令建账。',
    });
    return res;
  } catch (error) {
    set({ status: 'error', message: friendlyError(error) });
    throw error;
  }
}

// ---------------- 推送（含冲突处理）----------------
let timer = null;
/** 本机数据变动：5 秒防抖后自动加密上传 */
export function markDirty() {
  if (!session) return;
  set({ dirtyAt: Date.now() });
  clearTimeout(timer);
  timer = setTimeout(() => { pushNow().catch(() => {}); }, 5000);
}

export async function pushNow() {
  if (!session) throw new Error('not_ready');
  set({ status: 'syncing', message: '加密上传中…' });
  const envelope = await encryptJson(session.key, readLocalLedger());
  const base = session.version ?? 0;
  try {
    const res = await pushEnvelope({ ...envelope, salt: session.salt, iv: envelope.iv, baseVersion: base });
    session.version = res.version;
    localStorage.setItem(KEYS.seenVersion, String(res.version));
    set({ status: 'synced', message: '已同步到云端', version: res.version, dirtyAt: null });
    return res;
  } catch (error) {
    const code = codeFor(error);
    if (code === 'version_conflict') {
      set({ status: 'conflict', message: '另一端已更新过云端账本，请选择保留哪一份。', version: error.currentVersion ?? null });
    } else if (code === 'network_error') {
      set({ status: 'offline', message: '网络不通，改动已存在本机，联网后可手动同步。' });
    } else if (isWriteOutcomeUnknown(error)) {
      // 写入结果未知：绝不自动重放，让用户先核对云端版本
      set({ status: 'error', message: friendlyError(error) || messageFor('write_result_unknown') });
    } else {
      set({ status: 'error', message: friendlyError(error) });
    }
    throw error;
  }
}

/** 冲突处理 A：以云端为准（拉下来覆盖本机） */
export async function resolveUseCloud() {
  const env = await pullEnvelope();
  if (!env.found) throw new Error('云端账本不存在');
  const key = session ? session.key : null;
  if (!key) throw new Error('not_ready');
  const ledger = await decryptEnvelope(key, env.ciphertext, env.iv);
  writeLocalLedger(ledger);
  session = { ...session, version: env.version };
  localStorage.setItem(KEYS.seenVersion, String(env.version));
  set({ status: 'synced', message: '已采用云端账本', version: env.version });
  return true;
}

/** 冲突处理 B：以本机为准（用云端最新版本作基线强推，会覆盖对方改动） */
export async function resolveUseLocal(passphrase) {
  const env = await pullEnvelope();
  if (!env.found && !session) throw new Error('missing_ledger');
  if (!session) {
    if (!passphrase) throw new Error('请输入口令');
    const key = await deriveKey(passphrase, env.salt);
    session = { key, salt: env.salt, version: env.version };
    await storeSession(true);
  }
  session.version = env.found ? env.version : 0;
  const envelope = await encryptJson(session.key, readLocalLedger());
  const res = await pushEnvelope({ ...envelope, salt: session.salt, baseVersion: session.version });
  session.version = res.version;
  localStorage.setItem(KEYS.seenVersion, String(res.version));
  set({ status: 'synced', message: '已用本机账本覆盖云端', version: res.version });
  return res;
}

export function isSyncedUi(status) {
  return status === 'synced' || status === 'on';
}
