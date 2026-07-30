import {
  AdminApiError,
  adminApiErrorResponse,
  adminJson,
  assertSameOrigin,
  readAdminJson,
  requireAdminApiSession,
} from "@/lib/admin-api";
import {
  bulkUpdateSmsPhones,
  cancelSmsMessage,
  createSmsPhone,
  createSmsPhoneGroup,
  createSmsTemplate,
  createSmsTemplateGroup,
  deleteSmsPhone,
  deleteSmsPhoneGroup,
  deleteSmsTemplate,
  deleteSmsTemplateGroup,
  exportSmsPhoneRows,
  getSmsAdminState,
  importSmsPhoneRows,
  isSmsAdminTool,
  mutateSmsPhoneGroupContents,
  mutateSmsTemplateGroupContents,
  queueSmsMessage,
  syncSmsMembers,
  updateSmsPhone,
  updateSmsPhoneGroup,
  updateSmsSettings,
  updateSmsTemplate,
  updateSmsTemplateGroup,
  type SmsAdminTool,
} from "@/lib/admin-sms";
import * as XLSX from "xlsx";

interface RouteContext {
  params: Promise<{ section: string }>;
}

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
const MAX_IMPORT_ROWS = 1_000;

export async function GET(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    await requireAdminApiSession(request);
    const tool = await resolveTool(context);
    const url = new URL(request.url);
    if (tool === "sms-phone-file" && url.searchParams.has("download")) {
      return exportPhoneFile(url);
    }
    return adminJson({
      ok: true,
      state: await getSmsAdminState(tool),
    });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export async function POST(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    assertSameOrigin(request);
    const session = await requireAdminApiSession(request);
    const tool = await resolveTool(context);
    if (tool === "sms-phone-file") {
      const result = await importPhoneFile(request);
      return adminJson(
        {
          ok: true,
          result,
          state: await getSmsAdminState(tool),
          message: `${result.imported.toLocaleString("ko-KR")}개 번호를 등록했습니다. (중복 ${result.duplicates.toLocaleString("ko-KR")}개, 형식 오류 ${result.invalid.toLocaleString("ko-KR")}개)`,
        },
        201,
      );
    }
    const input = await readAdminJson(request, 250_000);
    let entity: object | null = null;
    let message = "";
    switch (tool) {
      case "sms-member-sync": {
        entity = await syncSmsMembers();
        message = `회원 연락처 ${("syncedCount" in entity ? Number(entity.syncedCount) : 0).toLocaleString("ko-KR")}개를 업데이트했습니다.`;
        break;
      }
      case "sms-send": {
        entity = await queueSmsMessage(input, session.username);
        const waiting =
          "status" in entity && entity.status === "waiting_provider";
        message = waiting
          ? "전송 요청을 공급사 연결 대기 상태로 저장했습니다. 실제 전송은 처리되지 않았습니다."
          : "전송 요청을 대기열에 등록했습니다. 공급사 처리 결과 전에는 성공으로 표시되지 않습니다.";
        break;
      }
      case "sms-phone-groups":
        entity = await createSmsPhoneGroup(input);
        message = "휴대폰번호 그룹을 추가했습니다.";
        break;
      case "sms-phones":
        entity = await createSmsPhone(input);
        message = "휴대폰번호를 추가했습니다.";
        break;
      case "sms-emoticon-groups":
        entity = await createSmsTemplateGroup(input);
        message = "이모티콘 그룹을 추가했습니다.";
        break;
      case "sms-emoticons":
        entity = await createSmsTemplate(input);
        message = "이모티콘을 추가했습니다.";
        break;
      default:
        return adminJson(
          { ok: false, message: "이 화면에서는 추가 작업을 지원하지 않습니다." },
          405,
        );
    }
    return adminJson(
      {
        ok: true,
        entity,
        state: await getSmsAdminState(tool),
        message,
      },
      201,
    );
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    assertSameOrigin(request);
    await requireAdminApiSession(request);
    const tool = await resolveTool(context);
    const input = await readAdminJson(request, 250_000);
    const action = readAction(input);
    let entity: object | object[] | null = null;
    let message = "";
    switch (tool) {
      case "sms-settings":
        entity = await updateSmsSettings(input);
        message = "SMS 기본설정을 저장했습니다.";
        break;
      case "sms-send":
        if (action !== "cancel") return methodNotAllowed();
        entity = await cancelSmsMessage(input);
        message = "문자 전송 요청을 취소했습니다.";
        break;
      case "sms-phone-groups":
        if (action === "clear" || action === "move") {
          await mutateSmsPhoneGroupContents(input);
          message =
            action === "clear"
              ? "선택한 그룹의 휴대폰번호를 비웠습니다."
              : "그룹의 휴대폰번호를 이동했습니다.";
        } else {
          entity = await updateSmsPhoneGroup(input);
          message = "휴대폰번호 그룹을 수정했습니다.";
        }
        break;
      case "sms-phones":
        if (action === "bulk") {
          entity = await bulkUpdateSmsPhones(input);
          message = "선택한 휴대폰번호를 처리했습니다.";
        } else {
          entity = await updateSmsPhone(input);
          message = "휴대폰번호를 수정했습니다.";
        }
        break;
      case "sms-emoticon-groups":
        if (action === "clear" || action === "move") {
          await mutateSmsTemplateGroupContents(input);
          message =
            action === "clear"
              ? "선택한 그룹의 이모티콘을 비웠습니다."
              : "그룹의 이모티콘을 이동했습니다.";
        } else {
          entity = await updateSmsTemplateGroup(input);
          message = "이모티콘 그룹을 수정했습니다.";
        }
        break;
      case "sms-emoticons":
        entity = await updateSmsTemplate(input);
        message = "이모티콘을 수정했습니다.";
        break;
      default:
        return methodNotAllowed();
    }
    return adminJson({
      ok: true,
      entity,
      state: await getSmsAdminState(tool),
      message,
    });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export async function DELETE(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    assertSameOrigin(request);
    await requireAdminApiSession(request);
    const tool = await resolveTool(context);
    const input = await readAdminJson(request, 50_000);
    switch (tool) {
      case "sms-phone-groups":
        await deleteSmsPhoneGroup(input);
        break;
      case "sms-phones":
        await deleteSmsPhone(input);
        break;
      case "sms-emoticon-groups":
        await deleteSmsTemplateGroup(input);
        break;
      case "sms-emoticons":
        await deleteSmsTemplate(input);
        break;
      default:
        return methodNotAllowed();
    }
    return adminJson({
      ok: true,
      state: await getSmsAdminState(tool),
      message: "선택한 자료를 삭제했습니다.",
    });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

async function resolveTool(context: RouteContext): Promise<SmsAdminTool> {
  const { section } = await context.params;
  if (!isSmsAdminTool(section)) {
    throw new ResponseError(404, "SMS 관리 화면을 찾을 수 없습니다.");
  }
  return section;
}

async function importPhoneFile(
  request: Request,
): Promise<{ imported: number; duplicates: number; invalid: number }> {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_UPLOAD_BYTES + 100_000) {
    throw new ResponseError(413, "업로드 파일은 2MB 이하여야 합니다.");
  }
  const formData = await request.formData();
  const file = formData.get("csv");
  if (!(file instanceof File) || file.size === 0) {
    throw new ResponseError(400, "업로드할 XLS 또는 CSV 파일을 선택해 주세요.");
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new ResponseError(413, "업로드 파일은 2MB 이하여야 합니다.");
  }
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!["xls", "csv", "tsv"].includes(extension)) {
    throw new ResponseError(
      400,
      "XLS(Excel 97-2003), CSV 또는 TSV 파일만 업로드할 수 있습니다. XLSX는 지원하지 않습니다.",
    );
  }
  const groupValue = formData.get("upload_bg_no");
  const groupId =
    typeof groupValue === "string" && groupValue ? groupValue : null;
  const rows = await readSpreadsheetRows(
    new Uint8Array(await file.arrayBuffer()),
    extension,
  );
  return importSmsPhoneRows(rows, groupId);
}

async function readSpreadsheetRows(
  bytes: Uint8Array,
  extension: string,
): Promise<{ name: string; phone: string }[]> {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(bytes, {
      type: "array",
      raw: true,
      codepage: 65001,
      cellFormula: false,
      cellHTML: false,
      cellNF: false,
      cellStyles: false,
      cellText: true,
      bookFiles: false,
      bookProps: false,
      bookDeps: false,
      bookVBA: false,
      sheetRows: MAX_IMPORT_ROWS + 1,
      ...(extension === "csv" ? { FS: "," } : {}),
      ...(extension === "tsv" ? { FS: "\t" } : {}),
    });
  } catch {
    throw new ResponseError(
      400,
      "파일을 읽을 수 없습니다. Excel 97-2003 XLS 또는 CSV 형식인지 확인해 주세요.",
    );
  }
  const firstSheetName = workbook.SheetNames[0];
  const firstSheet = firstSheetName
    ? workbook.Sheets[firstSheetName]
    : undefined;
  if (!firstSheet) {
    throw new ResponseError(400, "파일에 읽을 수 있는 시트가 없습니다.");
  }
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(firstSheet, {
    header: 1,
    raw: false,
    defval: "",
    blankrows: false,
  });
  if (matrix.length > MAX_IMPORT_ROWS) {
    throw new ResponseError(
      413,
      `한 파일에서 최대 ${MAX_IMPORT_ROWS.toLocaleString("ko-KR")}개까지 등록할 수 있습니다.`,
    );
  }
  return matrix.map((row: unknown[]) => ({
    name: scalarCell(row[0]),
    phone: scalarCell(row[1]),
  }));
}

