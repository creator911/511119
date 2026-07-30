"use client";

/* eslint-disable @next/next/no-html-link-for-pages -- Legacy administrator navigation intentionally performs full-page requests. */

import {
  useState,
  type FormEvent,
} from "react";
import type { PriceComparisonSettings } from "@/lib/price-comparison";
import styles from "./price-comparison.module.css";

interface SettingsApiResult {
  ok?: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
  settings?: Record<string, string | number | boolean>;
}

export function PriceComparisonManager({
  initialSettings,
  feedUrl,
  showSettings = false,
}: {
  initialSettings: PriceComparisonSettings;
  feedUrl: string;
  showSettings?: boolean;
}) {
  const [settings, setSettings] = useState(initialSettings);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setMessage("");
    setFailed(false);
    try {
      const response = await fetch("/api/admin/tools/price-comparison", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(settings),
      });
      const result = (await response.json()) as SettingsApiResult;
      if (response.status === 401) {
        window.location.assign("/adm/login");
        return;
      }
      if (!response.ok || !result.settings) {
        setFailed(true);
        setMessage(result.message ?? "상품 피드 설정을 저장하지 못했습니다.");
        return;
      }
      setSettings({
        enabled: result.settings.enabled === true,
        feedName: String(result.settings.feedName ?? ""),
        memo: String(result.settings.memo ?? ""),
      });
      setMessage("상품 피드 설정을 저장했습니다.");
    } catch {
      setFailed(true);
      setMessage("네트워크 상태를 확인한 뒤 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  }

  async function copyFeedUrl() {
    try {
      await navigator.clipboard.writeText(feedUrl);
      setFailed(false);
      setMessage("상품 피드 주소를 복사했습니다.");
    } catch {
      setFailed(true);
      setMessage("주소를 복사하지 못했습니다. 입력란의 주소를 직접 복사해 주세요.");
    }
  }

  if (!showSettings) {
    return <PriceComparisonGuide feedUrl={feedUrl} />;
  }

  return (
    <form onSubmit={save}>
      <div className="btn_fixed_top">
        <a className="btn btn_02" href="/adm/tools/price-comparison">
          연동 안내
        </a>
      </div>
      <div className="local_desc01 local_desc">
        <p>
          활성 상품 카탈로그에서 읽기 전용 XML 피드를 생성합니다. 이 화면은
          외부 가격비교 서비스에 제출되었다고 표시하거나 제출을 대신하지
          않습니다.
        </p>
      </div>
      <div className="tbl_frm01 tbl_wrap">
        <table>
          <caption>가격비교 상품 피드 설정</caption>
          <tbody>
            <tr>
              <th scope="row">피드 사용</th>
              <td>
                <label>
                  <input
                    type="radio"
                    name="price-feed-enabled"
                    checked={settings.enabled}
                    onChange={() =>
                      setSettings({ ...settings, enabled: true })
                    }
                  />{" "}
                  사용
                </label>{" "}
                <label>
                  <input
                    type="radio"
                    name="price-feed-enabled"
                    checked={!settings.enabled}
                    onChange={() =>
                      setSettings({ ...settings, enabled: false })
                    }
                  />{" "}
                  사용 안 함
                </label>
              </td>
            </tr>
            <tr>
              <th scope="row">
                <label htmlFor="price-feed-name">피드 이름</label>
              </th>
              <td>
                <input
                  id="price-feed-name"
                  className="frm_input"
                  value={settings.feedName}
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      feedName: event.currentTarget.value,
                    })
                  }
                  maxLength={200}
                />
              </td>
            </tr>
            <tr>
              <th scope="row">
                <label htmlFor="price-feed-url">피드 주소</label>
              </th>
              <td>
                <div className={styles.urlRow}>
                  <input
                    id="price-feed-url"
                    className="frm_input"
                    value={feedUrl}
                    readOnly
                    onFocus={(event) => event.currentTarget.select()}
                  />
                  <button
                    type="button"
                    className="btn btn_02"
                    onClick={() => void copyFeedUrl()}
                  >
                    주소 복사
                  </button>
                  <a
                    className="btn btn_03"
                    href="/api/catalog/price-feed"
                    target="_blank"
                    rel="noreferrer"
                  >
                    피드 확인
                  </a>
                </div>
                <span className="frm_info">
                  피드 사용을 끄면 이 주소는 404로 응답합니다.
                </span>
              </td>
            </tr>
            <tr>
              <th scope="row">
                <label htmlFor="price-feed-memo">연동 메모</label>
              </th>
              <td>
                <textarea
                  id="price-feed-memo"
                  className={styles.textarea}
                  value={settings.memo}
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      memo: event.currentTarget.value,
                    })
                  }
                  maxLength={5_000}
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      {message ? (
        <div
          className={`${styles.message} ${
            failed ? styles.failed : styles.success
          }`}
          role="status"
        >
          {message}
        </div>
      ) : null}
      <div className={styles.actions}>
        <button type="submit" className="btn btn_03" disabled={saving}>
          {saving ? "저장 중..." : "설정 저장"}
        </button>
      </div>
    </form>
  );
}

