"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./Storefront.module.css";
import type {
  HeaderUtilityLink,
  LocalAssetPath,
  NavigationItem,
} from "./types";
import { classNames } from "./utils";

const defaultUtilityLinks: HeaderUtilityLink[] = [
  { label: "회원가입", href: "/bbs/register.php", icon: "user" },
  { label: "로그인", href: "/bbs/login.php", icon: "lock" },
];

const defaultExtraLinks: HeaderUtilityLink[] = [
  { label: "장바구니", href: "/shop/cart.php", icon: "cart" },
  { label: "위시리스트", href: "/shop/wishlist.php", icon: "heart" },
  { label: "주문/배송조회", href: "/shop/orderinquiry.php", icon: "order" },
  { label: "충전신청", href: "/bbs/writecz.php", icon: "wallet" },
  { label: "출금신청", href: "/bbs/cashtx.php", icon: "wallet" },
  { label: "출금내역", href: "/bbs/withdrawal_list.php", icon: "wallet" },
];

const utilityGlyph: Record<NonNullable<HeaderUtilityLink["icon"]>, string> = {
  user: "\uf234",
  lock: "\uf13e",
  plus: "\uf055",
  cart: "\uf07a",
  heart: "\uf004",
  order: "\uf15c",
  wallet: "\uf555",
};

const CART_KEY = "kg_cart_v1";
const CUSTOMER_SESSION_EVENT = "kg-customer-session-change";
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function readStoredArray<T>(key: string): T[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return Array.isArray(value) ? (value as T[]) : [];
  } catch {
    return [];
  }
}

export interface StorefrontHeaderProps {
  logo: LocalAssetPath;
  mobileLogo?: LocalAssetPath;
  brandName?: string;
  homeHref?: string;
  navigation: NavigationItem[];
  quickProductLinks?: Array<{ label: string; href: string }>;
  utilityLinks?: HeaderUtilityLink[];
  extraLinks?: HeaderUtilityLink[];
  activeHref?: string;
  searchAction?: string;
  searchPlaceholder?: string;
  cartCount?: number;
  wishCount?: number;
}

