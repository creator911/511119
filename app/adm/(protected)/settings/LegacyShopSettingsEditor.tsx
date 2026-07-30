"use client";

import {
  Fragment,
  useMemo,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  defaultLegacyShopValues,
  isLegacyShopNumericControl,
  legacyShopSections,
  legacyShopSmsPresets,
  radioOptionsForLegacyShopControl,
  type LegacyShopCell,
  type LegacyShopControl,
  type LegacyShopValue,
  type LegacyShopValues,
} from "@/lib/legacy-shop-config-contract";
import type {
  LegacyShopProviderStatus,
  LegacyShopSettingsSnapshot,
} from "@/lib/legacy-shop-settings";

interface LegacyShopSettingsEditorProps {
  initialSnapshot: LegacyShopSettingsSnapshot;
}

interface ShopSettingsResponse {
  ok?: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
  values?: LegacyShopValues;
  revision?: number;
  providerStatus?: LegacyShopProviderStatus;
}

interface UploadResponse {
  ok?: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
  url?: string;
}

const sectionPresentation = [
  {
    id: "anc_scf_info",
    title: "사업자정보",
    description: (
      <>
        사업자정보는 tail.php 와 content.php 에서 표시합니다.
        <br />
        대표전화번호는 SMS 발송번호로 사용되므로 사전등록된 발신번호와
        일치해야 합니다.
      </>
    ),
  },
  {
    id: "anc_scf_skin",
    title: "스킨설정",
    description:
      "상품 분류리스트, 상품상세보기 등 에서 사용할 스킨을 설정합니다.",
  },
  {
    id: "anc_scf_index",
    title: "쇼핑몰 초기화면",
    description: (
      <>
        상품관리에서 선택한 상품의 타입대로 쇼핑몰 초기화면에 출력합니다.
        (상품 타입 히트/추천/최신/인기/할인)
        <br />
        각 타입별로 선택된 상품이 없으면 쇼핑몰 초기화면에 출력하지
        않습니다.
      </>
    ),
  },
  {
    id: "anc_mscf_index",
    title: "모바일 쇼핑몰 초기화면 설정",
    description: (
      <>
        상품관리에서 선택한 상품의 타입대로 쇼핑몰 초기화면에 출력합니다.
        (상품 타입 히트/추천/최신/인기/할인)
        <br />
        각 타입별로 선택된 상품이 없으면 쇼핑몰 초기화면에 출력하지
        않습니다.
      </>
    ),
  },
  {
    id: "anc_scf_payment",
    title: "결제설정",
    description: null,
  },
  {
    id: "anc_scf_delivery",
    title: "배송설정",
    description: null,
  },
  {
    id: "anc_scf_etc",
    title: "기타 설정",
    description: null,
  },
  {
    id: "anc_scf_sms",
    title: "SMS 설정",
    description: null,
  },
] as const;

const anchorLinks = [
  ["anc_scf_info", "사업자정보"],
  ["anc_scf_skin", "스킨설정"],
  ["anc_scf_index", "쇼핑몰 초기화면"],
  ["anc_mscf_index", "모바일 초기화면"],
  ["anc_scf_payment", "결제설정"],
  ["anc_scf_delivery", "배송설정"],
  ["anc_scf_etc", "기타설정"],
  ["anc_scf_sms", "SMS설정"],
] as const;

const editorControlKeys = new Set([
  "de_baesong_content",
  "de_change_content",
  "de_guest_privacy",
]);

const logoControlKeys = [
  "logo_img",
  "logo_img2",
  "mobile_logo_img",
  "mobile_logo_img2",
] as const;

const logoDeleteKeys: Record<(typeof logoControlKeys)[number], string> = {
  logo_img: "logo_img_del",
  logo_img2: "logo_img_del2",
  mobile_logo_img: "mobile_logo_img_del",
  mobile_logo_img2: "mobile_logo_img_del2",
};

const logoLabels: Record<(typeof logoControlKeys)[number], string> = {
  logo_img: "상단로고이미지",
  logo_img2: "하단로고이미지",
  mobile_logo_img: "모바일 상단로고이미지",
  mobile_logo_img2: "모바일 하단로고이미지",
};

const pgGroups: Record<string, "kcp" | "lg" | "inicis"> = {
  de_kcp_mid: "kcp",
  de_kcp_site_key: "kcp",
  "de_easy_pays.nhnkcp_payco": "kcp",
  "de_easy_pays.nhnkcp_naverpay": "kcp",
  "de_easy_pays.nhnkcp_kakaopay": "kcp",
  "de_easy_pays.nhnkcp_applepay": "kcp",
  "de_easy_pays.global_nhnkcp_naverpay": "kcp",
  "de_easy_pays.used_nhnkcp_naverpay_point": "kcp",
  cf_lg_mid: "lg",
  cf_lg_mert_key: "lg",
  de_inicis_mid: "inicis",
  de_inicis_admin_key: "inicis",
  de_inicis_sign_key: "inicis",
  de_samsung_pay_use: "inicis",
  de_inicis_lpay_use: "inicis",
  de_inicis_kakaopay_use: "inicis",
  de_inicis_cartpoint_use: "inicis",
  de_kakaopay_mid: "inicis",
  de_kakaopay_key: "inicis",
  de_kakaopay_cancelpwd: "inicis",
  de_kakaopay_enckey: "inicis",
  de_kakaopay_hashkey: "inicis",
};