async function exportPhoneFile(url: URL): Promise<Response> {
  const group = url.searchParams.get("group");
  const format = url.searchParams.get("format") === "csv" ? "csv" : "xls";
  const includeMissing = url.searchParams.get("no_hp") === "1";
  const hyphen = url.searchParams.get("hyphen") === "1";
  const exportedPhones = await exportSmsPhoneRows(
    group === "all" || !group ? undefined : group === "none" ? null : group,
  );
  const records = [
    ["이름", "전화번호"],
    ...exportedPhones
      .filter((phone) => includeMissing || Boolean(phone.phone))
      .map((phone) => [
        neutralSpreadsheetCell(phone.name),
        neutralSpreadsheetCell(
          hyphen ? formatPhone(phone.phone) : phone.phone,
        ),
      ]),
  ];
  if (format === "csv") {
    const lines = records.map((row) => row.map(csvCell).join(","));
    const body = `\uFEFF${lines.join("\r\n")}`;
    return new Response(body, {
      headers: downloadHeaders(
        "text/csv; charset=utf-8",
        "sms-phone-book.csv",
      ),
    });
  }
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet(records);
  XLSX.utils.book_append_sheet(workbook, worksheet, "휴대폰번호");
  const output = XLSX.write(workbook, {
    type: "array",
    bookType: "xls",
    bookSST: false,
    compression: true,
  }) as ArrayBuffer;
  return new Response(output, {
    headers: downloadHeaders(
      "application/vnd.ms-excel",
      "sms-phone-book.xls",
    ),
  });
}

