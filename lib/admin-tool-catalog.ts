export type LegacyAdminToolKind =
  | "settings"
  | "records"
  | "action"
  | "information";

export type LegacyAdminFieldType =
  | "text"
  | "textarea"
  | "number"
  | "boolean"
  | "select";

export interface LegacyAdminField {
  key: string;
  label: string;
  type: LegacyAdminFieldType;
  help?: string;
  required?: boolean;
  options?: readonly { value: string; label: string }[];
  defaultValue: string | number | boolean;
}

export interface LegacyAdminToolDefinition {
  slug: string;
  title: string;
  group: string;
  kind: LegacyAdminToolKind;
  description: string;
  fields?: readonly LegacyAdminField[];
  recordLabel?: string;
  actionLabel?: string;
  externalService?: boolean;
}

const enabledField: LegacyAdminField = {
  key: "enabled",
  label: "사용 여부",
  type: "boolean",
  defaultValue: true,
};

const definitions = [
  {
    slug: "admin-permissions",
    title: "관리권한설정",
    group: "환경설정",
    kind: "information",
    description: "관리자 계정별 접근 권한을 설정합니다.",
  },
  {
    slug: "theme-settings",
    title: "테마설정",
    group: "환경설정",
    kind: "settings",
    description: "쇼핑몰에서 사용할 테마와 기본 색상을 설정합니다.",
    fields: [
      {
        key: "theme",
        label: "선택 테마",
        type: "select",
        options: [
          { value: "basic", label: "베이직" },
          { value: "eb4_basic", label: "Everyday - Responsive" },
        ],
        defaultValue: "basic",
      },
      {
        key: "primaryColor",
        label: "기본 색상",
        type: "text",
        help: "#을 포함한 6자리 색상 코드로 입력합니다.",
        defaultValue: "#3949ab",
      },
      enabledField,
    ],
  },
  {
    slug: "menu-settings",
    title: "메뉴설정",
    group: "환경설정",
    kind: "settings",
    description: "공개 사이트 메뉴 노출과 순서를 관리합니다.",
    fields: [
      {
        key: "menuOrder",
        label: "메뉴 순서",
        type: "textarea",
        help:
          "한 줄에 메뉴 하나씩 입력합니다. 기존 메뉴 이름 또는 표시명|/연결주소 형식을 사용하며, 비워 두면 상품 분류 메뉴를 그대로 표시합니다.",
        defaultValue: "",
      },
      enabledField,
    ],
  },
  {
    slug: "mail-test",
    title: "메일 테스트",
    group: "환경설정",
    kind: "action",
    description: "저장된 발신 설정으로 테스트 메일 요청을 기록합니다.",
    actionLabel: "테스트 메일 요청",
    externalService: true,
  },
  {
    slug: "popup-layers",
    title: "팝업레이어관리",
    group: "환경설정",
    kind: "records",
    description: "팝업의 제목, 내용, 노출 상태를 관리합니다.",
    recordLabel: "팝업",
  },
  {
    slug: "session-files-delete",
    title: "세션파일 일괄삭제",
    group: "환경설정",
    kind: "action",
    description: "만료된 새 사이트 세션 정리 작업을 실행하고 기록합니다.",
    actionLabel: "만료 세션 정리",
  },
  {
    slug: "cache-files-delete",
    title: "캐시파일 일괄삭제",
    group: "환경설정",
    kind: "action",
    description: "새 사이트의 애플리케이션 캐시 정리 작업을 기록합니다.",
    actionLabel: "캐시 정리",
  },
  {
    slug: "captcha-files-delete",
    title: "캡챠파일 일괄삭제",
    group: "환경설정",
    kind: "action",
    description: "만료된 캡챠 자료 정리 작업을 기록합니다.",
    actionLabel: "캡챠 자료 정리",
  },
  {
    slug: "thumbnail-files-delete",
    title: "썸네일파일 일괄삭제",
    group: "환경설정",
    kind: "action",
    description: "재생성 가능한 썸네일 정리 작업을 기록합니다.",
    actionLabel: "썸네일 정리",
  },
  {
    slug: "phpinfo",
    title: "phpinfo()",
    group: "환경설정",
    kind: "information",
    description: "새 사이트 런타임 정보를 안전한 범위에서 표시합니다.",
  },
  {
    slug: "browscap-update",
    title: "Browscap 업데이트",
    group: "환경설정",
    kind: "action",
    description: "브라우저 식별 자료 갱신 작업을 기록합니다.",
    actionLabel: "브라우저 자료 갱신",
  },
  {
    slug: "access-log-convert",
    title: "접속로그 변환",
    group: "환경설정",
    kind: "action",
    description: "새 사이트 접속 통계 재집계 작업을 실행합니다.",
    actionLabel: "접속 통계 재집계",
  },
  {
    slug: "db-upgrade",
    title: "DB업그레이드",
    group: "환경설정",
    kind: "action",
    description: "현재 코드에 필요한 데이터베이스 구조를 안전하게 확인합니다.",
    actionLabel: "데이터베이스 구조 확인",
  },
  {
    slug: "additional-services",
    title: "부가서비스",
    group: "환경설정",
    kind: "settings",
    description: "외부 연동 서비스 사용 여부와 운영 메모를 관리합니다.",
    fields: [
      enabledField,
      {
        key: "memo",
        label: "운영 메모",
        type: "textarea",
        defaultValue: "",
      },
    ],
  },
  {
    slug: "visitor-search",
    title: "접속자검색",
    group: "회원관리",
    kind: "records",
    description: "새 사이트에서 수집한 접속 기록을 조회·관리합니다.",
    recordLabel: "접속 기록",
  },
  {
    slug: "meta-tags",
    title: "메타태그관리",
    group: "검색엔진최적화",
    kind: "settings",
    description: "검색엔진에 표시할 사이트 기본 정보를 관리합니다.",
    fields: [
      {
        key: "title",
        label: "사이트 제목",
        type: "text",
        required: true,
        defaultValue: "골드리안 | GOLDRIAN",
      },
      {
        key: "description",
        label: "사이트 설명",
        type: "textarea",
        defaultValue: "순금 주얼리, 골드바, 웨딩 주얼리 전문 쇼핑몰",
      },
      {
        key: "keywords",
        label: "키워드",
        type: "text",
        help: "쉼표로 구분합니다.",
        defaultValue: "",
      },
      {
        key: "robots",
        label: "검색 노출",
        type: "select",
        options: [
          { value: "index,follow", label: "검색 허용" },
          { value: "noindex,nofollow", label: "검색 차단" },
        ],
        defaultValue: "index,follow",
      },
    ],
  },
  {
    slug: "club-settings",
    title: "소모임 기본설정",
    group: "소모임 관리",
    kind: "settings",
    description: "소모임 개설과 운영 기준을 설정합니다.",
    fields: [
      enabledField,
      {
        key: "minimumLevel",
        label: "개설 가능 회원 레벨",
        type: "number",
        defaultValue: 2,
      },
      {
        key: "approvalRequired",
        label: "관리자 승인",
        type: "boolean",
        defaultValue: true,
      },
    ],
  },
  {
    slug: "approved-clubs",
    title: "정식 소모임 리스트",
    group: "소모임 관리",
    kind: "records",
    description: "승인된 소모임을 관리합니다.",
    recordLabel: "소모임",
  },
  {
    slug: "club-applications",
    title: "미개설 신청 리스트",
    group: "소모임 관리",
    kind: "records",
    description: "소모임 개설 신청을 승인 또는 보류합니다.",
    recordLabel: "개설 신청",
  },
  {
    slug: "personal-payments",
    title: "개인결제관리",
    group: "쇼핑몰관리",
    kind: "records",
    description: "고객별 개인결제 요청을 등록하고 상태를 관리합니다.",
    recordLabel: "개인결제",
  },
  {
    slug: "product-stock",
    title: "상품재고관리",
    group: "쇼핑몰관리",
    kind: "information",
    description: "상품별 재고는 상품관리에서 즉시 수정할 수 있습니다.",
  },
  {
    slug: "product-types",
    title: "상품유형관리",
    group: "쇼핑몰관리",
    kind: "records",
    description: "상품에 적용할 유형과 표시명을 관리합니다.",
    recordLabel: "상품유형",
  },
  {
    slug: "product-option-stock",
    title: "상품옵션재고관리",
    group: "쇼핑몰관리",
    kind: "records",
    description: "상품 옵션별 재고 자료를 관리합니다.",
    recordLabel: "옵션재고",
  },
  {
    slug: "coupons",
    title: "쿠폰관리",
    group: "쇼핑몰관리",
    kind: "records",
    description: "발급 쿠폰과 사용 상태를 관리합니다.",
    recordLabel: "쿠폰",
  },
  {
    slug: "coupon-zone",
    title: "쿠폰존관리",
    group: "쇼핑몰관리",
    kind: "records",
    description: "고객이 내려받을 수 있는 쿠폰을 관리합니다.",
    recordLabel: "쿠폰존 쿠폰",
  },
  {
    slug: "additional-shipping",
    title: "추가배송비관리",
    group: "쇼핑몰관리",
    kind: "records",
    description: "지역별 추가 배송비 규칙을 관리합니다.",
    recordLabel: "배송비 규칙",
  },
  {
    slug: "order-print",
    title: "주문내역출력",
    group: "쇼핑몰현황/기타",
    kind: "information",
    description: "주문내역 화면에서 조회 결과를 인쇄할 수 있습니다.",
  },
  {
    slug: "restock-sms",
    title: "재입고SMS알림",
    group: "쇼핑몰현황/기타",
    kind: "records",
    description: "재입고 알림 신청과 문자 발송 대기 상태를 관리합니다.",
    recordLabel: "재입고 알림",
    externalService: true,
  },
  {
    slug: "events",
    title: "이벤트관리",
    group: "쇼핑몰현황/기타",
    kind: "records",
    description: "쇼핑몰 이벤트와 게시 상태를 관리합니다.",
    recordLabel: "이벤트",
  },
  {
    slug: "event-bulk",
    title: "이벤트일괄처리",
    group: "쇼핑몰현황/기타",
    kind: "action",
    description: "등록된 이벤트 상태를 일괄 점검하고 처리 기록을 남깁니다.",
    actionLabel: "이벤트 일괄 점검",
  },
  {
    slug: "saved-items",
    title: "보관함현황",
    group: "쇼핑몰현황/기타",
    kind: "information",
    description: "고객이 보관한 상품 현황은 새 사이트 데이터만 집계합니다.",
  },
  {
    slug: "price-comparison",
    title: "가격비교사이트",
    group: "쇼핑몰현황/기타",
    kind: "settings",
    description: "가격비교 서비스용 상품 피드 설정을 관리합니다.",
    fields: [
      enabledField,
      {
        key: "feedName",
        label: "피드 이름",
        type: "text",
        defaultValue: "RIAN 상품 피드",
      },
      {
        key: "memo",
        label: "연동 메모",
        type: "textarea",
        defaultValue: "",
      },
    ],
    externalService: true,
  },
  {
    slug: "m3cron-settings",
    title: "m3cron 설정",
    group: "m3cron 관리",
    kind: "settings",
    description: "예약 작업 실행 여부와 주기를 관리합니다.",
    fields: [
      enabledField,
      {
        key: "schedule",
        label: "실행 주기",
        type: "text",
        help: "예: 매일 03:00",
        defaultValue: "매일 03:00",
      },
      {
        key: "task",
        label: "실행 작업",
        type: "textarea",
        defaultValue: "만료 자료 정리\n통계 재집계",
      },
    ],
  },
  {
    slug: "m3cron-logs",
    title: "m3cron 로그",
    group: "m3cron 관리",
    kind: "records",
    description: "예약 작업 실행 내역을 조회합니다.",
    recordLabel: "실행 로그",
  },
  {
    slug: "sms-settings",
    title: "SMS 기본설정",
    group: "SMS 관리",
    kind: "settings",
    description: "문자 발신 정보와 외부 서비스 연결 상태를 관리합니다.",
    fields: [
      enabledField,
      {
        key: "sender",
        label: "발신번호",
        type: "text",
        defaultValue: "",
      },
      {
        key: "provider",
        label: "발송 서비스",
        type: "text",
        defaultValue: "",
      },
      {
        key: "memo",
        label: "연동 메모",
        type: "textarea",
        defaultValue: "",
      },
    ],
    externalService: true,
  },
  {
    slug: "sms-member-sync",
    title: "회원정보 업데이트",
    group: "SMS 관리",
    kind: "action",
    description: "새 사이트 회원 연락처 자료를 문자 주소록 기준으로 재집계합니다.",
    actionLabel: "회원 연락처 재집계",
  },
  {
    slug: "sms-send",
    title: "문자 보내기",
    group: "SMS 관리",
    kind: "records",
    description: "문자 발송 요청을 등록하고 전송 대기 내역을 관리합니다.",
    recordLabel: "문자 발송 요청",
    externalService: true,
  },
  {
    slug: "sms-history-message",
    title: "문자전송 내역",
    group: "SMS 관리",
    kind: "records",
    description: "문자 발송 요청별 처리 내역을 조회합니다.",
    recordLabel: "전송 내역",
  },
  {
    slug: "sms-history-number",
    title: "문자전송 내역 (번호별)",
    group: "SMS 관리",
    kind: "records",
    description: "수신 번호별 문자 처리 내역을 조회합니다.",
    recordLabel: "번호별 내역",
  },
  {
    slug: "sms-emoticon-groups",
    title: "이모티콘 그룹",
    group: "SMS 관리",
    kind: "records",
    description: "문자 문구 그룹을 관리합니다.",
    recordLabel: "이모티콘 그룹",
  },
  {
    slug: "sms-emoticons",
    title: "이모티콘 관리",
    group: "SMS 관리",
    kind: "records",
    description: "재사용할 문자 문구를 관리합니다.",
    recordLabel: "이모티콘",
  },
  {
    slug: "sms-phone-groups",
    title: "휴대폰번호 그룹",
    group: "SMS 관리",
    kind: "records",
    description: "문자 주소록 그룹을 관리합니다.",
    recordLabel: "번호 그룹",
  },
  {
    slug: "sms-phones",
    title: "휴대폰번호 관리",
    group: "SMS 관리",
    kind: "records",
    description: "문자 발송용 휴대폰번호를 관리합니다.",
    recordLabel: "휴대폰번호",
  },
  {
    slug: "sms-phone-file",
    title: "휴대폰번호 파일",
    group: "SMS 관리",
    kind: "records",
    description: "휴대폰번호 일괄 등록 작업과 파일 메모를 관리합니다.",
    recordLabel: "번호 파일",
  },
  {
    slug: "eyoom-admin-link",
    title: "이윰관리자 바로가기",
    group: "이윰관리자모드",
    kind: "information",
    description: "새 사이트는 하나의 관리자 화면으로 통합되어 있습니다.",
  },
] as const satisfies readonly LegacyAdminToolDefinition[];

const definitionMap: ReadonlyMap<string, LegacyAdminToolDefinition> = new Map(
  definitions.map((definition) => [definition.slug, definition]),
);

export const legacyAdminToolDefinitions: readonly LegacyAdminToolDefinition[] =
  definitions;

export function getLegacyAdminToolDefinition(
  slug: string,
): LegacyAdminToolDefinition | null {
  return definitionMap.get(slug) ?? null;
}

export function defaultLegacyAdminToolSettings(
  definition: LegacyAdminToolDefinition,
): Record<string, string | number | boolean> {
  return Object.fromEntries(
    (definition.fields ?? []).map((field) => [field.key, field.defaultValue]),
  );
}