export function StorefrontHeader({
  logo,
  mobileLogo,
  brandName = "골드리안(GOLDRIAN)",
  homeHref = "/shop",
  navigation,
  quickProductLinks = [],
  utilityLinks = defaultUtilityLinks,
  extraLinks = defaultExtraLinks,
  activeHref,
  searchAction = "/shop/search.php",
  searchPlaceholder = "검색어를 입력하세요",
  cartCount: initialCartCount = 0,
  wishCount: initialWishCount = 0,
}: StorefrontHeaderProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [cartCount, setCartCount] = useState(initialCartCount);
  const [wishCount, setWishCount] = useState(initialWishCount);
  const [customerSession, setCustomerSession] = useState<{
    status: "loading" | "guest" | "member";
    memberName?: string;
  }>({ status: "loading" });
  const [adminSession, setAdminSession] = useState<{
    status: "loading" | "guest" | "admin";
    username?: string;
  }>({ status: "loading" });
  const [editMode, setEditMode] = useState(false);
  const [expandedMobileItems, setExpandedMobileItems] = useState<Set<string>>(
    new Set(),
  );
  const searchInputRef = useRef<HTMLInputElement>(null);
  const mobileDrawerRef = useRef<HTMLElement>(null);
  const mobileCloseButtonRef = useRef<HTMLButtonElement>(null);
  const searchOverlayRef = useRef<HTMLDivElement>(null);
  const focusReturnRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!mobileOpen && !searchOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const activeContainer = mobileOpen
      ? mobileDrawerRef.current
      : searchOverlayRef.current;
    window.setTimeout(() => {
      if (mobileOpen) mobileCloseButtonRef.current?.focus();
      else searchInputRef.current?.focus();
    }, 0);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileOpen(false);
        setSearchOpen(false);
        return;
      }
      if (event.key !== "Tab" || !activeContainer) return;
      const focusable = Array.from(
        activeContainer.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter(
        (element) =>
          !element.hidden &&
          element.getAttribute("aria-hidden") !== "true" &&
          element.getClientRects().length > 0,
      );
      if (focusable.length === 0) {
        event.preventDefault();
        activeContainer.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      focusReturnRef.current?.focus();
      focusReturnRef.current = null;
    };
  }, [mobileOpen, searchOpen]);

  useEffect(() => {
    const refreshCommerceCounts = () => {
      setCartCount(
        readStoredArray(CART_KEY).length,
      );
    };

    refreshCommerceCounts();
    window.addEventListener("storage", refreshCommerceCounts);
    window.addEventListener("kg-commerce-change", refreshCommerceCounts);
    return () => {
      window.removeEventListener("storage", refreshCommerceCounts);
      window.removeEventListener(
        "kg-commerce-change",
        refreshCommerceCounts,
      );
    };
  }, []);

  useEffect(() => {
    let disposed = false;

    const refreshCustomerSession = async () => {
      try {
        const response = await fetch("/api/customer/session", {
          cache: "no-store",
        });
        const result = response.ok
          ? ((await response.json()) as {
              user?: { name?: string } | null;
            })
          : { user: null };
        if (disposed) return;
        setCustomerSession(
          result.user
            ? {
                status: "member",
                memberName: result.user.name || "회원",
              }
            : { status: "guest" },
        );
        if (result.user) {
          const wishlistResponse = await fetch("/api/customer/wishlist", {
            cache: "no-store",
          });
          const wishlist = wishlistResponse.ok
            ? ((await wishlistResponse.json()) as { productIds?: string[] })
            : {};
          if (!disposed) {
            setWishCount(
              Array.isArray(wishlist.productIds)
                ? wishlist.productIds.length
                : 0,
            );
          }
        } else {
          setWishCount(0);
        }
      } catch {
        if (!disposed) setCustomerSession({ status: "guest" });
      }
    };
    const handleRefresh = () => void refreshCustomerSession();

    void refreshCustomerSession();
    window.addEventListener(CUSTOMER_SESSION_EVENT, handleRefresh);
    window.addEventListener("kg-wishlist-change", handleRefresh);
    window.addEventListener("focus", handleRefresh);
    window.addEventListener("pageshow", handleRefresh);
    return () => {
      disposed = true;
      window.removeEventListener(CUSTOMER_SESSION_EVENT, handleRefresh);
      window.removeEventListener("kg-wishlist-change", handleRefresh);
      window.removeEventListener("focus", handleRefresh);
      window.removeEventListener("pageshow", handleRefresh);
    };
  }, []);

  useEffect(() => {
    let disposed = false;

    const refreshAdminSession = async () => {
      try {
        const response = await fetch("/api/admin/session", {
          cache: "no-store",
        });
        const result = response.ok
          ? ((await response.json()) as {
              authenticated?: boolean;
              user?: { username?: string } | null;
            })
          : { authenticated: false, user: null };
        if (disposed) return;
        setAdminSession(
          result.authenticated
            ? {
                status: "admin",
                username: result.user?.username || "관리자",
              }
            : { status: "guest" },
        );
        if (!result.authenticated) setEditMode(false);
      } catch {
        if (!disposed) {
          setAdminSession({ status: "guest" });
          setEditMode(false);
        }
      }
    };
    const handleRefresh = () => void refreshAdminSession();

    void refreshAdminSession();
    window.addEventListener("focus", handleRefresh);
    window.addEventListener("pageshow", handleRefresh);
    return () => {
      disposed = true;
      window.removeEventListener("focus", handleRefresh);
      window.removeEventListener("pageshow", handleRefresh);
    };
  }, []);

  useEffect(() => {
    if (adminSession.status === "admin" && editMode) {
      document.documentElement.dataset.siteEditMode = "true";
    } else {
      delete document.documentElement.dataset.siteEditMode;
    }
    return () => {
      delete document.documentElement.dataset.siteEditMode;
    };
  }, [adminSession.status, editMode]);

  async function logout() {
    try {
      const responses = await Promise.all([
        ...(customerSession.status === "member"
          ? [
              fetch("/api/customer/session", {
                method: "DELETE",
              }),
            ]
          : []),
        ...(adminSession.status === "admin"
          ? [
              fetch("/api/admin/session", {
                method: "DELETE",
              }),
            ]
          : []),
      ]);
      if (responses.some((response) => !response.ok)) return;
      setCustomerSession({ status: "guest" });
      setAdminSession({ status: "guest" });
      setEditMode(false);
      window.dispatchEvent(new CustomEvent(CUSTOMER_SESSION_EVENT));
      window.location.assign(homeHref);
    } catch {
      // Keep the member controls visible when the server could not clear the cookie.
    }
  }

  function toggleMobileItem(id: string) {
    setExpandedMobileItems((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <>
      <a className={styles.skipLink} href="#main-content">
        본문 바로가기
      </a>
      <header className={styles.header}>
        <div className={styles.topHeader}>
          <div className={classNames(styles.container, styles.topHeaderInner)}>
            {adminSession.status === "admin" ? (
              <div className={styles.adminEditMode}>
                <span aria-hidden="true" className={styles.adminEditIcon} />
                <span>편집모드</span>
                <button
                  type="button"
                  role="switch"
                  aria-label="쇼핑몰 편집모드"
                  aria-checked={editMode}
                  className={styles.adminEditSwitch}
                  onClick={() => setEditMode((current) => !current)}
                >
                  <span />
                </button>
              </div>
            ) : (
              <span className={styles.topHeaderWelcome}>GOLDRIAN JEWELRY</span>
            )}
            <nav className={styles.utilityNav} aria-label="회원 메뉴">
              {adminSession.status === "admin" ? (
                <>
                  <a href="/adm">
                    <span
                      aria-hidden="true"
                      className={styles.adminUtilityIcon}
                    >
                      {"\uf013"}
                    </span>
                    관리자
                  </a>
                  <a href="/shop/mypage.php">
                    <span
                      aria-hidden="true"
                      className={styles.regularUtilityIcon}
                    >
                      {"\uf2bd"}
                    </span>
                    마이쇼핑
                  </a>
                  <button type="button" onClick={() => void logout()}>
                    <span aria-hidden="true">{"\uf2f5"}</span>
                    로그아웃
                  </button>
                </>
              ) : customerSession.status === "member" ? (
                <>
                  <a href="/shop/mypage.php">
                    <span aria-hidden="true">{utilityGlyph.user}</span>
                    {customerSession.memberName}님
                  </a>
                  <a href="/shop/mypage.php">
                    <span aria-hidden="true">{utilityGlyph.user}</span>
                    마이페이지
                  </a>
                  <button type="button" onClick={() => void logout()}>
                    <span aria-hidden="true">{utilityGlyph.lock}</span>
                    로그아웃
                  </button>
                </>
              ) : (
                utilityLinks.map((link) => (
                  <a href={link.href} key={`${link.label}-${link.href}`}>
                    {link.icon ? (
                      <span aria-hidden="true">{utilityGlyph[link.icon]}</span>
                    ) : null}
                    {link.label}
                  </a>
                ))
              )}
              <details className={styles.extraMenu}>
                <summary>
                  <span aria-hidden="true">{utilityGlyph.plus}</span>
                  추가메뉴
                </summary>
                <div className={styles.extraMenuList}>
                  {extraLinks.map((link) => (
                    <a href={link.href} key={`${link.label}-${link.href}`}>
                      {link.label}
                    </a>
                  ))}
                </div>
              </details>
            </nav>
          </div>
        </div>

        <div className={styles.logoRow}>
          <div className={styles.container}>
            <a className={styles.logoLink} href={homeHref} aria-label={`${brandName} 홈`}>
              <picture>
                {mobileLogo ? (
                  <source media="(max-width: 767px)" srcSet={mobileLogo} />
                ) : null}
                <img src={logo} alt={brandName} />
              </picture>
            </a>
            <div className={styles.mobileHeaderButtons}>
              <button
                type="button"
                onClick={(event) => {
                  focusReturnRef.current = event.currentTarget;
                  setMobileOpen(false);
                  setSearchOpen(true);
                }}
                aria-label="검색 열기"
              >
                <span className={styles.searchGlyph} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={(event) => {
                  focusReturnRef.current = event.currentTarget;
                  setSearchOpen(false);
                  setMobileOpen(true);
                }}
                aria-label="전체 메뉴 열기"
                aria-expanded={mobileOpen}
                aria-controls="storefront-mobile-drawer"
              >
                <span aria-hidden="true">☰</span>
              </button>
            </div>
          </div>
        </div>

        <div className={styles.navWrap}>
          <div className={classNames(styles.container, styles.desktopNavInner)}>
            <nav className={styles.desktopNav} aria-label="주요 메뉴">
              <ul>
                {navigation.filter((item) => item.usePc !== false).map((item) => (
                  <li
                    key={item.id}
                    className={item.children?.length ? styles.hasDropdown : undefined}
                  >
                    <a
                      href={item.href}
                      target={item.newWindow ? "_blank" : undefined}
                      rel={item.newWindow ? "noopener noreferrer" : undefined}
                      className={
                        activeHref === item.href ? styles.activeNavLink : undefined
                      }
                    >
                      {item.label}
                      {item.children?.length ? (
                        <span className={styles.navChevron} aria-hidden="true" />
                      ) : null}
                    </a>
                    {item.children?.length ? (
                      <ul className={styles.desktopDropdown}>
                        {item.children.map((child) => (
                          <li key={child.id}>
                            <a
                              href={child.href}
                              className={
                                activeHref === child.href
                                  ? styles.activeNavLink
                                  : undefined
                              }
                            >
                              {child.label}
                            </a>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ul>
            </nav>
            <button
              className={styles.desktopSearchButton}
              type="button"
              onClick={(event) => {
                focusReturnRef.current = event.currentTarget;
                setMobileOpen(false);
                setSearchOpen(true);
              }}
              aria-label="검색 열기"
            >
              <span className={styles.searchGlyph} aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      {mobileOpen ? (
        <div
          className={styles.drawerBackdrop}
          role="presentation"
          onMouseDown={() => setMobileOpen(false)}
        >
          <aside
            ref={mobileDrawerRef}
            id="storefront-mobile-drawer"
            className={styles.mobileDrawer}
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
            aria-label="모바일 메뉴"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className={styles.drawerHeader}>
              <strong>
                <span aria-hidden="true">☰</span> NAVIGATION
              </strong>
              <button
                ref={mobileCloseButtonRef}
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="메뉴 닫기"
              >
                ×
              </button>
            </div>
            <div className={styles.drawerMemberArea}>
              <div className={styles.drawerMemberGrid}>
                <a href="/shop/cart.php">
                  장바구니 {cartCount > 0 ? `(${cartCount})` : ""}
                </a>
                <a href="/shop/wishlist.php">
                  위시리스트 {wishCount > 0 ? `(${wishCount})` : ""}
                </a>
                <a href="/shop/couponzone.php">쿠폰존</a>
                <a href="/shop/orderinquiry.php">주문/배송조회</a>
                <a href="/bbs/inquiry.php">1:1 문의</a>
                <a href="/bbs/writecz.php">충전신청</a>
                <a href="/bbs/cashtx.php">출금신청</a>
                <a href="/bbs/withdrawal_list.php">충전·출금내역</a>
              </div>
            </div>
            <nav className={styles.mobileNav} aria-label="모바일 주요 메뉴">
              <ul>
                {navigation.filter((item) => item.useMobile !== false).map((item) => {
                  const expanded = expandedMobileItems.has(item.id);
                  return (
                    <li key={item.id}>
                      <div className={styles.mobileNavRow}>
                        <a
                          href={item.href}
                          target={item.newWindow ? "_blank" : undefined}
                          rel={item.newWindow ? "noopener noreferrer" : undefined}
                          className={
                            item.id === "home"
                              ? styles.mobileHomeLink
                              : activeHref === item.href
                                ? styles.activeNavLink
                                : undefined
                          }
                        >
                          {item.label}
                        </a>
                        {item.children?.length ? (
                          <button
                            type="button"
                            onClick={() => toggleMobileItem(item.id)}
                            aria-label={`${item.label} 하위 메뉴 ${
                              expanded ? "접기" : "열기"
                            }`}
                            aria-expanded={expanded}
                          >
                            {expanded ? "−" : "+"}
                          </button>
                        ) : null}
                      </div>
                      {item.children?.length && expanded ? (
                        <ul className={styles.mobileSubNav}>
                          {item.children.map((child) => (
                            <li key={child.id}>
                              <a href={child.href}>{child.label}</a>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
              <div className={styles.mobileQuickLinks}>
                {quickProductLinks.map((link) => (
                  <a href={link.href} key={link.href}>
                    {link.label}
                  </a>
                ))}
              </div>
            </nav>
            <div className={styles.mobileUtilityLinks}>
              {customerSession.status === "member" ? (
                <>
                  <a href="/shop/mypage.php">
                    마이페이지 ({customerSession.memberName}님)
                  </a>
                  <button type="button" onClick={() => void logout()}>
                    로그아웃
                  </button>
                </>
              ) : (
                utilityLinks.map((link) => (
                  <a href={link.href} key={`${link.href}-${link.label}`}>
                    {link.label}
                  </a>
                ))
              )}
            </div>
          </aside>
        </div>
      ) : null}

      {searchOpen ? (
        <div
          ref={searchOverlayRef}
          className={styles.searchOverlay}
          role="dialog"
          aria-modal="true"
          tabIndex={-1}
          aria-label="쇼핑몰 전체검색"
          onMouseDown={() => setSearchOpen(false)}
        >
          <button
            className={styles.searchClose}
            type="button"
            aria-label="검색 닫기"
            onClick={() => setSearchOpen(false)}
          >
            ×
          </button>
          <form
            action={searchAction}
            method="get"
            className={styles.searchForm}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <strong>쇼핑몰 전체검색</strong>
            <div>
              <label className={styles.srOnly} htmlFor="storefront-global-search">
                검색어
              </label>
              <input
                ref={searchInputRef}
                id="storefront-global-search"
                type="search"
                name="q"
                required
                placeholder={searchPlaceholder}
                autoComplete="off"
              />
              <button type="submit" aria-label="검색">
                <span className={styles.searchGlyph} aria-hidden="true" />
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
