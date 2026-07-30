"use client";

/* eslint-disable @next/next/no-img-element -- local legacy paths are supplied at runtime */

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type TransitionEvent as ReactTransitionEvent,
} from "react";
import styles from "./Storefront.module.css";
import type {
  BreadcrumbItem,
  ProductDetailData,
  ProductSummary,
} from "./types";
import { QuantitySelector } from "./QuantitySelector";
import { PageHeading } from "./StorefrontPrimitives";
import { classNames, formatKRW } from "./utils";

type ProductTab = "info" | "reviews" | "questions" | "shipping" | "exchange";
type InteractionKind = "review" | "question";
type PointerSample = readonly [time: number, x: number];
const CUSTOMER_SESSION_EVENT = "kg-customer-session-change";

function recentPointerMotion(
  samples: PointerSample[],
  endTime: number,
  endX: number,
) {
  const targetTime = endTime - 250;
  const sample =
    samples.reduce<PointerSample | null>((closest, candidate) => {
      if (!closest) return candidate;
      return Math.abs(candidate[0] - targetTime) <
        Math.abs(closest[0] - targetTime)
        ? candidate
        : closest;
    }, null) ?? ([endTime, endX] as const);
  const elapsed = Math.max(1, endTime - sample[0]);
  return {
    delta: endX - sample[1],
    elapsed,
    velocity: (endX - sample[1]) / elapsed,
  };
}

interface ProductInteraction {
  id: string;
  kind: InteractionKind;
  authorName: string;
  title: string;
  body: string;
  rating: number;
  answer: string;
  createdAt: string;
}

interface InteractionPage {
  items: ProductInteraction[];
  page: number;
  pageSize: number;
  pageCount: number;
  total: number;
}

const tabs: Array<{ id: ProductTab; label: string }> = [
  { id: "info", label: "상품정보" },
  { id: "reviews", label: "사용후기" },
  { id: "questions", label: "상품문의" },
  { id: "shipping", label: "배송정보" },
  { id: "exchange", label: "교환정보" },
];

const tabTargets: Record<ProductTab, string> = {
  info: "sit_inf",
  reviews: "sit_use",
  questions: "sit_qa",
  shipping: "sit_dvr",
  exchange: "sit_ex",
};

export interface ProductDetailProps {
  product: ProductDetailData;
  breadcrumbs?: BreadcrumbItem[];
  previousProduct?: Pick<ProductSummary, "name" | "href">;
  nextProduct?: Pick<ProductSummary, "name" | "href">;
  relatedProducts?: ProductSummary[];
  initiallyWished?: boolean;
  onAddToCart?: (payload: {
    productId: string;
    quantity: number;
    options: Record<string, string>;
  }) => void;
  onBuyNow?: (payload: {
    productId: string;
    quantity: number;
    options: Record<string, string>;
  }) => void;
  onToggleWish?: (productId: string, wished: boolean) => void;
}

