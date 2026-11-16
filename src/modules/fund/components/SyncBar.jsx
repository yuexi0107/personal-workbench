// ============================================================
// 云同步状态条 + 口令弹窗（端到端加密）
// 只做状态展示与动作触发，加密/网络细节全在 src/sync/cloud.js
// ============================================================
import React, { useEffect, useRef, useState } from 'react';
import {
  subscribe, getState, bootstrap, setup, unlock, forget, pushNow,
  resolveUseCloud, resolveUseLocal, resetCloud, friendlyError, isUnlocked,
} from '../sync/cloud.js';

const LABEL = {
  checking: '检查云端…',
  ready_setup: '未上云',
  locked: '云端已锁定',
  on: '云端已连接',
  syncing: '同步中…',
  synced: '已同步',
  conflict: '有冲突待处理',
  error: '同步异常',
  offline: '离线 · 本地记账',
  unavailable: '云端不可用',
};
const TONE = {
  on: 'ok', synced: 'ok',
  checking: 'idle', syncing: 'idle',
  ready_setup: 'warn', locked: 'warn', offline: 'warn', unavailable: 'warn',
  conflict: 'bad', error: 'bad',
};

export default function SyncBar({ onLedgerApplied }) {
  const [st, setSt] = useState(getState());
  const [modal, setModal] = useState(null); // 'setup' | 'unlock' | 'overwrite' | 'reset'
  const [pw, setPw] = useState('');
  const [remember, setRemember] = useState(true);
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    const unsub = subscribe((s) => { if (aliveRef.current) setSt(s); });
    // 启动探测：本机记住了密钥时会自动套用云端账本，需要让界面重读本机存储
    bootstrap()
      .then((s) => { if (aliveRef.current && s.status === 'on') onLedgerApplied?.(); })
      .catch(() => {});
    return () => { aliveRef.current = false; unsub(); };
  }, []);

  const run = async (fn, { reload = false } = {}) => {
    setBusy(true); setErr('');
    try {
      const result = await fn();
      if (reload) onLedgerApplied?.();
      return result;
    } catch (error) {
      setErr(friendlyError(error));
      return null;
    } finally {
      setBusy(false);
    }
  };

  const close = () => { setModal(null); setPw(''); setSure(false); setErr(''); };

  const submit = () => {
    const mode = modal;
    if (mode === 'reset') {
      if (!sure) { setErr('请先勾选确认'); return; }
      run(async () => { await resetCloud(); close(); }, { reload: false });
      return;
    }
    if (!pw) { setErr('请输入口令'); return; }
    if (mode === 'setup' && pw.length < 6) { setErr('口令至少 6 个字符'); return; }
    const fn = mode === 'setup' ? () => setup(pw, remember)
      : mode === 'unlock' ? () => unlock(pw, remember)
      : () => resolveUseLocal(pw);
    run(async () => { await fn(); close(); }, { reload: mode === 'unlock' });
  };

  // 冲突：以云端为准需要已解锁的会话，否则先要求输口令
  const useCloud = () => {
    if (!isUnlocked()) { setErr(''); setModal('unlock'); return; }
    run(async () => { await resolveUseCloud(); close(); }, { reload: true });
  };
  const useLocal = () => {
    if (!isUnlocked()) { setModal('overwrite'); return; }
    run(() => resolveUseLocal());
  };

  const tone = TONE[st.status] || 'idle';
  const versionText = st.version ? `云端 v${st.version}` : '';

  return (
    <>
      <div className="syncbar">
        <span className={`sync-dot ${tone}`} />
        <b className="sync-label">{LABEL[st.status] || st.status}</b>
        <span className="sync-msg">{st.message || (st.status === 'on' || st.status === 'synced' ? '账本改动会自动加密上传' : '')}</span>
        {versionText && <span className="tag">{versionText}</span>}

        <span className="sync-actions">
          {st.status === 'ready_setup' && (
            <button className="btn btn-primary btn-sm" onClick={() => setModal('setup')}>设置口令上云</button>
          )}
          {st.status === 'locked' && (
            <button className="btn btn-primary btn-sm" onClick={() => setModal('unlock')}>输入口令解锁</button>
          )}
          {(st.status === 'on' || st.status === 'synced' || st.status === 'offline' || st.status === 'error') && (
            <>
              <button className="btn btn-sm" disabled={busy}
                      title="把本机账本加密后上传" onClick={() => run(() => pushNow())}>立即同步</button>
              <button className="btn btn-sm" disabled={busy} onClick={() => run(() => bootstrap())}>重新检查</button>
              {st.remember && (
                <button className="btn btn-sm" title="清除本机记住的解锁状态"
                        onClick={() => run(() => forget().then(close))}>忘记本机</button>
              )}
            </>
          )}
          {(st.status === 'checking' || st.status === 'syncing') && (
            <button className="btn btn-sm" disabled>处理中…</button>
          )}
          {st.status === 'conflict' && (
            <>
              <button className="btn btn-primary btn-sm" disabled={busy} onClick={useCloud}>以云端为准</button>
              <button className="btn btn-sm" disabled={busy} onClick={useLocal}>用本机覆盖</button>
            </>
          )}
          {st.status === 'unavailable' && (
            <button className="btn btn-sm" onClick={() => run(() => bootstrap())}>重试</button>
          )}
          {['on', 'synced', 'locked', 'error', 'conflict', 'offline'].includes(st.status) && (
            <button className="btn btn-danger btn-sm" title="删除云端的密文账本（本机数据不受影响）"
                    onClick={() => setModal('reset')}>清空云端账本</button>
          )}
        </span>
      </div>

      {modal && (
        <div className="modal-mask" onClick={close}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">
              {modal === 'setup' ? '设置云端口令'
                : modal === 'unlock' ? '解锁云端账本'
                : modal === 'reset' ? '清空云端账本'
                : '用本机账本覆盖云端'}
            </div>

            {modal === 'reset' ? (
              <>
                <div className="warn-box">
                  这会删除<b>云端</b>那份加密账本（包含你换过口令前的旧版本），
                  本机数据不受影响，之后可以重新设置口令建立新账本。
                  其他设备将取不到云端记录，需要重新解锁或重建。
                </div>
                <label className="check-row">
                  <input type="checkbox" checked={sure} onChange={(e) => { setSure(e.target.checked); setErr(''); }} />
                  <span>我已确认要删除云端的密文账本，且知道这一步无法撤销</span>
                </label>
              </>
            ) : (
              <>
                <div className="warn-box">
                  账本在浏览器里用你的口令加密后才上传，云端只保存密文。
                  <b>口令不会被保存也无法找回</b>，忘了就只能重新建账。
                </div>

                {modal === 'overwrite' && (
                  <div className="hint">云端已有更新版本。覆盖会丢掉另一端在云端的新改动，请先确认哪一份才是你要的。</div>
                )}

                <div className="field">
                  <label>{modal === 'setup' ? '新建口令（至少 6 个字符）*' : '口令 *'}</label>
                  <input className="input" type="password" value={pw} autoFocus
                         placeholder={modal === 'setup' ? '建议用只有你知道的短语' : '输入解锁口令'}
                         onChange={(e) => { setPw(e.target.value); setErr(''); }}
                         onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} />
                </div>

                <label className="check-row">
                  <input type="checkbox" checked={remember}
                         onChange={(e) => setRemember(e.target.checked)} />
                  <span>记住解锁状态（仅本机，密钥不可导出；换设备需重新输口令）</span>
                </label>
              </>
            )}

            {err && <div className="delta-down">{err}</div>}

            <div className="modal-actions">
              <button className="btn" onClick={close}>取消</button>
              <button className="btn btn-primary" disabled={busy} onClick={submit}>
                {busy ? '处理中…'
                  : modal === 'setup' ? '加密并上传'
                  : modal === 'unlock' ? '解密并套用'
                  : modal === 'reset' ? '确认清空'
                  : '确认覆盖'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
