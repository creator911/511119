import shopSchemaSource from "@/data/legacy-shop-config-schema.json";

export type LegacyShopValue = string | number | boolean;
export type LegacyShopValues = Record<string, LegacyShopValue>;

export interface LegacyShopOption {
  value: string;
  label: string;
}

export interface LegacyShopControl {
  key: string;
  name: string;
  type:
    | "checkbox"
    | "file"
    | "hidden"
    | "password"
    | "radio"
    | "select"
    | "text"
    | "textarea";
  id: string;
  value: string;
  size: string;
  rows: string;
  cols: string;
  maxLength: string;
  provider: "" | "pg" | "sms";
  secret: boolean;
  options?: LegacyShopOption[];
}

export interface LegacyShopCell {
  label: string;
  thColSpan: string;
  tdColSpan: string;
  controls: LegacyShopControl[];
}

export interface LegacyShopRow {
  cells: LegacyShopCell[];
}

export interface LegacyShopSection {
  caption: string;
  rows: LegacyShopRow[];
}

interface LegacyShopSchema {
  source: string;
  sections: LegacyShopSection[];
  namedControlCount: number;
}

export const legacyShopSchema =
  shopSchemaSource as unknown as LegacyShopSchema;
export const legacyShopSections = legacyShopSchema.sections;
const legacyShopTableControls = legacyShopSections.flatMap((section) =>
  section.rows.flatMap((row) =>
    row.cells.flatMap((cell) => cell.controls),
  ),
);

export const legacyShopSmsPresets = [
  { index: 1, title: "회원가입시 고객님께 발송" },
  { index: 2, title: "주문시 고객님께 발송" },
  { index: 3, title: "주문시 관리자에게 발송" },
  { index: 4, title: "입금확인시 고객님께 발송" },
  { index: 5, title: "상품배송시 고객님께 발송" },
] as const;

const legacyShopSmsPresetControls: LegacyShopControl[] =
  legacyShopSmsPresets.flatMap(({ index }) => [
    {
      key: `de_sms_use${index}`,
      name: `de_sms_use${index}`,
      type: "checkbox",
      id: `de_sms_use${index}`,
      value: "1",
      size: "",
      rows: "",
      cols: "",
      maxLength: "",
      provider: "",
      secret: false,
    },
    {
      key: `de_sms_cont${index}`,
      name: `de_sms_cont${index}`,
      type: "textarea",
      id: `de_sms_cont${index}`,
      value: "",
      size: "",
      rows: "",
      cols: "",
      maxLength: "2000",
      provider: "",
      secret: false,
    },
  ]);

export const legacyShopControls = [
  ...legacyShopTableControls,
  ...legacyShopSmsPresetControls,
];

export const legacyShopControlMap = new Map<string, LegacyShopControl>();
for (const control of legacyShopControls) {
  if (!legacyShopControlMap.has(control.key)) {
    legacyShopControlMap.set(control.key, control);
  }
}

export const legacyShopUniqueControls = Array.from(
  legacyShopControlMap.values(),
);

const numericControlPattern =
  /(?:_(?:mod|row|width|height|point|days|after|term|price|minimum|limit|list)|^de_settle_(?:min|max)_point$|^de_send_cost_(?:limit|list)$)/u;

export function isLegacyShopNumericControl(
  control: LegacyShopControl,
): boolean {
  return (
    control.type === "text" &&
    numericControlPattern.test(control.key)
  );
}

export function radioOptionsForLegacyShopControl(
  key: string,
): LegacyShopOption[] {
  return legacyShopControls
    .filter((control) => control.key === key && control.type === "radio")
    .map((control) => ({
      value: control.value,
      label: control.value === "1" ? "사용" : "사용안함",
    }));
}