export function ProductDetail({
  product,
  breadcrumbs = [
    { label: "상점 메인", href: "/shop" },
    { label: product.categoryLabel, href: product.categoryHref },
    { label: product.name },
  ],
  previousProduct,
  nextProduct,
  relatedProducts = [],
  initiallyWished = false,
  onAddToCart,
  onBuyNow,
  onToggleWish,
}: ProductDetailProps) {
  const gallery = product.images.length > 0 ? product.images : [product.image];
  const galleryLoops = gallery.length > 2;
  const [imageIndex, setImageIndex] = useState(0);
  const [galleryPosition, setGalleryPosition] = useState(
    galleryLoops ? 1 : 0,
  );
  const [galleryTransitionEnabled, setGalleryTransitionEnabled] =
    useState(true);
  const [galleryTransitionDuration, setGalleryTransitionDuration] =
    useState(300);
  const [galleryDragOffset, setGalleryDragOffset] = useState(0);
  const [galleryControlsVisible, setGalleryControlsVisible] = useState(true);
  const galleryPointerStart = useRef<number | null>(null);
  const galleryPointerId = useRef<number | null>(null);
  const galleryPointerSamples = useRef<PointerSample[]>([]);
  const galleryDidDrag = useRef(false);
  const thumbnailViewportRef = useRef<HTMLDivElement | null>(null);
  const thumbnailTrackRef = useRef<HTMLDivElement | null>(null);
  const thumbnailBorderRef = useRef<HTMLSpanElement | null>(null);
  const thumbnailOffset = useRef(0);
  const thumbnailTransitionDistance = useRef(1);
  const thumbnailPointerStart = useRef<number | null>(null);
  const thumbnailPointerId = useRef<number | null>(null);
  const thumbnailPointerSamples = useRef<PointerSample[]>([]);
  const thumbnailPointerOffsetStart = useRef(0);
  const thumbnailDidDrag = useRef(false);
  const thumbnailInitialized = useRef(false);
  const thumbnailProductId = useRef(product.id);
  const tabScrollAnimation = useRef<number | null>(null);
  const relatedViewportRef = useRef<HTMLDivElement | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [localWished, setLocalWished] = useState(initiallyWished);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>(
    {},
  );
  const [shareStatus, setShareStatus] = useState("");
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const shareMenuRef = useRef<HTMLDivElement | null>(null);
  const [isCustomerLoggedIn, setIsCustomerLoggedIn] = useState(false);
  const [interactionPages, setInteractionPages] = useState<
    Record<InteractionKind, InteractionPage>
  >({
    review: {
      ...emptyInteractionPage(),
      total: product.reviewCount ?? 0,
    },
    question: {
      ...emptyInteractionPage(),
      total: product.questionCount ?? 0,
    },
  });
  const [interactionKind, setInteractionKind] =
    useState<InteractionKind | null>(null);
  const [expandedInteractionId, setExpandedInteractionId] = useState<
    string | null
  >(null);
  const [interactionMessage, setInteractionMessage] = useState("");
  const [postingInteraction, setPostingInteraction] = useState(false);
  const interactionModalRef = useRef<HTMLDivElement | null>(null);
  const interactionOpenerRef = useRef<HTMLElement | null>(null);
  const postingInteractionRef = useRef(false);
  const [purchaseMessage, setPurchaseMessage] = useState("");
  const [restockPhone, setRestockPhone] = useState("");
  const [restockMessage, setRestockMessage] = useState("");
  const [requestingRestock, setRequestingRestock] = useState(false);

  useEffect(() => {
    postingInteractionRef.current = postingInteraction;
  }, [postingInteraction]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all(
      (["review", "question"] as const).map(async (kind) => ({
        kind,
        page: await requestInteractionPage(product.id, kind, 1),
      })),
    )
      .then((results) => {
        if (cancelled) return;
        setInteractionPages({
          review:
            results.find((result) => result.kind === "review")?.page ??
            emptyInteractionPage(),
          question:
            results.find((result) => result.kind === "question")?.page ??
            emptyInteractionPage(),
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [product.id]);

  useEffect(() => {
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
        .then((result) => {
          if (!disposed) {
            setIsCustomerLoggedIn(
              Boolean(result.authenticated ?? result.user),
            );
          }
        })
        .catch(() => {
          if (!disposed) setIsCustomerLoggedIn(false);
        });
    };

    refreshSession();
    window.addEventListener(CUSTOMER_SESSION_EVENT, refreshSession);
    return () => {
      disposed = true;
      window.removeEventListener(CUSTOMER_SESSION_EVENT, refreshSession);
    };
  }, []);

  useEffect(() => {
    if (!shareMenuOpen) return;

    const closeOutside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !shareMenuRef.current?.contains(event.target)
      ) {
        setShareMenuOpen(false);
      }
    };
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShareMenuOpen(false);
    };

    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeWithEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeWithEscape);
    };
  }, [shareMenuOpen]);

  useEffect(() => {
    if (!interactionKind) return;

    const modal = interactionModalRef.current;
    const previousBodyOverflow = document.body.style.overflow;
    const previousBodyPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth =
      window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }
    modal?.style.setProperty(
      "--interaction-modal-offset",
      scrollbarWidth > 0 ? `${scrollbarWidth / -2}px` : "0px",
    );

    const focusableSelector =
      'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href]';
    const focusFirstField = window.requestAnimationFrame(() => {
      modal?.focus();
    });
    const handleModalKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !postingInteractionRef.current) {
        event.preventDefault();
        setInteractionKind(null);
        setInteractionMessage("");
        return;
      }
      if (event.key !== "Tab" || !modal) return;

      const focusable = Array.from(
        modal.querySelectorAll<HTMLElement>(focusableSelector),
      ).filter(
        (element) =>
          element.getAttribute("aria-hidden") !== "true" &&
          element.getClientRects().length > 0,
      );
      if (!focusable.length) {
        event.preventDefault();
        modal.focus();
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

    document.addEventListener("keydown", handleModalKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFirstField);
      document.removeEventListener("keydown", handleModalKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      document.body.style.paddingRight = previousBodyPaddingRight;
      modal?.style.removeProperty("--interaction-modal-offset");
      const opener = interactionOpenerRef.current;
      window.requestAnimationFrame(() => opener?.focus());
    };
  }, [interactionKind]);

  useLayoutEffect(() => {
    const viewport = thumbnailViewportRef.current;
    const track = thumbnailTrackRef.current;
    if (!viewport || !track || gallery.length <= 1) return;

    if (thumbnailProductId.current !== product.id) {
      thumbnailProductId.current = product.id;
      thumbnailInitialized.current = false;
      thumbnailOffset.current = 0;
    }

    const positionTrack = (animate: boolean) => {
      const buttons = track.querySelectorAll<HTMLButtonElement>("button");
      const active = buttons[imageIndex];
      if (!active) return;

      const viewportWidth = viewport.clientWidth;
      const trackWidth = track.scrollWidth;
      const centered =
        viewportWidth / 2 - (active.offsetLeft + active.offsetWidth / 2);
      const nextOffset =
        trackWidth <= viewportWidth
          ? (viewportWidth - trackWidth) / 2
          : Math.max(viewportWidth - trackWidth, Math.min(0, centered));

      thumbnailOffset.current = nextOffset;
      const imageDistance = Math.max(1, thumbnailTransitionDistance.current);
      const imageDuration = Math.min(
        300 * (1 + (imageDistance - 1) / 12),
        600,
      );
      track.style.transitionDuration = animate
        ? `${imageDuration * 1.1}ms`
        : "0ms";
      track.style.transform = `translate3d(${nextOffset}px, 0, 0)`;
      if (thumbnailBorderRef.current) {
        thumbnailBorderRef.current.style.transitionDuration = animate
          ? `${imageDuration * 1.2}ms`
          : "0ms";
      }
    };

    positionTrack(thumbnailInitialized.current);
    thumbnailInitialized.current = true;

    let viewportWidth = viewport.clientWidth;
    let trackWidth = track.scrollWidth;
    const observer = new ResizeObserver(() => {
      const nextViewportWidth = viewport.clientWidth;
      const nextTrackWidth = track.scrollWidth;
      if (
        nextViewportWidth === viewportWidth &&
        nextTrackWidth === trackWidth
      ) {
        return;
      }
      viewportWidth = nextViewportWidth;
      trackWidth = nextTrackWidth;
      positionTrack(false);
    });
    observer.observe(viewport);
    observer.observe(track);
    return () => observer.disconnect();
  }, [gallery.length, imageIndex, product.id]);

  useEffect(
    () => () => {
      if (tabScrollAnimation.current !== null) {
        window.cancelAnimationFrame(tabScrollAnimation.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (relatedProducts.length <= 1) return;
    const timer = window.setInterval(() => {
      const viewport = relatedViewportRef.current;
      if (!viewport) return;
      const maximum = viewport.scrollWidth - viewport.clientWidth;
      viewport.scrollTo({
        left:
          viewport.scrollLeft + viewport.clientWidth >= maximum - 2
            ? 0
            : viewport.scrollLeft + viewport.clientWidth,
        behavior: "smooth",
      });
    }, 4000);
    return () => window.clearInterval(timer);
  }, [relatedProducts.length]);

  const optionDelta = useMemo(
    () =>
      (product.options ?? []).reduce((sum, option) => {
        const selected = option.values.find(
          (value) => value.value === selectedOptions[option.id],
        );
        return sum + (selected?.priceDelta ?? 0);
      }, 0),
    [product.options, selectedOptions],
  );
  const selectedOptionValues = useMemo(
    () =>
      (product.options ?? []).flatMap((option) => {
        const selected = option.values.find(
          (value) => value.value === selectedOptions[option.id],
        );
        return selected ? [selected] : [];
      }),
    [product.options, selectedOptions],
  );
  const optionsComplete = (product.options ?? []).every(
    (option) =>
      !option.required ||
      option.values.some(
        (value) =>
          value.value === selectedOptions[option.id] && !value.disabled,
      ),
  );
  const maximumQuantity = Math.max(
    1,
    Math.min(
      product.maximumQuantity ?? 99,
      ...selectedOptionValues.map((value) => value.stock ?? 99),
    ),
  );
  const effectiveQuantity = Math.min(quantity, maximumQuantity);
  const unitPrice = product.price + optionDelta;
  const totalPrice = unitPrice * effectiveQuantity;
  const wished = onToggleWish ? initiallyWished : localWished;
  const reviews = interactionPages.review.items;
  const questions = interactionPages.question.items;
  const legacyProductTitle = product.name.endsWith("요약정보 및 구매")
    ? product.name
    : `${product.name} 요약정보 및 구매`;
  const gallerySlides =
    galleryLoops
      ? [
          {
            image: gallery[gallery.length - 1],
            logicalIndex: gallery.length - 1,
            key: "clone-last",
          },
          ...gallery.map((image, logicalIndex) => ({
            image,
            logicalIndex,
            key: `image-${logicalIndex}`,
          })),
          { image: gallery[0], logicalIndex: 0, key: "clone-first" },
        ]
      : gallery.map((image, logicalIndex) => ({
          image,
          logicalIndex,
          key: `image-${logicalIndex}`,
        }));

  function payload() {
    return {
      productId: product.id,
      quantity: effectiveQuantity,
      options: selectedOptions,
    };
  }

  function purchase(
    handler:
      | ProductDetailProps["onAddToCart"]
      | ProductDetailProps["onBuyNow"],
  ) {
    if (!optionsComplete) {
      setPurchaseMessage("필수 옵션을 모두 선택해 주세요.");
      return;
    }
    setPurchaseMessage("");
    handler?.(payload());
  }

  async function submitRestockRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (requestingRestock) return;
    setRequestingRestock(true);
    setRestockMessage("");
    try {
      const response = await fetch(
        `/api/products/${encodeURIComponent(product.id)}/restock`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ phone: restockPhone }),
        },
      );
      const result = (await response.json()) as {
        error?: string;
        message?: string;
      };
      if (!response.ok) {
        setRestockMessage(
          result.error ?? "재입고 알림을 신청하지 못했습니다.",
        );
        return;
      }
      setRestockMessage(
        result.message ?? "재입고 알림 신청이 접수되었습니다.",
      );
      setRestockPhone("");
    } catch {
      setRestockMessage(
        "네트워크 상태를 확인한 뒤 다시 신청해 주세요.",
      );
    } finally {
      setRequestingRestock(false);
    }
  }

  function toggleWish() {
    const next = !wished;
    if (onToggleWish) onToggleWish(product.id, next);
    else setLocalWished(next);
  }

  function selectProductOption(optionId: string, value: string) {
    const nextOptions = { ...selectedOptions, [optionId]: value };
    const nextMaximum = Math.max(
      1,
      Math.min(
        product.maximumQuantity ?? 99,
        ...(product.options ?? []).flatMap((option) => {
          const selected = option.values.find(
            (optionValue) => optionValue.value === nextOptions[option.id],
          );
          return selected ? [selected.stock ?? 99] : [];
        }),
      ),
    );
    setPurchaseMessage("");
    setSelectedOptions(nextOptions);
    setQuantity((current) => Math.min(current, nextMaximum));
  }

  function showImage(nextIndex: number) {
    if (gallery.length <= 1) return;
    const normalized = galleryLoops
      ? (nextIndex + gallery.length) % gallery.length
      : Math.max(0, Math.min(gallery.length - 1, nextIndex));
    if (!galleryLoops && normalized === imageIndex) {
      setGalleryDragOffset(0);
      return;
    }
    const imageDistance = Math.max(1, Math.abs(nextIndex - imageIndex));
    const transitionDuration = Math.min(
      300 * (1 + (imageDistance - 1) / 12),
      600,
    );
    thumbnailTransitionDistance.current = imageDistance;
    setGalleryTransitionDuration(transitionDuration);
    setGalleryDragOffset(0);
    setGalleryTransitionEnabled(true);
    if (!galleryLoops) {
      setGalleryPosition(normalized);
    } else if (imageIndex === 0 && nextIndex < 0) {
      setGalleryPosition(0);
    } else if (
      imageIndex === gallery.length - 1 &&
      nextIndex >= gallery.length
    ) {
      setGalleryPosition(gallery.length + 1);
    } else {
      setGalleryPosition(normalized + 1);
    }
    setImageIndex(normalized);
  }

  function finishGalleryTransition(
    event: ReactTransitionEvent<HTMLDivElement>,
  ) {
    if (
      event.currentTarget !== event.target ||
      gallery.length <= 1 ||
      !galleryLoops
    ) {
      return;
    }
    if (galleryPosition !== 0 && galleryPosition !== gallery.length + 1) return;

    setGalleryTransitionEnabled(false);
    setGalleryPosition(galleryPosition === 0 ? gallery.length : 1);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => setGalleryTransitionEnabled(true));
    });
  }

  function startGalleryDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (gallery.length <= 1 || event.button !== 0) return;
    galleryPointerStart.current = event.clientX;
    galleryPointerId.current = event.pointerId;
    galleryPointerSamples.current = [[event.timeStamp, event.clientX]];
    galleryDidDrag.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveGalleryDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (
      galleryPointerStart.current === null ||
      galleryPointerId.current !== event.pointerId
    ) {
      return;
    }
    const distance = event.clientX - galleryPointerStart.current;
    if (Math.abs(distance) >= 1) galleryDidDrag.current = true;
    galleryPointerSamples.current.push([event.timeStamp, event.clientX]);
    if (galleryPointerSamples.current.length > 80) {
      galleryPointerSamples.current.shift();
    }
    setGalleryDragOffset(distance);
  }

  function finishGalleryDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (
      galleryPointerStart.current === null ||
      galleryPointerId.current !== event.pointerId
    ) {
      return;
    }
    const distance = event.clientX - galleryPointerStart.current;
    const recentMotion = recentPointerMotion(
      galleryPointerSamples.current,
      event.timeStamp,
      event.clientX,
    );
    const stageSnap = event.currentTarget.clientWidth + 2;
    const fastFlick =
      galleryDidDrag.current &&
      recentMotion.elapsed <= 250 &&
      Math.abs(recentMotion.delta) >= 1;
    galleryPointerStart.current = null;
    galleryPointerId.current = null;
    galleryPointerSamples.current = [];
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (Math.abs(distance) >= stageSnap / 2 || fastFlick) {
      const directionDistance = fastFlick ? recentMotion.delta : distance;
      showImage(imageIndex + (directionDistance < 0 ? 1 : -1));
    } else {
      setGalleryDragOffset(0);
    }
    window.setTimeout(() => {
      galleryDidDrag.current = false;
    }, 0);
  }

  function cancelGalleryDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (
      galleryPointerStart.current === null ||
      galleryPointerId.current !== event.pointerId
    ) {
      return;
    }
    galleryPointerStart.current = null;
    galleryPointerId.current = null;
    galleryPointerSamples.current = [];
    galleryDidDrag.current = true;
    setGalleryDragOffset(0);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    window.setTimeout(() => {
      galleryDidDrag.current = false;
    }, 0);
  }

  function clickGallery(event: ReactMouseEvent<HTMLDivElement>) {
    if (gallery.length <= 1) return;
    if (galleryDidDrag.current) {
      galleryDidDrag.current = false;
      return;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    const relativeX = event.clientX - bounds.left;
    showImage(imageIndex + (relativeX > bounds.width / 3 ? 1 : -1));
  }

  function startThumbnailDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const viewport = thumbnailViewportRef.current;
    const track = thumbnailTrackRef.current;
    if (
      !viewport ||
      !track ||
      track.scrollWidth <= viewport.clientWidth ||
      event.button !== 0
    ) {
      return;
    }
    thumbnailPointerStart.current = event.clientX;
    thumbnailPointerId.current = event.pointerId;
    thumbnailPointerSamples.current = [[event.timeStamp, event.clientX]];
    thumbnailPointerOffsetStart.current = thumbnailOffset.current;
    thumbnailDidDrag.current = false;
    track.style.transitionDuration = "0ms";
  }

  function moveThumbnailDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const viewport = thumbnailViewportRef.current;
    const track = thumbnailTrackRef.current;
    if (
      !viewport ||
      !track ||
      thumbnailPointerStart.current === null ||
      thumbnailPointerId.current !== event.pointerId
    ) {
      return;
    }
    const distance = event.clientX - thumbnailPointerStart.current;
    if (Math.abs(distance) >= 4) {
      thumbnailDidDrag.current = true;
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.setPointerCapture(event.pointerId);
      }
    }
    thumbnailPointerSamples.current.push([event.timeStamp, event.clientX]);
    if (thumbnailPointerSamples.current.length > 80) {
      thumbnailPointerSamples.current.shift();
    }
    const minimum = viewport.clientWidth - track.scrollWidth;
    const nextOffset = Math.max(
      minimum,
      Math.min(0, thumbnailPointerOffsetStart.current + distance),
    );
    thumbnailOffset.current = nextOffset;
    track.style.transform = `translate3d(${nextOffset}px, 0, 0)`;
  }

  function finishThumbnailDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const viewport = thumbnailViewportRef.current;
    const track = thumbnailTrackRef.current;
    if (
      !viewport ||
      !track ||
      thumbnailPointerStart.current === null ||
      thumbnailPointerId.current !== event.pointerId
    ) {
      return;
    }
    const recentMotion = recentPointerMotion(
      thumbnailPointerSamples.current,
      event.timeStamp,
      event.clientX,
    );
    const hasMomentum =
      thumbnailDidDrag.current &&
      recentMotion.elapsed <= 250 &&
      Math.abs(recentMotion.delta) >= 1;
    const velocity = hasMomentum ? recentMotion.velocity : 0;
    const transitionDuration = hasMomentum
      ? 300 * Math.max(0.5, Math.min(2, Math.abs(velocity)))
      : 300;
    const minimum = viewport.clientWidth - track.scrollWidth;
    const projectedOffset = Math.max(
      minimum,
      Math.min(
        0,
        hasMomentum
          ? thumbnailOffset.current + (velocity * transitionDuration) / 5
          : thumbnailOffset.current,
      ),
    );
    thumbnailOffset.current = projectedOffset;
    track.style.transitionDuration = `${transitionDuration}ms`;
    track.style.transform = `translate3d(${projectedOffset}px, 0, 0)`;
    thumbnailPointerStart.current = null;
    thumbnailPointerId.current = null;
    thumbnailPointerSamples.current = [];
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    window.setTimeout(() => {
      thumbnailDidDrag.current = false;
    }, 0);
  }

  function cancelThumbnailDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const track = thumbnailTrackRef.current;
    if (
      !track ||
      thumbnailPointerStart.current === null ||
      thumbnailPointerId.current !== event.pointerId
    ) {
      return;
    }
    const restoreOffset = thumbnailPointerOffsetStart.current;
    thumbnailOffset.current = restoreOffset;
    thumbnailPointerStart.current = null;
    thumbnailPointerId.current = null;
    thumbnailPointerSamples.current = [];
    track.style.transitionDuration = "300ms";
    track.style.transform = `translate3d(${restoreOffset}px, 0, 0)`;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    window.setTimeout(() => {
      thumbnailDidDrag.current = false;
    }, 0);
  }

  function recommendProduct() {
    setShareMenuOpen(false);
    if (!isCustomerLoggedIn) {
      if (window.confirm("회원만 추천하실 수 있습니다.")) {
        const returnUrl =
          window.location.pathname + window.location.search + window.location.hash;
        window.location.assign(
          `/bbs/login.php?url=${encodeURIComponent(returnUrl)}`,
        );
      }
      return;
    }

    const popup = window.open(
      `/shop/itemrecommend.php?it_id=${encodeURIComponent(product.id)}`,
      "itemrecommend",
      "scrollbars=yes,width=616,height=420,top=10,left=10",
    );
    if (!popup) {
      setShareStatus("팝업 차단을 해제한 뒤 다시 추천하기를 눌러 주세요.");
      window.setTimeout(() => setShareStatus(""), 2200);
    }
  }

  function shareProductOn(service: "facebook" | "twitter") {
    setShareMenuOpen(false);
    const pageUrl = encodeURIComponent(window.location.href);
    const title = encodeURIComponent(product.name);
    const destination =
      service === "facebook"
        ? `https://www.facebook.com/sharer/sharer.php?u=${pageUrl}`
        : `https://twitter.com/intent/tweet?url=${pageUrl}&text=${title}`;
    window.open(
      destination,
      `${service}-share`,
      "popup,width=640,height=560,noopener,noreferrer",
    );
  }

  function selectTab(tab: ProductTab) {
    const target = document.getElementById(tabTargets[tab]);
    if (!target) return;
    const top =
      window.scrollY +
      target.getBoundingClientRect().top -
      (window.innerWidth >= 992 ? 90 : 70);
    const destination = Math.max(0, top);
    const start = window.scrollY;
    const distance = destination - start;
    const startedAt = window.performance.now();
    if (tabScrollAnimation.current !== null) {
      window.cancelAnimationFrame(tabScrollAnimation.current);
    }
    const animate = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / 500);
      const eased = 0.5 - Math.cos(Math.PI * progress) / 2;
      window.scrollTo(0, start + distance * eased);
      if (progress < 1) {
        tabScrollAnimation.current = window.requestAnimationFrame(animate);
      } else {
        tabScrollAnimation.current = null;
      }
    };
    tabScrollAnimation.current = window.requestAnimationFrame(animate);
  }

  function scrollRelated(direction: -1 | 1) {
    const viewport = relatedViewportRef.current;
    if (!viewport) return;
    const maximum = viewport.scrollWidth - viewport.clientWidth;
    const next = viewport.scrollLeft + viewport.clientWidth * direction;
    viewport.scrollTo({
      left:
        direction > 0 && next >= maximum - 2
          ? maximum
          : direction < 0 && next <= 2
            ? 0
            : next,
      behavior: "smooth",
    });
  }

  async function submitInteraction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!interactionKind || postingInteraction) return;
    setPostingInteraction(true);
    setInteractionMessage("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      const response = await fetch(
        `/api/products/${encodeURIComponent(product.id)}/interactions`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            kind: interactionKind,
            title: String(form.get("title") ?? ""),
            body: String(form.get("body") ?? ""),
            rating:
              interactionKind === "review"
                ? Number(form.get("rating") ?? 5)
                : 0,
          }),
        },
      );
      const result = (await response.json()) as {
        id?: string;
        error?: string;
      };
      if (!response.ok) {
        setInteractionMessage(
          result.error ??
            (response.status === 401
              ? "로그인 후 작성할 수 있습니다."
              : "등록하지 못했습니다."),
        );
        return;
      }
      const refreshed = await requestInteractionPage(
        product.id,
        interactionKind,
        1,
      );
      setInteractionPages((current) => ({
        ...current,
        [interactionKind]: refreshed,
      }));
      setInteractionKind(null);
      setInteractionMessage("정상적으로 등록했습니다.");
      formElement.reset();
    } catch {
      setInteractionMessage("네트워크 상태를 확인한 뒤 다시 시도해 주세요.");
    } finally {
      setPostingInteraction(false);
    }
  }

  function formatInteractionBody(
    event: ReactMouseEvent<HTMLButtonElement>,
    before: string,
    after = before,
  ) {
    const textarea =
      event.currentTarget.form?.querySelector<HTMLTextAreaElement>(
        'textarea[name="body"]',
      );
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = textarea.value.slice(start, end);
    textarea.setRangeText(
      `${before}${selected}${after}`,
      start,
      end,
      "end",
    );
    const selectionStart = start + before.length;
    textarea.focus();
    textarea.setSelectionRange(selectionStart, selectionStart + selected.length);
  }

  function interactionForm(kind: InteractionKind) {
    if (interactionKind !== kind) return null;
    return (
      <form className={styles.interactionForm} onSubmit={submitInteraction}>
        {kind === "question" ? (
          <div className={styles.interactionQuestionOptions}>
            <div className={styles.interactionOptionRow}>
              <strong>옵션</strong>
              <label className={styles.interactionSecretOption}>
                <input type="checkbox" name="secret" />
                <span aria-hidden="true">✓</span>
                비밀글
              </label>
            </div>
            <label className={styles.interactionContactField}>
              <span>이메일</span>
              <span className={styles.interactionInputWithIcon}>
                <input
                  type="email"
                  name="email"
                  autoComplete="email"
                  placeholder="이메일"
                />
                <i aria-hidden="true"></i>
              </span>
              <small>
                이메일을 입력하시면 답변 등록 시 답변 안내를 받을 수 있습니다.
              </small>
            </label>
            <label className={styles.interactionContactField}>
              <span>휴대폰</span>
              <span className={styles.interactionInputWithIcon}>
                <input
                  type="tel"
                  name="phone"
                  autoComplete="tel"
                  placeholder="휴대폰"
                />
                <i aria-hidden="true"></i>
              </span>
              <small>
                휴대폰번호를 입력하시면 답변 등록 시 알림을 받을 수 있습니다.
              </small>
            </label>
          </div>
        ) : null}
        <label className={styles.interactionTitleField}>
          <span className={styles.srOnly}>제목</span>
          <input
            name="title"
            required
            minLength={2}
            maxLength={120}
            placeholder="제목"
            aria-label="제목 필수"
          />
        </label>
        <label className={styles.interactionEditor}>
          <span className={styles.srOnly}>
            {kind === "review" ? "내용" : "질문"}
          </span>
          <span
            className={styles.interactionEditorShortcuts}
            aria-hidden="true"
          >
            단축키 일람
          </span>
          <span className={styles.interactionEditorToolbar} aria-label="글 편집 도구">
            <select aria-label="글꼴" defaultValue="돋움">
              <option>돋움</option>
              <option>굴림</option>
              <option>바탕</option>
            </select>
            <select aria-label="글자 크기" defaultValue="9pt">
              <option>9pt</option>
              <option>10pt</option>
              <option>12pt</option>
              <option>14pt</option>
            </select>
            <button
              type="button"
              title="굵게"
              aria-label="굵게"
              onClick={(event) => formatInteractionBody(event, "**")}
            >
              B
            </button>
            <button
              type="button"
              title="밑줄"
              aria-label="밑줄"
              onClick={(event) => formatInteractionBody(event, "__")}
            >
              U
            </button>
            <button
              type="button"
              title="기울임꼴"
              aria-label="기울임꼴"
              onClick={(event) => formatInteractionBody(event, "*")}
            >
              I
            </button>
            <button
              type="button"
              title="취소선"
              aria-label="취소선"
              onClick={(event) => formatInteractionBody(event, "~~")}
            >
              S
            </button>
            <button
              type="button"
              title="글자색"
              aria-label="글자색"
              onClick={(event) =>
                formatInteractionBody(
                  event,
                  '<span style="color:#d22605">',
                  "</span>",
                )
              }
            >
              A
            </button>
            <button
              type="button"
              title="배경색"
              aria-label="배경색"
              onClick={(event) =>
                formatInteractionBody(
                  event,
                  '<span style="background:#fff2a8">',
                  "</span>",
                )
              }
            >
              ▧
            </button>
            <button
              type="button"
              title="윗첨자"
              aria-label="윗첨자"
              onClick={(event) =>
                formatInteractionBody(event, "<sup>", "</sup>")
              }
            >
              x²
            </button>
            <button
              type="button"
              title="아래첨자"
              aria-label="아래첨자"
              onClick={(event) =>
                formatInteractionBody(event, "<sub>", "</sub>")
              }
            >
              x₂
            </button>
            <button
              type="button"
              title="왼쪽정렬"
              aria-label="왼쪽정렬"
              onClick={(event) =>
                formatInteractionBody(
                  event,
                  '<div style="text-align:left">',
                  "</div>",
                )
              }
            >
              ≡
            </button>
            <button
              type="button"
              title="가운데정렬"
              aria-label="가운데정렬"
              onClick={(event) =>
                formatInteractionBody(event, "<center>", "</center>")
              }
            >
              ≣
            </button>
            <button
              type="button"
              title="오른쪽정렬"
              aria-label="오른쪽정렬"
              onClick={(event) =>
                formatInteractionBody(
                  event,
                  '<div style="text-align:right">',
                  "</div>",
                )
              }
            >
              ≡
            </button>
            <button
              type="button"
              title="양쪽정렬"
              aria-label="양쪽정렬"
              onClick={(event) =>
                formatInteractionBody(
                  event,
                  '<div style="text-align:justify">',
                  "</div>",
                )
              }
            >
              ▤
            </button>
            <button
              type="button"
              title="인용구"
              aria-label="인용구"
              onClick={(event) => formatInteractionBody(event, "> ", "")}
            >
              ❝
            </button>
            <button
              type="button"
              title="링크"
              aria-label="링크"
              onClick={(event) =>
                formatInteractionBody(event, "[", "](https://)")
              }
            >
              URL
            </button>
            <button
              type="button"
              title="특수기호"
              aria-label="특수기호"
              onClick={(event) => formatInteractionBody(event, "☆", "")}
            >
              ※
            </button>
            <button
              type="button"
              title="표"
              aria-label="표"
              onClick={(event) =>
                formatInteractionBody(
                  event,
                  "| 항목 | 내용 |\n| --- | --- |\n| ",
                  " |",
                )
              }
            >
              ▦
            </button>
          </span>
          <textarea
            name="body"
            required
            minLength={5}
            maxLength={5000}
            rows={12}
            aria-label={kind === "review" ? "내용" : "질문"}
          />
          <span className={styles.interactionEditorResizeHint}>
            아래 영역을 드래그하여 입력창 크기를 조절할 수 있습니다.
          </span>
        </label>
        {kind === "review" ? (
          <fieldset className={styles.interactionRating}>
            <legend>평점</legend>
            {[5, 4, 3, 2, 1].map((rating) => (
              <label key={rating}>
                <input
                  type="radio"
                  name="rating"
                  value={rating}
                  defaultChecked={rating === 5}
                />
                <span>
                  {
                    ["매우불만", "불만", "보통", "만족", "매우만족"][
                      rating - 1
                    ]
                  }
                </span>
                <strong aria-label={`${rating}점`}>
                  {"★".repeat(rating)}
                  <i>{"★".repeat(5 - rating)}</i>
                </strong>
              </label>
            ))}
          </fieldset>
        ) : null}
        <div className={styles.interactionFormActions}>
          <button type="submit" disabled={postingInteraction}>
            {postingInteraction ? "등록 중…" : "작성완료"}
          </button>
        </div>
      </form>
    );
  }

  function interactionList(items: ProductInteraction[]) {
    if (!items.length) return null;
    return (
      <ol className={styles.interactionList}>
        {items.map((item) => {
          const expanded = expandedInteractionId === item.id;
          const contentId = `interaction-${item.kind}-${item.id}`;
          return (
            <li key={item.id} className={styles.interactionItem}>
              <button
                type="button"
                className={styles.interactionToggle}
                onClick={() =>
                  setExpandedInteractionId((current) =>
                    current === item.id ? null : item.id,
                  )
                }
                aria-expanded={expanded}
                aria-controls={contentId}
              >
                <strong>{item.title}</strong>
                {item.kind === "review" ? (
                  <span aria-label={`평점 ${item.rating}점`}>
                    {"★".repeat(item.rating)}
                    {"☆".repeat(5 - item.rating)}
                  </span>
                ) : null}
              </button>
              <div
                id={contentId}
                className={classNames(
                  styles.interactionCollapse,
                  expanded && styles.interactionCollapseOpen,
                )}
              >
                <div>
                  <p
                    dangerouslySetInnerHTML={{
                      __html: interactionBodyMarkup(item.body),
                    }}
                  />
                  <small>
                    {item.authorName} ·{" "}
                    {new Date(item.createdAt).toLocaleDateString("ko-KR")}
                  </small>
                  {item.answer ? (
                    <div className={styles.interactionAnswer}>
                      <strong>관리자 답변</strong>
                      <p>{item.answer}</p>
                    </div>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    );
  }

  function interactionPagination(kind: InteractionKind) {
    const page = interactionPages[kind];
    if (page.pageCount <= 1) return null;
    return (
      <div className={styles.interactionPagination}>
        <button
          type="button"
          disabled={page.page <= 1}
          onClick={() => void changeInteractionPage(kind, page.page - 1)}
        >
          이전
        </button>
        <span>
          {page.page} / {page.pageCount}
        </span>
        <button
          type="button"
          disabled={page.page >= page.pageCount}
          onClick={() => void changeInteractionPage(kind, page.page + 1)}
        >
          다음
        </button>
      </div>
    );
  }

  async function changeInteractionPage(
    kind: InteractionKind,
    page: number,
  ) {
    try {
      const next = await requestInteractionPage(product.id, kind, page);
      setInteractionPages((current) => ({ ...current, [kind]: next }));
    } catch {
      setInteractionMessage("목록을 불러오지 못했습니다.");
    }
  }

  function detailTabs(active: ProductTab) {
    return (
      <nav
        className={styles.productTabs}
        aria-label="상품 상세 메뉴"
        data-legacy-role="pg-anchor-in"
      >
        {tabs.map((tab) => (
          <a
            href={`#${tabTargets[tab.id]}`}
            key={tab.id}
            onClick={(event) => {
              event.preventDefault();
              selectTab(tab.id);
            }}
            className={active === tab.id ? styles.productTabActive : undefined}
          >
            {tab.label}
            {tab.id === "reviews"
              ? ` ${interactionPages.review.total}`
              : ""}
            {tab.id === "questions"
              ? ` ${interactionPages.question.total}`
              : ""}
          </a>
        ))}
        <span className={styles.productTabsBottomLine} aria-hidden="true" />
      </nav>
    );
  }

  return (
    <>
      <PageHeading title={product.categoryLabel} />
      <main
        id="main-content"
        className={styles.productDetailPage}
        data-product-detail="legacy"
      >
        <div className={styles.container}>
          <nav
            className={styles.productPager}
            aria-label="상품 경로"
            data-legacy-role="shop-list-nav"
          >
            {breadcrumbs
              .filter((breadcrumb) => breadcrumb.label !== product.name)
              .map((breadcrumb, index) =>
                breadcrumb.href ? (
                  <a
                    href={breadcrumb.href}
                    key={`${breadcrumb.label}-${index}`}
                    className={index === 0 ? styles.productPagerHome : undefined}
                  >
                    {breadcrumb.label}
                  </a>
                ) : (
                  <span key={`${breadcrumb.label}-${index}`}>
                    {breadcrumb.label}
                  </span>
                ),
              )}
          </nav>

          <section
            className={styles.productDetailTop}
            data-legacy-role="shop-product"
          >
            <div className={styles.productGallery}>
              <div
                className={styles.productGalleryViewer}
                onPointerEnter={() => setGalleryControlsVisible(true)}
                onPointerLeave={() => setGalleryControlsVisible(false)}
              >
                <div
                  className={classNames(
                    styles.productMainImage,
                    galleryControlsVisible && styles.galleryControlsVisible,
                  )}
                  onPointerDown={startGalleryDrag}
                  onPointerMove={moveGalleryDrag}
                  onPointerUp={finishGalleryDrag}
                  onPointerCancel={cancelGalleryDrag}
                  onLostPointerCapture={cancelGalleryDrag}
                  onClick={clickGallery}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowLeft") {
                      event.preventDefault();
                      showImage(imageIndex - 1);
                    }
                    if (event.key === "ArrowRight") {
                      event.preventDefault();
                      showImage(imageIndex + 1);
                    }
                  }}
                  role="group"
                  aria-label={`${product.name} 상품 이미지`}
                  tabIndex={0}
                >
                  <div
                    className={styles.productImageTrack}
                    onTransitionEnd={finishGalleryTransition}
                    style={
                      {
                        transform: `translate3d(calc(${-galleryPosition * 100}% + ${galleryDragOffset - galleryPosition * 2}px), 0, 0)`,
                        transition:
                          galleryDragOffset === 0 && galleryTransitionEnabled
                            ? `transform ${galleryTransitionDuration}ms cubic-bezier(.1, 0, .25, 1)`
                            : "none",
                      } satisfies CSSProperties
                    }
                  >
                    {gallerySlides.map(({ image, logicalIndex, key }) => (
                      <div
                        className={styles.productImageSlide}
                        key={`${image}-${key}`}
                        aria-hidden={
                          key.startsWith("clone-") ||
                          logicalIndex !== imageIndex
                        }
                      >
                        <img
                          src={image}
                          alt={
                            logicalIndex === imageIndex &&
                            !key.startsWith("clone-")
                              ? product.name
                              : ""
                          }
                          className={styles.productImage}
                          ref={(element) => {
                            if (element?.complete) {
                              element.classList.add(styles.productImageLoaded);
                            }
                          }}
                          onLoad={(event) =>
                            event.currentTarget.classList.add(
                              styles.productImageLoaded,
                            )
                          }
                          draggable={false}
                        />
                      </div>
                    ))}
                  </div>
                  {gallery.length > 1 ? (
                    <>
                      <button
                        type="button"
                        className={classNames(
                          styles.galleryArrow,
                          styles.galleryArrowPrevious,
                        )}
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => {
                          event.stopPropagation();
                          showImage(imageIndex - 1);
                        }}
                        disabled={!galleryLoops && imageIndex === 0}
                        aria-label="이전 상품 이미지"
                      >
                        ‹
                      </button>
                      <button
                        type="button"
                        className={classNames(
                          styles.galleryArrow,
                          styles.galleryArrowNext,
                        )}
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => {
                          event.stopPropagation();
                          showImage(imageIndex + 1);
                        }}
                        disabled={
                          !galleryLoops && imageIndex === gallery.length - 1
                        }
                        aria-label="다음 상품 이미지"
                      >
                        ›
                      </button>
                    </>
                  ) : null}
                  {product.badge ? (
                    <span className={styles.detailBadge}>{product.badge}</span>
                  ) : null}
                  {product.soldOut ? (
                    <span className={styles.detailSoldOut}>SOLD OUT</span>
                  ) : null}
                </div>
                {gallery.length > 1 ? (
                  <div
                    className={styles.productThumbnails}
                    role="group"
                    aria-label="상품 이미지 미리보기"
                    ref={thumbnailViewportRef}
                    onPointerDown={startThumbnailDrag}
                    onPointerMove={moveThumbnailDrag}
                    onPointerUp={finishThumbnailDrag}
                    onPointerCancel={cancelThumbnailDrag}
                    onLostPointerCapture={cancelThumbnailDrag}
                  >
                    <div
                      className={styles.productThumbnailTrack}
                      ref={thumbnailTrackRef}
                    >
                      {gallery.map((image, index) => (
                        <button
                          type="button"
                          key={`${image}-${index}`}
                          onClick={(event) => {
                            if (thumbnailDidDrag.current) {
                              event.preventDefault();
                              return;
                            }
                            showImage(index);
                          }}
                          className={
                            index === imageIndex
                              ? styles.thumbnailActive
                              : undefined
                          }
                          aria-label={`${index + 1}번째 상품 이미지 보기`}
                          aria-current={
                            index === imageIndex ? "true" : undefined
                          }
                        >
                          <img src={image} alt="" draggable={false} />
                        </button>
                      ))}
                      <span
                        className={styles.thumbnailActiveBorder}
                        ref={thumbnailBorderRef}
                        style={{
                          transform: `translate3d(${imageIndex * 66}px, 0, 0)`,
                        }}
                        aria-hidden="true"
                      />
                    </div>
                  </div>
                ) : null}
              </div>
              <div className={styles.productGallerySpacer} aria-hidden="true" />

              <nav className={styles.productPreviousNext} aria-label="이전·다음 상품">
                {previousProduct ? (
                  <a
                    href={previousProduct.href}
                    title={`${previousProduct.name} 요약정보 및 구매`}
                    className={styles.productPrevious}
                  >
                    <span aria-hidden="true" />
                    이전상품
                  </a>
                ) : null}
                {nextProduct ? (
                  <a
                    href={nextProduct.href}
                    title={`${nextProduct.name} 요약정보 및 구매`}
                    className={styles.productNext}
                  >
                    다음 상품
                    <span aria-hidden="true" />
                  </a>
                ) : null}
              </nav>

              <div className={styles.detailUtility}>
                <span title="사용후기">
                  <span
                    className={styles.detailReviewIcon}
                    aria-hidden="true"
                  />
                  <span className={styles.srOnly}>사용후기</span>{" "}
                  {interactionPages.review.total}
                </span>
                <i aria-hidden="true" />
                <span title="위시리스트저장">
                  <span
                    className={styles.detailWishIcon}
                    aria-hidden="true"
                  />
                  <span className={styles.srOnly}>위시리스트저장</span>{" "}
                  {wished ? 1 : 0}
                </span>
                <div className={styles.productShare} ref={shareMenuRef}>
                  <button
                    type="button"
                    className={styles.productShareButton}
                    onClick={() => setShareMenuOpen((open) => !open)}
                    aria-label="SNS 공유"
                    aria-expanded={shareMenuOpen}
                  >
                    <span className={styles.srOnly}>SNS 공유</span>
                  </button>
                  {shareMenuOpen ? (
                    <div className={styles.productShareMenu}>
                      <button
                        type="button"
                        className={styles.shareFacebook}
                        onClick={() => shareProductOn("facebook")}
                        aria-label="페이스북에 공유"
                      >
                        f
                      </button>
                      <button
                        type="button"
                        className={styles.shareTwitter}
                        onClick={() => shareProductOn("twitter")}
                        aria-label="트위터에 공유"
                      >
                        t
                      </button>
                      <button
                        type="button"
                        className={styles.shareRecommend}
                        onClick={recommendProduct}
                        aria-label="추천하기"
                      >
                        ✉
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <div className={styles.productPurchase}>
              {shareStatus ? (
                <p className={styles.shareStatus} role="status">
                  {shareStatus}
                </p>
              ) : null}

              <div className={styles.productTitleBlock}>
                <h1>{legacyProductTitle}</h1>
                {product.shortDescription || product.description ? (
                  <p>{product.shortDescription ?? product.description}</p>
                ) : null}
              </div>

              <div className={styles.productMeta}>
                <table>
                  <tbody>
                    <tr className={styles.productPriceRow}>
                      <th scope="row">판매가격</th>
                      <td>
                        <strong>{formatKRW(product.price)}</strong>
                        {product.compareAtPrice &&
                        product.compareAtPrice > product.price ? (
                          <del>{formatKRW(product.compareAtPrice)}</del>
                        ) : null}
                      </td>
                    </tr>
                    <tr>
                      <th scope="row">포인트</th>
                      <td>{formatKRW(product.rewardPoints ?? 0)}</td>
                    </tr>
                    <tr>
                      <th scope="row">배송비결제</th>
                      <td>{product.shippingLabel ?? "주문시 결제"}</td>
                    </tr>
                    {product.maker ? (
                      <tr>
                        <th scope="row">제조사</th>
                        <td>{product.maker}</td>
                      </tr>
                    ) : null}
                    {product.origin ? (
                      <tr>
                        <th scope="row">원산지</th>
                        <td>{product.origin}</td>
                      </tr>
                    ) : null}
                    {product.brand ? (
                      <tr>
                        <th scope="row">브랜드</th>
                        <td>{product.brand}</td>
                      </tr>
                    ) : null}
                    {product.model ? (
                      <tr>
                        <th scope="row">모델</th>
                        <td>{product.model}</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>

              {product.options?.length ? (
                <div className={styles.productOptions}>
                  {product.options.map((option) => (
                    <label key={option.id}>
                      <span>
                        {option.label}
                        {option.required ? <em>필수</em> : null}
                      </span>
                      <select
                        required={option.required}
                        value={selectedOptions[option.id] ?? ""}
                        onChange={(event) =>
                          selectProductOption(option.id, event.target.value)
                        }
                      >
                        <option value="">선택해 주세요</option>
                        {option.values.map((value) => (
                          <option
                            key={value.value}
                            value={value.value}
                            disabled={value.disabled}
                          >
                            {value.label}
                            {value.priceDelta
                              ? ` (${value.priceDelta > 0 ? "+" : ""}${formatKRW(
                                  value.priceDelta,
                                )})`
                              : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              ) : null}

              <div className={styles.selectedProduct}>
                <div>
                  <strong>{legacyProductTitle}</strong>
                </div>
                <QuantitySelector
                  value={effectiveQuantity}
                  maximum={maximumQuantity}
                  onChange={setQuantity}
                  disableAtBounds={false}
                />
                <strong>
                  {optionDelta >= 0 ? "+" : "−"}
                  {formatKRW(Math.abs(optionDelta))}
                </strong>
              </div>

              <div className={styles.totalPrice}>
                <span>총 금액 :</span>
                <strong>
                  {Math.max(0, Math.round(totalPrice)).toLocaleString("ko-KR")} 원
                </strong>
              </div>

              <div className={styles.purchaseButtons}>
                <button
                  className={styles.buyButton}
                  type="button"
                  onClick={() => purchase(onBuyNow)}
                  disabled={product.soldOut}
                >
                  <span className={styles.purchaseBuyIcon} aria-hidden="true" />{" "}
                  {product.soldOut ? "품절" : "바로구매"}
                </button>
                <button
                  className={styles.cartButton}
                  type="button"
                  onClick={() => purchase(onAddToCart)}
                  disabled={product.soldOut}
                >
                  <span className={styles.purchaseCartIcon} aria-hidden="true" />{" "}
                  장바구니
                </button>
                <button
                  className={classNames(
                    styles.wishButton,
                    wished && styles.wishButtonActive,
                  )}
                  type="button"
                  onClick={toggleWish}
                >
                  <span className={styles.purchaseWishIcon} aria-hidden="true" />
                  <span className={styles.srOnly}>위시리스트</span>
                </button>
              </div>
              {purchaseMessage ? (
                <p className={styles.purchaseMessage} role="alert">
                  {purchaseMessage}
                </p>
              ) : null}
              {product.soldOut && product.restockNotification ? (
                <form
                  className={styles.restockForm}
                  onSubmit={submitRestockRequest}
                >
                  <strong>재입고 알림 신청</strong>
                  <p>입고되면 입력하신 휴대전화 번호로 알려드립니다.</p>
                  <div>
                    <input
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      value={restockPhone}
                      maxLength={20}
                      required
                      aria-label="재입고 알림 휴대전화 번호"
                      placeholder="010-0000-0000"
                      onChange={(event) =>
                        setRestockPhone(event.currentTarget.value)
                      }
                    />
                    <button type="submit" disabled={requestingRestock}>
                      {requestingRestock ? "신청 중" : "알림 신청"}
                    </button>
                  </div>
                  {restockMessage ? (
                    <p role="status">{restockMessage}</p>
                  ) : null}
                </form>
              ) : null}
            </div>
          </section>

          <section
            className={styles.relatedProducts}
            data-legacy-role="sit-rel"
          >
            <h2>관련상품</h2>
            {relatedProducts.length > 0 ? (
              <div className={styles.relatedCarousel}>
                <div
                  className={styles.relatedViewport}
                  ref={relatedViewportRef}
                >
                  <div className={styles.relatedTrack}>
                    {relatedProducts.map((related) => (
                      <article className={styles.relatedCard} key={related.id}>
                        <a href={related.href}>
                          <span className={styles.relatedImage}>
                            <img src={related.image} alt="" />
                          </span>
                          <strong>{related.name}</strong>
                        </a>
                        <p>
                          <b>{formatKRW(related.price)}</b>
                          {related.compareAtPrice &&
                          related.compareAtPrice > related.price ? (
                            <del>{formatKRW(related.compareAtPrice)}</del>
                          ) : null}
                        </p>
                      </article>
                    ))}
                  </div>
                </div>
                <button
                  type="button"
                  className={styles.relatedPrevious}
                  onClick={() => scrollRelated(-1)}
                  aria-label="이전 관련상품"
                >
                  ‹
                </button>
                <button
                  type="button"
                  className={styles.relatedNext}
                  onClick={() => scrollRelated(1)}
                  aria-label="다음 관련상품"
                >
                  ›
                </button>
              </div>
            ) : (
              <div className={styles.relatedEmptyWrap}>
                <p className={styles.relatedEmpty}>
                  <span aria-hidden="true" /> 등록된 상품이 없습니다.
                </p>
              </div>
            )}
          </section>

          <section
            id="sit_inf"
            className={styles.detailContentSection}
          >
            {detailTabs("info")}
            {product.description ? (
              <div className={styles.productBasicDescription}>
                <p>{product.description}</p>
              </div>
            ) : null}
            {product.details ? (
              <div className={styles.productRichDetails}>{product.details}</div>
            ) : null}
            {product.noticeRows?.length ? (
              <div className={styles.productNotice}>
                <table>
                  <thead>
                    <tr>
                      <th scope="col">항목</th>
                      <th scope="col">내용</th>
                    </tr>
                  </thead>
                  <tbody>
                    {product.noticeRows.map((row) => (
                      <tr key={row.label}>
                        <th scope="row">{row.label}</th>
                        <td>{row.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>

          <section
            id="sit_use"
            className={styles.detailContentSection}
          >
            {detailTabs("reviews")}
            <div className={styles.detailSectionHeading}>
              <button
                type="button"
                onClick={(event) => {
                  interactionOpenerRef.current = event.currentTarget;
                  setInteractionKind("review");
                  setInteractionMessage("");
                }}
              >
                사용후기 쓰기
              </button>
              <a
                href="#sit_use"
                onClick={(event) => {
                  event.preventDefault();
                  selectTab("reviews");
                }}
              >
                더보기
              </a>
            </div>
            {interactionList(reviews) ?? (
              <p className={styles.legacyEmptyMessage}>
                <span aria-hidden="true" /> 사용후기가 없습니다.
              </p>
            )}
            {interactionPagination("review")}
          </section>

          <section
            id="sit_qa"
            className={styles.detailContentSection}
          >
            {detailTabs("questions")}
            <div
              className={classNames(
                styles.detailSectionHeading,
                styles.questionSectionHeading,
              )}
            >
              <button
                type="button"
                onClick={(event) => {
                  interactionOpenerRef.current = event.currentTarget;
                  setInteractionKind("question");
                  setInteractionMessage("");
                }}
              >
                상품문의 쓰기
              </button>
              <a
                href="#sit_qa"
                onClick={(event) => {
                  event.preventDefault();
                  selectTab("questions");
                }}
              >
                더보기
              </a>
            </div>
            {interactionList(questions) ?? (
              <p className={styles.legacyEmptyMessage}>
                <span aria-hidden="true" /> 상품문의가 없습니다.
              </p>
            )}
            {interactionPagination("question")}
          </section>

          <section
            id="sit_dvr"
            className={styles.detailContentSection}
          >
            {detailTabs("shipping")}
            <div className={styles.informationCopy}>
              {product.shippingInfo ?? (
                <p>
                  결제 완료건에 한하여 택배로 출고됩니다. 주문 상품과
                  공휴일 일정에 따라 출고가 지연될 수 있습니다.
                </p>
              )}
            </div>
          </section>

          <section
            id="sit_ex"
            className={styles.detailContentSection}
          >
            {detailTabs("exchange")}
            <div className={styles.informationCopy}>
              {product.exchangeInfo ?? (
                <p>
                  반품은 배송완료일로부터 7일 이내에 신청해 주십시오.
                  주문제작 및 훼손된 상품은 교환·반품이 제한될 수 있습니다.
                </p>
              )}
            </div>
          </section>
        </div>
      </main>
      {interactionKind ? (
        <div
          className={styles.interactionModalBackdrop}
          onMouseDown={(event) => {
            if (event.currentTarget === event.target && !postingInteraction) {
              setInteractionKind(null);
              setInteractionMessage("");
            }
          }}
        >
          <div
            className={styles.interactionModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="interaction-modal-title"
            ref={interactionModalRef}
            tabIndex={-1}
          >
            <header>
              <strong id="interaction-modal-title">
                <span aria-hidden="true">
                  {interactionKind === "review" ? "" : ""}
                </span>
                {interactionKind === "review"
                  ? "사용후기 작성하기"
                  : "상품문의 작성하기"}
              </strong>
              <button
                type="button"
                onClick={() => {
                  setInteractionKind(null);
                  setInteractionMessage("");
                }}
                disabled={postingInteraction}
                aria-label="닫기"
              >
                ×
              </button>
            </header>
            <div className={styles.interactionModalBody}>
              <div className={styles.interactionModalFrame}>
                {interactionMessage ? (
                  <p className={styles.interactionMessage} role="status">
                    {interactionMessage}
                  </p>
                ) : null}
                {interactionForm(interactionKind)}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function interactionBodyMarkup(body: string) {
  return body
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&#039;")
    .replace(
      /&lt;span style=&quot;color:#d22605&quot;&gt;/gu,
      '<span style="color:#d22605">',
    )
    .replace(
      /&lt;span style=&quot;background:#fff2a8&quot;&gt;/gu,
      '<span style="background:#fff2a8">',
    )
    .replace(/&lt;\/span&gt;/gu, "</span>")
    .replace(/&lt;sup&gt;/gu, "<sup>")
    .replace(/&lt;\/sup&gt;/gu, "</sup>")
    .replace(/&lt;sub&gt;/gu, "<sub>")
    .replace(/&lt;\/sub&gt;/gu, "</sub>")
    .replace(/&lt;center&gt;/gu, '<div style="text-align:center">')
    .replace(/&lt;\/center&gt;/gu, "</div>")
    .replace(
      /&lt;div style=&quot;text-align:(left|right|justify)&quot;&gt;/gu,
      '<div style="text-align:$1">',
    )
    .replace(/&lt;\/div&gt;/gu, "</div>")
    .replace(/\*\*(.+?)\*\*/gu, "<strong>$1</strong>")
    .replace(/__(.+?)__/gu, "<u>$1</u>")
    .replace(/~~(.+?)~~/gu, "<s>$1</s>")
    .replace(/\*([^*\n]+?)\*/gu, "<em>$1</em>")
    .replace(
      /\[([^\]\n]+)\]\((https:\/\/[^\s<]+)\)/gu,
      '<a href="$2" rel="noreferrer noopener" target="_blank">$1</a>',
    )
    .replace(/^&gt; (.+)$/gmu, "<blockquote>$1</blockquote>")
    .replace(/\r?\n/gu, "<br />");
}

function emptyInteractionPage(): InteractionPage {
  return {
    items: [],
    page: 1,
    pageSize: 10,
    pageCount: 1,
    total: 0,
  };
}

async function requestInteractionPage(
  productId: string,
  kind: InteractionKind,
  page: number,
): Promise<InteractionPage> {
  const params = new URLSearchParams({
    kind,
    page: String(Math.max(1, Math.trunc(page) || 1)),
    pageSize: "10",
  });
  const response = await fetch(
    `/api/products/${encodeURIComponent(productId)}/interactions?${params.toString()}`,
    { cache: "no-store" },
  );
  if (!response.ok) return emptyInteractionPage();
  const result = (await response.json()) as {
    items?: ProductInteraction[];
    pagination?: Omit<InteractionPage, "items">;
  };
  return {
    items: result.items ?? [],
    page: result.pagination?.page ?? 1,
    pageSize: result.pagination?.pageSize ?? 10,
    pageCount: result.pagination?.pageCount ?? 1,
    total: result.pagination?.total ?? 0,
  };
}
