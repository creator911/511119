import type { NavigationItem } from "./types";

/**
 * Relative routes only. Applications may replace this list when their route
 * scheme differs.
 */
export const kielNavigation: NavigationItem[] = [
  { id: "home", label: "HOME", href: "/shop" },
  {
    id: "theme",
    label: "테마주얼리",
    href: "/shop/list.php?ca_id=10",
  },
  {
    id: "gold-bar",
    label: "골드바",
    href: "/shop/list.php?ca_id=20",
    children: [
      {
        id: "gold-bar-house",
        label: "자사골드바",
        href: "/shop/list.php?ca_id=2010",
      },
      {
        id: "gold-bar-zodiac",
        label: "십이지신 골드바",
        href: "/shop/list.php?ca_id=2030",
      },
    ],
  },
  {
    id: "silver-bar",
    label: "실버바",
    href: "/shop/list.php?ca_id=40",
    children: [
      {
        id: "silver-premium",
        label: "고급형실버바",
        href: "/shop/list.php?ca_id=4010",
      },
      {
        id: "silver-investment",
        label: "투자형실버바",
        href: "/shop/list.php?ca_id=4020",
      },
    ],
  },
  {
    id: "first-birthday",
    label: "돌선물",
    href: "/shop/list.php?ca_id=50",
    children: [
      {
        id: "first-birthday-bracelet",
        label: "돌팔찌",
        href: "/shop/list.php?ca_id=5020",
      },
      {
        id: "first-birthday-spoon",
        label: "금수저",
        href: "/shop/list.php?ca_id=5040",
      },
    ],
  },
  {
    id: "women",
    label: "여성순금",
    href: "/shop/list.php?ca_id=60",
    children: [
      {
        id: "women-necklace",
        label: "목걸이",
        href: "/shop/list.php?ca_id=6010",
      },
      {
        id: "women-bracelet",
        label: "팔찌",
        href: "/shop/list.php?ca_id=6020",
      },
      {
        id: "women-earring",
        label: "귀걸이",
        href: "/shop/list.php?ca_id=6030",
      },
      {
        id: "women-ring",
        label: "반지",
        href: "/shop/list.php?ca_id=6040",
      },
      {
        id: "women-pendant",
        label: "펜던트",
        href: "/shop/list.php?ca_id=6070",
      },
    ],
  },
  {
    id: "men",
    label: "남성순금",
    href: "/shop/list.php?ca_id=70",
    children: [
      {
        id: "men-necklace",
        label: "목걸이",
        href: "/shop/list.php?ca_id=7010",
      },
      {
        id: "men-bracelet",
        label: "팔찌",
        href: "/shop/list.php?ca_id=7020",
      },
      {
        id: "men-ring",
        label: "반지",
        href: "/shop/list.php?ca_id=7030",
      },
      {
        id: "men-pendant",
        label: "펜던트",
        href: "/shop/list.php?ca_id=7040",
      },
    ],
  },
  {
    id: "couple",
    label: "커플",
    href: "/shop/list.php?ca_id=80",
    children: [
      {
        id: "couple-ring",
        label: "커플링",
        href: "/shop/list.php?ca_id=8030",
      },
    ],
  },
  {
    id: "gift",
    label: "기업&GIFT선물",
    href: "/shop/list.php?ca_id=90",
    children: [
      {
        id: "gift-collectible",
        label: "소장품(동물)",
        href: "/shop/list.php?ca_id=9010",
      },
      {
        id: "gift-golf",
        label: "골프",
        href: "/shop/list.php?ca_id=9020",
      },
    ],
  },
  {
    id: "wedding",
    label: "웨딩",
    href: "/shop/list.php?ca_id=91",
    children: [
      {
        id: "wedding-cognac",
        label: "꼬냑다이아몬드",
        href: "/shop/list.php?ca_id=9110",
      },
      {
        id: "wedding-lab",
        label: "랩다이아몬드",
        href: "/shop/list.php?ca_id=9120",
      },
      {
        id: "wedding-moissanite",
        label: "모이사나이트",
        href: "/shop/list.php?ca_id=9130",
      },
      {
        id: "wedding-zirconia",
        label: "지르코니아",
        href: "/shop/list.php?ca_id=9140",
      },
    ],
  },
];

export const kielProductTypeLinks = [
  { label: "히트상품", href: "/shop/listtype.php?type=1" },
  { label: "추천상품", href: "/shop/listtype.php?type=2" },
  { label: "최신상품", href: "/shop/listtype.php?type=3" },
  { label: "인기상품", href: "/shop/listtype.php?type=4" },
  { label: "할인상품", href: "/shop/listtype.php?type=5" },
];
