"use client";

import {
  type MouseEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import Link from "next/link";

export interface AdminNavItem {
  id: string;
  label: string;
  href?: string;
  icon?: ReactNode;
  count?: number | string;
  disabled?: boolean;
}

export interface AdminNavGroup {
  id: string;
  code?: string;
  label: string;
  items: AdminNavItem[];
}

export interface AdminUtilityAction {
  id: string;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  mobileVisible?: boolean;
  pressed?: boolean;
}

export const KIEL_ADMIN_NAVIGATION: AdminNavGroup[] = [
  {
    id: "group-100",
    code: "100",
    label: "환경설정",
    items: [
      {
        id: "item-100-basic-settings",
        label: "기본환경설정",
        href: "/adm/settings",
      },
      {
        id: "item-100-admin-permissions",
        label: "관리권한설정",
        href: "/adm/settings?view=permissions",
      },
      {
        id: "item-100-theme-settings",
        label: "테마설정",
        href: "/adm/tools/theme-settings",
      },
      {
        id: "item-100-menu-settings",
        label: "메뉴설정",
        href: "/adm/tools/menu-settings",
      },
      {
        id: "item-100-mail-test",
        label: "메일 테스트",
        href: "/adm/tools/mail-test",
      },
      {
        id: "item-100-popup-layers",
        label: "팝업레이어관리",
        href: "/adm/tools/popup-layers",
      },
      {
        id: "item-100-session-files-delete",
        label: "세션파일 일괄삭제",
        href: "/adm/tools/session-files-delete",
      },
      {
        id: "item-100-cache-files-delete",
        label: "캐시파일 일괄삭제",
        href: "/adm/tools/cache-files-delete",
      },
      {
        id: "item-100-captcha-files-delete",
        label: "캡챠파일 일괄삭제",
        href: "/adm/tools/captcha-files-delete",
      },
      {
        id: "item-100-thumbnail-files-delete",
        label: "썸네일파일 일괄삭제",
        href: "/adm/tools/thumbnail-files-delete",
      },
      {
        id: "item-100-phpinfo",
        label: "phpinfo()",
        href: "/adm/tools/phpinfo",
      },
      {
        id: "item-100-browscap-update",
        label: "Browscap 업데이트",
        href: "/adm/tools/browscap-update",
      },
      {
        id: "item-100-access-log-convert",
        label: "접속로그 변환",
        href: "/adm/tools/access-log-convert",
      },
      {
        id: "item-100-db-upgrade",
        label: "DB업그레이드",
        href: "/adm/tools/db-upgrade",
      },
      {
        id: "item-100-additional-services",
        label: "부가서비스",
        href: "/adm/tools/additional-services",
      },
    ],
  },
  {
    id: "group-200",
    code: "200",
    label: "회원관리",
    items: [
      {
        id: "item-200-members",
        label: "회원관리",
        href: "/adm/users",
      },
      {
        id: "item-200-visitor-search",
        label: "접속자검색",
        href: "/adm/tools/visitor-search",
      },
      {
        id: "item-200-points",
        label: "포인트관리",
        href: "/adm/reports?view=points",
      },
      {
        id: "item-200-charge-requests",
        label: "충전신청",
        href: "/adm/wallet?kind=charge",
      },
      {
        id: "item-200-exchange-requests",
        label: "환전신청",
        href: "/adm/wallet?kind=withdrawal",
      },
    ],
  },
  {
    id: "group-300",
    code: "300",
    label: "게시판관리",
    items: [
      {
        id: "item-300-boards",
        label: "게시판관리",
        href: "/adm/community?view=boards",
      },
      {
        id: "item-300-board-groups",
        label: "게시판그룹관리",
        href: "/adm/community?view=groups",
      },
      {
        id: "item-300-inquiry-settings",
        label: "1:1문의설정",
        href: "/adm/community?view=inquiry-settings",
      },
      {
        id: "item-300-content",
        label: "내용관리",
        href: "/adm/content",
      },
      {
        id: "item-300-post-comment-status",
        label: "글,댓글 현황",
        href: "/adm/community?view=posts",
      },
    ],
  },
  {
    id: "group-330",
    code: "330",
    label: "검색엔진최적화",
    items: [
      {
        id: "item-330-meta-tags",
        label: "메타태그관리",
        href: "/adm/tools/meta-tags",
      },
    ],
  },
  {
    id: "group-350",
    code: "350",
    label: "소모임 관리",
    items: [
      {
        id: "item-350-club-settings",
        label: "소모임 기본설정",
        href: "/adm/tools/club-settings",
      },
      {
        id: "item-350-approved-clubs",
        label: "정식 소모임 리스트",
        href: "/adm/tools/approved-clubs",
      },
      {
        id: "item-350-club-applications",
        label: "미개설 신청 리스트",
        href: "/adm/tools/club-applications",
      },
    ],
  },
  {
    id: "group-400",
    code: "400",
    label: "쇼핑몰관리",
    items: [
      {
        id: "item-400-shop-overview",
        label: "쇼핑몰현황",
        href: "/adm/shop-overview",
      },
      {
        id: "item-400-shop-settings",
        label: "쇼핑몰설정",
        href: "/adm/settings?view=shop",
      },
      {
        id: "item-400-orders",
        label: "주문내역",
        href: "/adm/orders",
      },
      {
        id: "item-400-personal-payments",
        label: "개인결제관리",
        href: "/adm/tools/personal-payments",
      },
      {
        id: "item-400-categories",
        label: "분류관리",
        href: "/adm/categories",
      },
      {
        id: "item-400-products",
        label: "상품관리",
        href: "/adm/products",
      },
      {
        id: "item-400-product-inquiries",
        label: "상품문의",
        href: "/adm/content?view=inquiries",
      },
      {
        id: "item-400-reviews",
        label: "사용후기",
        href: "/adm/content?view=reviews",
      },
      {
        id: "item-400-product-stock",
        label: "상품재고관리",
        href: "/adm/tools/product-stock",
      },
      {
        id: "item-400-product-types",
        label: "상품유형관리",
        href: "/adm/tools/product-types",
      },
      {
        id: "item-400-product-option-stock",
        label: "상품옵션재고관리",
        href: "/adm/tools/product-option-stock",
      },
      {
        id: "item-400-coupons",
        label: "쿠폰관리",
        href: "/adm/tools/coupons",
      },
      {
        id: "item-400-coupon-zone",
        label: "쿠폰존관리",
        href: "/adm/tools/coupon-zone",
      },
      {
        id: "item-400-additional-shipping",
        label: "추가배송비관리",
        href: "/adm/tools/additional-shipping",
      },
      {
        id: "item-400-incomplete-orders",
        label: "미완료주문",
        href: "/adm/reports?view=incomplete",
      },
    ],
  },
  {
    id: "group-500",
    code: "500",
    label: "쇼핑몰현황/기타",
    items: [
      {
        id: "item-500-sales",
        label: "매출현황",
        href: "/adm/reports?view=sales",
      },
      {
        id: "item-500-product-ranking",
        label: "상품판매순위",
        href: "/adm/reports?view=ranking",
      },
      {
        id: "item-500-order-print",
        label: "주문내역출력",
        href: "/adm/tools/order-print",
      },
      {
        id: "item-500-restock-sms",
        label: "재입고SMS알림",
        href: "/adm/tools/restock-sms",
      },
      {
        id: "item-500-events",
        label: "이벤트관리",
        href: "/adm/tools/events",
      },
      {
        id: "item-500-event-bulk",
        label: "이벤트일괄처리",
        href: "/adm/tools/event-bulk",
      },
      {
        id: "item-500-banners",
        label: "배너관리",
        href: "/adm/banners",
      },
      {
        id: "item-500-saved-items",
        label: "보관함현황",
        href: "/adm/tools/saved-items",
      },
      {
        id: "item-500-price-comparison",
        label: "가격비교사이트",
        href: "/adm/tools/price-comparison",
      },
    ],
  },
  {
    id: "group-650",
    code: "650",
    label: "m3cron 관리",
    items: [
      {
        id: "item-650-m3cron-settings",
        label: "m3cron 설정",
        href: "/adm/tools/m3cron-settings",
      },
      {
        id: "item-650-m3cron-logs",
        label: "m3cron 로그",
        href: "/adm/tools/m3cron-logs",
      },
    ],
  },
  {
    id: "group-900",
    code: "900",
    label: "SMS 관리",
    items: [
      {
        id: "item-900-sms-settings",
        label: "SMS 기본설정",
        href: "/adm/tools/sms-settings",
      },
      {
        id: "item-900-member-sync",
        label: "회원정보업데이트",
        href: "/adm/tools/sms-member-sync",
      },
      {
        id: "item-900-send",
        label: "문자 보내기",
        href: "/adm/tools/sms-send",
      },
      {
        id: "item-900-history-message",
        label: "전송내역-건별",
        href: "/adm/tools/sms-history-message",
      },
      {
        id: "item-900-history-number",
        label: "전송내역-번호별",
        href: "/adm/tools/sms-history-number",
      },
      {
        id: "item-900-emoticon-groups",
        label: "이모티콘 그룹",
        href: "/adm/tools/sms-emoticon-groups",
      },
      {
        id: "item-900-emoticons",
        label: "이모티콘 관리",
        href: "/adm/tools/sms-emoticons",
      },
      {
        id: "item-900-phone-groups",
        label: "휴대폰번호 그룹",
        href: "/adm/tools/sms-phone-groups",
      },
      {
        id: "item-900-phones",
        label: "휴대폰번호 관리",
        href: "/adm/tools/sms-phones",
      },
      {
        id: "item-900-phone-file",
        label: "휴대폰번호 파일",
        href: "/adm/tools/sms-phone-file",
      },
    ],
  },
  {
    id: "group-999",
    code: "999",
    label: "이윰관리자모드",
    items: [
      {
        id: "item-999-eyoom-admin",
        label: "이윰관리자 바로가기",
        href: "/adm/tools/eyoom-admin-link",
      },
    ],
  },
];

export const KIEL_ADMIN_UTILITY_ACTIONS: AdminUtilityAction[] = [];

const KIEL_ADMIN_QUICK_LINKS: AdminNavItem[] = [
  {
    id: "item-200-members",
    label: "회원관리",
    href: "/adm/users",
  },
  {
    id: "item-200-points",
    label: "포인트관리",
    href: "/adm/reports?view=points",
  },
  {
    id: "item-200-charge-requests",
    label: "충전신청",
    href: "/adm/wallet?kind=charge",
  },
  {
    id: "item-200-exchange-requests",
    label: "환전신청",
    href: "/adm/wallet?kind=withdrawal",
  },
];

export interface AdminShellProps {
  children: ReactNode;
  navigation?: AdminNavGroup[];
  activeNavId?: string;
  brand?: string;
  brandCaption?: string;
  brandMark?: ReactNode;
  pageTitle?: string;
  pageDescription?: string;
  breadcrumb?: string[];
  pageActions?: ReactNode;
  userName?: string;
  userRole?: string;
  sidebarCaption?: string;
  sidebarFooter?: ReactNode;
  utilityActions?: AdminUtilityAction[];
  onNavigate?: (item: AdminNavItem) => void;
  onLogout?: () => void;
}

function findActiveGroupId(
  navigation: AdminNavGroup[],
  activeNavId?: string,
) {
  return (
    navigation.find((group) =>
      group.items.some((item) => item.id === activeNavId),
    )?.id ??
    navigation[0]?.id ??
    ""
  );
}

export function AdminShell({
  children,
  navigation = KIEL_ADMIN_NAVIGATION,
  activeNavId,
  brand = "ADMINISTRATOR",
  pageTitle = "관리자 메인",
  pageDescription,
  breadcrumb,
  pageActions,
  userName = "admin",
  userRole = "Administrator",
  sidebarFooter,
  utilityActions = KIEL_ADMIN_UTILITY_ACTIONS,
  onNavigate,
  onLogout,
}: AdminShellProps) {
  const [menuCompact, setMenuCompact] = useState(false);
  const [openGroupId, setOpenGroupId] = useState<string | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLLIElement>(null);
  const visibleGroupId =
    openGroupId ?? findActiveGroupId(navigation, activeNavId) ?? navigation[0]?.id;

  useEffect(() => {
    function closeAccountOnOutsideClick(event: PointerEvent) {
      if (
        accountRef.current &&
        !accountRef.current.contains(event.target as Node)
      ) {
        setAccountOpen(false);
      }
    }

    function closeAccountOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setAccountOpen(false);
    }

    document.addEventListener("pointerdown", closeAccountOnOutsideClick);
    document.addEventListener("keydown", closeAccountOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeAccountOnOutsideClick);
      document.removeEventListener("keydown", closeAccountOnEscape);
    };
  }, []);

  function handleNavigation(
    event: MouseEvent<HTMLAnchorElement>,
    item: AdminNavItem,
  ) {
    if (item.disabled) {
      event.preventDefault();
      return;
    }
    if (onNavigate) {
      event.preventDefault();
      onNavigate(item);
    }
    setAccountOpen(false);
  }

  return (
    <div className="kiel-legacy-admin">
      <div id="to_content">
        <a href="#container_wr">본문 바로가기</a>
      </div>

      <div id="wrapper">
        <header id="hd">
          <h1>{brand}</h1>
          <div id="hd_top">
            <div id="logo">
              <Link href="/adm" aria-label="GOLDRIAN 관리자 메인">
                <span className="adminBrandLogo">GOLDRIAN</span>
              </Link>
            </div>
            <button
              type="button"
              id="btn_gnb"
              className={menuCompact ? "btn_gnb_open" : undefined}
              aria-label={menuCompact ? "관리자 메뉴 펼치기" : "관리자 메뉴 접기"}
              aria-expanded={!menuCompact}
              onClick={() => setMenuCompact((current) => !current)}
            >
              메뉴
            </button>

            <nav id="admin_quick_links" aria-label="자주 쓰는 회원관리">
              <ul>
                {KIEL_ADMIN_QUICK_LINKS.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={item.href!}
                      aria-current={
                        activeNavId === item.id ? "page" : undefined
                      }
                      onClick={(event) => handleNavigation(event, item)}
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>

            <nav id="tnb" aria-label="관리자 바로가기">
              <ul>
                <li>
                  <Link className="tnb_shop" href="/shop">
                    쇼핑몰 바로가기
                  </Link>
                </li>
                <li>
                  <Link className="tnb_community" href="/">
                    커뮤니티 바로가기
                  </Link>
                </li>
                <li>
                  <Link
                    className="tnb_service"
                    href="/adm/tools/additional-services"
                  >
                    부가서비스
                  </Link>
                </li>
                {utilityActions.map((action) => (
                  <li key={action.id}>
                    <button
                      type="button"
                      className="tnb_service kiel-extra-utility"
                      disabled={action.disabled || !action.onClick}
                      aria-pressed={action.pressed}
                      onClick={action.onClick}
                    >
                      {action.label}
                    </button>
                  </li>
                ))}
                <li ref={accountRef}>
                  <button
                    type="button"
                    className="tnb_mb_button"
                    aria-haspopup="menu"
                    aria-expanded={accountOpen}
                    onClick={() => setAccountOpen((current) => !current)}
                  >
                    {userName}
                    <span aria-hidden="true">메뉴열기</span>
                  </button>
                  <div
                    className={`tnb_mb_area${accountOpen ? " open" : ""}`}
                    role="menu"
                  >
                    <ul>
                      <li role="none">
                        <Link
                          href="/adm/settings?view=permissions"
                          role="menuitem"
                        >
                          관리자정보
                        </Link>
                      </li>
                      <li role="none">
                        <button
                          type="button"
                          className="tnb_logout"
                          role="menuitem"
                          disabled={!onLogout}
                          onClick={() => {
                            setAccountOpen(false);
                            onLogout?.();
                          }}
                        >
                          로그아웃
                        </button>
                      </li>
                    </ul>
                  </div>
                </li>
              </ul>
            </nav>
          </div>
        </header>

        <nav
          id="gnb"
          className={menuCompact ? "gnb_small" : undefined}
          aria-label="관리자 주 메뉴"
        >
          <h2>관리자 주 메뉴</h2>
          <ul className="gnb_ul">
            {navigation.map((group) => {
              const groupOpen = group.id === visibleGroupId;
              const menuCode = group.code ?? group.id.replace(/\D/g, "");

              return (
                <li
                  className={`gnb_li${groupOpen ? " on" : ""}`}
                  key={group.id}
                >
                  <button
                    type="button"
                    className={`btn_op menu-${menuCode}`}
                    title={group.label}
                    aria-label={group.label}
                    aria-expanded={groupOpen && !menuCompact}
                    aria-controls={`gnb-${menuCode}`}
                    onClick={() => {
                      setOpenGroupId(group.id);
                      if (menuCompact) setMenuCompact(false);
                    }}
                  >
                    {group.label}
                  </button>
                  <div
                    id={`gnb-${menuCode}`}
                    className="gnb_oparea"
                    aria-hidden={!groupOpen && !menuCompact}
                  >
                    <h3>{group.label}</h3>
                    <ul>
                      {group.items.map((item) => {
                        const active = item.id === activeNavId;
                        return (
                          <li key={item.id}>
                            {item.href && !item.disabled ? (
                              <Link
                                href={item.href}
                                className={active ? "on" : undefined}
                                aria-current={active ? "page" : undefined}
                                onClick={(event) =>
                                  handleNavigation(event, item)
                                }
                              >
                                {item.label}
                                {item.count !== undefined ? (
                                  <span className="gnb_count">
                                    {item.count}
                                  </span>
                                ) : null}
                              </Link>
                            ) : (
                              <button
                                type="button"
                                className={active ? "on" : undefined}
                                disabled={item.disabled || !onNavigate}
                                onClick={() => onNavigate?.(item)}
                              >
                                {item.label}
                              </button>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </li>
              );
            })}
          </ul>
        </nav>

        <main
          id="container"
          className={menuCompact ? "container-small" : undefined}
        >
          <h1 id="container_title">{pageTitle}</h1>
          <div id="container_wr">
            {breadcrumb?.length ? (
              <ol className="sound_only" aria-label="현재 위치">
                {breadcrumb.map((item, index) => (
                  <li key={`${item}-${index}`}>{item}</li>
                ))}
              </ol>
            ) : null}
            {pageDescription ? (
              <p className="sound_only">{pageDescription}</p>
            ) : null}
            <p className="sound_only">{userRole}</p>
            {pageActions ? (
              <div className="btn_fixed_top">{pageActions}</div>
            ) : null}
            {children}
          </div>
          <footer id="ft">
            {sidebarFooter ?? (
              <p>Copyright © GOLDRIAN. All rights reserved.</p>
            )}
          </footer>
        </main>
      </div>
    </div>
  );
}
