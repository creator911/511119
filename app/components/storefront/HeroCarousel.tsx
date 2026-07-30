"use client";

import {
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import styles from "./Storefront.module.css";
import type { HeroSlide } from "./types";
import { classNames } from "./utils";

export interface HeroCarouselProps {
  slides: HeroSlide[];
  autoPlayMs?: number;
  pauseOnHover?: boolean;
  className?: string;
}

interface PointerGesture {
  pointerId: number;
  startX: number;
  startY: number;
  axis: "pending" | "horizontal" | "vertical";
}

const DRAG_ACTIVATION_PX = 6;

export function HeroCarousel({
  slides,
  autoPlayMs = 5000,
  pauseOnHover = true,
  className,
}: HeroCarouselProps) {
  const [trackIndex, setTrackIndex] = useState(slides.length > 1 ? 1 : 0);
  const [transitionEnabled, setTransitionEnabled] = useState(false);
  const [paused, setPaused] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const viewportRef = useRef<HTMLDivElement>(null);
  const pointerGestureRef = useRef<PointerGesture | null>(null);
  const dragOffsetRef = useRef(0);
  const suppressClickUntilRef = useRef(0);
  const extendedSlides = useMemo(
    () =>
      slides.length > 1
        ? [
            { slide: slides[slides.length - 1], originalIndex: slides.length - 1 },
            ...slides.map((slide, originalIndex) => ({ slide, originalIndex })),
            { slide: slides[0], originalIndex: 0 },
          ]
        : slides.map((slide, originalIndex) => ({ slide, originalIndex })),
    [slides],
  );

  const visibleIndex =
    slides.length > 1
      ? ((trackIndex - 1) % slides.length + slides.length) % slides.length
      : 0;

  useEffect(() => {
    if (transitionEnabled || slides.length <= 1) return;
    const frame = window.requestAnimationFrame(() => {
      setTransitionEnabled(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [slides.length, transitionEnabled]);

  useEffect(() => {
    if (slides.length <= 1 || paused || dragging || autoPlayMs <= 0) return;
    const timer = window.setInterval(() => {
      setTransitionEnabled(true);
      setTrackIndex((current) => current + 1);
    }, autoPlayMs);
    return () => window.clearInterval(timer);
  }, [autoPlayMs, dragging, paused, slides.length]);

  if (slides.length === 0) return null;

  function move(delta: number) {
    setTransitionEnabled(true);
    setTrackIndex((current) => current + delta);
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (
      slides.length <= 1 ||
      !event.isPrimary ||
      (event.pointerType === "mouse" && event.button !== 0)
    ) {
      return;
    }

    pointerGestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      axis: "pending",
    };
    dragOffsetRef.current = 0;
    setDragOffset(0);
    setDragging(true);
    setTransitionEnabled(false);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
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
        dragOffsetRef.current = 0;
        setDragOffset(0);
        setDragging(false);
        setTransitionEnabled(true);
        return;
      }

      gesture.axis = "horizontal";
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.setPointerCapture(event.pointerId);
      }
    }

    if (gesture.axis !== "horizontal") return;

    const nextOffset = deltaX;
    dragOffsetRef.current = nextOffset;
    setDragOffset(nextOffset);
    event.preventDefault();
  }

  function finishPointerDrag(
    event: ReactPointerEvent<HTMLDivElement>,
    cancelled = false,
  ) {
    const gesture = pointerGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;
    const horizontalDrag =
      gesture.axis === "horizontal" ||
      (gesture.axis === "pending" &&
        Math.abs(deltaX) >= DRAG_ACTIVATION_PX &&
        Math.abs(deltaX) > Math.abs(deltaY));
    const viewportWidth =
      viewportRef.current?.getBoundingClientRect().width || window.innerWidth;
    const swipeThreshold = viewportWidth / 5;
    const changedSlide =
      !cancelled &&
      horizontalDrag &&
      Math.abs(deltaX) >= swipeThreshold;

    if (horizontalDrag) {
      suppressClickUntilRef.current = window.performance.now() + 400;
    }

    pointerGestureRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    dragOffsetRef.current = 0;
    setDragging(false);
    setTransitionEnabled(true);
    setDragOffset(0);

    if (changedSlide) {
      setTrackIndex((current) => current + (deltaX < 0 ? 1 : -1));
    }
  }

  function handleClickCapture(event: ReactMouseEvent<HTMLDivElement>) {
    if (window.performance.now() < suppressClickUntilRef.current) {
      event.preventDefault();
      event.stopPropagation();
      suppressClickUntilRef.current = 0;
    }
  }

  return (
    <section
      className={classNames(styles.hero, className)}
      aria-roledescription="carousel"
      aria-label="메인 프로모션"
      onMouseEnter={() => pauseOnHover && setPaused(true)}
      onMouseLeave={() => pauseOnHover && setPaused(false)}
      onFocus={() => pauseOnHover && setPaused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") move(-1);
        if (event.key === "ArrowRight") move(1);
      }}
    >
      <div
        ref={viewportRef}
        className={styles.heroViewport}
        style={{
          touchAction: "pan-y",
          userSelect: "none",
        }}
        onClickCapture={handleClickCapture}
        onDragStart={(event) => event.preventDefault()}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={(event) => finishPointerDrag(event)}
        onPointerLeave={(event) => {
          const gesture = pointerGestureRef.current;
          if (
            !gesture ||
            gesture.pointerId !== event.pointerId ||
            event.currentTarget.hasPointerCapture(event.pointerId)
          ) {
            return;
          }
          finishPointerDrag(event, true);
        }}
        onPointerCancel={(event) => finishPointerDrag(event, true)}
        onLostPointerCapture={(event) => finishPointerDrag(event, true)}
      >
        <div
          className={classNames(
            styles.heroTrack,
            !transitionEnabled && styles.heroTrackNoTransition,
          )}
          style={{
            transform: `translate3d(calc(-${trackIndex * 100}% + ${dragOffset}px), 0, 0)`,
          }}
          onTransitionEnd={(event) => {
            if (event.currentTarget !== event.target || slides.length <= 1) return;
            if (trackIndex === 0) {
              setTransitionEnabled(false);
              setTrackIndex(slides.length);
            } else if (trackIndex === slides.length + 1) {
              setTransitionEnabled(false);
              setTrackIndex(1);
            }
          }}
        >
          {extendedSlides.map(({ slide, originalIndex }, index) => {
            const isVisible = index === trackIndex;
            const body = (
              <>
                <picture>
                  {slide.mobileImage ? (
                    <source media="(max-width: 767px)" srcSet={slide.mobileImage} />
                  ) : null}
                  <img src={slide.image} alt={slide.alt} draggable={false} />
                </picture>
                {slide.eyebrow || slide.title || slide.description ? (
                  <div
                    className={classNames(
                      styles.heroShade,
                      slide.tone === "dark" ? styles.heroDarkText : styles.heroLightText,
                      slide.align === "center"
                        ? styles.heroCenter
                        : slide.align === "right"
                          ? styles.heroRight
                          : styles.heroLeft,
                    )}
                  >
                    <div className={styles.container}>
                      <div className={styles.heroCopy}>
                        {slide.eyebrow ? <span>{slide.eyebrow}</span> : null}
                        {slide.title ? <h2>{slide.title}</h2> : null}
                        {slide.description ? <p>{slide.description}</p> : null}
                        {slide.buttonLabel && slide.href ? (
                          <span className={styles.heroButton}>{slide.buttonLabel}</span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ) : null}
              </>
            );

            return (
              <article
                className={styles.heroSlide}
                key={`${slide.id}-${originalIndex}-${index}`}
                aria-hidden={!isVisible}
              >
                {slide.href ? (
                  <a
                    href={slide.href}
                    tabIndex={isVisible ? 0 : -1}
                    draggable={false}
                  >
                    {body}
                  </a>
                ) : (
                  body
                )}
              </article>
            );
          })}
        </div>
      </div>
      {slides.length > 1 ? (
        <>
          <button
            type="button"
            className={classNames(styles.heroArrow, styles.heroPrevious)}
            onClick={() => move(-1)}
            aria-label="이전 배너"
          >
            ‹
          </button>
          <button
            type="button"
            className={classNames(styles.heroArrow, styles.heroNext)}
            onClick={() => move(1)}
            aria-label="다음 배너"
          >
            ›
          </button>
          <div className={styles.heroDots} role="tablist" aria-label="배너 선택">
            {slides.map((slide, index) => (
              <button
                key={slide.id}
                type="button"
                role="tab"
                aria-selected={index === visibleIndex}
                aria-label={`${index + 1}번 배너`}
                onClick={() => {
                  setTransitionEnabled(true);
                  setTrackIndex(index + 1);
                }}
                className={index === visibleIndex ? styles.heroDotActive : undefined}
              />
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
