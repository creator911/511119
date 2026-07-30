"use client";

import {
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  useEffect,
  useId,
  useState,
} from "react";
import styles from "./admin.module.css";

export type AdminTone =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger";

export type AdminButtonVariant = "default" | "primary" | "danger" | "ghost";
export type AdminButtonSize = "small" | "medium" | "large";

export function cx(
  ...values: Array<string | false | null | undefined>
): string {
  return values.filter(Boolean).join(" ");
}

export interface AdminButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: AdminButtonVariant;
  size?: AdminButtonSize;
  icon?: ReactNode;
  loading?: boolean;
}

export function AdminButton({
  variant = "default",
  size = "medium",
  icon,
  loading = false,
  disabled,
  className,
  children,
  type = "button",
  ...props
}: AdminButtonProps) {
  const variantClass = {
    default: undefined,
    primary: styles.buttonPrimary,
    danger: styles.buttonDanger,
    ghost: styles.buttonGhost,
  }[variant];
  const sizeClass = {
    small: styles.buttonSmall,
    medium: undefined,
    large: styles.buttonLarge,
  }[size];

  return (
    <button
      type={type}
      className={cx(styles.button, variantClass, sizeClass, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <span aria-hidden="true">···</span> : icon}
      {children}
    </button>
  );
}

export interface StatusBadgeProps {
  children: ReactNode;
  tone?: AdminTone;
  className?: string;
}

export function StatusBadge({
  children,
  tone = "neutral",
  className,
}: StatusBadgeProps) {
  const toneClass = {
    neutral: styles.badgeNeutral,
    info: styles.badgeInfo,
    success: styles.badgeSuccess,
    warning: styles.badgeWarning,
    danger: styles.badgeDanger,
  }[tone];

  return (
    <span className={cx(styles.badge, toneClass, className)}>{children}</span>
  );
}

export interface AdminPanelProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  flush?: boolean;
  className?: string;
}

export function AdminPanel({
  title,
  subtitle,
  action,
  children,
  flush = false,
  className,
}: AdminPanelProps) {
  const hasHeader = title !== undefined || subtitle !== undefined || action;

  return (
    <section className={cx(styles.panel, className)}>
      {hasHeader ? (
        <header className={styles.panelHeader}>
          <div className={styles.panelTitleWrap}>
            {title !== undefined ? (
              <h2 className={styles.panelTitle}>{title}</h2>
            ) : null}
            {subtitle !== undefined ? (
              <p className={styles.panelSubtitle}>{subtitle}</p>
            ) : null}
          </div>
          {action ? <div className={styles.panelHeaderAction}>{action}</div> : null}
        </header>
      ) : null}
      <div className={cx(styles.panelBody, flush && styles.panelBodyFlush)}>
        {children}
      </div>
    </section>
  );
}

export interface FormSectionProps {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
}

export function FormSection({
  title,
  description,
  children,
}: FormSectionProps) {
  return (
    <section className={styles.formSection}>
      <header className={styles.formSectionHeader}>
        <h2 className={styles.formSectionTitle}>{title}</h2>
        {description ? (
          <p className={styles.formSectionDescription}>{description}</p>
        ) : null}
      </header>
      <div className={styles.formRows}>{children}</div>
    </section>
  );
}

export interface FormRowProps {
  label: ReactNode;
  children: ReactNode;
  required?: boolean;
  htmlFor?: string;
  help?: ReactNode;
  error?: ReactNode;
}

