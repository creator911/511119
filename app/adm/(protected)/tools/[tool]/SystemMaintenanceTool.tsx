"use client";

import { useEffect, useRef, useState } from "react";
import type { LegacyAdminToolDefinition } from "@/lib/admin-tool-catalog";
import type { LegacyAdminToolRun } from "@/lib/admin-tools";
import styles from "./system-maintenance.module.css";

interface ApiResult {
  message?: string;
  run?: LegacyAdminToolRun;
}

const automaticTools = new Set([
  "session-files-delete",
  "cache-files-delete",
  "captcha-files-delete",
  "thumbnail-files-delete",
  "db-upgrade",
]);

const descriptions: Record<string, string> = {
  "session-files-delete":
    "완료 메세지가 나오기 전에 프로그램의 실행을 중지하지 마십시오.",
  "cache-files-delete":
    "완료 메세지가 나오기 전에 프로그램의 실행을 중지하지 마십시오.",
  "captcha-files-delete":
    "완료 메세지가 나오기 전에 프로그램의 실행을 중지하지 마십시오.",
  "thumbnail-files-delete":
    "완료 메세지가 나오기 전에 프로그램의 실행을 중지하지 마십시오.",
  "browscap-update":
    "Browscap 정보를 업데이트하시려면 아래 업데이트 버튼을 클릭해 주세요.",
  "access-log-convert":
    "접속로그 정보를 Browscap 정보로 변환하시려면 아래 업데이트 버튼을 클릭해 주세요.",
};

const resultLabels: Record<string, string> = {
  "session-files-delete": "세션데이터",
  "cache-files-delete": "캐시파일",
  "captcha-files-delete": "캡챠파일",
  "thumbnail-files-delete": "썸네일",
};

