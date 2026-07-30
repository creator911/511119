import type { SiteDisplaySettings } from "@/lib/site-content";

export type LegacyConfigValue = string | number | boolean;
export type LegacyConfigControlKind =
  | "checkbox"
  | "email"
  | "number"
  | "password"
  | "radio"
  | "select"
  | "text"
  | "textarea";

export interface LegacyConfigOption {
  label: string;
  value: string | number;
}

export interface LegacyConfigControl {
  key: string;
  name: string;
  kind: LegacyConfigControlKind;
  defaultValue: LegacyConfigValue;
  width?: number;
  height?: number;
  options?: readonly LegacyConfigOption[];
  inlineLabel?: string;
  help?: string;
  required?: boolean;
  min?: number;
  max?: number;
  maxLength?: number;
  rows?: number;
  provider?: "email" | "identity" | "shortUrl" | "sms" | "sns";
  secret?: boolean;
  siteField?: keyof SiteDisplaySettings;
}

export interface LegacyConfigRow {
  id: string;
  label: string;
  height: number;
  controls: readonly LegacyConfigControl[];
  hiddenWhen?: "identityOff" | "smsPlan";
  help?: string;
}

export interface LegacyConfigSection {
  id: string;
  tabLabel: string;
  title: string;
  description?: string;
  rows: readonly LegacyConfigRow[];
}

const skin = [{ value: "basic", label: "basic" }] as const;
const levels = Array.from({ length: 10 }, (_, index) => ({
  value: index + 1,
  label: String(index + 1),
}));

const input = (
  key: string,
  width: number,
  defaultValue: string | number = "",
  extra: Partial<LegacyConfigControl> = {},
): LegacyConfigControl => ({
  key,
  name: key,
  kind: typeof defaultValue === "number" ? "number" : "text",
  defaultValue,
  width,
  ...extra,
});

const check = (
  key: string,
  defaultValue = false,
  extra: Partial<LegacyConfigControl> = {},
): LegacyConfigControl => ({
  key,
  name: key,
  kind: "checkbox",
  defaultValue,
  ...extra,
});

const select = (
  key: string,
  width: number,
  defaultValue: string | number,
  options: readonly LegacyConfigOption[],
  extra: Partial<LegacyConfigControl> = {},
): LegacyConfigControl => ({
  key,
  name: key,
  kind: "select",
  defaultValue,
  options,
  width,
  ...extra,
});

const textarea = (
  key: string,
  width: number,
  rows: number,
  extra: Partial<LegacyConfigControl> = {},
): LegacyConfigControl => ({
  key,
  name: key,
  kind: "textarea",
  defaultValue: "",
  width,
  rows,
  maxLength: 12000,
  ...extra,
});

