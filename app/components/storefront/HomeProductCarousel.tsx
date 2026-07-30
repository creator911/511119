"use client";

import type { ReactNode } from "react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import styles from "./HomeProductCarousel.module.css";
import type { ProductSummary } from "./types";

export type HomeProductCarouselMode = "sale" | "popular";

export interface HomeProductCarouselProps {
  products: ProductSummary[];
  mode: HomeProductCarouselMode;
  renderProduct: (product: ProductSummary, index: number) => ReactNode;
  ariaLabel?: string;
  className?: string;
}

export function HomeProductCarousel(props: HomeProductCarouselProps) {
  const instanceKey = `${props.mode}:${props.products
    .map((product) => product.id)
    .join("\u0000")}`;

  return <HomeProductCarouselContents key={instanceKey} {...props} />;
}

interface CarouselLayout {
  slidesToShow: number;
  slidesToScroll: number;
  centerPadding: number;
}

interface PointerGesture {
  pointerId: number;
  startX: number;
  startY: number;
  axis: "pending" | "horizontal" | "vertical";
}

const COPY_COUNT = 5;
const COPY_OFFSET = 2;
const TRANSITION_MS = 300;
const AUTOPLAY_MS = 4000;
const DRAG_ACTIVATION_PX = 6;
const CLICK_SUPPRESSION_MS = 500;

function getResponsiveLayout(
  viewportWidth: number,
  mode: HomeProductCarouselMode,
): CarouselLayout {
  if (mode === "popular") {
    if (viewportWidth >= 1200) {
      return { slidesToShow: 4, slidesToScroll: 4, centerPadding: 0 };
    }
    if (viewportWidth >= 992) {
      return { slidesToShow: 3, slidesToScroll: 3, centerPadding: 0 };
    }
    return { slidesToShow: 2, slidesToScroll: 2, centerPadding: 0 };
  }

  if (viewportWidth >= 1400) {
    return { slidesToShow: 3, slidesToScroll: 1, centerPadding: 150 };
  }
  if (viewportWidth >= 1200) {
    return { slidesToShow: 3, slidesToScroll: 1, centerPadding: 100 };
  }
  if (viewportWidth >= 992) {
    return { slidesToShow: 3, slidesToScroll: 1, centerPadding: 0 };
  }
  if (viewportWidth >= 768) {
    return { slidesToShow: 1, slidesToScroll: 1, centerPadding: 170 };
  }
  if (viewportWidth >= 577) {
    return { slidesToShow: 1, slidesToScroll: 1, centerPadding: 120 };
  }
  return { slidesToShow: 1, slidesToScroll: 1, centerPadding: 70 };
}

function modulo(value: number, divisor: number) {
  return ((value % divisor) + divisor) % divisor;
}

function sameLayout(left: CarouselLayout, right: CarouselLayout) {
  return (
    left.slidesToShow === right.slidesToShow &&
    left.slidesToScroll === right.slidesToScroll &&
    left.centerPadding === right.centerPadding
  );
}

function joinClassNames(...names: Array<string | false | null | undefined>) {
  return names.filter(Boolean).join(" ");
}

