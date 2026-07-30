import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { requiredLegacyAdminToolPermission } from "@/lib/admin-permissions";
import { getAdminMailTestState } from "@/lib/admin-mail";
import { getLegacyAdminToolDefinition } from "@/lib/admin-tool-catalog";
import { getLegacyAdminToolState } from "@/lib/admin-tools";
import { requireAdminPagePermission } from "@/lib/auth";
import { listAdminClubs } from "@/lib/clubs";
import {
  listAdminCoupons,
  listAdminShippingRules,
} from "@/lib/commerce-promotions";
import {
  getAdminVisitReport,
  getSavedItemReport,
} from "@/lib/admin-operational-reports";
import { listAdminStoreEvents } from "@/lib/store-events";
import { getAdminEventProductList } from "@/lib/event-product-assignments";
import legacyCategoryBaseline from "@/data/legacy-category-admin-baseline.json";
import {
  listM3CronJobs,
  listM3CronRuns,
} from "@/lib/admin-m3cron";
import { listAdminPersonalPayments } from "@/lib/personal-payments";
import { getAdminProductTypeRows } from "@/lib/admin-product-types";
import { getAdminProductOptionProducts } from "@/lib/product-options";
import { listAdminRestockRequests } from "@/lib/restock-notifications";
import { getPriceComparisonSettings } from "@/lib/price-comparison";
import {
  getSmsAdminState,
  isSmsAdminTool,
} from "@/lib/admin-sms";
import {
  ProductOptionStockManager,
  ProductTypeManager,
  RestockSmsManager,
} from "./CatalogOperationManagers";
import { ClubAdminManager } from "./ClubAdminManager";
import {
  EventAdminManager,
} from "./EventAdminManagers";
import { EventBulkManager } from "./EventBulkManager";
import { LegacyAdminToolManager } from "./LegacyAdminToolManager";
import {
  SavedItemsManager,
  VisitorSearchManager,
} from "./OperationalReportManagers";
import {
  AdditionalShippingManager,
  CouponAdminManager,
} from "./PromotionAdminManagers";
import {
  M3CronLogsManager,
  M3CronSettingsManager,
} from "./M3CronManagers";
import { PersonalPaymentsManager } from "./PersonalPaymentsManager";
import { MailTestManager } from "./MailTestManager";
import { PriceComparisonManager } from "./PriceComparisonManager";
import { SmsAdminManager } from "./SmsAdminManager";

interface ToolPageProps {
  params: Promise<{ tool: string }>;
  searchParams: Promise<{
    job?: string | string[];
    settings?: string | string[];
    fr_date?: string | string[];
    to_date?: string | string[];
    sel_ca_id?: string | string[];
    sfl?: string | string[];
    stx?: string | string[];
    ev_id?: string | string[];
    page?: string | string[];
    sel_field?: string | string[];
    search?: string | string[];
    sort1?: string | string[];
    sort2?: string | string[];
  }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: ToolPageProps): Promise<Metadata> {
  const { tool } = await params;
  const definition = getLegacyAdminToolDefinition(tool);
  if (tool === "phpinfo") {
    return {
      title: { absolute: "PHP 7.3.33 - phpinfo()" },
      robots: { index: false, follow: false },
    };
  }
  return {
    title: definition?.title ?? "관리 도구",
    robots: { index: false, follow: false },
  };
}

