import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteFrame } from "@/app/components/SiteFrame";
import { PageHeading } from "@/app/components/storefront";
import {
  getPublishedStoreEvent,
  listPublishedStoreEvents,
  type StoreEvent,
} from "@/lib/store-events";
import styles from "./event.module.css";

export const metadata: Metadata = { title: "이벤트" };
export const dynamic = "force-dynamic";

export default async function EventPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const eventId = firstParam(params.ev_id).trim();
  if (eventId) {
    const event = await getPublishedStoreEvent(eventId);
    if (!event) notFound();
    return <EventDetail event={event} />;
  }

  const events = await listPublishedStoreEvents();
  return (
    <SiteFrame>
      <PageHeading
        title="이벤트"
        breadcrumbs={[
          { label: "Home", href: "/shop" },
          { label: "이벤트" },
        ]}
      />
      <main className={styles.page} id="main-content">
        <div className={styles.listHeader}>
          <h2>진행 중인 이벤트</h2>
          <p>키엘골드에서 준비한 새로운 소식과 혜택을 확인해 보세요.</p>
        </div>
        {events.length > 0 ? (
          <div className={styles.grid}>
            {events.map((event) => (
              <article className={styles.card} key={event.id}>
                <a href={eventHref(event.id)}>
                  <span className={styles.badge}>EVENT</span>
                  <h3>{event.title}</h3>
                  <p>{event.content}</p>
                  <span className={styles.period}>
                    {periodLabel(event.startsAt, event.endsAt)}
                  </span>
                  <span className={styles.more}>자세히 보기</span>
                </a>
              </article>
            ))}
          </div>
        ) : (
          <div className={styles.empty}>진행 중인 이벤트가 없습니다.</div>
        )}
      </main>
    </SiteFrame>
  );
}

function EventDetail({ event }: { event: StoreEvent }) {
  return (
    <SiteFrame>
      <PageHeading
        title="이벤트"
        breadcrumbs={[
          { label: "Home", href: "/shop" },
          { label: "이벤트", href: "/shop/event.php" },
          { label: event.title },
        ]}
      />
      <main className={styles.page} id="main-content">
        <article className={styles.detail}>
          <header>
            <span className={styles.badge}>EVENT</span>
            <h2>{event.title}</h2>
            <p className={styles.detailPeriod}>
              {periodLabel(event.startsAt, event.endsAt)}
            </p>
          </header>
          <div className={styles.content}>
            {event.content.split(/\n{2,}/u).map((paragraph, index) => (
              <p key={`${event.id}-${index}`}>{paragraph}</p>
            ))}
          </div>
          {event.href ? (
            <a className={styles.cta} href={event.href}>
              이벤트 바로가기
            </a>
          ) : null}
        </article>
        <div className={styles.actions}>
          <a href="/shop/event.php">목록</a>
        </div>
      </main>
    </SiteFrame>
  );
}

function eventHref(eventId: string): string {
  return `/shop/event.php?ev_id=${encodeURIComponent(eventId)}`;
}

function periodLabel(startsAt: string, endsAt: string): string {
  if (!startsAt && !endsAt) return "상시 진행";
  return `${startsAt || "지금"} ~ ${endsAt || "종료 시까지"}`;
}

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? String(value[0] ?? "") : String(value ?? "");
}