export function FormRow({
  label,
  children,
  required = false,
  htmlFor,
  help,
  error,
}: FormRowProps) {
  return (
    <div className={styles.formRow}>
      <div className={styles.formLabelCell}>
        <label className={styles.fieldLabel} htmlFor={htmlFor}>
          {label}
          {required ? (
            <span className={styles.requiredMark} aria-hidden="true">
              *
            </span>
          ) : null}
        </label>
      </div>
      <div className={styles.formControlCell}>
        {children}
        {help ? <p className={styles.fieldHelp}>{help}</p> : null}
        {error ? (
          <p className={styles.fieldError} role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export interface AdminInputProps
  extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export function AdminInput({
  className,
  invalid,
  ...props
}: AdminInputProps) {
  return (
    <input
      className={cx(styles.input, className)}
      aria-invalid={invalid || undefined}
      {...props}
    />
  );
}

export interface AdminSelectProps
  extends SelectHTMLAttributes<HTMLSelectElement> {
  children: ReactNode;
}

export function AdminSelect({
  className,
  children,
  ...props
}: AdminSelectProps) {
  return (
    <select className={cx(styles.select, className)} {...props}>
      {children}
    </select>
  );
}

export interface AdminTextareaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export function AdminTextarea({
  className,
  invalid,
  ...props
}: AdminTextareaProps) {
  return (
    <textarea
      className={cx(styles.textarea, className)}
      aria-invalid={invalid || undefined}
      {...props}
    />
  );
}

export interface ToggleProps {
  checked: boolean;
  onChange?: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
  id?: string;
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
  id,
}: ToggleProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <span className={styles.fieldInline}>
      <label className={styles.toggle} htmlFor={inputId}>
        <input
          id={inputId}
          type="checkbox"
          checked={checked}
          disabled={disabled || !onChange}
          onChange={(event) => onChange?.(event.currentTarget.checked)}
        />
        <span className={styles.toggleTrack} aria-hidden="true" />
      </label>
      <span>{label}</span>
    </span>
  );
}

export interface NoticeProps {
  children: ReactNode;
  tone?: "info" | "warning" | "danger";
}

export function Notice({ children, tone = "info" }: NoticeProps) {
  return (
    <div
      className={cx(
        styles.notice,
        tone === "warning" && styles.noticeWarning,
        tone === "danger" && styles.noticeDanger,
      )}
      role={tone === "danger" ? "alert" : "status"}
    >
      <span className={styles.noticeIcon} aria-hidden="true">
        {tone === "danger" ? "!" : "i"}
      </span>
      <div>{children}</div>
    </div>
  );
}

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: ReactNode;
  warning?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm?: () => void | Promise<void>;
  onClose: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  warning,
  confirmLabel = "확인",
  cancelLabel = "취소",
  destructive = false,
  busy = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, onClose, open]);

  if (!open) return null;

  return (
    <div
      className={styles.dialogBackdrop}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <section
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className={styles.dialogHeader}>
          <h2 className={styles.dialogTitle} id={titleId}>
            {title}
          </h2>
          <button
            type="button"
            className={styles.dialogClose}
            onClick={onClose}
            disabled={busy}
            aria-label="닫기"
          >
            ×
          </button>
        </header>
        <div className={styles.dialogBody}>
          <p className={styles.dialogMessage}>{message}</p>
          {warning ? <div className={styles.dialogWarning}>{warning}</div> : null}
        </div>
        <footer className={styles.dialogActions}>
          <AdminButton onClick={onClose} disabled={busy}>
            {cancelLabel}
          </AdminButton>
          <AdminButton
            variant={destructive ? "danger" : "primary"}
            onClick={() => void onConfirm?.()}
            disabled={!onConfirm}
            loading={busy}
          >
            {confirmLabel}
          </AdminButton>
        </footer>
      </section>
    </div>
  );
}

export interface AdminToast {
  id: string;
  title: string;
  message?: string;
  tone?: Exclude<AdminTone, "neutral">;
}

export interface ToastRegionProps {
  toasts: AdminToast[];
  onDismiss?: (id: string) => void;
}

export function ToastRegion({ toasts, onDismiss }: ToastRegionProps) {
  return (
    <div
      className={styles.toastRegion}
      aria-live="polite"
      aria-label="알림"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cx(
            styles.toast,
            toast.tone === "success" && styles.toastSuccess,
            toast.tone === "warning" && styles.toastWarning,
            toast.tone === "danger" && styles.toastDanger,
          )}
          role={toast.tone === "danger" ? "alert" : "status"}
        >
          <span className={styles.toastAccent} aria-hidden="true" />
          <div className={styles.toastContent}>
            <p className={styles.toastTitle}>{toast.title}</p>
            {toast.message ? (
              <p className={styles.toastMessage}>{toast.message}</p>
            ) : null}
          </div>
          <button
            type="button"
            className={styles.toastClose}
            onClick={() => onDismiss?.(toast.id)}
            disabled={!onDismiss}
            aria-label={`${toast.title} 알림 닫기`}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

export interface UseAdminToastsResult {
  toasts: AdminToast[];
  pushToast: (toast: Omit<AdminToast, "id">, duration?: number) => string;
  dismissToast: (id: string) => void;
  clearToasts: () => void;
}

export function useAdminToasts(): UseAdminToastsResult {
  const [toasts, setToasts] = useState<AdminToast[]>([]);

  const dismissToast = (id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  };

  const pushToast = (
    toast: Omit<AdminToast, "id">,
    duration = 4200,
  ): string => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setToasts((current) => [...current, { ...toast, id }]);
    if (duration > 0) {
      window.setTimeout(() => dismissToast(id), duration);
    }
    return id;
  };

  return {
    toasts,
    pushToast,
    dismissToast,
    clearToasts: () => setToasts([]),
  };
}

export interface AdminTabsProps<T extends string> {
  tabs: ReadonlyArray<{ id: T; label: string; count?: number }>;
  activeId: T;
  onChange?: (id: T) => void;
  label?: string;
}

export function AdminTabs<T extends string>({
  tabs,
  activeId,
  onChange,
  label = "관리 화면 탭",
}: AdminTabsProps<T>) {
  return (
    <div className={styles.tabList} role="tablist" aria-label={label}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={cx(
            styles.tabButton,
            activeId === tab.id && styles.tabButtonActive,
          )}
          role="tab"
          aria-selected={activeId === tab.id}
          onClick={() => onChange?.(tab.id)}
          disabled={!onChange}
        >
          {tab.label}
          {tab.count !== undefined ? ` (${tab.count.toLocaleString("ko-KR")})` : ""}
        </button>
      ))}
    </div>
  );
}

