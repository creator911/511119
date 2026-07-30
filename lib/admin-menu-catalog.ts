import type {
  AdminPermissionMode,
  AdminPermissionScope,
} from "@/lib/admin-permissions";

export interface AdminLegacyMenuOption {
  code: string;
  label: string;
  scope: AdminPermissionScope;
}

export const ADMIN_LEGACY_MENU_OPTIONS = [
  { code: "100100", label: "기본환경설정", scope: "settings.manage" },
  { code: "100200", label: "관리권한설정", scope: "admins.manage" },
  { code: "100280", label: "테마설정", scope: "settings.manage" },
  { code: "100290", label: "메뉴설정", scope: "settings.manage" },
  { code: "100300", label: "메일 테스트", scope: "settings.manage" },
  { code: "100310", label: "팝업레이어관리", scope: "content.manage" },
  { code: "100800", label: "세션파일 일괄삭제", scope: "settings.manage" },
  { code: "100900", label: "캐시파일 일괄삭제", scope: "settings.manage" },
  { code: "100910", label: "캡챠파일 일괄삭제", scope: "settings.manage" },
  { code: "100920", label: "썸네일파일 일괄삭제", scope: "settings.manage" },
  { code: "100500", label: "phpinfo()", scope: "settings.manage" },
  { code: "100510", label: "Browscap 업데이트", scope: "settings.manage" },
  { code: "100520", label: "접속로그 변환", scope: "settings.manage" },
  { code: "100410", label: "DB업그레이드", scope: "settings.manage" },
  { code: "100400", label: "부가서비스", scope: "settings.manage" },
  { code: "200100", label: "회원관리", scope: "members.manage" },
  { code: "200810", label: "접속자검색", scope: "members.manage" },
  { code: "200200", label: "포인트관리", scope: "members.manage" },
  { code: "200900", label: "충전신청", scope: "wallet.manage" },
  { code: "200300", label: "환전신청", scope: "wallet.manage" },
  { code: "300100", label: "게시판관리", scope: "content.manage" },
  { code: "300200", label: "게시판그룹관리", scope: "content.manage" },
  { code: "300500", label: "1:1문의설정", scope: "content.manage" },
  { code: "300600", label: "내용관리", scope: "content.manage" },
  { code: "300820", label: "글,댓글 현황", scope: "content.manage" },
  { code: "330100", label: "메타태그관리", scope: "settings.manage" },
  { code: "350100", label: "소모임 기본설정", scope: "content.manage" },
  { code: "350200", label: "정식 소모임 리스트", scope: "content.manage" },
  { code: "350300", label: "미개설 신청 리스트", scope: "content.manage" },
  { code: "400010", label: "쇼핑몰현황", scope: "dashboard.view" },
  { code: "400100", label: "쇼핑몰설정", scope: "settings.manage" },
  { code: "400400", label: "주문내역", scope: "orders.manage" },
  { code: "400440", label: "개인결제관리", scope: "orders.manage" },
  { code: "400200", label: "분류관리", scope: "catalog.manage" },
  { code: "400300", label: "상품관리", scope: "catalog.manage" },
  { code: "400660", label: "상품문의", scope: "content.manage" },
  { code: "400650", label: "사용후기", scope: "content.manage" },
  { code: "400620", label: "상품재고관리", scope: "catalog.manage" },
  { code: "400610", label: "상품유형관리", scope: "catalog.manage" },
  { code: "400500", label: "상품옵션재고관리", scope: "catalog.manage" },
  { code: "400800", label: "쿠폰관리", scope: "catalog.manage" },
  { code: "400810", label: "쿠폰존관리", scope: "catalog.manage" },
  { code: "400750", label: "추가배송비관리", scope: "catalog.manage" },
  { code: "400410", label: "미완료주문", scope: "orders.manage" },
  { code: "500110", label: "매출현황", scope: "reports.view" },
  { code: "500100", label: "상품판매순위", scope: "reports.view" },
  { code: "500120", label: "주문내역출력", scope: "orders.manage" },
  { code: "500400", label: "재입고SMS알림", scope: "catalog.manage" },
  { code: "500300", label: "이벤트관리", scope: "content.manage" },
  { code: "500310", label: "이벤트일괄처리", scope: "content.manage" },
  { code: "500500", label: "배너관리", scope: "catalog.manage" },
  { code: "500140", label: "보관함현황", scope: "reports.view" },
  { code: "500210", label: "가격비교사이트", scope: "catalog.manage" },
  { code: "650100", label: "m3cron 설정", scope: "settings.manage" },
  { code: "650200", label: "m3cron 로그", scope: "reports.view" },
  { code: "900100", label: "SMS 기본설정", scope: "settings.manage" },
  { code: "900200", label: "회원정보업데이트", scope: "members.manage" },
  { code: "900300", label: "문자 보내기", scope: "members.manage" },
  { code: "900400", label: "전송내역-건별", scope: "members.manage" },
  { code: "900410", label: "전송내역-번호별", scope: "members.manage" },
  { code: "900500", label: "이모티콘 그룹", scope: "members.manage" },
  { code: "900600", label: "이모티콘 관리", scope: "members.manage" },
  { code: "900700", label: "휴대폰번호 그룹", scope: "members.manage" },
  { code: "900800", label: "휴대폰번호 관리", scope: "members.manage" },
  { code: "900900", label: "휴대폰번호 파일", scope: "members.manage" },
  { code: "999100", label: "이윰관리자 바로가기", scope: "settings.manage" },
] as const satisfies readonly AdminLegacyMenuOption[];

const menuByCode = new Map<string, AdminLegacyMenuOption>(
  ADMIN_LEGACY_MENU_OPTIONS.map((option) => [option.code, option]),
);

export function adminLegacyMenuOption(
  code: string,
): AdminLegacyMenuOption | undefined {
  return menuByCode.get(code);
}

export function adminLegacyMenuScope(
  code: string,
): AdminPermissionScope | undefined {
  return menuByCode.get(code)?.scope;
}

export function adminMenuPermissionToken(
  code: string,
  mode: AdminPermissionMode,
): `scope:${AdminPermissionScope}:${AdminPermissionMode}` {
  const scope = adminLegacyMenuScope(code);
  if (!scope) {
    throw new Error("Unknown administrator menu code.");
  }
  return `scope:${scope}:${mode}`;
}
