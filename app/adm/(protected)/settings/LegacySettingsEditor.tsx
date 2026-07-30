"use client";

import {
  useMemo,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type FormEvent,
} from "react";
import { AdminButton } from "@/app/components/admin";
import {
  legacyConfigSections,
  type LegacyConfigControl,
  type LegacyConfigValue,
  type LegacyConfigValues,
} from "@/lib/legacy-config-contract";
import type {
  LegacyProviderStatus,
} from "@/lib/legacy-admin-settings";
import type { SiteDisplaySettings } from "@/lib/site-content";

interface LegacySettingsEditorProps {
  initialSettings: SiteDisplaySettings;
  initialLegacySettings: LegacyConfigValues;
  providerStatus: LegacyProviderStatus;
}

interface SettingsResponse {
  message?: string;
  fieldErrors?: Record<string, string>;
  settings?: SiteDisplaySettings;
  legacySettings?: LegacyConfigValues;
  providerStatus?: LegacyProviderStatus;
}

function subscribeToOrigin() {
  return () => {};
}

function readBrowserOrigin() {
  return window.location.origin;
}

function readServerOrigin() {
  return "";
}

export function LegacySettingsEditor({
  initialSettings,
  initialLegacySettings,
  providerStatus: initialProviderStatus,
}: LegacySettingsEditorProps) {
  const [siteSettings, setSiteSettings] = useState(initialSettings);
  const [values, setValues] = useState<LegacyConfigValues>(() =>
    mergeStorefrontValues(initialLegacySettings, initialSettings),
  );
  const [providerStatus, setProviderStatus] = useState(initialProviderStatus);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const currentOrigin = useSyncExternalStore(
    subscribeToOrigin,
    readBrowserOrigin,
    readServerOrigin,
  );

  const controlSiteFields = useMemo(
    () =>
      new Map(
        legacyConfigSections.flatMap((section) =>
          section.rows.flatMap((row) =>
            row.controls.flatMap((control) =>
              control.siteField
                ? ([[control.key, control.siteField]] as const)
                : [],
            ),
          ),
        ),
      ),
    [],
  );

  function change(control: LegacyConfigControl, value: LegacyConfigValue) {
    setValues((current) => ({ ...current, [control.key]: value }));
    const siteField = controlSiteFields.get(control.key);
    if (siteField) {
      setSiteSettings((current) => ({
        ...current,
        [siteField]: value,
      }));
    }
    setErrors((current) => ({ ...current, [control.key]: "" }));
    setMessage("");
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setMessage("");
    setFailed(false);
    setErrors({});
    try {
      const response = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          siteSettings,
          legacySettings: values,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as
        SettingsResponse;
      if (response.status === 401) {
        const next = `${window.location.pathname}${window.location.search}`;
        window.location.assign(`/adm/login?next=${encodeURIComponent(next)}`);
        return;
      }
      if (
        !response.ok ||
        !payload.settings ||
        !payload.legacySettings
      ) {
        setErrors(payload.fieldErrors ?? {});
        setFailed(true);
        setMessage(payload.message ?? "기본환경설정을 저장하지 못했습니다.");
        return;
      }
      setSiteSettings(payload.settings);
      setValues(
        mergeStorefrontValues(payload.legacySettings, payload.settings),
      );
      if (payload.providerStatus) {
        setProviderStatus(payload.providerStatus);
      }
      setMessage("기본환경설정을 저장했습니다.");
    } catch {
      setFailed(true);
      setMessage("네트워크 상태를 확인한 뒤 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  }

  const identityOff = String(values.cf_cert_use) === "0";

  function runAuxiliary(sectionId: string) {
    if (sectionId === "anc_cf_basic") {
      setValues((current) => ({
        ...current,
        cf_new_skin: "basic",
        cf_mobile_new_skin: "basic",
        cf_search_skin: "basic",
        cf_mobile_search_skin: "basic",
        cf_connect_skin: "basic",
        cf_mobile_connect_skin: "basic",
        cf_faq_skin: "basic",
        cf_mobile_faq_skin: "basic",
      }));
      setMessage("테마 기본 스킨값을 입력했습니다. 확인을 눌러 저장하세요.");
    } else if (sectionId === "anc_cf_join") {
      setValues((current) => ({
        ...current,
        cf_member_skin: "basic",
        cf_mobile_member_skin: "basic",
      }));
      setMessage("테마 회원스킨값을 입력했습니다. 확인을 눌러 저장하세요.");
    } else if (sectionId === "anc_cf_url") {
      window.alert(
        "Nginx에서는 애플리케이션의 /shop 및 /bbs 경로를 그대로 전달하도록 설정해 주세요. 현재 짧은주소 공급자가 연결되지 않아 원본 경로를 사용합니다.",
      );
    }
  }

  return (
    <form className="legacy-config-form" onSubmit={save}>
      <div className="btn_fixed_top">
        <AdminButton type="submit" variant="primary" loading={saving}>
          확인
        </AdminButton>
      </div>
      <p
        className={`legacy-config-message ${failed ? "error" : ""}`}
        role={failed ? "alert" : "status"}
        aria-live="polite"
      >
        {message}
      </p>
      {legacyConfigSections.map((section) => (
        <section
          className="legacy-config-section"
          id={section.id}
          key={section.id}
        >
          <h2 className="h2_frm">{section.title}</h2>
          <ConfigAnchor />
          <ConfigDescription
            sectionId={section.id}
            description={section.description}
          />
          {section.id === "anc_cf_url" ? (
            <ShortUrlTools onAction={() => runAuxiliary(section.id)} />
          ) : null}
          <div className="tbl_frm01 tbl_wrap legacy-config-table-wrap">
            <table className="legacy-config-table">
              <caption>{legacyConfigCaption(section.id, section.title)}</caption>
              <colgroup>
                <col className="legacy-config-label-column" />
                <col className="legacy-config-value-column" />
                <col className="legacy-config-label-column-secondary" />
                <col className="legacy-config-value-column-secondary" />
              </colgroup>
              <tbody>
                {section.rows.map((row) => {
                  const hidden =
                    row.hiddenWhen === "smsPlan" ||
                    (row.hiddenWhen === "identityOff" && identityOff);
                  if (section.id === "anc_cf_url") {
                    return (
                      <tr
                        id={`row-${row.id}`}
                        key={row.id}
                        style={
                          {
                            "--legacy-row-height": `${row.height}px`,
                          } as CSSProperties
                        }
                      >
                        <td className="legacy-config-short-choice">
                          <ConfigControlGroup
                            controls={row.controls}
                            rowId={row.id}
                            values={values}
                            errors={errors}
                            providerStatus={providerStatus}
                            saving={saving}
                            hideFirstInlineLabel={false}
                            onChange={change}
                          />
                        </td>
                        <td
                          className="legacy-config-short-example"
                          colSpan={3}
                        >
                          {shortUrlExample(row.id, currentOrigin)}
                        </td>
                      </tr>
                    );
                  }
                  const splitAt = pairedConfigRowSplit(row.id);
                  const leftControls =
                    splitAt === null
                      ? row.controls
                      : row.controls.slice(0, splitAt);
                  const rightControls =
                    splitAt === null
                      ? []
                      : row.controls.slice(splitAt);
                  const labels = pairedConfigRowLabels(
                    row.id,
                    row.label,
                    leftControls[0],
                    rightControls[0],
                  );
                  return (
                    <tr
                      id={`row-${row.id}`}
                      key={row.id}
                      hidden={hidden}
                      style={
                        hidden
                          ? undefined
                          : ({ "--legacy-row-height": `${row.height}px` } as CSSProperties)
                      }
                    >
                      <th scope="row">{labels[0]}</th>
                      <td colSpan={splitAt === null ? 3 : undefined}>
                        <ConfigControlGroup
                          controls={leftControls}
                          rowId={row.id}
                          values={values}
                          errors={errors}
                          providerStatus={providerStatus}
                          saving={saving}
                          hideFirstInlineLabel={splitAt !== null}
                          onChange={change}
                        />
                        {row.help ? (
                          <span className="frm_info">{row.help}</span>
                        ) : null}
                      </td>
                      {splitAt !== null ? (
                        <>
                          <th scope="row">{labels[1]}</th>
                          <td>
                            <ConfigControlGroup
                              controls={rightControls}
                              rowId={`${row.id}-secondary`}
                              values={values}
                              errors={errors}
                              providerStatus={providerStatus}
                              saving={saving}
                              hideFirstInlineLabel
                              onChange={change}
                            />
                          </td>
                        </>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <SectionAuxiliary
            sectionId={section.id}
            onAction={() => runAuxiliary(section.id)}
          />
        </section>
      ))}
    </form>
  );
}

function ConfigControlGroup({
  controls,
  rowId,
  values,
  errors,
  providerStatus,
  saving,
  hideFirstInlineLabel,
  onChange,
}: {
  controls: readonly LegacyConfigControl[];
  rowId: string;
  values: LegacyConfigValues;
  errors: Record<string, string>;
  providerStatus: LegacyProviderStatus;
  saving: boolean;
  hideFirstInlineLabel: boolean;
  onChange: (
    control: LegacyConfigControl,
    value: LegacyConfigValue,
  ) => void;
}) {
  return (
    <div
      className={`legacy-config-controls ${
        controls.length > 1 ? "legacy-config-controls-multiple" : ""
      }`}
    >
      {controls.map((control, index) => (
        <ConfigControl
          key={`${rowId}-${control.key}-${index}`}
          control={control}
          value={values[control.key] ?? control.defaultValue}
          error={errors[control.key]}
          providerStatus={providerStatus}
          saving={saving}
          hideInlineLabel={hideFirstInlineLabel && index === 0}
          onChange={(value) => onChange(control, value)}
        />
      ))}
    </div>
  );
}

function ConfigAnchor() {
  return (
    <nav className="anchor legacy-config-anchor" aria-label="환경설정 바로가기">
      <ul>
        {legacyConfigSections.map((section) => (
          <li key={section.id}>
            <a href={`#${section.id}`}>{section.tabLabel}</a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function ConfigDescription({
  sectionId,
  description,
}: {
  sectionId: string;
  description?: string;
}) {
  if (!description) return null;
  const lines = description.split("\n");
  return (
    <div className="local_desc02 local_desc legacy-config-description">
      <p>
        {lines.map((line, index) => (
          <span key={`${sectionId}-description-${index}`}>
            {line}
            {index < lines.length - 1 ? <br /> : null}
          </span>
        ))}
        {sectionId === "anc_cf_url" ? (
          <a
            className="btn btn_03 legacy-config-manual-link"
            href="https://sir.kr/manual/g5/286"
            target="_blank"
            rel="noreferrer"
          >
            설정 관련 메뉴얼 보기
          </a>
        ) : null}
      </p>
    </div>
  );
}

function ShortUrlTools({ onAction }: { onAction: () => void }) {
  return (
    <div className="server_config_views legacy-config-server-views">
      <button
        type="button"
        className="btn btn_03 legacy-config-nginx-button"
        onClick={onAction}
      >
        Nginx 설정 코드 보기
      </button>
    </div>
  );
}

function shortUrlExample(rowId: string, origin: string): string {
  const base = origin || "";
  if (rowId === "cf_bbs_rewrite_number") return `${base}/free/123`;
  if (rowId === "cf_bbs_rewrite_name") {
    return `${base}/free/안녕하세요/`;
  }
  return `${base}/bbs/board.php?bo_table=free&wr_id=123`;
}

function ConfigControl({
  control,
  value,
  error,
  providerStatus,
  saving,
  hideInlineLabel = false,
  onChange,
}: {
  control: LegacyConfigControl;
  value: LegacyConfigValue;
  error?: string;
  providerStatus: LegacyProviderStatus;
  saving: boolean;
  hideInlineLabel?: boolean;
  onChange: (value: LegacyConfigValue) => void;
}) {
  const providerUnavailable =
    control.provider !== undefined &&
    !providerStatus[control.provider].configured;
  const disabled = saving || control.secret || providerUnavailable;
  const style = control.width
    ? ({ "--legacy-control-width": `${control.width}px` } as CSSProperties)
    : undefined;
  const common = {
    id: control.key,
    name: control.name,
    disabled,
    required: control.required,
    "aria-invalid": Boolean(error) || undefined,
    className: "legacy-config-input",
    style,
  } as const;

  let element;
  if (control.kind === "checkbox") {
    element = (
      <input
        {...common}
        type="checkbox"
        checked={Boolean(value)}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
    );
  } else if (control.kind === "radio") {
    element = (
      <span className="legacy-config-radio-group">
        {(control.options ?? []).map((option) => (
          <label key={String(option.value)}>
            <input
              type="radio"
              name={control.name}
              checked={String(value) === String(option.value)}
              disabled={disabled}
              onChange={() => onChange(String(option.value))}
            />
            {option.label}
          </label>
        ))}
      </span>
    );
  } else if (control.kind === "select") {
    element = (
      <select
        {...common}
        value={String(value)}
        onChange={(event) => {
          const selected = control.options?.find(
            (option) => String(option.value) === event.currentTarget.value,
          );
          onChange(selected?.value ?? event.currentTarget.value);
        }}
      >
        {(control.options ?? []).map((option) => (
          <option key={String(option.value)} value={String(option.value)}>
            {option.label}
          </option>
        ))}
      </select>
    );
  } else if (control.kind === "textarea") {
    element = (
      <textarea
        {...common}
        rows={control.rows}
        maxLength={control.maxLength}
        value={String(value)}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    );
  } else {
    element = (
      <input
        {...common}
        type={
          control.kind === "number"
            ? "number"
            : control.kind === "password"
              ? "password"
              : control.kind === "email"
                ? "email"
                : "text"
        }
        min={control.min}
        max={control.max}
        maxLength={control.maxLength}
        value={control.secret ? "" : String(value)}
        placeholder={
          control.secret && providerUnavailable
            ? "서버 환경변수로 설정"
            : undefined
        }
        onChange={(event) =>
          onChange(
            control.kind === "number"
              ? Number(event.currentTarget.value)
              : event.currentTarget.value,
          )
        }
      />
    );
  }

  return (
    <span className="legacy-config-control">
      {control.inlineLabel && !hideInlineLabel ? (
        <label htmlFor={control.key}>{control.inlineLabel}</label>
      ) : null}
      {element}
      {control.help ? <span className="frm_info">{control.help}</span> : null}
      {error ? (
        <span className="legacy-config-field-error" role="alert">
          {error}
        </span>
      ) : null}
    </span>
  );
}

function SectionAuxiliary({
  sectionId,
  onAction,
}: {
  sectionId: string;
  onAction: () => void;
}) {
  if (sectionId === "anc_cf_basic") {
    return (
      <button
        type="button"
        className="legacy-config-auxiliary"
        onClick={onAction}
      >
        테마 스킨설정 가져오기
      </button>
    );
  }
  if (sectionId === "anc_cf_join") {
    return (
      <button
        type="button"
        className="legacy-config-auxiliary"
        onClick={onAction}
      >
        테마 회원스킨설정 가져오기
      </button>
    );
  }
  return null;
}

function legacyConfigCaption(sectionId: string, fallback: string): string {
  if (sectionId === "anc_cf_sns") return "소셜네트워크서비스 설정";
  if (sectionId === "anc_cf_sms") return "SMS 설정";
  return fallback;
}

function pairedConfigRowSplit(rowId: string): number | null {
  const splitAtOne = new Set([
    "cf_login_memo_point",
    "cf_nick_open_modify",
    "cf_new_memo_del",
    "cf_visit_popular_del",
    "cf_login_new_rows",
    "cf_page_rows_pair",
    "cf_pages_pair",
    "cf_new_skin_pair",
    "cf_search_skin_pair",
    "cf_connect_skin_pair",
    "cf_faq_skin_pair",
    "cf_ip_lists",
    "cf_delay_link",
    "cf_read_write_point",
    "cf_comment_download_point",
    "cf_member_skin_pair",
    "cf_register",
    "cf_member_icon_use",
    "cf_member_icon_size",
    "cf_member_img_size",
    "cf_recommend",
    "cf_prohibit",
    "cf_naver_keys",
    "cf_facebook_keys",
    "cf_twitter_keys",
    "cf_google_keys",
    "cf_kakao_keys",
    "cf_payco_keys",
  ]);
  if (splitAtOne.has(rowId) || /^cf_\d+$/u.test(rowId)) return 1;
  if (
    rowId === "cf_homepage_addr" ||
    rowId === "cf_tel_hp" ||
    rowId === "cf_signature_profile"
  ) {
    return 2;
  }
  return null;
}

function pairedConfigRowLabels(
  rowId: string,
  fallback: string,
  left?: LegacyConfigControl,
  right?: LegacyConfigControl,
): [string, string] {
  const fixed: Record<string, [string, string]> = {
    cf_new_skin_pair: ["최근게시물 스킨", "모바일 최근게시물 스킨"],
    cf_search_skin_pair: ["검색 스킨", "모바일 검색 스킨"],
    cf_connect_skin_pair: ["접속자 스킨", "모바일 접속자 스킨"],
    cf_faq_skin_pair: ["FAQ 스킨", "모바일 FAQ 스킨"],
    cf_member_skin_pair: ["회원 스킨", "모바일 회원 스킨"],
    cf_member_icon_size: ["회원아이콘 용량", "회원아이콘 사이즈"],
    cf_member_img_size: ["회원이미지 용량", "회원이미지 사이즈"],
    cf_ip_lists: ["접근가능 IP", "접근차단 IP"],
    cf_prohibit: ["아이디,닉네임 금지단어", "입력 금지 메일"],
  };
  if (fixed[rowId]) return fixed[rowId];
  if (/^cf_\d+$/u.test(rowId)) {
    return [`${fallback} 제목`, `${fallback} 값`];
  }
  return [
    left?.inlineLabel ?? fallback,
    right?.inlineLabel ?? fallback,
  ];
}

function mergeStorefrontValues(
  legacySettings: LegacyConfigValues,
  siteSettings: SiteDisplaySettings,
): LegacyConfigValues {
  const values = { ...legacySettings };
  for (const section of legacyConfigSections) {
    for (const row of section.rows) {
      for (const control of row.controls) {
        if (control.siteField) {
          values[control.key] = siteSettings[
            control.siteField
          ] as LegacyConfigValue;
        }
      }
    }
  }
  return values;
}