const legacyShopHelp: Record<string, string> = {
  de_bank_use:
    "주문시 무통장으로 입금을 가능하게 할 것인지를 설정합니다.\n사용할 경우 은행계좌번호를 반드시 입력하여 주십시오.",
  de_iche_use: "주문시 실시간 계좌이체를 가능하게 할 것인지를 설정합니다.",
  de_vbank_use:
    "주문별로 유일하게 생성되는 일회용 계좌번호입니다. 입금시 상점에 실시간으로 통보됩니다.",
  de_hp_use: "주문시 휴대폰 결제를 가능하게 할 것인지를 설정합니다.",
  de_card_use: "주문시 신용카드 결제를 가능하게 할 것인지를 설정합니다.",
  de_card_noint_use:
    "신용카드 결제시 무이자 할부 사용 여부를 설정합니다.\nNHN KCP 결제대행사를 사용하는 경우에만 적용됩니다.",
  de_easy_pay_use:
    "결제대행사가 제공하는 간편결제 버튼을 노출할지를 설정합니다.",
  de_taxsave_use:
    "무통장입금, 가상계좌, 계좌이체 결제시 현금영수증 발급 여부를 설정합니다.",
  de_taxsave_types_account:
    "현금영수증을 발급할 결제수단을 선택합니다.\n무통장입금은 기본 적용되며 가상계좌와 계좌이체를 추가할 수 있습니다.\nPG 연동이 준비되지 않은 결제수단은 실제 주문에서 활성화되지 않습니다.",
  cf_use_point: "회원이 주문 결제시 포인트를 사용할 수 있게 합니다.",
  de_settle_min_point:
    "주문 결제시 사용할 수 있는 최소 포인트를 설정합니다.\n포인트를 사용하지 않는 경우에는 의미가 없습니다.",
  de_settle_max_point:
    "주문 결제시 최대로 사용할 수 있는 포인트를 설정합니다.\n포인트를 사용하지 않는 경우에는 의미가 없습니다.",
  de_settle_point_unit:
    "주문 결제시 사용되는 포인트의 절사 단위를 설정합니다.",
  de_card_point:
    "신용카드, 계좌이체, 휴대폰 결제시 포인트를 부여할지를 설정합니다.",
  de_point_days:
    "주문자가 회원인 경우 주문완료시 포인트를 지급합니다.\n취소와 반품을 고려하여 지급할 기간을 입력하십시오.",
  de_pg_service: "쇼핑몰에서 사용할 결제대행사를 선택합니다.",
  de_kcp_mid:
    "NHN KCP에서 발급받은 SITE CODE를 입력합니다.\n연동 모듈이 준비된 뒤 환경변수와 함께 사용할 수 있습니다.",
  de_kcp_site_key:
    "NHN KCP에서 발급받은 SITE KEY입니다.\n비밀값은 화면이나 데이터베이스에 저장하지 않습니다.",
  "de_easy_pays.nhnkcp_payco":
    "NHN KCP에서 신청한 간편결제 서비스를 선택합니다.\n각 서비스의 계약과 심사가 완료되어야 실제 결제가 가능합니다.\n현재는 PG 승인 모듈이 없어 안전하게 비활성화됩니다.",
  "de_easy_pays.global_nhnkcp_naverpay":
    "NHN KCP 네이버페이 서비스의 사용 여부를 설정합니다.\n서비스 신청과 승인 후 사용할 수 있습니다.",
  "de_easy_pays.used_nhnkcp_naverpay_point":
    "네이버페이 포인트 결제 사용 여부를 설정합니다.\n네이버페이 서비스 계약이 필요합니다.",
  cf_lg_mid:
    "토스페이먼츠에서 발급받은 상점아이디를 입력합니다.\n실제 결제는 승인 모듈과 환경변수가 연결되어야 합니다.",
  cf_lg_mert_key:
    "토스페이먼츠에서 발급받은 MERT KEY입니다.\n비밀값은 화면이나 데이터베이스에 저장하지 않습니다.",
  de_inicis_mid:
    "KG이니시스에서 발급받은 상점아이디를 입력합니다.\n연동 전에는 실제 결제가 활성화되지 않습니다.",
  de_inicis_admin_key:
    "KG이니시스 키패스워드입니다.\n비밀값은 서버 환경변수로만 관리합니다.",
  de_inicis_sign_key:
    "KG이니시스 웹결제 사인키입니다.\n비밀값은 서버 환경변수로만 관리합니다.",
  de_samsung_pay_use:
    "KG이니시스 삼성페이 서비스 신청 후 사용 여부를 설정합니다.",
  de_inicis_lpay_use:
    "KG이니시스 L.pay 서비스 신청 후 사용 여부를 설정합니다.",
  de_inicis_kakaopay_use:
    "KG이니시스 카카오페이 서비스 신청 후 사용 여부를 설정합니다.",
  de_inicis_cartpoint_use:
    "KG이니시스 신용카드 포인트 결제를 사용하려면 별도 계약이 필요합니다.\n연동 전에는 안전하게 비활성화됩니다.",
  de_kakaopay_mid:
    "카카오페이 서비스에서 발급받은 상점아이디를 입력합니다.",
  de_kakaopay_key:
    "카카오페이 상점키입니다.\n실제 키는 서버 환경변수로 연결해야 합니다.",
  de_kakaopay_cancelpwd:
    "카카오페이 취소용 키패스워드입니다.\n비밀값은 서버 환경변수로만 관리합니다.",
  de_kakaopay_enckey:
    "카카오페이 계약과 심사가 완료된 경우에만 사용할 수 있습니다.",
  de_kakaopay_hashkey:
    "카카오페이 상점 HashKey입니다. 서버 환경변수로만 관리합니다.",
  de_escrow_use:
    "에스크로 결제 사용 여부를 설정합니다.\nPG사에 에스크로 서비스 신청 후 사용할 수 있습니다.",
  de_card_test:
    "결제대행사의 테스트 결제 여부를 설정합니다.\n실결제 전환은 자격증명과 승인 모듈을 모두 확인해야 합니다.",
  de_tax_flag_use:
    "과세상품과 비과세상품을 함께 판매하는 경우 복합과세 결제를 사용합니다.",
  de_delivery_company:
    "주문상품을 배송할 기본 배송업체를 선택합니다.",
  de_send_cost_case:
    "배송비 유형을 선택합니다.\n금액별 차등은 주문금액 기준에 따라 배송비가 달라집니다.\n무료배송은 모든 주문의 기본 배송비를 0원으로 적용합니다.",
  de_send_cost_limit:
    "배송비상한가를 여러 단계로 입력할 수 있습니다.\n각 금액은 세미콜론(;)으로 구분합니다.\n예) 20000;30000;40000",
  de_hope_date_use:
    "주문서에서 고객이 희망배송일을 선택할 수 있게 합니다.",
  de_hope_date_after:
    "오늘을 포함하여 설정한 날 이후부터 일주일 동안 달력으로 노출합니다.",
  de_rel_list_skin:
    "관련상품은 등록된 상품을 모두 출력합니다.\n이미지높이를 0으로 설정하면 이미지폭에 비례해 생성합니다.",
  de_mobile_rel_list_skin:
    "모바일 관련상품은 등록된 상품을 모두 출력합니다.\n이미지높이를 0으로 설정하면 이미지폭에 비례해 생성합니다.",
  de_simg_width:
    "분류리스트에서 보여지는 상품이미지 크기입니다.\n높이를 0으로 설정하면 폭에 비례해 생성합니다.",
  de_mimg_width:
    "상품상세보기에서 보여지는 상품이미지 크기를 설정합니다.",
  logo_img: "쇼핑몰 상단로고를 직접 올릴 수 있습니다. 이미지 파일만 가능합니다.",
  logo_img2: "쇼핑몰 하단로고를 직접 올릴 수 있습니다. 이미지 파일만 가능합니다.",
  mobile_logo_img:
    "모바일 쇼핑몰 상단로고를 직접 올릴 수 있습니다. 이미지 파일만 가능합니다.",
  mobile_logo_img2:
    "모바일 쇼핑몰 하단로고를 직접 올릴 수 있습니다. 이미지 파일만 가능합니다.",
  de_item_use_write:
    "사용후기를 작성할 수 있는 주문상태를 설정합니다.",
  de_item_use_use:
    "등록된 사용후기를 즉시 출력할지 관리자 승인 후 출력할지 설정합니다.",
  de_level_sell: "상품을 구입할 수 있는 최소 회원레벨을 설정합니다.",
  de_cart_keep_term:
    "장바구니에 담긴 상품을 보관할 기간을 설정합니다.",
  de_guest_cart_use:
    "비회원도 장바구니를 사용할 수 있게 할지를 설정합니다.",
  de_member_reg_coupon_use:
    "신규 회원가입시 쿠폰 발행 여부와 금액, 주문 최소금액, 유효기간을 설정합니다.",
  cf_sms_use:
    "SMS 서비스 회사를 선택합니다. 공급자를 선택하지 않으면 발송 기능이 동작하지 않습니다.\n환경변수와 발신번호 등록이 완료되어야 실제 발송할 수 있습니다.",
  cf_sms_type:
    "SMS는 최대 80바이트까지 전송합니다.\nLMS는 90바이트를 넘는 긴 내용을 전송할 수 있습니다.",
  de_sms_hp:
    "주문서 작성시 쇼핑몰 관리자가 문자메시지를 받아볼 번호를 숫자만 입력하세요.",
  cf_icode_id:
    "아이코드 구버전에서 사용하는 회원아이디입니다.",
  cf_icode_pw:
    "아이코드 구버전 비밀번호입니다. 비밀값은 환경변수로만 관리합니다.",
  cf_icode_token_key:
    "아이코드 JSON 버전은 토큰키가 연결된 경우 실행됩니다.\nLMS 선택시 긴 메시지를 전송할 수 있습니다.\n토큰키는 서버 환경변수로만 관리합니다.",
};

