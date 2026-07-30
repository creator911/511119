export type LegacyAdminCategoryOption = {
  id: string;
  name: string;
};

/**
 * Original Kiel Gold administrator category-select order.
 *
 * The legacy shop does not sort this list by code or by the public navigation
 * hierarchy. Keeping the source order here makes every classic administrator
 * search screen show the same options while still allowing newly-created
 * categories to be appended by `mergeLegacyAdminCategoryOptions`.
 */
export const legacyAdminCategoryOptions: readonly LegacyAdminCategoryOption[] =
  [
    { id: "2010", name: "자사골드바" },
    { id: "4010", name: "고급형실버바" },
    { id: "5010", name: "돌반지" },
    { id: "6010", name: "목걸이" },
    { id: "7010", name: "목걸이" },
    { id: "8010", name: "실버쥬얼리" },
    { id: "9010", name: "소장품(동물)" },
    { id: "9110", name: "꼬냑다이아몬드" },
    { id: "2020", name: "LS-NIKKO골드바" },
    { id: "3020", name: "벽걸이형" },
    { id: "4020", name: "투자형실버바" },
    { id: "5020", name: "돌팔찌" },
    { id: "6020", name: "팔찌" },
    { id: "7020", name: "팔찌" },
    { id: "8020", name: "비스포크 반지" },
    { id: "9020", name: "골프" },
    { id: "9120", name: "랩다이아몬드" },
    { id: "2030", name: "십이지신 골드바" },
    { id: "3030", name: "멀티형" },
    { id: "5030", name: "돌목걸이" },
    { id: "6030", name: "귀걸이" },
    { id: "7030", name: "반지" },
    { id: "8030", name: "커플링" },
    { id: "9030", name: "소장품(모형)" },
    { id: "9130", name: "모이사나이트" },
    { id: "2040", name: "편지골드바" },
    { id: "3040", name: "창문형/이동식" },
    { id: "5040", name: "금수저" },
    { id: "6040", name: "반지" },
    { id: "7040", name: "펜던트" },
    { id: "9140", name: "지르코니아" },
    { id: "6050", name: "커플링" },
    { id: "6060", name: "쌍가락지" },
    { id: "6070", name: "펜던트" },
    { id: "10", name: "테마주얼리" },
    { id: "20", name: "골드바" },
    { id: "40", name: "실버바" },
    { id: "50", name: "돌선물" },
    { id: "60", name: "여성순금" },
    { id: "70", name: "남성순금" },
    { id: "80", name: "커플" },
    { id: "90", name: "기업&GIFT선물" },
    { id: "91", name: "웨딩" },
    { id: "30", name: "여름가전" },
  ];

export function mergeLegacyAdminCategoryOptions(
  categories: readonly LegacyAdminCategoryOption[],
): LegacyAdminCategoryOption[] {
  const knownIds = new Set(legacyAdminCategoryOptions.map((item) => item.id));
  return [
    ...legacyAdminCategoryOptions,
    ...categories.filter((item) => !knownIds.has(item.id)),
  ];
}
