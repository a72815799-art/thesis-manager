import { ReactNode, createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppError } from '../db/repo';
import { EVIDENCE_STATUS_LABEL, EvidenceStatus } from '../domain/types';

/* ───────── 토스트 · 확인 대화상자 · 저장 상태 ───────── */

interface Toast {
  id: number;
  text: string;
  err: boolean;
}
interface ConfirmOpts {
  title: string;
  body: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
}
interface UiCtx {
  toast: (text: string, err?: boolean) => void;
  confirm: (o: ConfirmOpts) => Promise<boolean>;
  /** 저장 작업 실행: 성공/실패를 사용자에게 알리고 저장 상태를 갱신한다. */
  run: <T>(fn: () => Promise<T>, okMessage?: string) => Promise<T | undefined>;
  saveState: { at: Date | null; failed: boolean; saving: boolean };
}
const Ctx = createContext<UiCtx | null>(null);
export function useUi(): UiCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('UiProvider 필요');
  return c;
}

export function errorMessage(e: unknown): string {
  if (e instanceof AppError) return e.message;
  const m = e instanceof Error ? e.message : String(e);
  return `저장하지 못했습니다. 입력 내용은 화면에 남아 있으니 다시 시도하세요. (브라우저 저장소 오류: ${m})`;
}

export function UiProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [dialog, setDialog] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);
  const [saveState, setSaveState] = useState<{ at: Date | null; failed: boolean; saving: boolean }>({ at: null, failed: false, saving: false });
  const seq = useRef(0);
  const toast = useCallback((text: string, err = false) => {
    const id = ++seq.current;
    setToasts((t) => [...t, { id, text, err }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), err ? 9000 : 3500);
  }, []);
  const confirm = useCallback((o: ConfirmOpts) => new Promise<boolean>((resolve) => setDialog({ ...o, resolve })), []);
  const run = useCallback(
    async <T,>(fn: () => Promise<T>, okMessage?: string) => {
      setSaveState((s) => ({ ...s, saving: true }));
      try {
        const r = await fn();
        setSaveState({ at: new Date(), failed: false, saving: false });
        if (okMessage) toast(okMessage);
        return r;
      } catch (e) {
        setSaveState((s) => ({ ...s, saving: false, failed: e instanceof AppError ? s.failed : true }));
        toast(errorMessage(e), true);
        return undefined;
      }
    },
    [toast],
  );
  const close = (v: boolean) => {
    dialog?.resolve(v);
    setDialog(null);
  };
  return (
    <Ctx.Provider value={{ toast, confirm, run, saveState }}>
      {children}
      {dialog && (
        <div className="overlay" role="dialog" aria-modal="true" data-testid="confirm-dialog">
          <div className="modal">
            <h2>{dialog.title}</h2>
            <div>{dialog.body}</div>
            <div className="modal-foot">
              <button className="btn" onClick={() => close(false)} data-testid="confirm-cancel">
                취소
              </button>
              <button className={`btn ${dialog.danger ? 'danger' : 'primary'}`} onClick={() => close(true)} data-testid="confirm-ok" autoFocus>
                {dialog.confirmLabel ?? '확인'}
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.err ? 'err' : ''}`} role={t.err ? 'alert' : 'status'} data-testid={t.err ? 'toast-error' : 'toast-ok'}>
            {t.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

/* ───────── 기본 컴포넌트 ───────── */

export function Modal({ title, children, onClose, wide, testid }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean; testid?: string }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={title} data-testid={testid ?? 'modal'}>
      <div className={`modal ${wide ? 'wide' : ''}`}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, required, optional, help, children }: { label: string; required?: boolean; optional?: boolean; help?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="lbl">
        {label}
        {required && <span className="req" title="필수 항목">*필수</span>}
        {optional && <span className="opt">선택</span>}
      </span>
      {children}
      {help && <div className="help">{help}</div>}
    </label>
  );
}

export function TextInput({ value, onChange, ...rest }: { value: string; onChange: (v: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'>) {
  return <input type="text" value={value} onChange={(e) => onChange(e.target.value)} {...rest} />;
}
export function TextArea({ value, onChange, ...rest }: { value: string; onChange: (v: string) => void } & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange' | 'value'>) {
  return <textarea value={value} onChange={(e) => onChange(e.target.value)} {...rest} />;
}

export function MultiCheck({ options, value, onChange, empty, name }: { options: { id: string; label: string }[]; value: string[]; onChange: (v: string[]) => void; empty: string; name: string }) {
  if (!options.length) return <div className="help">{empty}</div>;
  return (
    <div className="checks">
      {options.map((o) => (
        <label key={o.id} className="check">
          <input
            type="checkbox"
            data-testid={`${name}-${o.label.split(' ')[0]}`}
            checked={value.includes(o.id)}
            onChange={(e) => onChange(e.target.checked ? [...value, o.id] : value.filter((x) => x !== o.id))}
          />
          {o.label}
        </label>
      ))}
    </div>
  );
}

/** 한 줄에 하나씩 입력하는 목록 편집기 */
export function ListEditor({ value, onChange, placeholder, testid }: { value: string[]; onChange: (v: string[]) => void; placeholder: string; testid?: string }) {
  return (
    <TextArea
      data-testid={testid}
      value={value.join('\n')}
      onChange={(t) => onChange(t.split('\n'))}
      placeholder={`${placeholder}\n(한 줄에 하나씩 입력)`}
      rows={Math.max(3, value.length + 1)}
    />
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty" data-testid="empty">
      <strong>{title}</strong>
      <div>{children}</div>
    </div>
  );
}

export function Loading() {
  return (
    <div className="empty" role="status">
      불러오는 중…
    </div>
  );
}

export function Todo() {
  return <span className="todo">작성 필요</span>;
}
export function TextOrTodo({ text }: { text: string }) {
  return text.trim() ? <span className="pre">{text}</span> : <Todo />;
}

const STATUS_CLASS: Record<EvidenceStatus, string> = { unverified: '', checking: 'accent', verified: 'ok', recheck: 'danger' };
export function EvidenceBadge({ status }: { status: EvidenceStatus }) {
  return <span className={`badge ${STATUS_CLASS[status]}`}>{EVIDENCE_STATUS_LABEL[status]}</span>;
}

export function FictionalBadge() {
  return <span className="badge warn">가상 예시</span>;
}

export function fmtDate(iso: string | null | undefined, withTime = false): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, '0');
  const s = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  return withTime ? `${s} ${p(d.getHours())}:${p(d.getMinutes())}` : s;
}

export function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function safeFileName(s: string): string {
  return s.replace(/[\\/:*?"<>|\n\r]+/g, ' ').trim().slice(0, 40) || '프로젝트';
}
