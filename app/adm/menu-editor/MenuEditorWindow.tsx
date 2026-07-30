"use client";

import { useState, type FormEvent } from "react";
import {
  isSafeManagedMenuHref,
  type ManagedMenuEntry,
} from "@/lib/admin-menu-settings";
import styles from "./menu-editor.module.css";

export interface MenuEditorInitialValues {
  id: string;
  label: string;
  href: string;
  newWindow: boolean;
  order: number;
  usePc: boolean;
  useMobile: boolean;
}

export function MenuEditorWindow({
  initialValues,
}: {
  initialValues: MenuEditorInitialValues;
}) {
  const [values, setValues] = useState(initialValues);
  const [message, setMessage] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const label = values.label.trim();
    const href = values.href.trim();
    if (!label || label.length > 60) {
      setMessage("메뉴 이름은 1자 이상 60자 이내로 입력해 주세요.");
      return;
    }
    if (!isSafeManagedMenuHref(href)) {
      setMessage("링크는 / 또는 #으로 시작하는 새 사이트 내부 주소로 입력해 주세요.");
      return;
    }
    if (!window.opener || window.opener.closed) {
      setMessage("메뉴설정 화면을 찾을 수 없습니다. 창을 닫고 다시 열어 주세요.");
      return;
    }
    const entry: ManagedMenuEntry = {
      id:
        values.id ||
        `menu-${window.crypto.randomUUID().replace(/-/gu, "").slice(0, 16)}`,
      label,
      href,
      newWindow: values.newWindow,
      order: Math.max(0, Math.min(9_999, Math.round(values.order))),
      usePc: values.usePc,
      useMobile: values.useMobile,
    };
    window.opener.postMessage(
      { type: "kiel-menu-editor-save", entry },
      window.location.origin,
    );
    window.close();
  }

  return (
    <main className={styles.window}>
      <h1>{values.id ? "메뉴 수정" : "메뉴 추가"}</h1>
      <p className={styles.help}>
        메뉴 정보를 입력한 뒤 확인을 누르세요. 목록 화면에서 다시 한 번 확인을
        눌러야 최종 저장됩니다.
      </p>
      <form onSubmit={submit}>
        <table>
          <caption>메뉴 정보</caption>
          <tbody>
            <tr>
              <th scope="row">
                <label htmlFor="menu-editor-label">메뉴</label>
              </th>
              <td>
                <input
                  id="menu-editor-label"
                  value={values.label}
                  maxLength={60}
                  autoFocus
                  required
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      label: event.currentTarget.value,
                    }))
                  }
                />
              </td>
            </tr>
            <tr>
              <th scope="row">
                <label htmlFor="menu-editor-href">링크</label>
              </th>
              <td>
                <input
                  id="menu-editor-href"
                  value={values.href}
                  maxLength={300}
                  placeholder="/shop"
                  required
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      href: event.currentTarget.value,
                    }))
                  }
                />
              </td>
            </tr>
            <tr>
              <th scope="row">새창</th>
              <td>
                <label className={styles.choice}>
                  <input
                    type="checkbox"
                    checked={values.newWindow}
                    onChange={(event) =>
                      setValues((current) => ({
                        ...current,
                        newWindow: event.currentTarget.checked,
                      }))
                    }
                  />
                  새 창으로 열기
                </label>
              </td>
            </tr>
            <tr>
              <th scope="row">
                <label htmlFor="menu-editor-order">순서</label>
              </th>
              <td>
                <input
                  id="menu-editor-order"
                  type="number"
                  min={0}
                  max={9999}
                  value={values.order}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      order: Number(event.currentTarget.value),
                    }))
                  }
                />
              </td>
            </tr>
            <tr>
              <th scope="row">PC사용</th>
              <td>
                <label className={styles.choice}>
                  <input
                    type="checkbox"
                    checked={values.usePc}
                    onChange={(event) =>
                      setValues((current) => ({
                        ...current,
                        usePc: event.currentTarget.checked,
                      }))
                    }
                  />
                  PC 메뉴에 표시
                </label>
              </td>
            </tr>
            <tr>
              <th scope="row">모바일사용</th>
              <td>
                <label className={styles.choice}>
                  <input
                    type="checkbox"
                    checked={values.useMobile}
                    onChange={(event) =>
                      setValues((current) => ({
                        ...current,
                        useMobile: event.currentTarget.checked,
                      }))
                    }
                  />
                  모바일 메뉴에 표시
                </label>
              </td>
            </tr>
          </tbody>
        </table>
        {message ? (
          <p className={styles.error} role="alert">
            {message}
          </p>
        ) : null}
        <div className={styles.actions}>
          <button type="button" onClick={() => window.close()}>
            취소
          </button>
          <button className={styles.primary} type="submit">
            확인
          </button>
        </div>
      </form>
    </main>
  );
}
