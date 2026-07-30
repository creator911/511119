"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  isSafeManagedMenuHref,
  parseManagedMenuEntries,
  serializeManagedMenuEntries,
  type ManagedMenuEntry,
} from "@/lib/admin-menu-settings";
import type { LegacyAdminToolDefinition } from "@/lib/admin-tool-catalog";
import styles from "./menu-settings.module.css";

interface SettingsResult {
  message?: string;
  fieldErrors?: Record<string, string>;
  settings?: Record<string, string | number | boolean>;
}

interface MenuEditorMessage {
  type: "kiel-menu-editor-save";
  entry: ManagedMenuEntry;
}

export function MenuSettingsTool({
  definition,
  initialSettings,
}: {
  definition: LegacyAdminToolDefinition;
  initialSettings: Record<string, string | number | boolean>;
}) {
  const [entries, setEntries] = useState(() =>
    parseManagedMenuEntries(initialSettings.menuOrder),
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const editorWindowRef = useRef<Window | null>(null);
  const orderedEntries = useMemo(
    () =>
      [...entries].sort(
        (left, right) =>
          left.order - right.order || left.id.localeCompare(right.id),
      ),
    [entries],
  );

  useEffect(() => {
    function receive(event: MessageEvent<unknown>) {
      if (
        event.origin !== window.location.origin ||
        event.source !== editorWindowRef.current ||
        !isMenuEditorMessage(event.data)
      ) {
        return;
      }
      const entry = normalizeEditorEntry(event.data.entry);
      editorWindowRef.current = null;
      if (!entry) {
        setFailed(true);
        setMessage("메뉴 입력 내용을 확인해 주세요.");
        return;
      }
      setEntries((current) => {
        const exists = current.some((item) => item.id === entry.id);
        return exists
          ? current.map((item) => (item.id === entry.id ? entry : item))
          : [...current, entry];
      });
      setFailed(false);
      setMessage("메뉴를 목록에 반영했습니다. 상단 확인을 눌러 저장해 주세요.");
    }
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, []);

  function openEditor(entry?: ManagedMenuEntry) {
    const query = new URLSearchParams();
    if (entry) {
      query.set("id", entry.id);
      query.set("label", entry.label);
      query.set("href", entry.href);
      query.set("newWindow", entry.newWindow ? "1" : "0");
      query.set("order", String(entry.order));
      query.set("usePc", entry.usePc ? "1" : "0");
      query.set("useMobile", entry.useMobile ? "1" : "0");
    } else {
      query.set("order", String(entries.length));
      query.set("usePc", "1");
      query.set("useMobile", "1");
    }
    const popup = window.open(
      `/adm/menu-editor?${query.toString()}`,
      "kiel_menu_editor",
      "popup=yes,width=550,height=650,resizable=yes,scrollbars=yes",
    );
    if (!popup) {
      setFailed(true);
      setMessage("메뉴 편집창을 열 수 없습니다. 팝업 허용 여부를 확인해 주세요.");
      return;
    }
    editorWindowRef.current = popup;
    popup.focus();
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    setFailed(false);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/tools/${definition.slug}`, {
        method: "PATCH",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...initialSettings,
          menuOrder: serializeManagedMenuEntries(orderedEntries),
          enabled: true,
        }),
      });
      const result = (await response.json().catch(() => null)) as
        | SettingsResult
        | null;
      if (response.status === 401) {
        window.location.assign("/adm/login");
        return;
      }
      if (!response.ok || !result?.settings) {
        throw new Error(
          result?.message ??
            Object.values(result?.fieldErrors ?? {})[0] ??
            "메뉴설정을 저장하지 못했습니다.",
        );
      }
      setEntries(parseManagedMenuEntries(result.settings.menuOrder));
      setMessage("메뉴설정을 저장했습니다.");
    } catch (cause) {
      setFailed(true);
      setMessage(
        cause instanceof Error
          ? cause.message
          : "메뉴설정을 저장하지 못했습니다.",
      );
    } finally {
      setSaving(false);
    }
  }

  function remove(entry: ManagedMenuEntry) {
    if (!window.confirm(`"${entry.label}" 메뉴를 삭제하시겠습니까?`)) return;
    setEntries((current) => current.filter((item) => item.id !== entry.id));
    setFailed(false);
    setMessage("메뉴를 목록에서 삭제했습니다. 상단 확인을 눌러 저장해 주세요.");
  }

  return (
    <div className={styles.page}>
      <div className={`btn_fixed_top ${styles.fixedActions}`}>
        <button
          className={`btn btn_01 ${styles.addButton}`}
          type="button"
          onClick={() => openEditor()}
        >
          메뉴추가
        </button>
        <button
          className={`btn_submit btn ${styles.saveButton}`}
          type="button"
          disabled={saving}
          onClick={() => void save()}
        >
          확인
        </button>
      </div>

      <div className={`local_desc01 local_desc ${styles.notice}`}>
        <p>
          <strong>주의!</strong> 메뉴설정 작업 후 반드시 확인을 누르셔야
          저장됩니다.
        </p>
      </div>

      <div className={`tbl_head01 tbl_wrap ${styles.tableWrap}`}>
        <table className={styles.table}>
          <caption>메뉴 설정 목록</caption>
          <colgroup>
            <col className={styles.colMenu} />
            <col className={styles.colLink} />
            <col className={styles.colWindow} />
            <col className={styles.colOrder} />
            <col className={styles.colPc} />
            <col className={styles.colMobile} />
            <col className={styles.colManage} />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">메뉴</th>
              <th scope="col">링크</th>
              <th scope="col">새창</th>
              <th scope="col">순서</th>
              <th scope="col">PC사용</th>
              <th scope="col">모바일사용</th>
              <th scope="col">관리</th>
            </tr>
          </thead>
          <tbody>
            {orderedEntries.length > 0 ? (
              orderedEntries.map((entry) => (
                <tr key={entry.id}>
                  <td className={styles.textCell}>{entry.label}</td>
                  <td className={styles.linkCell}>{entry.href}</td>
                  <td>{entry.newWindow ? "사용" : "사용안함"}</td>
                  <td>{entry.order}</td>
                  <td>{entry.usePc ? "사용" : "사용안함"}</td>
                  <td>{entry.useMobile ? "사용" : "사용안함"}</td>
                  <td className={styles.manageCell}>
                    <button
                      className="btn btn_03"
                      type="button"
                      onClick={() => openEditor(entry)}
                    >
                      수정
                    </button>
                    <button
                      className="btn btn_02"
                      type="button"
                      onClick={() => remove(entry)}
                    >
                      삭제
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td className={styles.emptyCell} colSpan={7}>
                  자료가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p
        className="sound_only"
        aria-live="polite"
        data-failed={failed ? "true" : "false"}
      >
        {message}
      </p>
    </div>
  );
}

function isMenuEditorMessage(value: unknown): value is MenuEditorMessage {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      (value as { type?: unknown }).type === "kiel-menu-editor-save" &&
      (value as { entry?: unknown }).entry,
  );
}

function normalizeEditorEntry(entry: ManagedMenuEntry): ManagedMenuEntry | null {
  const parsed = parseManagedMenuEntries(JSON.stringify([entry]));
  return parsed.length === 1 && isSafeManagedMenuHref(parsed[0]!.href)
    ? parsed[0]!
    : null;
}