export default async function LegacyAdminToolPage({
  params,
  searchParams,
}: ToolPageProps) {
  const { tool } = await params;
  const definition = getLegacyAdminToolDefinition(tool);
  if (!definition) notFound();
  await requireAdminPagePermission(
    requiredLegacyAdminToolPermission(tool),
  );
  if (tool === "admin-permissions") {
    redirect("/adm/settings?view=permissions");
  }
  if (tool === "club-settings") {
    redirect("/adm/settings");
  }
  if (tool === "product-stock") {
    redirect("/adm/products?view=stock");
  }
  if (tool === "order-print") {
    redirect("/adm/orders?print=1");
  }
  if (tool === "mail-test") {
    return <MailTestManager initialState={await getAdminMailTestState()} />;
  }
  if (tool === "approved-clubs") {
    return (
      <ClubAdminManager
        initialClubs={await listAdminClubs()}
        mode="approved"
      />
    );
  }
  if (tool === "club-applications") {
    return (
      <ClubAdminManager
        initialClubs={await listAdminClubs()}
        mode="applications"
      />
    );
  }
  if (tool === "price-comparison") {
    const query = await searchParams;
    const settingsMode = Array.isArray(query.settings)
      ? query.settings[0] ?? ""
      : query.settings ?? "";
    const requestHeaders = await headers();
    const requestedHost = (
      requestHeaders.get("x-forwarded-host")?.split(",")[0] ??
      requestHeaders.get("host") ??
      "localhost"
    ).trim();
    const host = /^[A-Za-z0-9.-]+(?::[0-9]{1,5})?$/u.test(requestedHost)
      ? requestedHost
      : "localhost";
    const forwardedProtocol = requestHeaders
      .get("x-forwarded-proto")
      ?.split(",")[0]
      ?.trim()
      .toLowerCase();
    const protocol =
      forwardedProtocol === "http" || forwardedProtocol === "https"
        ? forwardedProtocol
        : host.startsWith("localhost") || host.startsWith("127.0.0.1")
          ? "http"
          : "https";
    return (
      <PriceComparisonManager
        initialSettings={await getPriceComparisonSettings()}
        feedUrl={`${protocol}://${host}/api/catalog/price-feed`}
        showSettings={settingsMode === "1"}
      />
    );
  }
  if (tool === "personal-payments") {
    return (
      <PersonalPaymentsManager
        initialPayments={await listAdminPersonalPayments()}
      />
    );
  }
  if (tool === "m3cron-settings") {
    const result = await listM3CronJobs();
    return (
      <M3CronSettingsManager
        initialJobs={result.jobs}
        initialSummary={result.summary}
      />
    );
  }
  if (tool === "m3cron-logs") {
    const query = await searchParams;
    const job = Array.isArray(query.job)
      ? query.job[0] ?? ""
      : query.job ?? "";
    return (
      <M3CronLogsManager
        initialRuns={await listM3CronRuns({ jobId: job })}
        initialJobFilter={job}
      />
    );
  }
  if (tool === "product-types") {
    return (
      <ProductTypeManager initialRows={await getAdminProductTypeRows()} />
    );
  }
  if (tool === "product-option-stock") {
    const products = await getAdminProductOptionProducts();
    return (
      <ProductOptionStockManager
        initialProducts={products}
        initialCategories={legacyCategoryBaseline
          .filter((category) => category.active)
          .map((category) => ({
            id: category.id,
            name: category.name,
          }))}
      />
    );
  }
  if (tool === "restock-sms") {
    const result = await listAdminRestockRequests();
    return (
      <RestockSmsManager
        initialRequests={result.requests}
        providerConfigured={result.providerConfigured}
      />
    );
  }
  if (isSmsAdminTool(tool)) {
    return <SmsAdminManager initialState={await getSmsAdminState(tool)} />;
  }
  if (tool === "coupons" || tool === "coupon-zone") {
    const zoneOnly = tool === "coupon-zone";
    const coupons = await listAdminCoupons({ zoneOnly });
    return (
      <CouponAdminManager
        initialCoupons={coupons}
        zoneOnly={zoneOnly}
      />
    );
  }
  if (tool === "additional-shipping") {
    const rules = await listAdminShippingRules();
    return <AdditionalShippingManager initialRules={rules} />;
  }
  if (tool === "events") {
    const events = await listAdminStoreEvents();
    return <EventAdminManager initialEvents={events} />;
  }
  if (tool === "event-bulk") {
    const query = await searchParams;
    const one = (value: string | string[] | undefined) =>
      Array.isArray(value) ? value[0] ?? "" : value ?? "";
    const pageValue = one(query.page);
    const [events, initialResult] = await Promise.all([
      listAdminStoreEvents(),
      getAdminEventProductList({
        eventId: one(query.ev_id),
        categoryId: one(query.sel_ca_id),
        searchField: one(query.sel_field) === "a.it_id" ? "id" : "name",
        query: one(query.search),
        sortBy: one(query.sort1) === "it_name" ? "name" : "id",
        sortDirection: one(query.sort2) === "asc" ? "asc" : "desc",
        page: /^\d+$/u.test(pageValue) ? Number(pageValue) : undefined,
      }),
    ]);
    return (
      <EventBulkManager
        initialEvents={events}
        initialResult={initialResult}
      />
    );
  }
  if (tool === "saved-items") {
    const query = await searchParams;
    const one = (value: string | string[] | undefined) =>
      Array.isArray(value) ? value[0] ?? "" : value ?? "";
    return (
      <SavedItemsManager
        initialReport={await getSavedItemReport({
          categoryId: one(query.sel_ca_id),
          dateStart: one(query.fr_date),
          dateEnd: one(query.to_date),
        })}
      />
    );
  }
  if (tool === "visitor-search") {
    const query = await searchParams;
    const one = (value: string | string[] | undefined) =>
      Array.isArray(value) ? value[0] ?? "" : value ?? "";
    const requestedField = one(query.sfl);
    const initialSearchField =
      requestedField === "path" || requestedField === "date"
        ? requestedField
        : "ip";
    return (
      <VisitorSearchManager
        initialReport={await getAdminVisitReport()}
        initialQuery={one(query.stx).slice(0, 100)}
        initialSearchField={initialSearchField}
      />
    );
  }
  const state = await getLegacyAdminToolState(tool);
  return <LegacyAdminToolManager initialState={state} />;
}