export function LegacyShopSettingsEditor({
  initialSnapshot,
}: LegacyShopSettingsEditorProps) {
  const [values, setValues] = useState<LegacyShopValues>(
    initialSnapshot.values,
  );
  const [revision, setRevision] = useState(initialSnapshot.revision);
  const [providerStatus, setProviderStatus] = useState(
    initialSnapshot.providerStatus,
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [selectedFiles, setSelectedFiles] = useState<
    Partial<Record<string, File>>
  >({});
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const [message, setMessage] = useState("");
  const [pgTab, setPgTab] = useState<"kcp" | "lg" | "inicis">("kcp");

  const smsLimit = values.cf_sms_type === "LMS" ? 1_500 : 80;
  const sectionData = useMemo(
    () =>
      legacyShopSections.map((section, index) => ({
        section,
        presentation: sectionPresentation[index]!,
      })),
    [],
  );

  function change(key: string, value: LegacyShopValue) {
    setValues((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => ({ ...current, [key]: "" }));
    setMessage("");
  }

  function selectFile(
    control: LegacyShopControl,
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.currentTarget.files?.[0];
    setSelectedFiles((current) => {
      const next = { ...current };
      if (file) next[control.key] = file;
      else delete next[control.key];
      return next;
    });
    if (file) {
      const deleteKey = logoDeleteKeys[
        control.key as (typeof logoControlKeys)[number]
      ];
      if (deleteKey) change(deleteKey, false);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setFailed(false);
    setMessage("");
    setFieldErrors({});
    try {
      const nextValues = { ...values };
      for (const key of logoControlKeys) {
        const deleteKey = logoDeleteKeys[key];
        if (nextValues[deleteKey] === true) {
          nextValues[key] = "";
          continue;
        }
        const file = selectedFiles[key];
        if (!file) continue;
        const form = new FormData();
        form.append("file", file);
        const uploadResponse = await fetch("/api/admin/media", {
          method: "POST",
          headers: { Accept: "application/json" },
          body: form,
        });
        const uploadPayload = (await uploadResponse
          .json()
          .catch(() => ({}))) as UploadResponse;
        if (!uploadResponse.ok || !uploadPayload.url) {
          setFieldErrors((current) => ({
            ...current,
            [key]:
              uploadPayload.fieldErrors?.file ??
              uploadPayload.message ??
              "이미지를 업로드하지 못했습니다.",
          }));
          throw new Error(
            uploadPayload.message ?? "이미지를 업로드하지 못했습니다.",
          );
        }
        nextValues[key] = uploadPayload.url;
      }

      const response = await fetch("/api/admin/shop-settings", {
        method: "PATCH",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          expectedRevision: revision,
          values: nextValues,
        }),
      });
      const payload = (await response
        .json()
        .catch(() => ({}))) as ShopSettingsResponse;
      if (response.status === 401) {
        const next = `${window.location.pathname}${window.location.search}`;
        window.location.assign(`/adm/login?next=${encodeURIComponent(next)}`);
        return;
      }
      if (
        !response.ok ||
        !payload.values ||
        typeof payload.revision !== "number"
      ) {
        setFieldErrors(payload.fieldErrors ?? {});
        setFailed(true);
        setMessage(payload.message ?? "쇼핑몰설정을 저장하지 못했습니다.");
        return;
      }
      setValues(payload.values);
      setRevision(payload.revision);
      setSelectedFiles({});
      if (payload.providerStatus) setProviderStatus(payload.providerStatus);
      setMessage("쇼핑몰설정을 저장했습니다.");
    } catch (error) {
      setFailed(true);
      setMessage(
        error instanceof Error && error.message
          ? error.message
          : "네트워크 상태를 확인한 뒤 다시 시도해 주세요.",
      );
    } finally {
      setSaving(false);
    }
  }

  function applyThemeDefaults(
    kind: "skin" | "desktop" | "mobile" | "etc",
  ) {
    const prompt =
      kind === "skin"
        ? "현재 테마의 쇼핑몰 스킨 설정을 적용하시겠습니까?"
        : "현재 테마의 스킨, 이미지 사이즈 등의 설정을 적용하시겠습니까?";
    if (!window.confirm(prompt)) return;
    const matcher =
      kind === "skin"
        ? /^de_shop_(?:mobile_)?skin$/u
        : kind === "desktop"
          ? /^de_type[1-5]_/u
          : kind === "mobile"
            ? /^de_mobile_type[1-5]_/u
            : /^(?:de_(?:mobile_)?(?:rel|search|listtype)_|de_[sm]img_)/u;
    setValues((current) => {
      const next = { ...current };
      for (const [key, value] of Object.entries(defaultLegacyShopValues)) {
        if (matcher.test(key)) next[key] = value;
      }
      return next;
    });
    setMessage("테마 기본 설정을 입력했습니다. 확인을 눌러 저장하세요.");
  }

  return (
    <form
      className="legacy-shop-settings-form"
      name="fconfig"
      onSubmit={save}
    >
      <input type="hidden" name="token" value="" readOnly />
      <div className="btn_fixed_top legacy-shop-fixed-buttons">
        <a href="/shop" className="btn btn_02">
          쇼핑몰
        </a>
        <button
          type="submit"
          className="btn_submit btn"
          disabled={saving}
          accessKey="s"
        >
          {saving ? "저장중" : "확인"}
        </button>
      </div>
      <p
        className={`legacy-shop-message ${failed ? "error" : ""}`}
        role={failed ? "alert" : "status"}
        aria-live="polite"
      >
        {message}
      </p>
      <p className="sound_only" id="legacy-shop-pg-status">
        {providerStatus.pg.message}
      </p>
      <p className="sound_only" id="legacy-shop-sms-status">
        {providerStatus.sms.message}
      </p>

      {sectionData.map(({ section, presentation }, sectionIndex) => (
        <div className="legacy-shop-section-block" key={presentation.id}>
          <section
            className="legacy-shop-section"
            id={presentation.id}
          >
            <h2 className="h2_frm">{presentation.title}</h2>
            <ShopAnchor />
            {presentation.description ? (
              <div className="local_desc02 local_desc legacy-shop-description">
                <p>{presentation.description}</p>
              </div>
            ) : null}
            <div className="tbl_frm01 tbl_wrap legacy-shop-table-wrap">
              <table className="legacy-shop-table">
                <caption>{section.caption}</caption>
                <colgroup>
                  <col className="grid_4" />
                  <col />
                  {sectionIndex === 0 ? (
                    <>
                      <col className="grid_4" />
                      <col />
                    </>
                  ) : null}
                </colgroup>
                <tbody>
                  {section.rows.map((row, rowIndex) => {
                    const firstKey =
                      row.cells[0]?.controls[0]?.key ?? `${rowIndex}`;
                    const providerGroup = pgGroups[firstKey];
                    return (
                      <Fragment
                        key={`${presentation.id}-${firstKey}-${rowIndex}`}
                      >
                        <tr
                          hidden={
                            firstKey === "de_kakaopay_hashkey" ||
                            firstKey === "cf_icode_server_ip"
                          }
                          className={
                            [
                              `legacy-shop-row-${firstKey}`,
                              providerGroup
                                ? `pg_info_fld ${providerGroup}_info_fld`
                                : "",
                            ]
                              .filter(Boolean)
                              .join(" ")
                          }
                        >
                          {row.cells.map((cell, cellIndex) => (
                            <ShopCell
                              cell={cell}
                              errors={fieldErrors}
                              key={`${firstKey}-${cellIndex}`}
                              pgTab={pgTab}
                              providerStatus={providerStatus}
                              selectedFiles={selectedFiles}
                              smsLimit={smsLimit}
                              values={values}
                              onChange={change}
                              onFileChange={selectFile}
                              onPgTabChange={setPgTab}
                            />
                          ))}
                        </tr>
                        {sectionIndex === 4 && rowIndex === 3 ? (
                          <PaymentNotificationRows />
                        ) : null}
                      </Fragment>
                    );
                  })}
                  {sectionIndex === 6 ? <LocalDatabaseRows /> : null}
                  {sectionIndex === 7 ? <SmsRegistrationRow /> : null}
                </tbody>
              </table>
            </div>
            {sectionIndex === 7 ? (
              <SmsPresetEditor
                errors={fieldErrors}
                limit={smsLimit}
                values={values}
                onChange={change}
              />
            ) : null}
          </section>
          {sectionIndex === 1 ? (
            <button
              type="button"
              className="get_shop_skin legacy-shop-theme-button"
              onClick={() => applyThemeDefaults("skin")}
            >
              테마 스킨설정 가져오기
            </button>
          ) : null}
          {sectionIndex === 2 ? (
            <button
              type="button"
              className="shop_pc_index legacy-shop-theme-button"
              onClick={() => applyThemeDefaults("desktop")}
            >
              테마설정 가져오기
            </button>
          ) : null}
          {sectionIndex === 3 ? (
            <button
              type="button"
              className="shop_mobile_index legacy-shop-theme-button"
              onClick={() => applyThemeDefaults("mobile")}
            >
              테마설정 가져오기
            </button>
          ) : null}
          {sectionIndex === 6 ? (
            <button
              type="button"
              className="shop_etc legacy-shop-theme-button"
              onClick={() => applyThemeDefaults("etc")}
            >
              테마설정 가져오기
            </button>
          ) : null}
        </div>
      ))}
    </form>
  );
}

function ShopAnchor() {
  return (
    <ul className="anchor legacy-shop-anchor">
      {anchorLinks.map(([id, label]) => (
        <li key={id}>
          <a href={`#${id}`}>{label}</a>
        </li>
      ))}
    </ul>
  );
}

function ShopCell({
  cell,
  errors,
  pgTab,
  providerStatus,
  selectedFiles,
  smsLimit,
  values,
  onChange,
  onFileChange,
  onPgTabChange,
}: {
  cell: LegacyShopCell;
  errors: Record<string, string>;
  pgTab: "kcp" | "lg" | "inicis";
  providerStatus: LegacyShopProviderStatus;
  selectedFiles: Partial<Record<string, File>>;
  smsLimit: number;
  values: LegacyShopValues;
  onChange: (key: string, value: LegacyShopValue) => void;
  onFileChange: (
    control: LegacyShopControl,
    event: ChangeEvent<HTMLInputElement>,
  ) => void;
  onPgTabChange: (tab: "kcp" | "lg" | "inicis") => void;
}) {
  const firstControl = cell.controls[0];
  const help = firstControl
    ? legacyShopHelp[firstControl.key]
    : undefined;
  return (
    <>
      <th
        scope="row"
        colSpan={positiveColumnSpan(cell.thColSpan)}
      >
        {cell.label}
      </th>
      <td colSpan={positiveColumnSpan(cell.tdColSpan)}>
        {help ? (
          <span className="frm_info legacy-shop-help">{help}</span>
        ) : null}
        <div
          className={`legacy-shop-control-group ${
            cell.controls.length > 1 ? "multiple" : ""
          }`}
        >
          {firstControl?.key === "de_pg_service" ? (
            <PgTabs selected={pgTab} onChange={onPgTabChange} />
          ) : null}
          {renderControls({
            cell,
            errors,
            providerStatus,
            selectedFiles,
            smsLimit,
            values,
            onChange,
            onFileChange,
          })}
        </div>
        {firstControl?.provider === "pg" ? (
          <span className="sound_only">{providerStatus.pg.message}</span>
        ) : null}
        {firstControl?.provider === "sms" ? (
          <span className="sound_only">{providerStatus.sms.message}</span>
        ) : null}
      </td>
    </>
  );
}

function PaymentNotificationRows() {
  return (
    <>
      <tr className="legacy-shop-kcp-notification-row">
        <th scope="row">
          NHN KCP 가상계좌
          <br />
          입금통보 URL
        </th>
        <td>
          <span className="frm_info legacy-shop-help">
            NHN KCP 가상계좌를 사용할 때 상점 관리자에 등록하는 로컬
            입금통보 주소입니다.
          </span>
          <span className="legacy-shop-local-url">
            /shop/settle_kcp_common.php
          </span>
        </td>
      </tr>
      <tr className="legacy-shop-inicis-notification-row" hidden>
        <th scope="row">
          KG이니시스 가상계좌
          <br />
          입금통보 URL
        </th>
        <td>
          <span className="frm_info legacy-shop-help">
            KG이니시스 가상계좌를 사용할 때 등록하는 로컬 입금통보
            주소입니다.
          </span>
          <span className="legacy-shop-local-url">
            /shop/settle_inicis_common.php
          </span>
        </td>
      </tr>
    </>
  );
}

function LocalDatabaseRows() {
  return (
    <>
      <tr className="legacy-shop-runtime-row">
        <th scope="row">MYSQL USER</th>
        <td>로컬 런타임 바인딩</td>
      </tr>
      <tr className="legacy-shop-runtime-row">
        <th scope="row">MYSQL DB</th>
        <td>로컬 D1 데이터베이스</td>
      </tr>
      <tr className="legacy-shop-runtime-row">
        <th scope="row">서버 IP</th>
        <td>127.0.0.1</td>
      </tr>
    </>
  );
}

function SmsRegistrationRow() {
  return (
    <tr className="legacy-shop-sms-registration-row">
      <th scope="row">
        아이코드 SMS 신청
        <br />
        회원가입
      </th>
      <td>
        <span className="frm_info legacy-shop-help">
          SMS 공급자 계정과 환경변수가 연결되어야 실제 발송할 수 있습니다.
        </span>
        <span className="btn_frmline legacy-shop-provider-button">
          아이코드 회원가입
        </span>
      </td>
    </tr>
  );
}

function renderControls({
  cell,
  errors,
  providerStatus,
  selectedFiles,
  smsLimit,
  values,
  onChange,
  onFileChange,
}: {
  cell: LegacyShopCell;
  errors: Record<string, string>;
  providerStatus: LegacyShopProviderStatus;
  selectedFiles: Partial<Record<string, File>>;
  smsLimit: number;
  values: LegacyShopValues;
  onChange: (key: string, value: LegacyShopValue) => void;
  onFileChange: (
    control: LegacyShopControl,
    event: ChangeEvent<HTMLInputElement>,
  ) => void;
}): ReactNode {
  const renderedRadios = new Set<string>();
  return cell.controls.map((control, index) => {
    if (control.type === "radio") {
      if (renderedRadios.has(control.key)) return null;
      renderedRadios.add(control.key);
      return (
        <span className="legacy-shop-radio-group" key={control.key}>
          {radioOptionsForLegacyShopControl(control.key).map((option) => (
            <label key={`${control.key}-${option.value}`}>
              <input
                type="radio"
                name={control.name}
                value={option.value}
                checked={String(values[control.key]) === option.value}
                disabled={control.provider === "pg"}
                onChange={() => onChange(control.key, option.value)}
              />
              {option.label}
            </label>
          ))}
          {paymentTipButtons(control.key)}
          <FieldError message={errors[control.key]} />
        </span>
      );
    }

    const disabled =
      control.secret ||
      control.provider === "pg" ||
      (control.provider === "sms" &&
        control.key !== "de_sms_hp" &&
        !providerStatus.sms.configured);
    const inlineLabel = inlineControlLabel(control, cell.controls.length);
    const error = errors[control.key];
    const common = {
      id: control.id || control.key.replaceAll(".", "-"),
      name: control.name,
      disabled,
      "aria-invalid": Boolean(error),
      "aria-describedby":
        control.provider === "pg"
          ? "legacy-shop-pg-status"
          : control.provider === "sms"
            ? "legacy-shop-sms-status"
            : undefined,
    };
    const suffix = controlSuffix(control.key);

    let field: ReactNode;
    if (control.type === "hidden") {
      field = (
        <input
          {...common}
          type="hidden"
          value={String(values[control.key] ?? "")}
          readOnly
        />
      );
    } else if (control.type === "select") {
      field = (
        <select
          {...common}
          className="legacy-shop-input"
          value={String(values[control.key] ?? "")}
          onChange={(event) =>
            onChange(control.key, event.currentTarget.value)
          }
        >
          {(control.options ?? []).map((option) => (
            <option value={option.value} key={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );
    } else if (control.type === "textarea") {
      field = (
        <>
          <textarea
            {...common}
            className="legacy-shop-input"
            rows={numberOrUndefined(control.rows)}
            cols={numberOrUndefined(control.cols)}
            maxLength={numberOrUndefined(control.maxLength)}
            value={String(values[control.key] ?? "")}
            onChange={(event) => {
              const value = editorControlKeys.has(control.key)
                ? event.currentTarget.value
                : truncateByLegacyBytes(event.currentTarget.value, smsLimit);
              onChange(control.key, value);
            }}
          />
          {editorControlKeys.has(control.key) ? (
            <button type="button" className="btn_cke_sc">
              단축키 일람
            </button>
          ) : null}
        </>
      );
    } else if (control.type === "file") {
      const logoKey = control.key as (typeof logoControlKeys)[number];
      field = (
        <>
          <input
            {...common}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            disabled={false}
            onChange={(event) => onFileChange(control, event)}
          />
          {selectedFiles[control.key] ? (
            <span className="legacy-shop-file-name">
              {selectedFiles[control.key]?.name}
            </span>
          ) : null}
          <button
            type="button"
            className="btn_frmline scf_img_view"
            onClick={() => {
              const url = String(values[control.key] ?? "");
              if (url) window.open(url, "_blank", "noopener,noreferrer");
            }}
          >
            {logoLabels[logoKey]} 확인
          </button>
          <button
            type="button"
            className="sit_wimg_close"
            hidden
          >
            닫기
          </button>
        </>
      );
    } else if (control.type === "checkbox") {
      field = (
        <input
          {...common}
          type="checkbox"
          value={control.value || "1"}
          checked={values[control.key] === true}
          onChange={(event) =>
            onChange(control.key, event.currentTarget.checked)
          }
        />
      );
    } else {
      field = (
        <input
          {...common}
          className="frm_input legacy-shop-input"
          type={control.type === "password" ? "password" : "text"}
          size={numberOrUndefined(control.size)}
          maxLength={numberOrUndefined(control.maxLength)}
          inputMode={
            isLegacyShopNumericControl(control) ? "numeric" : undefined
          }
          placeholder={control.secret ? "환경변수로 관리" : undefined}
          value={
            control.secret ? "" : String(values[control.key] ?? "")
          }
          style={
            control.size
              ? ({
                  "--legacy-shop-input-width": inputWidth(control.size),
                } as CSSProperties)
              : undefined
          }
          onChange={(event) =>
            onChange(control.key, event.currentTarget.value)
          }
        />
      );
    }

    return (
      <span
        className={`legacy-shop-control control-${control.type}`}
        key={`${control.key}-${index}`}
      >
        {inlineLabel ? (
          <label htmlFor={common.id}>{inlineLabel}</label>
        ) : null}
        {prefixText(control.key)}
        {field}
        {suffix}
        {control.secret ? (
          <span className="legacy-shop-secret-note">환경변수로 관리</span>
        ) : null}
        <FieldError message={error} />
      </span>
    );
  });
}

function PgTabs({
  selected,
  onChange,
}: {
  selected: "kcp" | "lg" | "inicis";
  onChange: (tab: "kcp" | "lg" | "inicis") => void;
}) {
  const tabs = [
    ["kcp", "NHN KCP"],
    ["lg", "토스페이먼츠"],
    ["inicis", "KG이니시스"],
  ] as const;
  return (
    <ul className="de_pg_tab" aria-label="결제대행사 화면">
      {tabs.map(([id, label]) => (
        <li className={selected === id ? "tab-current" : ""} key={id}>
          <a
            href={`#${id}_info_anchor`}
            onClick={(event) => {
              event.preventDefault();
              onChange(id);
            }}
          >
            {label}
          </a>
        </li>
      ))}
    </ul>
  );
}

function paymentTipButtons(key: string) {
  if (key !== "de_card_test") return null;
  return (
    <span className="legacy-shop-card-test-buttons">
      <button type="button" className="scf_cardtest_btn btn_frmline">
        테스트결제 팁 더보기
      </button>
      <button type="button" className="scf_cardtest_btn btn_frmline">
        테스트결제 팁 더보기
      </button>
      <button type="button" className="scf_cardtest_btn btn_frmline">
        테스트결제 팁 더보기
      </button>
    </span>
  );
}

function SmsPresetEditor({
  errors,
  limit,
  values,
  onChange,
}: {
  errors: Record<string, string>;
  limit: number;
  values: LegacyShopValues;
  onChange: (key: string, value: LegacyShopValue) => void;
}) {
  return (
    <section id="scf_sms_pre" className="legacy-shop-sms-presets">
      <h3>사전에 정의된 SMS프리셋</h3>
      <div className="local_desc01 local_desc legacy-shop-sms-description">
        <dl>
          <dt>회원가입시</dt>
          <dd>{"{이름} {회원아이디} {회사명}"}</dd>
          <dt>주문서작성</dt>
          <dd>
            {"{이름} {보낸분} {받는분} {주문번호} {주문금액} {회사명}"}
          </dd>
          <dt>입금확인시</dt>
          <dd>{"{이름} {입금액} {주문번호} {회사명}"}</dd>
          <dt>상품배송시</dt>
          <dd>
            {"{이름} {택배회사} {운송장번호} {주문번호} {회사명}"}
          </dd>
        </dl>
        <p>
          주의! 80 bytes 까지만 전송됩니다. (영문 한글자 : 1byte, 한글
          한글자 : 2bytes, 특수문자의 경우 1 또는 2bytes 임)
        </p>
      </div>
      <div id="scf_sms" className="legacy-shop-sms-grid">
        {legacyShopSmsPresets.map(({ index, title }) => {
          const useKey = `de_sms_use${index}`;
          const contentKey = `de_sms_cont${index}`;
          const content = String(values[contentKey] ?? "");
          return (
            <section className="scf_sms_box" key={index}>
              <h4>{title}</h4>
              <input
                type="checkbox"
                name={useKey}
                value="1"
                id={useKey}
                checked={values[useKey] === true}
                onChange={(event) =>
                  onChange(useKey, event.currentTarget.checked)
                }
              />
              <label htmlFor={useKey}>
                <span className="sound_only">{title}</span>사용
              </label>
              <div className="scf_sms_img">
                <textarea
                  id={contentKey}
                  name={contentKey}
                  value={content}
                  onChange={(event) =>
                    onChange(
                      contentKey,
                      truncateByLegacyBytes(
                        event.currentTarget.value,
                        limit,
                      ),
                    )
                  }
                />
              </div>
              <span className="scf_sms_cnt">
                {legacyByteLength(content)} / {limit} 바이트
              </span>
              <FieldError message={errors[contentKey] ?? errors[useKey]} />
            </section>
          );
        })}
      </div>
    </section>
  );
}

function FieldError({ message }: { message?: string }) {
  return message ? (
    <span className="legacy-shop-field-error" role="alert">
      {message}
    </span>
  ) : null;
}

function inlineControlLabel(
  control: LegacyShopControl,
  count: number,
): string {
  if (count <= 1) return "";
  const key = control.key;
  if (/_list_use$/u.test(key)) return "출력";
  if (/_list_skin$/u.test(key)) return "스킨";
  if (/_list_mod$/u.test(key)) return "1줄당 이미지 수";
  if (/_list_row$/u.test(key)) return "출력할 줄 수";
  if (/_img_width$/u.test(key)) return "이미지 폭";
  if (/_img_height$/u.test(key)) return "이미지 높이";
  if (/^de_[sm]img_width$/u.test(key)) return "폭";
  if (/^de_[sm]img_height$/u.test(key)) return "높이";
  if (key === "de_taxsave_types_account") return "무통장입금";
  if (key === "de_taxsave_types_vbank") return "가상계좌";
  if (key === "de_taxsave_types_transfer") return "계좌이체";
  if (key.includes("nhnkcp_payco")) return "PAYCO";
  if (key.includes("nhnkcp_naverpay")) return "네이버페이";
  if (key.includes("nhnkcp_kakaopay")) return "카카오페이";
  if (key.includes("nhnkcp_applepay")) return "애플페이";
  if (key === "logo_img_del" || key === "logo_img_del2") return "삭제";
  if (
    key === "mobile_logo_img_del" ||
    key === "mobile_logo_img_del2"
  ) {
    return "삭제";
  }
  if (key === "de_member_reg_coupon_use") return "쿠폰발행";
  if (key === "de_member_reg_coupon_price") return "쿠폰금액";
  if (key === "de_member_reg_coupon_minimum") return "주문 최소금액";
  if (key === "de_member_reg_coupon_term") return "유효기간";
  return "";
}

function controlSuffix(key: string): string {
  if (
    key === "de_settle_min_point" ||
    key === "de_settle_max_point" ||
    key === "de_settle_point_unit"
  ) {
    return " 점";
  }
  if (
    key === "de_member_reg_coupon_price" ||
    key === "de_member_reg_coupon_minimum" ||
    key === "de_send_cost_limit" ||
    key === "de_send_cost_list"
  ) {
    return " 원";
  }
  if (key === "de_point_days") {
    return " 일 이후에 포인트를 지급";
  }
  if (
    key === "de_hope_date_after" ||
    key === "de_cart_keep_term" ||
    key === "de_member_reg_coupon_term"
  ) {
    return " 일";
  }
  if (
    /(?:img_width|img_height|^de_[sm]img_(?:width|height))$/u.test(key)
  ) {
    return " 픽셀";
  }
  return "";
}

function prefixText(key: string): string {
  return key === "de_point_days" ? "주문 완료 " : "";
}

function inputWidth(size: string): string {
  const parsed = Number(size);
  if (!Number.isFinite(parsed) || parsed <= 0) return "272px";
  return `${Math.max(24, Math.round(parsed * 7.8 + 12))}px`;
}

function numberOrUndefined(value: string): number | undefined {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function positiveColumnSpan(value: string): number | undefined {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 1 ? parsed : undefined;
}

function legacyByteLength(value: string): number {
  let bytes = 0;
  for (const character of value) {
    bytes += character.codePointAt(0)! > 0x7f ? 2 : 1;
  }
  return bytes;
}

function truncateByLegacyBytes(value: string, limit: number): string {
  let bytes = 0;
  let result = "";
  for (const character of value) {
    const size = character.codePointAt(0)! > 0x7f ? 2 : 1;
    if (bytes + size > limit) break;
    bytes += size;
    result += character;
  }
  return result;
}