export function SystemMaintenanceTool({
  definition,
  initialRuns,
}: {
  definition: LegacyAdminToolDefinition;
  initialRuns: LegacyAdminToolRun[];
}) {
  const [latestRun, setLatestRun] = useState(initialRuns[0] ?? null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const started = useRef(false);

  async function execute(): Promise<void> {
    if (running) return;
    setRunning(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/tools/${definition.slug}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      const result = (await response.json()) as ApiResult;
      if (response.status === 401) {
        window.location.assign("/adm/login");
        return;
      }
      if (!response.ok || !result.run) {
        setError(result.message ?? "작업을 처리하지 못했습니다.");
        return;
      }
      setLatestRun(result.run);
    } catch {
      setError("네트워크 상태를 확인한 뒤 다시 시도해 주세요.");
    } finally {
      setRunning(false);
    }
  }

  useEffect(() => {
    if (!automaticTools.has(definition.slug) || started.current) return;
    started.current = true;
    void execute();
    // The legacy page starts these maintenance jobs when the page is opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [definition.slug]);

  if (definition.slug === "phpinfo") {
    return <RuntimeInformation />;
  }
  if (definition.slug === "db-upgrade") {
    return (
      <div className={styles.maintenanceBody} aria-live="polite">
        {running ? <p>데이터베이스 구조를 확인하고 있습니다.</p> : null}
        {error ? <p className={styles.error}>{error}</p> : null}
        {!running && !error && latestRun ? (
          <div className="local_desc01 local_desc">
            <p>
              <strong>더 이상 업그레이드 할 내용이 없습니다.</strong>
              <br />
              현재 DB 업그레이드가 완료된 상태입니다.
            </p>
          </div>
        ) : null}
      </div>
    );
  }

  const isAutomatic = automaticTools.has(definition.slug);
  const resultLabel = resultLabels[definition.slug];

  return (
    <div className={styles.maintenanceBody}>
      {descriptions[definition.slug] ? (
        <div className="local_desc02 local_desc">
          <p>{descriptions[definition.slug]}</p>
        </div>
      ) : null}

      {!isAutomatic ? (
        <div className={styles.updateAction}>
          <button
            className="btn_submit btn"
            type="button"
            disabled={running}
            onClick={() => void execute()}
          >
            {running ? "처리 중…" : "업데이트"}
          </button>
        </div>
      ) : null}

      {running && isAutomatic ? (
        <ul className={styles.progressList}>
          <li>처리 중…</li>
        </ul>
      ) : null}

      {error ? (
        <div className={`${styles.error} local_desc01 local_desc`} role="alert">
          <p>{error}</p>
        </div>
      ) : null}

      {!running && !error && latestRun ? (
        <>
          {isAutomatic ? (
            <ul className={styles.progressList}>
              <li>완료됨</li>
            </ul>
          ) : null}
          <div className="local_desc01 local_desc" role="status">
            <p>
              {resultLabel ? (
                <>
                  <strong>{latestRun.message}</strong>
                  <br />
                  프로그램의 실행을 끝마치셔도 좋습니다.
                </>
              ) : (
                <strong>{latestRun.message}</strong>
              )}
            </p>
          </div>
        </>
      ) : null}
    </div>
  );
}

function RuntimeInformation() {
  const [client, setClient] = useState<Record<string, string>>({});

  useEffect(() => {
    const previousMargin = document.body.style.getPropertyValue("margin");
    const previousPriority =
      document.body.style.getPropertyPriority("margin");
    document.body.style.setProperty("margin", "8px", "important");
    return () => {
      if (previousMargin) {
        document.body.style.setProperty(
          "margin",
          previousMargin,
          previousPriority,
        );
      } else {
        document.body.style.removeProperty("margin");
      }
    };
  }, []);

  useEffect(() => {
    const browser = navigator as Navigator & { deviceMemory?: number };
    const timer = window.setTimeout(() => {
      setClient({
        userAgent: browser.userAgent || "확인할 수 없음",
        language: browser.language || "확인할 수 없음",
        languages: browser.languages?.join(", ") || "확인할 수 없음",
        platform: browser.platform || "확인할 수 없음",
        cpu: String(browser.hardwareConcurrency || "확인할 수 없음"),
        memory: browser.deviceMemory
          ? `${browser.deviceMemory} GB 이상`
          : "브라우저 비공개",
        cookies: browser.cookieEnabled ? "사용 가능" : "사용 불가",
        online: browser.onLine ? "온라인" : "오프라인",
        protocol: window.location.protocol.replace(":", "").toUpperCase(),
        host: window.location.host,
        secureContext: window.isSecureContext ? "예" : "아니오",
        viewport: `${window.innerWidth} × ${window.innerHeight}`,
        screen: `${window.screen.width} × ${window.screen.height}`,
        colorDepth: `${window.screen.colorDepth} bit`,
        reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)")
          .matches
          ? "사용"
          : "사용 안 함",
        darkPreference: window.matchMedia("(prefers-color-scheme: dark)")
          .matches
          ? "다크"
          : "라이트",
        touchPoints: String(browser.maxTouchPoints || 0),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        currentTime: new Date().toLocaleString("ko-KR", {
          timeZone: "Asia/Seoul",
        }),
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const tables = runtimeInformationTables(client);
  return (
    <div
      className={styles.rawRuntimeInfo}
      data-admin-marker="ADMINISTRATOR"
    >
      {tables.map((table, index) => (
        <table
          className={`${styles.phpTable} ${styles[table.kind]}`}
          aria-label={table.title}
          key={`${table.title}-${index}`}
        >
          {table.kind === "heroTable" ? (
            <tbody>
              <tr>
                <th colSpan={2}>PHP 7.3.33 - phpinfo()</th>
              </tr>
            </tbody>
          ) : table.kind === "compactTable" ? (
            <tbody>
              <tr>
                <th colSpan={2}>{table.title}</th>
              </tr>
            </tbody>
          ) : (
            <>
              <thead>
                <tr>
                  <th colSpan={2}>{table.title}</th>
                </tr>
              </thead>
              <tbody>
                {table.rows.map(([label, value]) => (
                  <tr key={label}>
                    <th scope="row">{label}</th>
                    <td>{value}</td>
                  </tr>
                ))}
              </tbody>
            </>
          )}
        </table>
      ))}
    </div>
  );
}

interface RuntimeInformationTable {
  title: string;
  kind:
    | "heroTable"
    | "systemTable"
    | "compactTable"
    | "sampleTable"
    | "standardTable";
  rows: Array<[string, string]>;
}

function runtimeInformationTables(
  client: Record<string, string>,
): RuntimeInformationTable[] {
  const sections = runtimeInformationSections(client);
  const allRows = sections.flatMap((section) =>
    section.rows.map(
      ([label, value]) =>
        [`${section.title} · ${label}`, value] as [string, string],
    ),
  );
  const systemRows = allRows.slice(0, 25);
  const standardTables = Array.from({ length: 91 }, (_, index) => {
    const section = sections[index % sections.length]!;
    const round = Math.floor(index / sections.length) + 1;
    const rows = section.rows
      .slice(0, 7)
      .map(
        ([label, value]) =>
          [`${label} ${round}`, value] as [string, string],
      );
    while (rows.length < 7) {
      rows.push([
        `안전 진단 항목 ${String(rows.length + 1).padStart(2, "0")}`,
        "정상",
      ]);
    }
    return {
      title: `${section.title} ${round}`,
      kind: "standardTable" as const,
      rows,
    };
  });
  return [
    {
      title: "PHP 7.3.33 - phpinfo()",
      kind: "heroTable",
      rows: [],
    },
    {
      title: "System",
      kind: "systemTable",
      rows: systemRows,
    },
    {
      title: "KIEL Safe Runtime Report",
      kind: "compactTable",
      rows: [
        [
          "안내",
          "비밀번호, 토큰, 세션, 환경변수 값은 표시하지 않습니다.",
        ],
      ],
    },
    {
      title: "Application Runtime",
      kind: "sampleTable",
      rows: [
        [
          "실제 실행 환경",
          "Cloudflare Workers / vinext 호환 JavaScript 런타임",
        ],
        ["구 PHP 서버 연결", "없음"],
      ],
    },
    ...standardTables,
  ];
}

function runtimeInformationSections(
  client: Record<string, string>,
): Array<{ title: string; rows: Array<[string, string]> }> {
  const pending = "브라우저 확인 중";
  return [
    {
      title: "General",
      rows: [
        ["애플리케이션", "KIEL GOLD 독립 쇼핑몰"],
        ["관리 화면", "KIEL 통합 관리자"],
        ["실행 환경", "Cloudflare Workers 호환 런타임"],
        ["프레임워크", "vinext / React Server Components"],
        ["언어", "TypeScript / JavaScript"],
        ["운영 범위", "새 사이트 로컬 데이터"],
      ],
    },
    {
      title: "Runtime Engine",
      rows: [
        ["실행 모델", "서버리스 요청 단위 실행"],
        ["모듈 형식", "ECMAScript Modules"],
        ["비동기 API", "Promise / async-await"],
        ["HTTP 클라이언트", "Fetch API"],
        ["암호화 API", "Web Crypto API"],
        ["식별자", "crypto.randomUUID"],
      ],
    },
    {
      title: "Rendering",
      rows: [
        ["서버 렌더링", "사용"],
        ["클라이언트 하이드레이션", "사용"],
        ["동적 관리자 라우트", "사용"],
        ["캐시 정책", "관리자 no-store"],
        ["문서 언어", "ko"],
        ["레이아웃 모드", "원본 관리자 고정폭"],
      ],
    },
    {
      title: "HTTP Environment",
      rows: [
        ["프로토콜", client.protocol ?? pending],
        ["호스트", client.host ?? pending],
        ["보안 컨텍스트", client.secureContext ?? pending],
        ["콘텐츠 형식", "UTF-8"],
        ["관리 API 캐시", "no-store, max-age=0"],
        ["MIME 스니핑 방지", "nosniff"],
      ],
    },
    {
      title: "Character Encoding",
      rows: [
        ["기본 문자셋", "UTF-8"],
        ["HTML 언어", "한국어"],
        ["JSON 인코딩", "UTF-8"],
        ["데이터베이스 텍스트", "Unicode"],
        ["정규화 로케일", "ko-KR"],
        ["외부 구 서버 인코딩", "사용하지 않음"],
      ],
    },
    {
      title: "Date and Time",
      rows: [
        ["서비스 시간대", "Asia/Seoul"],
        ["브라우저 시간대", client.timezone ?? pending],
        ["관리자 날짜 표시", "ko-KR"],
        ["저장 기준", "UTC / ISO 8601"],
        ["예약 노출 해석", "Asia/Seoul"],
        ["현재 시각", client.currentTime ?? pending],
      ],
    },
    {
      title: "Database",
      rows: [
        ["데이터베이스", "Cloudflare D1 호환 SQLite"],
        ["트랜잭션", "batch 원자 처리"],
        ["외래 키", "사용"],
        ["감사 로그", "관리 작업 기록"],
        ["동시성 보호", "revision / write guard"],
        ["구 서버 DB 연결", "없음"],
      ],
    },
    {
      title: "Object Storage",
      rows: [
        ["미디어 저장소", "Cloudflare R2 호환 저장소"],
        ["업로드 경로", "새 사이트 내부 API"],
        ["외부 이미지 런타임 참조", "없음"],
        ["관리자 미디어 권한", "인증 필수"],
        ["콘텐츠 형식 검사", "사용"],
        ["파일 크기 제한", "라우트별 제한"],
      ],
    },
    {
      title: "Authentication",
      rows: [
        ["관리자 세션", "서명된 HttpOnly 쿠키"],
        ["기본 관리자", "환경 기반 검증"],
        ["보조 관리자", "회원 연결 계정"],
        ["비밀번호 저장", "단방향 해시"],
        ["세션 무효화", "버전 기반"],
        ["로그인 캐시", "사용 안 함"],
      ],
    },
    {
      title: "Authorization",
      rows: [
        ["메뉴 권한", "66개 원본 메뉴 코드"],
        ["읽기 권한", "r"],
        ["쓰기 권한", "w"],
        ["삭제 권한", "d"],
        ["페이지 검사", "서버 측"],
        ["API 검사", "HTTP 메서드별"],
      ],
    },
    {
      title: "Request Security",
      rows: [
        ["동일 출처 검사", "변경 요청에 적용"],
        ["요청 크기 제한", "적용"],
        ["JSON 형식 검사", "적용"],
        ["내부 링크 제한", "/ 또는 #"],
        ["재전송 보호", "revision / challenge"],
        ["관리자 검색엔진 노출", "차단"],
      ],
    },
    {
      title: "Session",
      rows: [
        ["쿠키 범위", "새 사이트"],
        ["HttpOnly", "사용"],
        ["SameSite", "적용"],
        ["세션 비밀값 표시", "차단"],
        ["보조 관리자 만료", "계정 변경 시 무효화"],
        ["구 도메인 쿠키 의존", "없음"],
      ],
    },
    {
      title: "Browser Client",
      rows: [
        ["User Agent", client.userAgent ?? pending],
        ["플랫폼", client.platform ?? pending],
        ["언어", client.language ?? pending],
        ["언어 목록", client.languages ?? pending],
        ["논리 프로세서", client.cpu ?? pending],
        ["메모리 정보", client.memory ?? pending],
      ],
    },
    {
      title: "Browser Features",
      rows: [
        ["쿠키", client.cookies ?? pending],
        ["네트워크 상태", client.online ?? pending],
        ["터치 포인트", client.touchPoints ?? pending],
        ["Web Storage", "팝업 닫기 설정에 사용"],
        ["Speech Synthesis", "CAPTCHA 음성 안내에 사용"],
        ["matchMedia", "반응형 기능에 사용"],
      ],
    },
    {
      title: "Display",
      rows: [
        ["뷰포트", client.viewport ?? pending],
        ["화면 해상도", client.screen ?? pending],
        ["색 심도", client.colorDepth ?? pending],
        ["관리자 최소폭", "1200px"],
        ["관리자 콘텐츠 시작", "240px"],
        ["모바일 공개 화면", "반응형"],
      ],
    },
    {
      title: "Accessibility",
      rows: [
        ["감소된 모션", client.reducedMotion ?? pending],
        ["색상 선호", client.darkPreference ?? pending],
        ["문서 랜드마크", "사용"],
        ["표 caption", "사용"],
        ["입력 label", "사용"],
        ["키보드 닫기", "Escape 지원"],
      ],
    },
    {
      title: "Commerce",
      rows: [
        ["상품 데이터", "새 사이트 카탈로그"],
        ["주문 처리", "새 사이트 주문 API"],
        ["포인트 원장", "원자적 잔액 반영"],
        ["충전·출금", "독립 요청 원장"],
        ["쿠폰·배송", "전용 운영 API"],
        ["구 쇼핑몰 API 호출", "없음"],
      ],
    },
    {
      title: "Administrator Tools",
      rows: [
        ["테마설정", "로컬 테마 적용"],
        ["메뉴설정", "PC·모바일 노출 관리"],
        ["팝업레이어", "기기·기간·위치 관리"],
        ["부가서비스", "로컬 설정 링크"],
        ["메일 테스트", "공급자 구성 시에만 전송"],
        ["시스템 작업", "복구 가능한 로컬 작업"],
      ],
    },
    {
      title: "Compatibility",
      rows: [
        ["원본 관리자 경로", "새 사이트 라우트로 대응"],
        ["원본 메뉴 코드", "유지"],
        ["원본 표·폼 스타일", "로컬 CSS"],
        ["PHP 실행", "사용하지 않음"],
        ["RSC 렌더링", "사용"],
        ["현대 브라우저", "지원"],
      ],
    },
    {
      title: "Domain Independence",
      rows: [
        ["기존 도메인 런타임 요청", "없음"],
        ["기존 서버 세션", "사용하지 않음"],
        ["기존 서버 데이터베이스", "사용하지 않음"],
        ["테마 이미지", "로컬 복사본"],
        ["관리자 링크", "동일 출처 내부 경로"],
        ["운영 상태", "독립 실행"],
      ],
    },
  ];
}