const defaultOverrides: LegacyShopValues = {
  de_shop_skin: "basic",
  de_shop_mobile_skin: "basic",
  de_bank_use: "1",
  de_iche_use: "0",
  de_vbank_use: "0",
  de_hp_use: "0",
  de_card_use: "0",
  de_card_noint_use: "0",
  de_easy_pay_use: "0",
  de_taxsave_use: "0",
  cf_use_point: true,
  de_settle_min_point: 1_000,
  de_settle_max_point: 100_000_000,
  de_settle_point_unit: "100",
  de_card_point: "0",
  de_point_days: 0,
  de_pg_service: "",
  de_escrow_use: "0",
  de_card_test: "0",
  de_delivery_company: "",
  de_send_cost_case: "무료",
  de_send_cost_limit: 0,
  de_send_cost_list: 0,
  de_hope_date_use: "0",
  de_hope_date_after: 0,
  de_item_use_write: "0",
  de_item_use_use: "0",
  de_level_sell: "1",
  de_cart_keep_term: 15,
  de_guest_cart_use: true,
  de_member_reg_coupon_use: false,
  de_member_reg_coupon_price: 0,
  de_member_reg_coupon_minimum: 0,
  de_member_reg_coupon_term: 0,
  cf_sms_use: "",
  cf_sms_type: "",
  de_sms_cont1:
    "{이름}님의 회원가입을 축하드립니다.\nID:{회원아이디}\n{회사명}",
  de_sms_cont2:
    "{이름}님 주문해주셔서 고맙습니다.\n{주문번호}\n{주문금액}원\n{회사명}",
  de_sms_cont3:
    "{이름}님께서 주문하셨습니다.\n{주문번호}\n{주문금액}원\n{회사명}",
  de_sms_cont4:
    "{이름}님 입금 감사합니다.\n{입금액}원\n주문번호:\n{주문번호}\n{회사명}",
  de_sms_cont5:
    "{이름}님 배송합니다.\n택배:{택배회사}\n운송장번호:\n{운송장번호}\n{회사명}",
};

for (let index = 1; index <= 5; index += 1) {
  defaultOverrides[`de_type${index}_list_use`] = true;
  defaultOverrides[`de_type${index}_list_skin`] = "main.10.skin.php";
  defaultOverrides[`de_type${index}_list_mod`] = 3;
  defaultOverrides[`de_type${index}_list_row`] = 5;
  defaultOverrides[`de_type${index}_img_width`] = 600;
  defaultOverrides[`de_type${index}_img_height`] = 0;
  defaultOverrides[`de_mobile_type${index}_list_use`] = true;
  defaultOverrides[`de_mobile_type${index}_list_skin`] =
    "main.10.skin.php";
  defaultOverrides[`de_mobile_type${index}_list_mod`] = 2;
  defaultOverrides[`de_mobile_type${index}_list_row`] = 6;
  defaultOverrides[`de_mobile_type${index}_img_width`] = 600;
  defaultOverrides[`de_mobile_type${index}_img_height`] = 0;
}

Object.assign(defaultOverrides, {
  de_rel_list_skin: "relation.10.skin.php",
  de_rel_img_width: 600,
  de_rel_img_height: 0,
  de_rel_list_mod: 3,
  de_rel_list_use: true,
  de_mobile_rel_list_skin: "relation.10.skin.php",
  de_mobile_rel_img_width: 600,
  de_mobile_rel_img_height: 0,
  de_mobile_rel_list_mod: 2,
  de_mobile_rel_list_use: true,
  de_search_list_skin: "list.10.skin.php",
  de_search_img_width: 600,
  de_search_img_height: 0,
  de_search_list_mod: 3,
  de_search_list_row: 5,
  de_mobile_search_list_skin: "list.10.skin.php",
  de_mobile_search_img_width: 600,
  de_mobile_search_img_height: 0,
  de_mobile_search_list_mod: 2,
  de_mobile_search_list_row: 6,
  de_listtype_list_skin: "list.10.skin.php",
  de_listtype_img_width: 600,
  de_listtype_img_height: 0,
  de_listtype_list_mod: 3,
  de_listtype_list_row: 5,
  de_mobile_listtype_list_skin: "list.10.skin.php",
  de_mobile_listtype_img_width: 600,
  de_mobile_listtype_img_height: 0,
  de_mobile_listtype_list_mod: 2,
  de_mobile_listtype_list_row: 6,
  de_simg_width: 600,
  de_simg_height: 600,
  de_mimg_width: 600,
  de_mimg_height: 600,
});

export const defaultLegacyShopValues: LegacyShopValues =
  Object.fromEntries(
    legacyShopUniqueControls.map((control) => [
      control.key,
      defaultOverrides[control.key] ?? safeControlDefault(control),
    ]),
  );

function safeControlDefault(control: LegacyShopControl): LegacyShopValue {
  if (control.secret || control.type === "file") return "";
  if (control.type === "checkbox") return false;
  if (control.type === "radio") {
    return radioOptionsForLegacyShopControl(control.key).some(
      (option) => option.value === "0",
    )
      ? "0"
      : (radioOptionsForLegacyShopControl(control.key)[0]?.value ?? "");
  }
  if (control.type === "select") {
    const safe =
      control.options?.find(
        (option) =>
          option.value === "0" ||
          option.label.includes("사용안함") ||
          option.label.includes("없음"),
      ) ??
      control.options?.find((option) => option.value === "") ??
      control.options?.[0];
    return safe?.value ?? "";
  }
  if (isLegacyShopNumericControl(control)) return 0;
  return "";
}