function scalarCell(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") {
    return String(value).trim();
  }
  return "";
}

function neutralSpreadsheetCell(value: string): string {
  const normalized = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/gu, "");
  return /^[=+\-@]/u.test(normalized) ? `'${normalized}` : normalized;
}

function csvCell(value: string): string {
  return `"${value.replace(/"/gu, '""')}"`;
}

function formatPhone(phone: string): string {
  if (phone.length === 11) {
    return `${phone.slice(0, 3)}-${phone.slice(3, 7)}-${phone.slice(7)}`;
  }
  if (phone.length === 10) {
    return `${phone.slice(0, 3)}-${phone.slice(3, 6)}-${phone.slice(6)}`;
  }
  return phone;
}

function downloadHeaders(contentType: string, fileName: string): Headers {
  const headers = new Headers();
  headers.set("Content-Type", contentType);
  headers.set(
    "Content-Disposition",
    `attachment; filename="${fileName}"`,
  );
  headers.set("Cache-Control", "no-store, max-age=0");
  headers.set("X-Content-Type-Options", "nosniff");
  return headers;
}

function readAction(input: unknown): string {
  if (!input || typeof input !== "object" || Array.isArray(input)) return "";
  const value = (input as Record<string, unknown>).action;
  return typeof value === "string" ? value : "";
}

function methodNotAllowed(): Response {
  return adminJson(
    { ok: false, message: "이 화면에서는 해당 작업을 지원하지 않습니다." },
    405,
  );
}

class ResponseError extends AdminApiError {
  constructor(
    status: number,
    message: string,
  ) {
    super(status, message);
    this.name = "AdminApiError";
  }
}