function PriceComparisonGuide({ feedUrl }: { feedUrl: string }) {
  const feed = (channel: string, scope = "full") =>
    `${feedUrl}?channel=${encodeURIComponent(channel)}&scope=${encodeURIComponent(scope)}`;
  return (
    <div className={styles.guide}>
      <section id="price-guide-info">
        <h2>가격비교사이트 연동 안내</h2>
        <GuideAnchors variant="intro" />
        <div
          className={`local_desc01 local_desc ${styles.guideIntroDescription}`}
        >
          <ol>
            <li>
              가격비교사이트는 네이버 지식쇼핑, 다음 쇼핑하우 등이
              있습니다.
            </li>
            <li>
              앞서 나열한 가격비교사이트 중 희망하시는 사이트에
              입점합니다.
            </li>
            <li>
              <strong>사이트별 엔진페이지 URL</strong>을 참고하여 해당
              엔진페이지 URL 을 입점하신 사이트에 알려주시면 됩니다.
            </li>
          </ol>
        </div>
      </section>

      <section id="price-guide-engine">
        <h2>사이트별 엔진페이지 URL</h2>
        <GuideAnchors variant="engine" />
        <div
          className={`local_desc01 local_desc ${styles.guideEngineDescription}`}
        >
          <p>사이트 명을 클릭하시면 해당 사이트로 이동합니다.</p>
          <dl className={styles.priceEngine}>
            <dt>
              <a
                href="https://shopping.naver.com/"
                target="_blank"
                rel="noreferrer"
              >
                네이버쇼핑
              </a>
            </dt>
            <dd>
              <ul>
                <li>
                  입점 안내 :{" "}
                  <a
                    href="https://shopping.naver.com/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    네이버쇼핑 판매자 안내
                  </a>
                </li>
                <li>
                  전체상품 URL :{" "}
                  <a href={feed("naver")} target="_blank" rel="noreferrer">
                    {feed("naver")}
                  </a>
                </li>
                <li>
                  요약상품 URL :{" "}
                  <a
                    href={feed("naver", "summary")}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {feed("naver", "summary")}
                  </a>
                </li>
              </ul>
            </dd>
            <dt>
              <a
                href="https://www.google.com/intl/ko_kr/retail/solutions/merchant-center"
                target="_blank"
                rel="noreferrer"
              >
                구글 쇼핑
              </a>
            </dt>
            <dd>
              <ul>
                <li>
                  구글 Merchant Center :{" "}
                  <a
                    href="https://www.google.com/intl/ko_kr/retail/solutions/merchant-center"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Google Merchant Center
                  </a>
                </li>
                <li>파일 이름 : price-feed</li>
                <li>
                  파일 URL :{" "}
                  <a href={feed("google")} target="_blank" rel="noreferrer">
                    {feed("google")}
                  </a>
                </li>
              </ul>
            </dd>
            <dt>Feed 설명</dt>
            <dd>
              <ul>
                <li>
                  판매국가 <b>대한민국</b>, 언어 <b>한국어</b> 설정
                  기준입니다.
                </li>
                <li>기본 피드 이름 : 쇼핑몰피드</li>
                <li>
                  상품 설명 : 상품기본설명을 사용하며 HTML 태그는 자동
                  제거됩니다.
                </li>
              </ul>
            </dd>
            <dt>
              <a
                href="https://shoppinghow.kakao.com/"
                target="_blank"
                rel="noreferrer"
              >
                다음 쇼핑하우
              </a>
            </dt>
            <dd>
              <ul>
                <li>
                  입점 안내 :{" "}
                  <a
                    href="https://shoppinghow.kakao.com/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    다음 쇼핑하우
                  </a>
                </li>
                <li>
                  전체상품 URL :{" "}
                  <a href={feed("daum")} target="_blank" rel="noreferrer">
                    {feed("daum")}
                  </a>
                </li>
                <li>
                  요약상품 URL :{" "}
                  <a
                    href={feed("daum", "summary")}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {feed("daum", "summary")}
                  </a>
                </li>
              </ul>
            </dd>
          </dl>
        </div>
      </section>
    </div>
  );
}

function GuideAnchors({ variant }: { variant: "intro" | "engine" }) {
  return (
    <ul
      className={`${styles.guideAnchors} ${
        variant === "intro"
          ? styles.guideAnchorsIntro
          : styles.guideAnchorsEngine
      }`}
    >
      <li>
        <a href="#price-guide-info">가격비교사이트 연동 안내</a>
      </li>
      <li>
        <a href="#price-guide-engine">사이트별 엔진페이지 URL</a>
      </li>
    </ul>
  );
}
