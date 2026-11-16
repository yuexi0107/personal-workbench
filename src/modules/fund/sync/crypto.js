// ============================================================
// 端到端加密（E2EE）信封层：PBKDF2 派生密钥 + AES-GCM 加密整本账
// 密钥只存在于本浏览器；云端只见 ciphertext/salt/iv，永不见明文与口令
// ============================================================

const enc = new TextEncoder();
const dec = new TextDecoder();

export const KDF = { hash: 'SHA-256', iterations: 210000 };

function toB64(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}
function fromB64(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function available() {
  return typeof crypto !== 'undefined' && !!crypto.subtle;
}

/** 随机盐（新账本用） */
export function newSalt() {
  return toB64(crypto.getRandomValues(new Uint8Array(16)));
}

/** 口令 + 云端 salt → AES-GCM 密钥（不可导出，只留在本标签页内存） */
export async function deriveKey(passphrase, saltB64) {
  if (!available()) throw new Error('no_webcrypto');
  const base = await crypto.subtle.importKey('raw', enc.encode(String(passphrase)), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: fromB64(saltB64), iterations: KDF.iterations, hash: KDF.hash },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** 明文对象 → {ciphertext, iv}；每次随机 12 字节 IV */
export async function encryptJson(key, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const buf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj)));
  return { ciphertext: toB64(buf), iv: toB64(iv) };
}

/** {ciphertext, iv} → 明文对象；口令错/数据坏会抛 decrypt_failed */
export async function decryptEnvelope(key, ciphertextB64, ivB64) {
  try {
    const buf = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromB64(ivB64) },
      key,
      fromB64(ciphertextB64),
    );
    return JSON.parse(dec.decode(buf));
  } catch {
    throw new Error('decrypt_failed');
  }
}