export const legacyConfigSections: readonly LegacyConfigSection[] = [
  {
    id: "anc_cf_basic",
    tabLabel: "기본환경",
    title: "홈페이지 기본환경 설정",
    rows: [
      { id: "cf_title", label: "홈페이지 제목", height: 45.921875, controls: [input("cf_title", 272, "골드리안(GOLDRIAN)", { required: true, maxLength: 120, siteField: "companyName" })] },
      { id: "cf_admin", label: "최고관리자", height: 56, controls: [select("cf_admin", 70, "admin", [{ value: "admin", label: "admin" }], { required: true })] },
      { id: "cf_admin_email", label: "관리자 메일 주소", height: 121.921875, controls: [input("cf_admin_email", 272, "", { kind: "email", required: true, maxLength: 200, siteField: "email", help: "관리자 메일 주소는 새 서버의 안전한 주소를 사용합니다." })] },
      { id: "cf_admin_email_name", label: "관리자 메일 발송이름", height: 72.921875, controls: [input("cf_admin_email_name", 272, "", { required: true, maxLength: 80, siteField: "representative" })] },
      { id: "cf_use_point", label: "포인트 사용", height: 43, controls: [check("cf_use_point", true, { inlineLabel: "사용", siteField: "pointUseEnabled" })] },
      { id: "cf_login_memo_point", label: "포인트 설정", height: 94.921875, controls: [input("cf_login_point", 62, 0, { min: 0, max: 100000000, inlineLabel: "로그인시 포인트" }), input("cf_memo_send_point", 62, 0, { min: 0, max: 100000000, inlineLabel: "쪽지보낼시 차감 포인트" })] },
      { id: "cf_cut_name", label: "이름(닉네임) 표시", height: 45.921875, controls: [input("cf_cut_name", 62, 15, { min: 1, max: 80 })] },
      { id: "cf_nick_open_modify", label: "회원정보 수정", height: 45.921875, controls: [input("cf_nick_modify", 50, 60, { min: 0, max: 3650, inlineLabel: "닉네임 수정" }), input("cf_open_modify", 50, 0, { min: 0, max: 3650, inlineLabel: "정보공개 수정" })] },
      { id: "cf_new_memo_del", label: "자료 삭제", height: 72.921875, controls: [input("cf_new_del", 62, 30, { min: 1, max: 3650, inlineLabel: "최근게시물 삭제" }), input("cf_memo_del", 62, 180, { min: 1, max: 3650, inlineLabel: "쪽지 삭제" })] },
      { id: "cf_visit_popular_del", label: "로그 삭제", height: 72.921875, controls: [input("cf_visit_del", 62, 180, { min: 1, max: 3650, inlineLabel: "접속자로그 삭제" }), input("cf_popular_del", 62, 180, { min: 1, max: 3650, inlineLabel: "인기검색어 삭제" })] },
      { id: "cf_login_new_rows", label: "현재 접속자·최근게시물", height: 94.921875, controls: [input("cf_login_minutes", 50, 10, { min: 1, max: 1440, inlineLabel: "현재 접속자" }), input("cf_new_rows", 50, 15, { min: 1, max: 1000, inlineLabel: "최근게시물 라인수" })] },
      { id: "cf_page_rows_pair", label: "한페이지당 라인수", height: 72.921875, controls: [input("cf_page_rows", 50, 15, { min: 1, max: 1000, inlineLabel: "PC" }), input("cf_mobile_page_rows", 50, 15, { min: 1, max: 1000, inlineLabel: "모바일" })] },
      { id: "cf_pages_pair", label: "페이지 표시 수", height: 45.921875, controls: [input("cf_write_pages", 50, 10, { min: 1, max: 100, inlineLabel: "PC" }), input("cf_mobile_pages", 50, 5, { min: 1, max: 100, inlineLabel: "모바일" })] },
      { id: "cf_new_skin_pair", label: "최근게시물 스킨", height: 56.84375, controls: [select("cf_new_skin", 50, "basic", skin, { inlineLabel: "PC" }), select("cf_mobile_new_skin", 50, "basic", skin, { inlineLabel: "모바일" })] },
      { id: "cf_search_skin_pair", label: "검색 스킨", height: 56, controls: [select("cf_search_skin", 50, "basic", skin, { inlineLabel: "PC" }), select("cf_mobile_search_skin", 50, "basic", skin, { inlineLabel: "모바일" })] },
      { id: "cf_connect_skin_pair", label: "접속자 스킨", height: 56, controls: [select("cf_connect_skin", 50, "basic", skin, { inlineLabel: "PC" }), select("cf_mobile_connect_skin", 50, "basic", skin, { inlineLabel: "모바일" })] },
      { id: "cf_faq_skin_pair", label: "FAQ 스킨", height: 56, controls: [select("cf_faq_skin", 50, "basic", skin, { inlineLabel: "PC" }), select("cf_mobile_faq_skin", 50, "basic", skin, { inlineLabel: "모바일" })] },
      { id: "cf_editor", label: "에디터 선택", height: 83, controls: [select("cf_editor", 92, "smarteditor2", [{ value: "smarteditor2", label: "smarteditor2" }, { value: "none", label: "사용안함" }])] },
      { id: "cf_captcha", label: "캡챠 선택", height: 149, controls: [select("cf_captcha", 133, "kcaptcha", [{ value: "kcaptcha", label: "KCaptcha" }, { value: "recaptcha", label: "Google reCAPTCHA" }])] },
      { id: "cf_captcha_mp3", label: "음성캡챠 선택", height: 83, controls: [select("cf_captcha_mp3", 57, "basic", skin)] },
      { id: "cf_recaptcha_site_key", label: "구글 reCAPTCHA Site key", height: 83, controls: [input("cf_recaptcha_site_key", 344, "", { maxLength: 300, provider: "identity" })] },
      { id: "cf_recaptcha_secret_key", label: "구글 reCAPTCHA Secret key", height: 45.921875, controls: [input("cf_recaptcha_secret_key", 344, "", { kind: "password", maxLength: 300, provider: "identity", secret: true })] },
      { id: "cf_use_copy_log", label: "복사, 이동시 로그", height: 70, controls: [check("cf_use_copy_log", true, { inlineLabel: "사용" })] },
      { id: "cf_point_term", label: "포인트 유효기간", height: 72.921875, controls: [input("cf_point_term", 62, 0, { min: 0, max: 36500 })] },
      { id: "cf_ip_lists", label: "접근 IP 설정", height: 248, controls: [textarea("cf_possible_ip", 219.421875, 8, { inlineLabel: "접근가능 IP", maxLength: 4000 }), textarea("cf_intercept_ip", 345.578125, 8, { inlineLabel: "접근차단 IP", maxLength: 4000 })] },
      { id: "cf_analytics", label: "방문자분석 스크립트", height: 226, controls: [textarea("cf_analytics", 785, 8)] },
      { id: "cf_add_meta", label: "추가 메타태그", height: 226, controls: [textarea("cf_add_meta", 785, 8)] },
      { id: "cf_syndi_token", label: "네이버 신디케이션 연동키", height: 94.921875, controls: [input("cf_syndi_token", 452, "", { maxLength: 500 })] },
      { id: "cf_syndi_except", label: "네이버 신디케이션 제외게시판", height: 94.921875, controls: [input("cf_syndi_except", 452, "", { maxLength: 500 })] },
    ],
  },
  {
    id: "anc_cf_board",
    tabLabel: "게시판기본",
    title: "게시판 기본 설정",
    description: "각 게시판 관리에서 개별적으로 설정 가능합니다.",
    rows: [
      { id: "cf_delay_link", label: "글쓰기·링크", height: 83, controls: [input("cf_delay_sec", 50, 30, { min: 0, max: 86400, inlineLabel: "글쓰기 간격" }), select("cf_link_target", 57, "_blank", [{ value: "_blank", label: "_blank" }, { value: "_self", label: "_self" }, { value: "_top", label: "_top" }, { value: "_new", label: "_new" }], { inlineLabel: "새창 링크" })] },
      { id: "cf_read_write_point", label: "글 포인트", height: 45.921875, controls: [input("cf_read_point", 50, 0, { min: -100000000, max: 100000000, inlineLabel: "글읽기" }), input("cf_write_point", 50, 0, { min: -100000000, max: 100000000, inlineLabel: "글쓰기" })] },
      { id: "cf_comment_download_point", label: "댓글·다운로드 포인트", height: 45.921875, controls: [input("cf_comment_point", 50, 0, { min: -100000000, max: 100000000, inlineLabel: "댓글쓰기" }), input("cf_download_point", 50, 0, { min: -100000000, max: 100000000, inlineLabel: "다운로드" })] },
      { id: "cf_search_part", label: "검색 단위", height: 45.921875, controls: [input("cf_search_part", 56, 10000, { min: 1, max: 1000000 })] },
      { id: "cf_image_extension", label: "이미지 업로드 확장자", height: 72.921875, controls: [input("cf_image_extension", 452, "gif|jpg|jpeg|png|webp", { maxLength: 500 })] },
      { id: "cf_flash_extension", label: "플래쉬 업로드 확장자", height: 72.921875, controls: [input("cf_flash_extension", 452, "swf", { maxLength: 500 })] },
      { id: "cf_movie_extension", label: "동영상 업로드 확장자", height: 72.921875, controls: [input("cf_movie_extension", 452, "asx|asf|wmv|wma|mpg|mpeg|mov|avi|mp3|mp4", { maxLength: 500 })] },
      { id: "cf_filter", label: "단어 필터링", height: 204, controls: [textarea("cf_filter", 785, 8, { maxLength: 8000 })] },
    ],
  },
  {
    id: "anc_cf_join",
    tabLabel: "회원가입",
    title: "회원가입 설정",
    description: "회원가입 시 사용할 스킨과 입력 받을 정보 등을 설정할 수 있습니다.",
    rows: [
      { id: "cf_member_skin_pair", label: "회원 스킨", height: 56.84375, controls: [select("cf_member_skin", 50, "basic", skin, { inlineLabel: "PC" }), select("cf_mobile_member_skin", 50, "basic", skin, { inlineLabel: "모바일" })] },
      { id: "cf_homepage_addr", label: "홈페이지·주소 입력", height: 44.921875, controls: [check("cf_use_homepage", false, { inlineLabel: "홈페이지 입력" }), check("cf_req_homepage", false, { inlineLabel: "필수" }), check("cf_use_addr", true, { inlineLabel: "주소 입력" }), check("cf_req_addr", false, { inlineLabel: "필수" })] },
      { id: "cf_tel_hp", label: "전화번호·휴대폰번호 입력", height: 44.921875, controls: [check("cf_use_tel", true, { inlineLabel: "전화번호 입력" }), check("cf_req_tel", false, { inlineLabel: "필수" }), check("cf_use_hp", true, { inlineLabel: "휴대폰번호 입력" }), check("cf_req_hp", false, { inlineLabel: "필수" })] },
      { id: "cf_signature_profile", label: "서명·자기소개 입력", height: 44.921875, controls: [check("cf_use_signature", false, { inlineLabel: "서명 입력" }), check("cf_req_signature", false, { inlineLabel: "필수" }), check("cf_use_profile", false, { inlineLabel: "자기소개 입력" }), check("cf_req_profile", false, { inlineLabel: "필수" })] },
      { id: "cf_register", label: "회원가입시 설정", height: 56, controls: [select("cf_register_level", 29, 2, levels, { inlineLabel: "권한" }), input("cf_register_point", 62, 100, { min: 0, max: 100000000, inlineLabel: "포인트" })] },
      { id: "cf_leave_day", label: "회원탈퇴후 삭제일", height: 45.921875, controls: [input("cf_leave_day", 44, 30, { min: 1, max: 3650 })] },
      { id: "cf_member_icon_use", label: "회원아이콘 사용", height: 83, controls: [select("cf_use_member_icon", 119, "2", [{ value: "0", label: "미사용" }, { value: "1", label: "아이콘만 표시" }, { value: "2", label: "아이콘 또는 이름 표시" }]), select("cf_icon_level", 29, 2, levels, { inlineLabel: "업로드 권한" })] },
      { id: "cf_member_icon_size", label: "회원아이콘 용량·크기", height: 45.921875, controls: [input("cf_member_icon_size", 92, 5000, { min: 1, max: 10000000, inlineLabel: "용량" }), input("cf_member_icon_width", 44, 22, { min: 1, max: 1000, inlineLabel: "폭" }), input("cf_member_icon_height", 44, 22, { min: 1, max: 1000, inlineLabel: "높이" })] },
      { id: "cf_member_img_size", label: "회원이미지 용량·크기", height: 45.921875, controls: [input("cf_member_img_size", 92, 50000, { min: 1, max: 10000000, inlineLabel: "용량" }), input("cf_member_img_width", 44, 100, { min: 1, max: 2000, inlineLabel: "폭" }), input("cf_member_img_height", 44, 100, { min: 1, max: 2000, inlineLabel: "높이" })] },
      { id: "cf_recommend", label: "추천인제도", height: 45.921875, controls: [check("cf_use_recommend", false, { inlineLabel: "사용" }), input("cf_recommend_point", 152, 0, { min: 0, max: 100000000, inlineLabel: "추천인 포인트" })] },
      { id: "cf_prohibit", label: "가입 금지 정보", height: 226, controls: [textarea("cf_prohibit_id", 286.546875, 8, { inlineLabel: "아이디,닉네임 금지단어", maxLength: 4000 }), textarea("cf_prohibit_email", 278.453125, 8, { inlineLabel: "입력 금지 메일", maxLength: 4000 })] },
      { id: "cf_stipulation", label: "회원가입약관", height: 177, controls: [textarea("cf_stipulation", 785, 8, { maxLength: 30000 })] },
      { id: "cf_privacy", label: "개인정보처리방침", height: 177, controls: [textarea("cf_privacy", 785, 8, { maxLength: 30000 })] },
    ],
  },
  {
    id: "anc_cf_cert",
    tabLabel: "본인확인",
    title: "본인확인 설정",
    description: "회원가입 시 본인확인 수단을 설정합니다.\n실명과 휴대폰 번호 그리고 본인확인 당시에 성인인지의 여부를 저장합니다.\n게시판의 경우 본인확인 또는 성인여부를 따져 게시물 조회 및 쓰기 권한을 줄 수 있습니다.",
    rows: [
      { id: "cf_cert_use", label: "본인확인", height: 56, controls: [select("cf_cert_use", 70, "0", [{ value: "0", label: "사용안함" }, { value: "1", label: "테스트" }, { value: "2", label: "실서비스" }], { provider: "identity" })] },
      { id: "cf_cert_find", label: "회원정보찾기", height: 56, hiddenWhen: "identityOff", controls: [check("cf_cert_find", false, { provider: "identity" })] },
      { id: "cf_cert_simple", label: "통합인증(간편인증)", height: 56, hiddenWhen: "identityOff", controls: [select("cf_cert_simple", 130, "none", [{ value: "none", label: "사용안함" }, { value: "inicis", label: "KG이니시스 통합인증" }], { provider: "identity" })] },
      { id: "cf_cert_hp", label: "휴대폰 본인확인", height: 56, hiddenWhen: "identityOff", controls: [select("cf_cert_hp", 100, "none", [{ value: "none", label: "사용안함" }, { value: "kcb", label: "KCB" }, { value: "kcp", label: "NHN KCP" }], { provider: "identity" })] },
      { id: "cf_cert_ipin", label: "아이핀 본인확인", height: 56, hiddenWhen: "identityOff", controls: [select("cf_cert_ipin", 90, "none", [{ value: "none", label: "사용안함" }, { value: "kcb", label: "KCB" }], { provider: "identity" })] },
      { id: "cf_cert_kg_mid", label: "KG이니시스 간편인증 MID", height: 56, hiddenWhen: "identityOff", controls: [input("cf_cert_kg_mid", 272, "", { maxLength: 200, provider: "identity" })] },
      { id: "cf_cert_kg_cd", label: "KG이니시스 간편인증 API KEY", height: 56, hiddenWhen: "identityOff", controls: [input("cf_cert_kg_cd", 302, "", { kind: "password", maxLength: 200, provider: "identity", secret: true })] },
      { id: "cf_cert_kcb_cd", label: "코리아크레딧뷰로 KCB 회원사ID", height: 56, hiddenWhen: "identityOff", controls: [input("cf_cert_kcb_cd", 272, "", { maxLength: 200, provider: "identity" })] },
      { id: "cf_cert_kcp_cd", label: "NHN KCP 사이트코드", height: 56, hiddenWhen: "identityOff", controls: [input("cf_cert_kcp_cd", 272, "", { maxLength: 200, provider: "identity" })] },
      { id: "cf_cert_limit", label: "본인확인 이용제한", height: 56, hiddenWhen: "identityOff", controls: [input("cf_cert_limit", 50, 2, { min: 0, max: 100, provider: "identity" })] },
      { id: "cf_cert_req", label: "본인확인 필수", height: 56, hiddenWhen: "identityOff", controls: [check("cf_cert_req", false, { provider: "identity" })] },
    ],
  },
  {
    id: "anc_cf_url",
    tabLabel: "짧은주소",
    title: "짧은 주소 설정",
    description: "게시판과 컨텐츠 페이지에 짧은 URL 을 사용합니다.",
    rows: [
      { id: "cf_bbs_rewrite_off", label: "짧은주소", height: 44.921875, controls: [{ key: "cf_bbs_rewrite", name: "cf_bbs_rewrite", kind: "radio", defaultValue: "0", options: [{ value: "0", label: "사용안함" }], provider: "shortUrl" }] },
      { id: "cf_bbs_rewrite_number", label: "숫자 방식", height: 44.921875, controls: [{ key: "cf_bbs_rewrite", name: "cf_bbs_rewrite", kind: "radio", defaultValue: "0", options: [{ value: "number", label: "숫자" }], provider: "shortUrl" }] },
      { id: "cf_bbs_rewrite_name", label: "글 이름 방식", height: 44.921875, controls: [{ key: "cf_bbs_rewrite", name: "cf_bbs_rewrite", kind: "radio", defaultValue: "0", options: [{ value: "name", label: "글 이름" }], provider: "shortUrl" }] },
    ],
  },
  {
    id: "anc_cf_mail",
    tabLabel: "기본메일환경",
    title: "기본 메일 환경 설정",
    rows: [
      { id: "cf_email_use", label: "메일발송 사용", height: 70, controls: [check("cf_email_use", false, { inlineLabel: "사용", provider: "email" })] },
      { id: "cf_use_email_certify", label: "메일인증 사용", height: 92, controls: [check("cf_use_email_certify", false, { inlineLabel: "사용", provider: "email" })] },
      { id: "cf_formmail_is_member", label: "폼메일 사용 여부", height: 70, controls: [check("cf_formmail_is_member", false, { inlineLabel: "회원만 사용", provider: "email" })] },
    ],
  },
  {
    id: "anc_cf_article_mail",
    tabLabel: "글작성메일",
    title: "게시판 글 작성 시 메일 설정",
    rows: [
      { id: "cf_email_wr_super_admin", label: "최고관리자", height: 70, controls: [check("cf_email_wr_super_admin")] },
      { id: "cf_email_wr_group_admin", label: "그룹관리자", height: 70, controls: [check("cf_email_wr_group_admin")] },
      { id: "cf_email_wr_board_admin", label: "게시판관리자", height: 70, controls: [check("cf_email_wr_board_admin")] },
      { id: "cf_email_wr_write", label: "원글작성자", height: 70, controls: [check("cf_email_wr_write")] },
      { id: "cf_email_wr_comment_all", label: "댓글작성자", height: 70, controls: [check("cf_email_wr_comment_all")] },
    ],
  },
  {
    id: "anc_cf_join_mail",
    tabLabel: "가입메일",
    title: "회원가입 시 메일 설정",
    rows: [
      { id: "cf_email_mb_super_admin", label: "최고관리자 메일발송", height: 70, controls: [check("cf_email_mb_super_admin")] },
      { id: "cf_email_mb_member", label: "회원님께 메일발송", height: 70, controls: [check("cf_email_mb_member")] },
    ],
  },
  {
    id: "anc_cf_vote_mail",
    tabLabel: "투표메일",
    title: "투표 기타의견 작성 시 메일 설정",
    rows: [
      { id: "cf_email_po_super_admin", label: "최고관리자 메일발송", height: 70, controls: [check("cf_email_po_super_admin")] },
    ],
  },
  {
    id: "anc_cf_sns",
    tabLabel: "SNS",
    title: "소셜네트워크서비스(SNS : Social Network Service)",
    rows: [
      { id: "cf_social_login_use", label: "소셜로그인설정", height: 78, controls: [check("cf_social_login_use", false, { provider: "sns" })] },
      { id: "cf_social_servicelist", label: "소셜로그인 서비스", height: 488.53125, controls: ["naver", "kakao", "facebook", "google", "twitter", "payco"].map((provider) => check(`cf_social_${provider}`, false, { name: "cf_social_servicelist[]", inlineLabel: ({ naver: "네이버", kakao: "카카오", facebook: "페이스북", google: "구글", twitter: "트위터", payco: "페이코" } as Record<string, string>)[provider], provider: "sns" })) },
      { id: "cf_naver_keys", label: "네이버", height: 80.921875, controls: [input("cf_naver_clientid", 272, "", { inlineLabel: "Client ID", provider: "sns" }), input("cf_naver_secret", 302, "", { kind: "password", inlineLabel: "Client Secret", provider: "sns", secret: true })] },
      { id: "cf_facebook_keys", label: "페이스북", height: 80.921875, controls: [input("cf_facebook_appid", 272, "", { inlineLabel: "앱 ID", provider: "sns" }), input("cf_facebook_secret", 302, "", { kind: "password", inlineLabel: "앱 Secret", provider: "sns", secret: true })] },
      { id: "cf_twitter_keys", label: "트위터", height: 80.921875, controls: [input("cf_twitter_key", 272, "", { inlineLabel: "컨슈머 Key", provider: "sns" }), input("cf_twitter_secret", 302, "", { kind: "password", inlineLabel: "컨슈머 Secret", provider: "sns", secret: true })] },
      { id: "cf_google_keys", label: "구글", height: 80.921875, controls: [input("cf_google_clientid", 272, "", { inlineLabel: "Client ID", provider: "sns" }), input("cf_google_secret", 302, "", { kind: "password", inlineLabel: "Client Secret", provider: "sns", secret: true })] },
      { id: "cf_google_shorturl", label: "구글 짧은주소 API Key", height: 56, controls: [input("cf_google_shorturl_apikey", 272, "", { provider: "shortUrl", secret: true, kind: "password" })] },
      { id: "cf_kakao_keys", label: "카카오", height: 80.921875, controls: [input("cf_kakao_rest_key", 272, "", { inlineLabel: "REST API 키", provider: "sns" }), input("cf_kakao_client_secret", 302, "", { kind: "password", inlineLabel: "Client Secret", provider: "sns", secret: true })] },
      { id: "cf_kakao_js", label: "카카오 JavaScript 키", height: 45.921875, controls: [input("cf_kakao_js_apikey", 302, "", { provider: "sns" })] },
      { id: "cf_payco_keys", label: "페이코", height: 80.921875, controls: [input("cf_payco_clientid", 272, "", { inlineLabel: "Client ID", provider: "sns" }), input("cf_payco_secret", 302, "", { kind: "password", inlineLabel: "Secret", provider: "sns", secret: true })] },
    ],
  },
  {
    id: "anc_cf_lay",
    tabLabel: "레이아웃 추가설정",
    title: "레이아웃 추가설정",
    description: "기본 설정된 파일 경로 및 script, css 를 추가하거나 변경할 수 있습니다.",
    rows: [
      { id: "cf_add_script", label: "추가 script, css", height: 226, controls: [textarea("cf_add_script", 785, 8)] },
    ],
  },
  {
    id: "anc_cf_sms",
    tabLabel: "SMS",
    title: "SMS",
    rows: [
      { id: "cf_sms_use", label: "SMS 사용", height: 56, controls: [select("cf_sms_use", 70, "0", [{ value: "0", label: "사용안함" }, { value: "icode", label: "아이코드" }], { provider: "sms" })] },
      { id: "cf_sms_type", label: "SMS 전송유형", height: 127, controls: [select("cf_sms_type", 47, "SMS", [{ value: "SMS", label: "SMS" }, { value: "LMS", label: "LMS" }], { provider: "sms" })] },
      { id: "cf_icode_id", label: "아이코드 회원아이디", height: 72.921875, controls: [input("cf_icode_id", 152, "", { provider: "sms" })] },
      { id: "cf_icode_pw", label: "아이코드 비밀번호", height: 72.921875, controls: [input("cf_icode_pw", 152, "", { kind: "password", provider: "sms", secret: true })] },
      { id: "cf_icode_plan", label: "요금제", height: 0, hiddenWhen: "smsPlan", controls: [input("cf_icode_plan", 100, "", { provider: "sms" })] },
      { id: "cf_icode_token_key", label: "아이코드 토큰키", height: 165.921875, controls: [input("cf_icode_token_key", 272, "", { kind: "password", provider: "sms", secret: true })] },
      { id: "cf_sms_signup", label: "아이코드 SMS 신청 회원가입", height: 56, controls: [{ key: "cf_sms_signup", name: "cf_sms_signup", kind: "text", defaultValue: "공급자 연결 후 신청할 수 있습니다.", width: 300, provider: "sms" }] },
    ],
  },
  {
    id: "anc_cf_extra",
    tabLabel: "여분필드",
    title: "여분필드 기본 설정",
    description: "각 게시판 관리에서 개별적으로 설정 가능합니다.",
    rows: Array.from({ length: 10 }, (_, index) => ({
      id: `cf_${index + 1}`,
      label: `여분필드 ${index + 1}`,
      height: 45.921875,
      controls: [
        input(
          `cf_${index + 1}_subj`,
          130,
          index === 0 ? "출금신청시 멘트" : "",
          { inlineLabel: "제목", maxLength: 200 },
        ),
        input(
          `cf_${index + 1}`,
          415,
          index === 0 ? "출금신청이 완료되였습니다." : "",
          { inlineLabel: "값", maxLength: 500 },
        ),
      ],
    })),
  },
] as const;

export const legacyConfigRows = legacyConfigSections.flatMap(
  (section) => section.rows,
);

export const legacyConfigControls = legacyConfigRows.flatMap(
  (row) => row.controls,
);

export const legacyConfigControlMap = new Map(
  legacyConfigControls.map((control) => [control.key, control]),
);

export type LegacyConfigValues = Record<string, LegacyConfigValue>;

export const defaultLegacyConfigValues: LegacyConfigValues =
  Object.fromEntries(
    legacyConfigControls.map((control) => [
      control.key,
      control.defaultValue,
    ]),
  );
