// 浏览器 → 同源 Function 的请求封装（移植自 Sites 官方 api.ts，去掉 TS 注解）
// 只渲染已知错误码对应的中文文案，绝不显示服务端原始报错
export class ApiError extends Error {
  constructor(message, code, status = 0) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

export const API_BASE = '/functions/v1/app';

const MESSAGES = {
  network_error: '连不上云端，已切到本地模式，改动会暂存在本机。',
  invalid_response: '云端返回了无法识别的响应，请稍后重试。',
  request_failed: '请求失败，请重试。',
  access_denied: '需要登录 Qoder 账号后才能同步（手机和电脑用同一个账号）。',
  login_required: '需要登录 Qoder 账号后才能同步（手机和电脑用同一个账号）。',
  invalid_user_context: '登录状态校验失败，请重新登录本站。',
  read_failed: '读取云端账本失败，本机数据未受影响。',
  write_rejected: '云端拒绝了这次写入，本机数据仍安全保存。',
  write_result_unknown: '不确定这次上传是否成功，请先刷新云端再决定，不要重复上传。',
  version_conflict: '另一端已经改过账本，需要先处理冲突。',
  missing_ledger: '云端还没有你的账本，请重新解锁一次。',
  stored_ledger_invalid: '云端账本格式异常，请联系排查。',
  invalid_ciphertext: '加密数据格式不正确，本次未上传。',
  invalid_envelope: '加密参数不完整，本次未上传。',
  invalid_base_version: '版本号无效，请刷新云端。',
  invalid_body: '上传内容无法解析，本次未上传。',
  invalid_content_type: '上传格式不对，本次未上传。',
  unknown_action: '云端接口不认识这个操作。',
  method_not_allowed: '请求方式不对。',
  decrypt_failed: '口令不正确或云端数据已损坏，没能解开。',
  no_webcrypto: '当前浏览器不支持所需加密（需 HTTPS 或 localhost）。',
};

export function messageFor(code) {
  return Object.prototype.hasOwnProperty.call(MESSAGES, code) ? MESSAGES[code] : MESSAGES.request_failed;
}

export async function requestJson(url, init = {}) {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  let response;
  try {
    response = await fetch(url, { ...init, headers, credentials: 'same-origin' });
  } catch (error) {
    if (init.signal && init.signal.aborted) throw error;
    throw new ApiError(messageFor('network_error'), 'network_error');
  }
  if (response.status === 401 || response.status === 403) {
    let code = response.status === 401 ? 'login_required' : 'invalid_user_context';
    try {
      const j = await response.clone().json();
      if (typeof j.error === 'string') code = j.error;
    } catch { /* 保持默认码 */ }
    throw new ApiError(messageFor(code), code, response.status);
  }
  const type = response.headers.get('content-type') || '';
  if (response.redirected || !type.includes('application/json')) {
    throw new ApiError(messageFor('invalid_response'), 'invalid_response', response.status);
  }
  let data;
  try { data = await response.json(); }
  catch { throw new ApiError(messageFor('invalid_response'), 'invalid_response', response.status); }

  const body = data && typeof data === 'object' ? data : null;
  const code = body && typeof body.error === 'string' ? body.error
    : (!response.ok || (body && body.ok === false)) && body && typeof body.code === 'string' ? body.code
      : response.ok ? null : 'request_failed';

  if (!response.ok || !body || body.ok === false || code) {
    const resolved = code || 'request_failed';
    const err = new ApiError(messageFor(resolved), resolved, response.status);
    if (body && typeof body.current_version === 'number') err.currentVersion = body.current_version;
    throw err;
  }
  return data;
}

// 响应丢失不等于写入失败：这类错误必须先核对云端状态，不能自动重放
export function isWriteOutcomeUnknown(error) {
  if (!(error instanceof ApiError) || error.status === 401 || error.status === 403) return false;
  if (error.code === 'write_rejected') return false;
  return ['network_error', 'invalid_response', 'write_result_unknown'].includes(error.code)
    || (error.status >= 500 && error.status < 600);
}
