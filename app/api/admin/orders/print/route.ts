import {
  adminApiErrorResponse,
  requireAdminApiSession,
} from "@/lib/admin-api";
import {
  adminOrderPrintCsv,
  adminOrderPrintExcelHtml,
  adminOrderPrintFilename,
  adminOrderPrintHtml,
  listAdminOrdersForPrint,
  parseAdminOrderPrintCriteria,
} from "@/lib/admin-order-print";

export async function GET(request: Request): Promise<Response> {
  try {
    await requireAdminApiSession(request);
    const criteria = parseAdminOrderPrintCriteria(
      new URL(request.url).searchParams,
    );
    const rows = await listAdminOrdersForPrint(criteria);

    if (criteria.format === "csv") {
      return downloadableResponse(
        adminOrderPrintCsv(rows),
        "text/csv; charset=utf-8",
        adminOrderPrintFilename(criteria),
      );
    }
    if (criteria.format === "xls") {
      return downloadableResponse(
        adminOrderPrintExcelHtml(rows, criteria),
        "application/vnd.ms-excel; charset=utf-8",
        adminOrderPrintFilename(criteria),
      );
    }

    return new Response(adminOrderPrintHtml(rows, criteria), {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy":
          "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
      },
    });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

function downloadableResponse(
  body: string,
  contentType: string,
  filename: string,
): Response {
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