function HomeProductCarouselContents({
  products,
  mode,
  renderProduct,
  ariaLabel = mode === "sale" ? "할인 상품" : "인기 상품",
  className,
}: HomeProductCarouselProps) {
  const productCount = products.length;
  const viewportRef = useRef<HTMLDivElement>(null);
  const animatingRef = useRef(false);
  const draggingRef = useRef(false);
  const measurementRef = useRef<{
    layout: CarouselLayout;
    width: number;
  } | null>(null);
  const pointerGestureRef = useRef<PointerGesture | null>(null);
  const suppressClickRef = useRef(false);
  const suppressClickTimerRef = useRef<number | null>(null);
  const enableTransitionFrameRef = useRef<number | null>(null);
  const enableTransitionSecondFrameRef = useRef<number | null>(null);
  const [layout, setLayout] = useState<CarouselLayout>(() =>
    getResponsiveLayout(1280, mode),
  );
  const [measuredWidth, setMeasuredWidth] = useState(0);
  const [physicalIndex, setPhysicalIndex] = useState(
    productCount > 1 ? productCount * COPY_OFFSET : 0,
  );
  const [transitionEnabled, setTransitionEnabled] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const [documentHidden, setDocumentHidden] = useState(false);

  const effectiveSlidesToShow = Math.max(
    1,
    Math.min(layout.slidesToShow, Math.max(1, productCount)),
  );
  const effectiveSlidesToScroll = Math.max(
    1,
    Math.min(layout.slidesToScroll, Math.max(1, productCount)),
  );
  const centerPadding =
    mode === "sale" && productCount > 0 ? layout.centerPadding : 0;
  const canMove =
    mode === "sale"
      ? productCount > 1
      : productCount > effectiveSlidesToShow;
  const contentWidth = Math.max(0, measuredWidth - centerPadding * 2);
  const measuredSlideWidth =
    contentWidth > 0 ? contentWidth / effectiveSlidesToShow : 0;
  const slideWidth =
    mode === "popular" && measuredSlideWidth > 0
      ? Math.ceil(measuredSlideWidth)
      : measuredSlideWidth;
  const centerOffset =
    mode === "sale"
      ? (contentWidth - slideWidth) / 2
      : 0;
  const translateX =
    slideWidth > 0
      ? centerOffset - physicalIndex * slideWidth
      : 0;
  const paused =
    hovered || focusWithin || documentHidden || dragging || !canMove;

  const pageStarts = useMemo(() => {
    if (mode === "sale") {
      return Array.from({ length: productCount }, (_, index) => index);
    }

    const starts: number[] = [];
    for (let index = 0; index < productCount; index += effectiveSlidesToScroll) {
      starts.push(index);
    }
    return starts;
  }, [effectiveSlidesToScroll, mode, productCount]);

  const logicalIndex =
    productCount > 0 ? modulo(physicalIndex, productCount) : 0;
  const currentPageIndex = Math.max(
    0,
    pageStarts.findIndex((pageStart, index) => {
      const nextStart = pageStarts[index + 1] ?? productCount;
      return logicalIndex >= pageStart && logicalIndex < nextStart;
    }),
  );

  const renderedSlides = useMemo(() => {
    if (productCount <= 1) {
      return products.map((product, index) => ({
        copyIndex: 0,
        logicalIndex: index,
        product,
      }));
    }

    return Array.from({ length: COPY_COUNT }, (_, copyIndex) =>
      products.map((product, index) => ({
        copyIndex,
        logicalIndex: index,
        product,
      })),
    ).flat();
  }, [productCount, products]);

  const cancelEnableTransitionFrames = useCallback(() => {
    if (enableTransitionFrameRef.current !== null) {
      window.cancelAnimationFrame(enableTransitionFrameRef.current);
      enableTransitionFrameRef.current = null;
    }
    if (enableTransitionSecondFrameRef.current !== null) {
      window.cancelAnimationFrame(enableTransitionSecondFrameRef.current);
      enableTransitionSecondFrameRef.current = null;
    }
  }, []);

  const enableTransitionAfterLayout = useCallback(() => {
    cancelEnableTransitionFrames();
    enableTransitionFrameRef.current = window.requestAnimationFrame(() => {
      enableTransitionSecondFrameRef.current = window.requestAnimationFrame(() => {
        if (!draggingRef.current) setTransitionEnabled(true);
        enableTransitionFrameRef.current = null;
        enableTransitionSecondFrameRef.current = null;
      });
    });
  }, [cancelEnableTransitionFrames]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    function measure() {
      const nextLayout = getResponsiveLayout(window.innerWidth, mode);
      const nextWidth = viewport?.clientWidth ?? 0;
      const previousMeasurement = measurementRef.current;
      const layoutChanged =
        !previousMeasurement ||
        !sameLayout(previousMeasurement.layout, nextLayout);
      const widthChanged =
        !previousMeasurement ||
        Math.abs(previousMeasurement.width - nextWidth) >= 0.5;

      if (!layoutChanged && !widthChanged) return;

      measurementRef.current = { layout: nextLayout, width: nextWidth };
      setTransitionEnabled(false);
      if (layoutChanged) setLayout(nextLayout);
      if (widthChanged) setMeasuredWidth(nextWidth);
      enableTransitionAfterLayout();
    }

    measure();
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure);
    resizeObserver?.observe(viewport);
    window.addEventListener("resize", measure);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [enableTransitionAfterLayout, mode]);

  useEffect(() => {
    function updateDocumentVisibility() {
      setDocumentHidden(document.hidden);
    }

    updateDocumentVisibility();
    document.addEventListener("visibilitychange", updateDocumentVisibility);
    return () =>
      document.removeEventListener("visibilitychange", updateDocumentVisibility);
  }, []);

  useEffect(
    () => () => {
      cancelEnableTransitionFrames();
      if (suppressClickTimerRef.current !== null) {
        window.clearTimeout(suppressClickTimerRef.current);
      }
    },
    [cancelEnableTransitionFrames],
  );

  const settleTransition = useCallback(() => {
    if (!animatingRef.current || productCount <= 1) return;

    animatingRef.current = false;
    setAnimating(false);
    let normalizedIndex = physicalIndex;
    const lowerBoundary = productCount;
    const upperBoundary = productCount * (COPY_COUNT - 1);

    while (normalizedIndex < lowerBoundary) normalizedIndex += productCount;
    while (normalizedIndex >= upperBoundary) normalizedIndex -= productCount;

    if (normalizedIndex !== physicalIndex) {
      setTransitionEnabled(false);
      setPhysicalIndex(normalizedIndex);
      enableTransitionAfterLayout();
    }
  }, [
    enableTransitionAfterLayout,
    physicalIndex,
    productCount,
  ]);

  useEffect(() => {
    if (!animating) return;
    const fallbackTimer = window.setTimeout(
      settleTransition,
      TRANSITION_MS + 80,
    );
    return () => window.clearTimeout(fallbackTimer);
  }, [animating, settleTransition]);

  const move = useCallback(
    (direction: -1 | 1) => {
      if (!canMove || animatingRef.current) return;

      animatingRef.current = true;
      setTransitionEnabled(true);
      setAnimating(true);
      setPhysicalIndex((currentPhysicalIndex) => {
        if (mode === "sale") return currentPhysicalIndex + direction;

        const currentLogicalIndex = modulo(
          currentPhysicalIndex,
          productCount,
        );
        let currentPage = pageStarts.findIndex(
          (pageStart) => pageStart === currentLogicalIndex,
        );
        if (currentPage < 0) {
          currentPage = Math.min(
            pageStarts.length - 1,
            Math.floor(currentLogicalIndex / effectiveSlidesToScroll),
          );
        }

        const nextPage = modulo(currentPage + direction, pageStarts.length);
        const targetLogicalIndex = pageStarts[nextPage] ?? 0;

        if (direction > 0) {
          const delta =
            targetLogicalIndex > currentLogicalIndex
              ? targetLogicalIndex - currentLogicalIndex
              : productCount - currentLogicalIndex + targetLogicalIndex;
          return currentPhysicalIndex + delta;
        }

        const delta =
          targetLogicalIndex < currentLogicalIndex
            ? currentLogicalIndex - targetLogicalIndex
            : currentLogicalIndex + productCount - targetLogicalIndex;
        return currentPhysicalIndex - delta;
      });
    },
    [
      effectiveSlidesToScroll,
      canMove,
      mode,
      pageStarts,
      productCount,
    ],
  );

  const moveToPage = useCallback(
    (pageIndex: number) => {
      if (
        !canMove ||
        animatingRef.current ||
        pageIndex < 0 ||
        pageIndex >= pageStarts.length
      ) {
        return;
      }

      const targetLogicalIndex = pageStarts[pageIndex] ?? 0;
      if (targetLogicalIndex === logicalIndex) return;

      const delta = targetLogicalIndex - logicalIndex;

      animatingRef.current = true;
      setTransitionEnabled(true);
      setAnimating(true);
      setPhysicalIndex((current) => current + delta);
    },
    [
      logicalIndex,
      canMove,
      pageStarts,
    ],
  );

  const clearClickSuppression = useCallback(() => {
    suppressClickRef.current = false;
    if (suppressClickTimerRef.current !== null) {
      window.clearTimeout(suppressClickTimerRef.current);
      suppressClickTimerRef.current = null;
    }
  }, []);

  const suppressNextClick = useCallback(() => {
    clearClickSuppression();
    suppressClickRef.current = true;
    suppressClickTimerRef.current = window.setTimeout(() => {
      suppressClickRef.current = false;
      suppressClickTimerRef.current = null;
    }, CLICK_SUPPRESSION_MS);
  }, [clearClickSuppression]);

  const finishPointerGesture = useCallback(
    (
      pointerId: number,
      clientX: number,
      clientY: number,
      cancelled = false,
    ) => {
      const gesture = pointerGestureRef.current;
      if (!gesture || gesture.pointerId !== pointerId) return;

      pointerGestureRef.current = null;
      draggingRef.current = false;
      setDragging(false);

      const deltaX = clientX - gesture.startX;
      const deltaY = clientY - gesture.startY;
      const horizontalDrag =
        gesture.axis === "horizontal" ||
        (gesture.axis === "pending" &&
          Math.abs(deltaX) >= DRAG_ACTIVATION_PX &&
          Math.abs(deltaX) > Math.abs(deltaY));

      if (horizontalDrag) suppressNextClick();

      const swipeThreshold = Math.max(35, measuredWidth / 5);
      const shouldAdvance =
        !cancelled &&
        horizontalDrag &&
        Math.abs(deltaX) >= swipeThreshold &&
        canMove;

      setDragOffset(0);
      if (shouldAdvance) {
        move(deltaX > 0 ? -1 : 1);
      } else {
        setTransitionEnabled(true);
      }
    },
    [canMove, measuredWidth, move, suppressNextClick],
  );

  useEffect(() => {
    if (paused || !canMove) return;
    const autoplayTimer = window.setInterval(() => move(1), AUTOPLAY_MS);
    return () => window.clearInterval(autoplayTimer);
  }, [canMove, move, paused]);

  if (productCount === 0) return null;

  const fallbackSlideBasis = `${100 / effectiveSlidesToShow}%`;
  const slideStyle = slideWidth > 0
    ? { width: `${slideWidth}px` }
    : { width: fallbackSlideBasis };

  return (
    <section
      className={joinClassNames(
        styles.carousel,
        mode === "sale" ? styles.sale : styles.popular,
        canMove && styles.controls,
        dragging && styles.dragging,
        className,
      )}
      aria-label={ariaLabel}
      aria-roledescription="carousel"
      role="region"
      tabIndex={0}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocusWithin(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setFocusWithin(false);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          move(-1);
        } else if (event.key === "ArrowRight") {
          event.preventDefault();
          move(1);
        } else if (event.key === "Home") {
          event.preventDefault();
          moveToPage(0);
        } else if (event.key === "End") {
          event.preventDefault();
          moveToPage(pageStarts.length - 1);
        }
      }}
      onClickCapture={(event) => {
        if (!suppressClickRef.current) return;
        event.preventDefault();
        event.stopPropagation();
        clearClickSuppression();
      }}
      onPointerDown={(event) => {
        if (
          !event.isPrimary ||
          !canMove ||
          animatingRef.current ||
          (event.pointerType === "mouse" && event.button !== 0)
        ) {
          return;
        }

        const target = event.target;
        if (
          target instanceof Element &&
          target.closest("[data-carousel-control='true']")
        ) {
          return;
        }

        clearClickSuppression();
        cancelEnableTransitionFrames();
        pointerGestureRef.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          axis: "pending",
        };
        draggingRef.current = true;
        setDragging(true);
        setDragOffset(0);
        setTransitionEnabled(false);
      }}
      onPointerMove={(event) => {
        const gesture = pointerGestureRef.current;
        if (
          !gesture ||
          gesture.pointerId !== event.pointerId ||
          !event.isPrimary
        ) {
          return;
        }

        const deltaX = event.clientX - gesture.startX;
        const deltaY = event.clientY - gesture.startY;

        if (gesture.axis === "pending") {
          if (
            Math.abs(deltaX) < DRAG_ACTIVATION_PX &&
            Math.abs(deltaY) < DRAG_ACTIVATION_PX
          ) {
            return;
          }

          if (Math.abs(deltaY) >= Math.abs(deltaX)) {
            gesture.axis = "vertical";
            draggingRef.current = false;
            setDragging(false);
            setTransitionEnabled(true);
            return;
          }

          gesture.axis = "horizontal";
          suppressClickRef.current = true;
        }

        if (gesture.axis !== "horizontal") return;

        event.preventDefault();
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.setPointerCapture(event.pointerId);
        }
        const pageDistance =
          slideWidth *
          (mode === "popular" ? effectiveSlidesToScroll : 1);
        const dragLimit = Math.max(slideWidth, pageDistance, 1);
        setDragOffset(Math.max(-dragLimit, Math.min(dragLimit, deltaX)));
      }}
      onPointerUp={(event) => {
        if (!event.isPrimary) return;
        finishPointerGesture(
          event.pointerId,
          event.clientX,
          event.clientY,
        );
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      }}
      onPointerLeave={(event) => {
        const gesture = pointerGestureRef.current;
        if (
          !gesture ||
          gesture.pointerId !== event.pointerId ||
          event.currentTarget.hasPointerCapture(event.pointerId)
        ) {
          return;
        }
        finishPointerGesture(
          event.pointerId,
          event.clientX,
          event.clientY,
          true,
        );
      }}
      onPointerCancel={(event) => {
        finishPointerGesture(
          event.pointerId,
          event.clientX,
          event.clientY,
          true,
        );
      }}
      onLostPointerCapture={(event) => {
        const gesture = pointerGestureRef.current;
        if (!gesture || gesture.pointerId !== event.pointerId) return;
        finishPointerGesture(
          event.pointerId,
          event.clientX,
          event.clientY,
          true,
        );
      }}
    >
      <div
        className={styles.viewport}
        ref={viewportRef}
        onDragStart={(event) => event.preventDefault()}
        style={{
          paddingRight: `${centerPadding}px`,
          paddingLeft: `${centerPadding}px`,
        }}
      >
        <div
          className={joinClassNames(
            styles.track,
            transitionEnabled && !dragging && styles.transitioning,
          )}
          style={{
            transform: `translate3d(${translateX + dragOffset}px, 0, 0)`,
          }}
          onTransitionEnd={(event) => {
            if (event.currentTarget === event.target) settleTransition();
          }}
        >
          {renderedSlides.map(
            ({ copyIndex, logicalIndex: slideLogicalIndex, product }, itemIndex) => {
              const isCenter =
                mode === "sale" && itemIndex === physicalIndex;
              const activeStart =
                mode === "sale"
                  ? physicalIndex - Math.floor(effectiveSlidesToShow / 2)
                  : physicalIndex;
              const isActive =
                itemIndex >= activeStart &&
                itemIndex < activeStart + effectiveSlidesToShow;

              return (
                <div
                  key={`${copyIndex}-${product.id}-${slideLogicalIndex}`}
                  className={joinClassNames(
                    styles.slide,
                    "home-product-slide",
                    isActive && styles.active,
                    isActive && "active",
                    isCenter && styles.center,
                    isCenter && "center",
                  )}
                  style={slideStyle}
                  data-active={isActive ? "true" : "false"}
                  data-center={isCenter ? "true" : "false"}
                  aria-hidden={!isActive}
                  inert={isActive ? undefined : true}
                  aria-label={`${slideLogicalIndex + 1} / ${productCount}`}
                  aria-roledescription="slide"
                  role="group"
                >
                  {renderProduct(product, slideLogicalIndex)}
                </div>
              );
            },
          )}
        </div>
      </div>

      {canMove ? (
        <>
          <button
            type="button"
            className={joinClassNames(styles.arrow, styles.previous)}
            data-carousel-control="true"
            aria-label="이전 상품"
            onClick={() => move(-1)}
          >
            <span className={styles.visuallyHidden}>이전 상품</span>
          </button>
          <button
            type="button"
            className={joinClassNames(styles.arrow, styles.next)}
            data-carousel-control="true"
            aria-label="다음 상품"
            onClick={() => move(1)}
          >
            <span className={styles.visuallyHidden}>다음 상품</span>
          </button>
          <div className={styles.dots} aria-label="상품 페이지 선택" role="tablist">
            {pageStarts.map((pageStart, pageIndex) => (
              <button
                type="button"
                className={joinClassNames(
                  styles.dot,
                  pageIndex === currentPageIndex && styles.dotActive,
                )}
                key={pageStart}
                data-carousel-control="true"
                role="tab"
                aria-label={`${pageIndex + 1}번 상품 페이지`}
                aria-selected={pageIndex === currentPageIndex}
                onClick={() => moveToPage(pageIndex)}
              />
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
