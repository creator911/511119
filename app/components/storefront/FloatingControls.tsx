"use client";

/* eslint-disable @next/next/no-img-element -- local legacy paths are supplied at runtime */

import { useEffect, useRef, useState, type FormEvent } from "react";
import styles from "./Storefront.module.css";
import type { CartLine, ProductSummary } from "./types";
import { classNames } from "./utils";

type ShoppingPanel = "recent" | "cart" | "wishlist" | null;
const CART_KEY = "kg_cart_v1";
const RECENT_KEY = "kg_recent_v1";
const CUSTOMER_SESSION_EVENT = "kg-customer-session-change";

function readStoredArray<T>(key: string): T[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return Array.isArray(value) ? (value as T[]) : [];
  } catch {
    return [];
  }
}

export interface FloatingControlsProps {
  recentProducts?: ProductSummary[];
  recentCount?: number;
  cartCount?: number;
  wishCount?: number;
  cartHref?: string;
  wishHref?: string;
  loginHref?: string;
  registerHref?: string;
  isLoggedIn?: boolean;
  memberName?: string;
  onLogout?: () => void;
}

export function FloatingControls({
  recentProducts: suppliedRecentProducts = [],
  recentCount: suppliedRecentCount,
  cartCount: suppliedCartCount,
  wishCount: suppliedWishCount,
  cartHref = "/shop/cart.php",
  wishHref = "/shop/wishlist.php",
  loginHref = "/bbs/login.php",
  registerHref = "/bbs/register.php",
  isLoggedIn: suppliedLoggedIn,
  memberName: suppliedMemberName,
  onLogout,
}: FloatingControlsProps) {
  const [panel, setPanel] = useState<ShoppingPanel>(null);
  const [panelMounted, setPanelMounted] = useState(false);
  const [showTop, setShowTop] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const topScrollAnimation = useRef<number | null>(null);
  const shoppingPanelRef = useRef<HTMLElement | null>(null);
  const shoppingTriggerRef = useRef<HTMLButtonElement | null>(null);
  const shoppingPanelOpener = useRef<HTMLElement | null>(null);
  const shoppingPanelWasMounted = useRef(false);
  const [storedRecentProducts, setStoredRecentProducts] = useState<
    ProductSummary[]
  >([]);
  const [storedCartCount, setStoredCartCount] = useState(0);
  const [storedCartItems, setStoredCartItems] = useState<CartLine[]>([]);
  const [storedWishCount, setStoredWishCount] = useState(0);
  const [storedWishProducts, setStoredWishProducts] = useState<
    ProductSummary[]
  >([]);
  const [session, setSession] = useState<{
    loggedIn: boolean;
    memberName?: string;
  }>({ loggedIn: false });
  const [panelLoginError, setPanelLoginError] = useState("");
  const [panelLoginSubmitting, setPanelLoginSubmitting] = useState(false);
  const [recentPage, setRecentPage] = useState(1);

  const recentProducts = suppliedRecentProducts.length
    ? suppliedRecentProducts
    : storedRecentProducts;
  const recentPageSize = 3;
  const recentPageCount = Math.max(
    1,
    Math.ceil(recentProducts.length / recentPageSize),
  );
  const activeRecentPage = Math.min(recentPage, recentPageCount);
  const visibleRecentProducts = recentProducts.slice(
    (activeRecentPage - 1) * recentPageSize,
    activeRecentPage * recentPageSize,
  );
  const recentCount = suppliedRecentCount ?? recentProducts.length;
  const cartCount = suppliedCartCount ?? storedCartCount;
  const wishCount = suppliedWishCount ?? storedWishCount;
  const isLoggedIn = suppliedLoggedIn ?? session.loggedIn;
  const memberName = suppliedMemberName ?? session.memberName;

  useEffect(() => {
    if (panel || !panelMounted) return;

    const timer = window.setTimeout(() => setPanelMounted(false), 300);
    return () => window.clearTimeout(timer);
  }, [panel, panelMounted]);

  useEffect(() => {
    if (!panelMounted) return;

    const body = document.body;
    const root = document.documentElement;
    const previousBodyOverflow = body.style.overflow;
    const previousBodyPaddingRight = body.style.paddingRight;
    const previousRootOverflowY = root.style.overflowY;
    const scrollbarWidth = Math.max(0, window.innerWidth - root.clientWidth);
    const currentPaddingRight =
      Number.parseFloat(window.getComputedStyle(body).paddingRight) || 0;

    root.style.overflowY = "scroll";
    body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${currentPaddingRight + scrollbarWidth}px`;
    }

    return () => {
      root.style.overflowY = previousRootOverflowY;
      body.style.overflow = previousBodyOverflow;
      body.style.paddingRight = previousBodyPaddingRight;
    };
  }, [panelMounted]);

  useEffect(() => {
    if (!panel || !panelMounted) return;
    const panelElement = shoppingPanelRef.current;
    if (!panelElement) return;

    const focusFrame = window.requestAnimationFrame(() =>
      panelElement.focus(),
    );
    const handlePanelKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setPanel(null);
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = [
        ...panelElement.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((element) => element.getClientRects().length > 0);
      if (focusable.length === 0) {
        event.preventDefault();
        panelElement.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !panelElement.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (active === last || !panelElement.contains(active))
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handlePanelKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener("keydown", handlePanelKeyDown);
    };
  }, [panel, panelMounted]);

  useEffect(() => {
    if (panel) {
      shoppingPanelWasMounted.current = true;
      return;
    }
    if (!shoppingPanelWasMounted.current) return;
    shoppingPanelWasMounted.current = false;
    shoppingPanelOpener.current?.focus();
  }, [panel]);

  useEffect(() => {
    const handleScroll = () => {
      const scrollableHeight = Math.max(
        1,
        document.documentElement.scrollHeight - window.innerHeight,
      );
      setShowTop(window.scrollY > 50);
      setScrollProgress(
        Math.min(100, Math.max(0, (window.scrollY / scrollableHeight) * 100)),
      );
    };
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(
    () => () => {
      if (topScrollAnimation.current !== null) {
        window.cancelAnimationFrame(topScrollAnimation.current);
      }
    },
    [],
  );

  useEffect(() => {
    const refreshCommerceState = () => {
      setStoredRecentProducts(
        readStoredArray<ProductSummary>(RECENT_KEY).slice(0, 8),
      );
      const cartItems = readStoredArray<CartLine>(CART_KEY);
      setStoredCartItems(cartItems);
      setStoredCartCount(cartItems.length);
    };

    refreshCommerceState();
    window.addEventListener("storage", refreshCommerceState);
    window.addEventListener("kg-commerce-change", refreshCommerceState);
    return () => {
      window.removeEventListener("storage", refreshCommerceState);
      window.removeEventListener(
        "kg-commerce-change",
        refreshCommerceState,
      );
    };
  }, []);

  useEffect(() => {
    if (suppliedLoggedIn !== undefined) return;
    let disposed = false;
    const refreshSession = () => {
      void fetch("/api/customer/session", { cache: "no-store" })
        .then(async (response) => {
          if (!response.ok) return { authenticated: false };
          return (await response.json()) as {
            authenticated?: boolean;
            user?: { name?: string };
          };
        })
        .then(async (result) => {
          if (disposed) return;
          const loggedIn = Boolean(result.authenticated ?? result.user);
          setSession({
            loggedIn,
            memberName: result.user?.name,
          });
          if (!loggedIn) {
            setStoredWishCount(0);
            setStoredWishProducts([]);
            return;
          }
          const response = await fetch("/api/customer/wishlist", {
            cache: "no-store",
          });
          const wishlist = response.ok
            ? ((await response.json()) as {
                productIds?: string[];
                products?: ProductSummary[];
              })
            : {};
          if (!disposed) {
            setStoredWishCount(
              Array.isArray(wishlist.productIds)
                ? wishlist.productIds.length
                : 0,
            );
            setStoredWishProducts(
              Array.isArray(wishlist.products)
                ? wishlist.products.slice(0, 3)
                : [],
            );
          }
        })
        .catch(() => {
          if (!disposed) {
            setSession({ loggedIn: false });
            setStoredWishCount(0);
            setStoredWishProducts([]);
          }
        });
    };

    refreshSession();
    window.addEventListener(CUSTOMER_SESSION_EVENT, refreshSession);
    window.addEventListener("kg-wishlist-change", refreshSession);
    return () => {
      disposed = true;
      window.removeEventListener(CUSTOMER_SESSION_EVENT, refreshSession);
      window.removeEventListener("kg-wishlist-change", refreshSession);
    };
  }, [suppliedLoggedIn]);

  async function logout() {
    if (onLogout) {
      onLogout();
      return;
    }
    await fetch("/api/customer/session", { method: "DELETE" }).catch(
      () => undefined,
    );
    setSession({ loggedIn: false });
    window.dispatchEvent(new CustomEvent(CUSTOMER_SESSION_EVENT));
    window.location.assign("/");
  }

  function buyCartFromPanel() {
    if (storedCartItems.length === 0) return;
    window.localStorage.setItem(
      "kg_checkout_v1",
      JSON.stringify(storedCartItems),
    );
    window.dispatchEvent(new CustomEvent("kg-commerce-change"));
    window.location.assign("/shop/orderform.php");
  }

  async function loginFromPanel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (panelLoginSubmitting) return;
    const form = new FormData(event.currentTarget);
    const remember = form.get("auto_login") === "on";
    if (
      remember &&
      !window.confirm(
        "자동로그인을 사용하면 다음부터 아이디와 비밀번호를 입력하지 않아도 됩니다. 공용 기기에서는 사용하지 마세요.",
      )
    ) {
      return;
    }

    setPanelLoginError("");
    setPanelLoginSubmitting(true);
    try {
      const response = await fetch("/api/customer/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          userId: String(form.get("mb_id") ?? ""),
          password: String(form.get("mb_password") ?? ""),
          remember,
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setPanelLoginError(
          result.error ?? "아이디 또는 비밀번호를 확인해 주세요.",
        );
        return;
      }
      window.dispatchEvent(new CustomEvent(CUSTOMER_SESSION_EVENT));
      window.location.assign(
        `${window.location.pathname}${window.location.search}${window.location.hash}`,
      );
    } catch {
      setPanelLoginError(
        "로그인 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      );
    } finally {
      setPanelLoginSubmitting(false);
    }
  }

  function togglePanel(next: Exclude<ShoppingPanel, null>) {
    if (panel === next) {
      setPanel(null);
      return;
    }
    shoppingPanelOpener.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : shoppingTriggerRef.current;
    setPanelMounted(true);
    setPanel(next);
  }

  function scrollToTop() {
    const start = window.scrollY;
    const startedAt = window.performance.now();
    if (topScrollAnimation.current !== null) {
      window.cancelAnimationFrame(topScrollAnimation.current);
    }
    const animate = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / 500);
      const eased = 0.5 - Math.cos(Math.PI * progress) / 2;
      window.scrollTo(0, start * (1 - eased));
      if (progress < 1) {
        topScrollAnimation.current = window.requestAnimationFrame(animate);
      } else {
        topScrollAnimation.current = null;
      }
    };
    topScrollAnimation.current = window.requestAnimationFrame(animate);
  }

  return (
    <div className={styles.floatingRoot}>
      {panelMounted ? (
        <>
          <button
            type="button"
            className={classNames(
              styles.shoppingBackdrop,
              panel && styles.shoppingBackdropOpen,
            )}
            onClick={() => setPanel(null)}
            aria-label="쇼핑 박스 닫기"
            tabIndex={-1}
          />
          <aside
            id="shopping-panel"
            className={classNames(
              styles.shoppingPanel,
              panel && styles.shoppingPanelOpen,
            )}
            aria-label="나의 쇼핑 박스"
            aria-hidden={!panel}
            aria-modal="true"
            role="dialog"
            inert={!panel}
            tabIndex={-1}
            ref={shoppingPanelRef}
          >
          <header>
            <strong>
              <span className={styles.shoppingPanelTitleIcon} aria-hidden="true" />
              나의 쇼핑 박스
            </strong>
            <button
              type="button"
              onClick={() => setPanel(null)}
              aria-label="쇼핑 박스 닫기"
            >
              ×
            </button>
          </header>
          <div className={styles.shoppingPanelBody}>
            <section className={styles.shoppingPanelAccount}>
              {isLoggedIn ? (
                <>
                  <strong>{memberName ?? "회원"}님</strong>
                  <button type="button" onClick={() => void logout()}>
                    로그아웃
                  </button>
                </>
              ) : (
                <form
                  className={styles.shoppingPanelLogin}
                  onSubmit={loginFromPanel}
                  aria-busy={panelLoginSubmitting}
                >
                  <input type="hidden" name="url" value="" />
                  <div className={styles.shoppingPanelLoginHeadline}>
                    <strong>LOGIN</strong>
                  </div>
                  <nav aria-label="회원 안내">
                    <a href={registerHref}>회원가입</a>
                    <a href="/bbs/password_lost.php">아이디/비번찾기</a>
                  </nav>
                  <label className={styles.shoppingPanelLoginField}>
                    <span className={styles.srOnly}>아이디</span>
                    <input
                      type="text"
                      name="mb_id"
                      maxLength={20}
                      autoComplete="username"
                      placeholder="아이디"
                      required
                    />
                    <span
                      className={classNames(
                        styles.shoppingPanelLoginIcon,
                        styles.shoppingPanelLoginUserIcon,
                      )}
                      aria-hidden="true"
                    />
                  </label>
                  <label className={styles.shoppingPanelLoginField}>
                    <span className={styles.srOnly}>비밀번호</span>
                    <input
                      type="password"
                      name="mb_password"
                      maxLength={20}
                      autoComplete="current-password"
                      placeholder="비밀번호"
                      required
                    />
                    <span
                      className={classNames(
                        styles.shoppingPanelLoginIcon,
                        styles.shoppingPanelLoginPasswordIcon,
                      )}
                      aria-hidden="true"
                    />
                  </label>
                  {panelLoginError ? (
                    <p role="alert">{panelLoginError}</p>
                  ) : null}
                  <div className={styles.shoppingPanelLoginFooter}>
                    <label className={styles.shoppingPanelAutoLogin}>
                      <input type="checkbox" name="auto_login" />
                      <span>자동로그인</span>
                    </label>
                    <button type="submit" disabled={panelLoginSubmitting}>
                      {panelLoginSubmitting ? "로그인 중" : "로그인"}
                    </button>
                  </div>
                </form>
              )}
            </section>

            <section className={styles.shoppingPanelSection}>
              <h2>
                오늘본상품 <span>{recentCount}</span>
              </h2>
              <div className={styles.shoppingPanelSectionBody}>
                {recentProducts.length > 0 ? (
                  <>
                    <ul className={styles.recentProductList}>
                      {visibleRecentProducts.map((product) => (
                        <li key={product.id}>
                          <a href={product.href}>
                            <img src={product.image} alt="" />
                            <span>
                              <strong>{product.name.slice(0, 10)}</strong>
                              <small>
                                ₩ {product.price.toLocaleString("ko-KR")}
                              </small>
                            </span>
                          </a>
                        </li>
                      ))}
                    </ul>
                    <div className={styles.recentProductNavigation}>
                      {recentPageCount > 1 ? (
                        <button
                          type="button"
                          aria-label="이전 최근 본 상품"
                          onClick={() => {
                            if (activeRecentPage === 1) {
                              window.alert("목록의 처음입니다.");
                              return;
                            }
                            setRecentPage((current) => current - 1);
                          }}
                        >
                          ‹
                        </button>
                      ) : (
                        <span aria-hidden="true" />
                      )}
                      <span>
                        {activeRecentPage}/{recentPageCount}
                      </span>
                      {recentPageCount > 1 ? (
                        <button
                          type="button"
                          aria-label="다음 최근 본 상품"
                          onClick={() => {
                            if (activeRecentPage === recentPageCount) {
                              window.alert("더 이상 목록이 없습니다.");
                              return;
                            }
                            setRecentPage((current) => current + 1);
                          }}
                        >
                          ›
                        </button>
                      ) : (
                        <span aria-hidden="true" />
                      )}
                    </div>
                  </>
                ) : (
                  <p className={styles.shoppingPanelEmpty}>해당내용 없음</p>
                )}
              </div>
            </section>

            <section className={styles.shoppingPanelSection}>
              <h2>
                장바구니 <span>{cartCount}</span>
              </h2>
              <div className={styles.shoppingPanelSectionBody}>
                {storedCartItems.length > 0 ? (
                  <>
                    <ul className={styles.recentProductList}>
                      {storedCartItems.slice(0, 3).map((line) => (
                        <li key={line.lineKey ?? line.id}>
                          <a
                            className={styles.shoppingPanelCartImage}
                            href={
                              line.href ??
                              `/shop/item.php?it_id=${encodeURIComponent(
                                line.productId ?? line.id,
                              )}`
                            }
                          >
                            <img src={line.image} alt="" />
                          </a>
                          <a href={cartHref}>
                            {line.name.endsWith("요약정보 및 구매")
                              ? line.name
                              : `${line.name} 요약정보 및 구매`}
                          </a>
                        </li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      className={styles.shoppingPanelBuyNow}
                      onClick={buyCartFromPanel}
                    >
                      바로구매
                    </button>
                    <a
                      className={styles.shoppingPanelSectionLink}
                      href={cartHref}
                    >
                      장바구니 바로가기
                    </a>
                  </>
                ) : (
                  <div className={styles.shoppingPanelEmpty}>
                    <p>
                      {cartCount > 0
                        ? `장바구니에 상품 ${cartCount}개가 있습니다.`
                        : "해당내용 없음"}
                    </p>
                    <a href={cartHref}>장바구니 바로가기</a>
                  </div>
                )}
              </div>
            </section>

            <section className={styles.shoppingPanelSection}>
              <h2>
                위시리스트 <span>{wishCount}</span>
              </h2>
              <div className={styles.shoppingPanelSectionBody}>
                {storedWishProducts.length > 0 ? (
                  <>
                    <ul className={styles.recentProductList}>
                      {storedWishProducts.map((product) => (
                        <li key={product.id}>
                          <a href={product.href}>
                            <img src={product.image} alt="" />
                            <span>
                              <strong>{product.name.slice(0, 10)}</strong>
                              <small>
                                ₩ {product.price.toLocaleString("ko-KR")}
                              </small>
                            </span>
                          </a>
                        </li>
                      ))}
                    </ul>
                    <a
                      className={styles.shoppingPanelSectionLink}
                      href={wishHref}
                    >
                      위시리스트 바로가기
                    </a>
                  </>
                ) : (
                  <div className={styles.shoppingPanelEmpty}>
                    <p>
                    {wishCount > 0
                      ? `위시리스트에 상품 ${wishCount}개가 있습니다.`
                      : "해당내용 없음"}
                    </p>
                    <a href={wishHref}>위시리스트 바로가기</a>
                  </div>
                )}
              </div>
            </section>
          </div>
          </aside>
        </>
      ) : null}

      <div className={styles.shoppingQuick}>
        <div className={styles.shoppingQuickTitle}>나의 쇼핑 박스</div>
        <div className={styles.shoppingMember}>
          {isLoggedIn ? (
            <>
              <strong>{memberName ?? "회원"}님</strong>
              <button type="button" onClick={() => void logout()}>
                로그아웃
              </button>
            </>
          ) : (
            <>
              <a href={loginHref}>LOGIN</a>
              <a href={registerHref}>회원가입</a>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={() => togglePanel("recent")}
          className={panel === "recent" ? styles.shoppingQuickActive : undefined}
        >
          <span aria-hidden="true">◷</span>
          <em>오늘본상품</em>
          <strong>{recentCount}</strong>
        </button>
        <button
          type="button"
          onClick={() => togglePanel("cart")}
          className={panel === "cart" ? styles.shoppingQuickActive : undefined}
        >
          <span aria-hidden="true">▱</span>
          <em>장바구니</em>
          <strong>{cartCount}</strong>
        </button>
        <button
          type="button"
          onClick={() => togglePanel("wishlist")}
          className={panel === "wishlist" ? styles.shoppingQuickActive : undefined}
        >
          <span aria-hidden="true">♡</span>
          <em>위시리스트</em>
          <strong>{wishCount}</strong>
        </button>
      </div>

      <button
        type="button"
        className={classNames(
          styles.shoppingTrigger,
          panel && styles.shoppingTriggerOpen,
        )}
        ref={shoppingTriggerRef}
        onClick={() => {
          if (panel !== null) {
            setPanel(null);
            return;
          }
          shoppingPanelOpener.current =
            document.activeElement instanceof HTMLElement
              ? document.activeElement
              : shoppingTriggerRef.current;
          setPanelMounted(true);
          setPanel("recent");
        }}
        aria-label={panel ? "나의 쇼핑 박스 닫기" : "나의 쇼핑 박스 열기"}
        aria-expanded={panel !== null}
        aria-controls="shopping-panel"
      >
        <span className={styles.shoppingTriggerUser} aria-hidden="true" />
        <span className={styles.shoppingTriggerDirection} aria-hidden="true">
          {panel ? "" : ""}
        </span>
      </button>

      <div className={styles.mobileFloatingBar}>
        <a href={cartHref} aria-label={`장바구니 ${cartCount}개`}>
          <span aria-hidden="true">▱</span>
          {cartCount > 0 ? <strong>{cartCount}</strong> : null}
        </a>
        <a href={wishHref} aria-label={`위시리스트 ${wishCount}개`}>
          <span aria-hidden="true">♡</span>
          {wishCount > 0 ? <strong>{wishCount}</strong> : null}
        </a>
      </div>

      <button
        type="button"
        className={classNames(
          styles.backToTop,
          showTop && styles.backToTopVisible,
          scrollProgress > 99 && styles.backToTopComplete,
        )}
        onClick={scrollToTop}
        aria-label="페이지 맨 위로"
      >
        <svg
          className={styles.backToTopProgress}
          width="100%"
          height="100%"
          viewBox="-1 -1 102 102"
          aria-hidden="true"
        >
          <path
            d="M50,1 a49,49 0 0,1 0,98 a49,49 0 0,1 0,-98"
            style={{
              strokeDasharray: "307.919, 307.919",
              strokeDashoffset: 307.919 * (1 - scrollProgress / 100),
            }}
          />
        </svg>
        <span className={styles.backToTopCount}>
          {Math.round(scrollProgress)}%
        </span>
      </button>
    </div>
  );
}
