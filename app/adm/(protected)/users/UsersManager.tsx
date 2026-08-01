"use client";

import {
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { openPostcodeSearch } from "@/app/components/daum-postcode";
import {
  AdminButton,
  AdminInput,
  AdminSelect,
  FilterPanel,
  Notice,
  TableResultBar,
  ToastRegion,
  useAdminToasts,
  type FilterField,
  type MemberListRecord,
  type RowKey,
} from "@/app/components/admin";
import { OperationDialog } from "../OperationDialog";
import dialogStyles from "../operation-dialog.module.css";
import type { AdminMemberDetail } from "@/lib/admin-operations";
import type {
  AdminMemberOrderItem,
  AdminMemberOrderList,
} from "@/lib/admin-member-orders";
import { MAX_POINTS } from "@/lib/commerce-limits";
import {
  MAX_WALLET_REQUEST_AMOUNT,
  MIN_WALLET_REQUEST_AMOUNT,
  type WalletRequest,
  type WalletRequestStatus,
} from "@/lib/wallet-contract";
import type {
  AdminMemberListFilters,
  AdminMemberPageResult,
  AdminMemberRow,
} from "@/lib/admin-data";

interface UsersManagerProps {
  initialResult: AdminMemberPageResult;
}

interface MemberApiResponse {
  ok?: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
  member?: AdminMemberDetail;
}

interface MemberListApiResponse extends Partial<AdminMemberPageResult> {
  ok?: boolean;
  message?: string;
}

interface MemberMediaResponse {
  ok?: boolean;
  message?: string;
  url?: string;
}

interface MemberGroupOption {
  id: string;
  name: string;
  active: boolean;
  selected: boolean;
}

interface MemberGroupsApiResponse {
  ok?: boolean;
  message?: string;
  memberId?: string;
  loginId?: string;
  revision?: number;
  groups?: MemberGroupOption[];
}

interface MemberWalletApiResponse {
  ok?: boolean;
  message?: string;
  request?: WalletRequest;
  requests?: WalletRequest[];
}

interface MemberWalletDraft {
  id: string;
  amount: string;
  status: WalletRequestStatus;
  depositorName: string;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  adminMemo: string;
  createdAt: string;
}

interface MemberOrdersApiResponse extends Partial<AdminMemberOrderList> {
  ok?: boolean;
  message?: string;
}

interface MemberOrderDraft {
  productId: string;
  purchasedAt: string;
}

interface LegacyMemberRecord extends MemberListRecord {
  name: string;
  nickname: string;
  email: string;
  phone: string;
  telephone: string;
  emailOptIn: boolean;
  smsOptIn: boolean;
  emailVerified: boolean;
  identityMethod: "none" | "phone" | "ipin";
  identityVerified: boolean;
  adultVerified: boolean;
  publicProfile: boolean;
  active: boolean;
  level: number;
}

type MemberDialogMode = "view" | "edit" | "create";

const MEMBER_MEDIA_PLACEHOLDER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 60 60'%3E%3Crect width='60' height='60' fill='%23f1f3f5'/%3E%3Ccircle cx='30' cy='23' r='11' fill='%23b9c0c8'/%3E%3Cpath d='M11 57c2-13 10-20 19-20s17 7 19 20' fill='%23b9c0c8'/%3E%3C/svg%3E";

export function UsersManager({ initialResult }: UsersManagerProps) {
  const router = useRouter();
  const { toasts, pushToast, dismissToast } = useAdminToasts();
  const [result, setResult] = useState(initialResult);
  const [filters, setFilters] = useState<AdminMemberListFilters>(
    initialResult.filters,
  );
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState("");
  const listRequestId = useRef(0);
  const [memberOverrides, setMemberOverrides] = useState<
    Record<string, LegacyMemberRecord>
  >({});
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] =
    useState<MemberDialogMode>("view");
  const [dialogLoading, setDialogLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mediaUploading, setMediaUploading] = useState(false);
  const [error, setError] = useState("");
  const [member, setMember] = useState<AdminMemberDetail | null>(null);
  const [loginId, setLoginId] = useState("");
  const [name, setName] = useState("");
  const [nickname, setNickname] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [telephone, setTelephone] = useState("");
  const [homepage, setHomepage] = useState("");
  const [postcode, setPostcode] = useState("");
  const [address1, setAddress1] = useState("");
  const [address2, setAddress2] = useState("");
  const [address3, setAddress3] = useState("");
  const [adminMemo, setAdminMemo] = useState("");
  const [identityMethod, setIdentityMethod] =
    useState<"none" | "phone" | "ipin">("none");
  const [identityVerified, setIdentityVerified] = useState(false);
  const [adultVerified, setAdultVerified] = useState(false);
  const [publicProfile, setPublicProfile] = useState(false);
  const [signature, setSignature] = useState("");
  const [profile, setProfile] = useState("");
  const [verificationHistory, setVerificationHistory] = useState("");
  const [withdrawnAt, setWithdrawnAt] = useState("");
  const [blockedAt, setBlockedAt] = useState("");
  const [memberIcon, setMemberIcon] = useState("");
  const [memberImage, setMemberImage] = useState("");
  const [extras, setExtras] = useState<string[]>(() =>
    Array.from({ length: 10 }, () => ""),
  );
  const [emailOptIn, setEmailOptIn] = useState(false);
  const [smsOptIn, setSmsOptIn] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  const [level, setLevel] = useState("2");
  const [points, setPoints] = useState("0");
  const [active, setActive] = useState(true);
  const [selectedKeys, setSelectedKeys] = useState<Set<RowKey>>(new Set());
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [groupLoading, setGroupLoading] = useState(false);
  const [groupSaving, setGroupSaving] = useState(false);
  const [groupError, setGroupError] = useState("");
  const [groupMember, setGroupMember] =
    useState<LegacyMemberRecord | null>(null);
  const [groupOptions, setGroupOptions] = useState<MemberGroupOption[]>([]);
  const [groupRevision, setGroupRevision] = useState(0);
  const [groupCounts, setGroupCounts] = useState<Record<string, number>>({});
  const [walletDialogOpen, setWalletDialogOpen] = useState(false);
  const [walletLoading, setWalletLoading] = useState(false);
  const [walletError, setWalletError] = useState("");
  const [walletMember, setWalletMember] =
    useState<LegacyMemberRecord | null>(null);
  const [walletRequests, setWalletRequests] = useState<WalletRequest[]>([]);
  const [walletDrafts, setWalletDrafts] = useState<
    Record<string, MemberWalletDraft>
  >({});
  const [walletSavingKey, setWalletSavingKey] = useState("");
  const [orderDialogOpen, setOrderDialogOpen] = useState(false);
  const [orderLoading, setOrderLoading] = useState(false);
  const [orderError, setOrderError] = useState("");
  const [orderMember, setOrderMember] =
    useState<AdminMemberOrderList["member"] | null>(null);
  const [memberOrders, setMemberOrders] = useState<AdminMemberOrderItem[]>([]);
  const [orderDrafts, setOrderDrafts] = useState<
    Record<number, MemberOrderDraft>
  >({});
  const [orderSavingItemId, setOrderSavingItemId] = useState(0);

  const members = result.rows.map(adminMemberListRecord).map(
    (record) => memberOverrides[String(record.id)] ?? record,
  );
  const filterFields: FilterField[] = [
    {
      type: "custom",
      name: "q",
      label: "회원 검색",
      span: "full",
      control: (
        <div className="legacy-member-search-control">
          <AdminSelect aria-label="검색 기준" defaultValue="member">
            <option value="member">회원아이디</option>
            <option value="nickname">닉네임</option>
            <option value="name">이름</option>
            <option value="level">권한</option>
            <option value="email">E-MAIL</option>
            <option value="phone">전화번호</option>
            <option value="mobile">휴대폰번호</option>
            <option value="points">포인트</option>
            <option value="joined">가입일시</option>
            <option value="ip">IP</option>
            <option value="referrer">추천인</option>
          </AdminSelect>
          <AdminInput
            type="text"
            name="stx"
            aria-label="검색어"
            value={filters.q}
            placeholder=""
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                q: event.currentTarget.value,
              }))
            }
          />
        </div>
      ),
    },
  ];

  const closeDialog = useCallback(() => {
    if (saving) return;
    setDialogOpen(false);
    setMember(null);
    setError("");
  }, [saving]);

  const closeGroupDialog = useCallback(() => {
    if (groupSaving) return;
    setGroupDialogOpen(false);
    setGroupError("");
  }, [groupSaving]);

  const closeWalletDialog = useCallback(() => {
    if (walletSavingKey) return;
    setWalletDialogOpen(false);
    setWalletError("");
  }, [walletSavingKey]);

  const closeOrderDialog = useCallback(() => {
    if (orderSavingItemId) return;
    setOrderDialogOpen(false);
    setOrderError("");
  }, [orderSavingItemId]);

  useEffect(() => {
    if (!dialogOpen) return;
    const title = document.getElementById("container_title");
    if (!title) return;
    const previous = title.textContent;
    title.textContent =
      dialogMode === "create" ? "회원 추가" : "회원 정보 수정";
    return () => {
      title.textContent = previous;
    };
  }, [dialogMode, dialogOpen]);

  const populateForm = (nextMember: AdminMemberDetail) => {
    setLoginId(nextMember.loginId);
    setName(nextMember.name);
    setNickname(nextMember.nickname);
    setEmail(nextMember.email);
    setPhone(nextMember.phone);
    setTelephone(nextMember.telephone);
    setHomepage(nextMember.homepage);
    setPostcode(nextMember.postcode);
    setAddress1(nextMember.address1);
    setAddress2(nextMember.address2);
    setAddress3(nextMember.address3);
    setAdminMemo(nextMember.adminMemo);
    setIdentityMethod(nextMember.identityMethod);
    setIdentityVerified(nextMember.identityVerified);
    setAdultVerified(nextMember.adultVerified);
    setPublicProfile(nextMember.publicProfile);
    setSignature(nextMember.signature);
    setProfile(nextMember.profile);
    setVerificationHistory(nextMember.verificationHistory);
    setWithdrawnAt(nextMember.withdrawnAt ?? "");
    setBlockedAt(nextMember.blockedAt ?? "");
    setMemberIcon(nextMember.memberIcon);
    setMemberImage(nextMember.memberImage);
    setExtras(
      Array.from(
        { length: 10 },
        (_, index) =>
          nextMember[`extra${index + 1}` as keyof AdminMemberDetail] as string,
      ),
    );
    setEmailOptIn(nextMember.emailOptIn);
    setSmsOptIn(nextMember.smsOptIn);
    setEmailVerified(nextMember.emailVerified);
    setLevel(String(nextMember.level));
    setPoints(String(nextMember.points));
    setActive(nextMember.active);
  };

  const openCreateMember = () => {
    setDialogMode("create");
    setDialogOpen(true);
    setDialogLoading(false);
    setError("");
    setMember(null);
    setLoginId("");
    setName("");
    setNickname("");
    setEmail("");
    setPhone("");
    setTelephone("");
    setHomepage("");
    setPostcode("");
    setAddress1("");
    setAddress2("");
    setAddress3("");
    setAdminMemo("");
    setIdentityMethod("none");
    setIdentityVerified(false);
    setAdultVerified(false);
    setPublicProfile(false);
    setSignature("");
    setProfile("");
    setVerificationHistory("");
    setWithdrawnAt("");
    setBlockedAt("");
    setMemberIcon("");
    setMemberImage("");
    setExtras(Array.from({ length: 10 }, () => ""));
    setEmailOptIn(false);
    setSmsOptIn(false);
    setEmailVerified(false);
    setLevel("2");
    setPoints("0");
    setActive(true);
  };

  const openMember = async (
    record: LegacyMemberRecord,
    mode: MemberDialogMode,
  ) => {
    const id = String(record.id);
    setDialogMode(mode);
    setDialogOpen(true);
    setDialogLoading(true);
    setError("");
    setMember(null);
    try {
      const response = await fetch(
        `/api/admin/users/${encodeURIComponent(id)}`,
        {
          cache: "no-store",
          headers: { Accept: "application/json" },
        },
      );
      const result = await readMemberResponse(response);
      if (response.status === 401) {
        redirectToAdminLogin();
        return;
      }
      if (!response.ok || !result.member) {
        throw new Error(result.message ?? "회원 정보를 불러오지 못했습니다.");
      }
      setMember(result.member);
      populateForm(result.member);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "회원 정보를 불러오지 못했습니다.",
      );
    } finally {
      setDialogLoading(false);
    }
  };

  const uploadMemberMedia = async (
    file: File,
    assign: (url: string) => void,
  ) => {
    if (mediaUploading) return;
    setMediaUploading(true);
    setError("");
    try {
      const formData = new FormData();
      formData.set("file", file);
      const response = await fetch("/api/admin/users/media", {
        method: "POST",
        headers: { Accept: "application/json" },
        body: formData,
      });
      const payload = (await response.json().catch(() => ({}))) as
        MemberMediaResponse;
      if (response.status === 401) {
        redirectToAdminLogin();
        return;
      }
      if (!response.ok || !payload.url) {
        throw new Error(payload.message ?? "회원 이미지를 업로드하지 못했습니다.");
      }
      assign(payload.url);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "회원 이미지를 업로드하지 못했습니다.",
      );
    } finally {
      setMediaUploading(false);
    }
  };

  const loadMembers = async (
    options: Partial<AdminMemberListFilters> & { page?: number },
  ) => {
    const requestId = listRequestId.current + 1;
    listRequestId.current = requestId;
    const requestedFilters = { ...result.filters, ...options };
    const params = new URLSearchParams({
      page: String(options.page ?? 1),
      pageSize: String(result.pageSize),
      sortBy: requestedFilters.sortBy,
      sortDirection: requestedFilters.sortDirection,
    });
    for (const name of ["q", "status", "dateStart", "dateEnd"] as const) {
      if (requestedFilters[name]) params.set(name, requestedFilters[name]);
    }

    setListLoading(true);
    setListError("");
    try {
      const response = await fetch(`/api/admin/users?${params.toString()}`, {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      const payload = await readMemberListResponse(response);
      if (requestId !== listRequestId.current) return;
      if (response.status === 401) {
        redirectToAdminLogin();
        return;
      }
      if (
        !response.ok ||
        !Array.isArray(payload.rows) ||
        !payload.filters ||
        typeof payload.total !== "number" ||
        typeof payload.page !== "number" ||
        typeof payload.pageSize !== "number" ||
        typeof payload.totalPages !== "number"
      ) {
        throw new Error(payload.message ?? "회원 목록을 불러오지 못했습니다.");
      }
      const nextResult = payload as AdminMemberPageResult;
      setResult(nextResult);
      setFilters(nextResult.filters);
    } catch (cause) {
      if (requestId !== listRequestId.current) return;
      setListError(
        cause instanceof Error
          ? cause.message
          : "회원 목록을 불러오지 못했습니다.",
      );
    } finally {
      if (requestId === listRequestId.current) setListLoading(false);
    }
  };

  const changeMemberSort = (
    sortBy: AdminMemberListFilters["sortBy"],
  ) => {
    const sortDirection =
      result.filters.sortBy === sortBy &&
      result.filters.sortDirection === "desc"
        ? "asc"
        : "desc";
    void loadMembers({
      ...result.filters,
      sortBy,
      sortDirection,
      page: 1,
    });
  };

  const openMemberGroups = async (record: LegacyMemberRecord) => {
    const id = String(record.id);
    setGroupMember(record);
    setGroupOptions([]);
    setGroupRevision(0);
    setGroupError("");
    setGroupDialogOpen(true);
    setGroupLoading(true);
    try {
      const response = await fetch(
        `/api/admin/users/${encodeURIComponent(id)}/groups`,
        {
          cache: "no-store",
          headers: { Accept: "application/json" },
        },
      );
      const payload = await readMemberGroupsResponse(response);
      if (response.status === 401) {
        redirectToAdminLogin();
        return;
      }
      if (
        !response.ok ||
        !Array.isArray(payload.groups) ||
        typeof payload.revision !== "number"
      ) {
        throw new Error(
          payload.message ?? "접근가능그룹 정보를 불러오지 못했습니다.",
        );
      }
      setGroupOptions(payload.groups);
      setGroupRevision(payload.revision);
      setGroupCounts((current) => ({
        ...current,
        [id]: payload.groups?.filter((group) => group.selected).length ?? 0,
      }));
    } catch (cause) {
      setGroupError(
        cause instanceof Error
          ? cause.message
          : "접근가능그룹 정보를 불러오지 못했습니다.",
      );
    } finally {
      setGroupLoading(false);
    }
  };

  const saveMemberGroups = async () => {
    if (!groupMember || groupSaving || groupLoading) return;
    const id = String(groupMember.id);
    setGroupSaving(true);
    setGroupError("");
    try {
      const response = await fetch(
        `/api/admin/users/${encodeURIComponent(id)}/groups`,
        {
          method: "PUT",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            groupIds: groupOptions
              .filter((group) => group.selected)
              .map((group) => group.id),
            expectedRevision: groupRevision,
          }),
        },
      );
      const payload = await readMemberGroupsResponse(response);
      if (response.status === 401) {
        redirectToAdminLogin();
        return;
      }
      if (
        !response.ok ||
        !Array.isArray(payload.groups) ||
        typeof payload.revision !== "number"
      ) {
        throw new Error(
          payload.message ?? "접근가능그룹을 저장하지 못했습니다.",
        );
      }
      const selectedCount = payload.groups.filter(
        (group) => group.selected,
      ).length;
      setGroupOptions(payload.groups);
      setGroupRevision(payload.revision);
      setGroupCounts((current) => ({
        ...current,
        [id]: selectedCount,
      }));
      setGroupDialogOpen(false);
      pushToast({
        title: "접근가능그룹을 저장했습니다.",
        message: `${groupMember.loginId} 회원의 그룹 ${selectedCount.toLocaleString(
          "ko-KR",
        )}개가 반영되었습니다.`,
        tone: "success",
      });
    } catch (cause) {
      setGroupError(
        cause instanceof Error
          ? cause.message
          : "접근가능그룹을 저장하지 못했습니다.",
      );
    } finally {
      setGroupSaving(false);
    }
  };

  const openMemberWallet = async (record: LegacyMemberRecord) => {
    const id = String(record.id);
    setWalletMember(record);
    setWalletRequests([]);
    setWalletDrafts({});
    setWalletError("");
    setWalletDialogOpen(true);
    setWalletLoading(true);
    try {
      const params = new URLSearchParams({ userId: id });
      const response = await fetch(
        `/api/admin/wallet/requests?${params.toString()}`,
        {
          cache: "no-store",
          headers: { Accept: "application/json" },
        },
      );
      const payload = await readMemberWalletResponse(response);
      if (response.status === 401) {
        redirectToAdminLogin();
        return;
      }
      if (!response.ok || !Array.isArray(payload.requests)) {
        throw new Error(
          payload.message ?? "회원의 충전·출금 내역을 불러오지 못했습니다.",
        );
      }
      setWalletRequests(payload.requests);
      setWalletDrafts(
        Object.fromEntries(
          payload.requests.map((request) => [
            walletRequestKey(request),
            walletDraftFromRequest(request),
          ]),
        ),
      );
    } catch (cause) {
      setWalletError(
        cause instanceof Error
          ? cause.message
          : "회원의 충전·출금 내역을 불러오지 못했습니다.",
      );
    } finally {
      setWalletLoading(false);
    }
  };

  const updateWalletDraft = (
    key: string,
    changes: Partial<MemberWalletDraft>,
  ) => {
    setWalletDrafts((current) => {
      const draft = current[key];
      if (!draft) return current;
      return {
        ...current,
        [key]: { ...draft, ...changes },
      };
    });
  };

  const saveMemberWalletRequest = async (request: WalletRequest) => {
    const key = walletRequestKey(request);
    const draft = walletDrafts[key];
    if (!draft || walletSavingKey) return;
    const amount = Number(draft.amount);
    if (
      !Number.isSafeInteger(amount) ||
      amount < MIN_WALLET_REQUEST_AMOUNT ||
      amount > MAX_WALLET_REQUEST_AMOUNT
    ) {
      setWalletError(
        `금액은 ${MIN_WALLET_REQUEST_AMOUNT.toLocaleString("ko-KR")}원부터 ${MAX_WALLET_REQUEST_AMOUNT.toLocaleString("ko-KR")}원까지 입력해 주세요.`,
      );
      return;
    }
    const createdAt = walletLocalDateTimeToIso(draft.createdAt);
    if (!createdAt) {
      setWalletError("신청일시는 초 단위까지 정확히 입력해 주세요.");
      return;
    }

    setWalletSavingKey(key);
    setWalletError("");
    try {
      const response = await fetch(
        `/api/admin/wallet/requests/${encodeURIComponent(request.id)}`,
        {
          method: "PUT",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            kind: request.kind,
            ...draft,
            amount,
            createdAt,
            expectedUpdatedAt: request.updatedAt,
          }),
        },
      );
      const payload = await readMemberWalletResponse(response);
      if (response.status === 401) {
        redirectToAdminLogin();
        return;
      }
      if (!response.ok || !payload.request) {
        throw new Error(
          payload.message ?? "충전·출금 내역을 수정하지 못했습니다.",
        );
      }
      const updated = payload.request;
      const updatedKey = walletRequestKey(updated);
      setWalletRequests((current) =>
        current.map((item) =>
          walletRequestKey(item) === key ? updated : item,
        ),
      );
      setWalletDrafts((current) => {
        const next = { ...current };
        delete next[key];
        next[updatedKey] = walletDraftFromRequest(updated);
        return next;
      });
      if (walletMember) {
        const memberKey = String(walletMember.id);
        setWalletMember((current) =>
          current ? { ...current, points: updated.memberPoints } : current,
        );
        setMemberOverrides((current) => ({
          ...current,
          [memberKey]: {
            ...(current[memberKey] ?? walletMember),
            points: updated.memberPoints,
          },
        }));
      }
      pushToast({
        title: "충전·출금 내역을 수정했습니다.",
        message: `${updated.id} 내역과 회원 포인트 정합성을 반영했습니다.`,
        tone: "success",
      });
    } catch (cause) {
      setWalletError(
        cause instanceof Error
          ? cause.message
          : "충전·출금 내역을 수정하지 못했습니다.",
      );
    } finally {
      setWalletSavingKey("");
    }
  };

  const openMemberOrders = async (record: LegacyMemberRecord) => {
    const id = String(record.id);
    setOrderMember({
      id,
      loginId: record.loginId,
      name: record.name,
      points: record.points,
    });
    setMemberOrders([]);
    setOrderDrafts({});
    setOrderError("");
    setOrderDialogOpen(true);
    setOrderLoading(true);
    try {
      const response = await fetch(
        `/api/admin/users/${encodeURIComponent(id)}/orders`,
        { cache: "no-store" },
      );
      if (response.status === 401) {
        redirectToAdminLogin();
        return;
      }
      const payload = await readMemberOrdersResponse(response);
      if (
        !response.ok ||
        !payload.member ||
        !Array.isArray(payload.items)
      ) {
        throw new Error(
          payload.message ?? "회원의 구매상품을 불러오지 못했습니다.",
        );
      }
      setOrderMember(payload.member);
      setMemberOrders(payload.items);
      setOrderDrafts(
        Object.fromEntries(
          payload.items.map((item) => [
            item.itemId,
            memberOrderDraft(item),
          ]),
        ),
      );
    } catch (cause) {
      setOrderError(
        cause instanceof Error
          ? cause.message
          : "회원의 구매상품을 불러오지 못했습니다.",
      );
    } finally {
      setOrderLoading(false);
    }
  };

  const updateMemberOrderDraft = (
    itemId: number,
    changes: Partial<MemberOrderDraft>,
  ) => {
    setOrderDrafts((current) => {
      const draft = current[itemId];
      if (!draft) return current;
      return {
        ...current,
        [itemId]: { ...draft, ...changes },
      };
    });
  };

  const saveMemberOrder = async (item: AdminMemberOrderItem) => {
    if (!orderMember || orderSavingItemId) return;
    const draft = orderDrafts[item.itemId];
    if (!draft) return;
    const productId = draft.productId.trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u.test(productId)) {
      setOrderError(
        "상품 페이지 주소의 it_id 값(예: 1762011927)을 입력해 주세요.",
      );
      return;
    }
    const purchasedAt = walletLocalDateTimeToIso(draft.purchasedAt);
    if (!purchasedAt) {
      setOrderError("구매일시는 초 단위까지 정확히 입력해 주세요.");
      return;
    }

    setOrderSavingItemId(item.itemId);
    setOrderError("");
    try {
      const response = await fetch(
        `/api/admin/users/${encodeURIComponent(orderMember.id)}/orders`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            itemId: item.itemId,
            productId,
            purchasedAt,
            expectedUpdatedAt: item.updatedAt,
          }),
        },
      );
      if (response.status === 401) {
        redirectToAdminLogin();
        return;
      }
      const payload = await readMemberOrdersResponse(response);
      if (
        !response.ok ||
        !payload.member ||
        !Array.isArray(payload.items)
      ) {
        throw new Error(payload.message ?? "구매상품을 수정하지 못했습니다.");
      }
      setOrderMember(payload.member);
      setMemberOrders(payload.items);
      setOrderDrafts(
        Object.fromEntries(
          payload.items.map((nextItem) => [
            nextItem.itemId,
            memberOrderDraft(nextItem),
          ]),
        ),
      );
      setMemberOverrides((current) => {
        const existing = current[orderMember.id];
        const base =
          existing ??
          members.find(
            (candidate) => String(candidate.id) === orderMember.id,
          );
        if (!base) return current;
        return {
          ...current,
          [orderMember.id]: {
            ...base,
            points: payload.member!.points,
          },
        };
      });
      pushToast({
        title: "구매상품을 수정했습니다.",
        message: `${item.orderId} 주문의 상품·구매일·금액·마일리지를 반영했습니다.`,
        tone: "success",
      });
    } catch (cause) {
      setOrderError(
        cause instanceof Error
          ? cause.message
          : "구매상품을 수정하지 못했습니다.",
      );
    } finally {
      setOrderSavingItemId(0);
    }
  };

  const saveMember = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!member || saving) return;
    const form = event.currentTarget;
    const newPasswordInput = form.elements.namedItem(
      "newPassword",
    ) as HTMLInputElement | null;
    const adminPasswordInput = form.elements.namedItem(
      "adminPassword",
    ) as HTMLInputElement | null;
    const newPassword = newPasswordInput?.value ?? "";
    const adminPassword = adminPasswordInput?.value ?? "";
    if (!name.trim() || name.trim().length > 80) {
      setError("회원 이름을 80자 이내로 입력해 주세요.");
      return;
    }
    if (!nickname.trim() || nickname.trim().length > 80) {
      setError("닉네임을 80자 이내로 입력해 주세요.");
      return;
    }
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email.trim()) ||
      email.trim().length > 254
    ) {
      setError("이메일 주소를 확인해 주세요.");
      return;
    }
    const parsedLevel = Number(level);
    const parsedPoints = Number(points);
    if (
      !Number.isSafeInteger(parsedLevel) ||
      parsedLevel < 1 ||
      parsedLevel > 10
    ) {
      setError("회원 등급은 1부터 10까지의 정수로 입력해 주세요.");
      return;
    }
    if (
      !Number.isSafeInteger(parsedPoints) ||
      parsedPoints < 0 ||
      parsedPoints > MAX_POINTS
    ) {
      setError(
        `포인트는 0부터 ${MAX_POINTS.toLocaleString("ko-KR")}까지 입력해 주세요.`,
      );
      return;
    }
    if (
      newPassword.length > 0 &&
      (newPassword.length < 8 || newPassword.length > 128)
    ) {
      setError("새 비밀번호는 8자 이상 128자 이하로 입력해 주세요.");
      return;
    }
    if (
      newPassword.length > 0 &&
      (adminPassword.length === 0 || adminPassword.length > 1_024)
    ) {
      setError("비밀번호 초기화를 위해 관리자 비밀번호를 입력해 주세요.");
      return;
    }

    const payload: Record<string, number | boolean | string | null> = {};
    if (name.trim() !== member.name) payload.name = name.trim();
    if (nickname.trim() !== member.nickname) {
      payload.nickname = nickname.trim();
    }
    if (email.trim().toLowerCase() !== member.email) {
      payload.email = email.trim().toLowerCase();
    }
    if (phone.trim() !== member.phone) payload.phone = phone.trim();
    if (telephone.trim() !== member.telephone) {
      payload.telephone = telephone.trim();
    }
    if (homepage.trim() !== member.homepage) {
      payload.homepage = homepage.trim();
    }
    if (postcode.trim() !== member.postcode) {
      payload.postcode = postcode.trim();
    }
    if (address1.trim() !== member.address1) {
      payload.address1 = address1.trim();
    }
    if (address2.trim() !== member.address2) {
      payload.address2 = address2.trim();
    }
    if (address3.trim() !== member.address3) {
      payload.address3 = address3.trim();
    }
    if (adminMemo.trim() !== member.adminMemo) {
      payload.adminMemo = adminMemo.trim();
    }
    if (identityMethod !== member.identityMethod) {
      payload.identityMethod = identityMethod;
    }
    if (identityVerified !== member.identityVerified) {
      payload.identityVerified = identityVerified;
    }
    if (adultVerified !== member.adultVerified) {
      payload.adultVerified = adultVerified;
    }
    if (publicProfile !== member.publicProfile) {
      payload.publicProfile = publicProfile;
    }
    if (signature.trim() !== member.signature) {
      payload.signature = signature.trim();
    }
    if (profile.trim() !== member.profile) {
      payload.profile = profile.trim();
    }
    if (verificationHistory.trim() !== member.verificationHistory) {
      payload.verificationHistory = verificationHistory.trim();
    }
    if ((withdrawnAt || null) !== member.withdrawnAt) {
      payload.withdrawnAt = withdrawnAt || null;
    }
    if ((blockedAt || null) !== member.blockedAt) {
      payload.blockedAt = blockedAt || null;
    }
    if (memberIcon.trim() !== member.memberIcon) {
      payload.memberIcon = memberIcon.trim();
    }
    if (memberImage.trim() !== member.memberImage) {
      payload.memberImage = memberImage.trim();
    }
    extras.forEach((value, index) => {
      const key = `extra${index + 1}` as
        | "extra1"
        | "extra2"
        | "extra3"
        | "extra4"
        | "extra5"
        | "extra6"
        | "extra7"
        | "extra8"
        | "extra9"
        | "extra10";
      if (value.trim() !== member[key]) payload[key] = value.trim();
    });
    if (emailOptIn !== member.emailOptIn) {
      payload.emailOptIn = emailOptIn;
    }
    if (smsOptIn !== member.smsOptIn) payload.smsOptIn = smsOptIn;
    if (emailVerified !== member.emailVerified) {
      payload.emailVerified = emailVerified;
    }
    if (parsedLevel !== member.level) payload.level = parsedLevel;
    if (parsedPoints !== member.points) {
      payload.points = parsedPoints;
      payload.expectedPoints = member.points;
    }
    if (active !== member.active) payload.active = active;
    if (newPassword.length > 0) {
      payload.newPassword = newPassword;
      payload.adminPassword = adminPassword;
    }
    if (Object.keys(payload).length === 0) {
      setDialogOpen(false);
      return;
    }
    payload.expectedUpdatedAt = member.updatedAt;

    setSaving(true);
    setError("");
    try {
      const response = await fetch(
        `/api/admin/users/${encodeURIComponent(member.id)}`,
        {
          method: "PATCH",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        },
      );
      const apiResult = await readMemberResponse(response);
      if (response.status === 401) {
        redirectToAdminLogin();
        return;
      }
      if (!response.ok || !apiResult.member) {
        throw new Error(
          firstApiError(apiResult) ?? "회원 변경사항을 저장하지 못했습니다.",
        );
      }

      const obsoleteMedia = [
        member.memberIcon && member.memberIcon !== memberIcon.trim()
          ? member.memberIcon
          : "",
        member.memberImage && member.memberImage !== memberImage.trim()
          ? member.memberImage
          : "",
      ].filter(Boolean);
      await Promise.all(
        obsoleteMedia.map(async (url) => {
          const mediaResponse = await fetch("/api/admin/users/media", {
            method: "DELETE",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ url }),
          });
          if (!mediaResponse.ok && mediaResponse.status !== 404) {
            const payload = (await mediaResponse.json().catch(() => ({}))) as
              MemberMediaResponse;
            throw new Error(
              payload.message ?? "기존 회원 이미지 파일을 정리하지 못했습니다.",
            );
          }
        }),
      );
      clearPasswordInputs(newPasswordInput, adminPasswordInput);
      setMember(apiResult.member);
      populateForm(apiResult.member);
      const updated = apiResult.member;
      setMemberOverrides((current) => ({
        ...current,
        [updated.id]: memberListRecord(updated),
      }));
      setDialogOpen(false);
      pushToast({
        title: "회원 정보를 저장했습니다.",
        message:
          newPassword.length > 0
            ? `${apiResult.member.loginId} 회원의 비밀번호를 초기화하고 기존 로그인을 해제했습니다.`
            : `${apiResult.member.loginId} 회원의 운영 정보가 반영되었습니다.`,
        tone: "success",
      });
      void loadMembers({ ...result.filters, page: result.page });
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "회원 변경사항을 저장하지 못했습니다.",
      );
    } finally {
      clearPasswordInputs(newPasswordInput, adminPasswordInput);
      setSaving(false);
    }
  };

  const createMember = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    const passwordInput = event.currentTarget.elements.namedItem(
      "password",
    ) as HTMLInputElement | null;
    const password = passwordInput?.value ?? "";
    const parsedLevel = Number(level);
    const parsedPoints = Number(points);
    if (!/^[A-Za-z0-9_-]{4,30}$/u.test(loginId.trim())) {
      setError("아이디는 영문·숫자 4~30자로 입력해 주세요.");
      return;
    }
    if (password.length < 8 || password.length > 128) {
      setError("비밀번호는 8자 이상 128자 이하로 입력해 주세요.");
      return;
    }
    if (!name.trim() || name.trim().length > 80) {
      setError("회원 이름을 80자 이내로 입력해 주세요.");
      return;
    }
    if (!nickname.trim() || nickname.trim().length > 80) {
      setError("닉네임을 80자 이내로 입력해 주세요.");
      return;
    }
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email.trim()) ||
      email.trim().length > 254
    ) {
      setError("이메일 주소를 확인해 주세요.");
      return;
    }
    if (
      !Number.isSafeInteger(parsedLevel) ||
      parsedLevel < 1 ||
      parsedLevel > 10
    ) {
      setError("회원 등급은 1부터 10까지의 정수로 입력해 주세요.");
      return;
    }
    if (
      !Number.isSafeInteger(parsedPoints) ||
      parsedPoints < 0 ||
      parsedPoints > MAX_POINTS
    ) {
      setError(
        `포인트는 0부터 ${MAX_POINTS.toLocaleString("ko-KR")}까지 입력해 주세요.`,
      );
      return;
    }

    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          loginId: loginId.trim(),
          password,
          name: name.trim(),
          nickname: nickname.trim(),
          email: email.trim().toLowerCase(),
          phone: phone.trim(),
          telephone: telephone.trim(),
          homepage: homepage.trim(),
          postcode: postcode.trim(),
          address1: address1.trim(),
          address2: address2.trim(),
          address3: address3.trim(),
          adminMemo: adminMemo.trim(),
          identityMethod,
          identityVerified,
          adultVerified,
          publicProfile,
          signature: signature.trim(),
          profile: profile.trim(),
          verificationHistory: verificationHistory.trim(),
          withdrawnAt: withdrawnAt || null,
          blockedAt: blockedAt || null,
          memberIcon: memberIcon.trim(),
          memberImage: memberImage.trim(),
          extra1: extras[0]?.trim() ?? "",
          extra2: extras[1]?.trim() ?? "",
          extra3: extras[2]?.trim() ?? "",
          extra4: extras[3]?.trim() ?? "",
          extra5: extras[4]?.trim() ?? "",
          extra6: extras[5]?.trim() ?? "",
          extra7: extras[6]?.trim() ?? "",
          extra8: extras[7]?.trim() ?? "",
          extra9: extras[8]?.trim() ?? "",
          extra10: extras[9]?.trim() ?? "",
          level: parsedLevel,
          points: parsedPoints,
          active,
          emailOptIn,
          smsOptIn,
          emailVerified,
        }),
      });
      const apiResult = await readMemberResponse(response);
      if (response.status === 401) {
        redirectToAdminLogin();
        return;
      }
      if (!response.ok || !apiResult.member) {
        throw new Error(
          firstApiError(apiResult) ?? "회원을 등록하지 못했습니다.",
        );
      }
      if (passwordInput) passwordInput.value = "";
      setMember(apiResult.member);
      populateForm(apiResult.member);
      setDialogOpen(false);
      pushToast({
        title: "회원을 등록했습니다.",
        message: `${apiResult.member.loginId} 회원이 새 사이트 데이터베이스에 등록되었습니다.`,
        tone: "success",
      });
      void loadMembers({ ...result.filters, page: 1 });
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "회원을 등록하지 못했습니다.",
      );
    } finally {
      if (passwordInput) passwordInput.value = "";
      setSaving(false);
    }
  };

  const deactivateMember = async (record: LegacyMemberRecord) => {
    const id = String(record.id);
    try {
      const response = await fetch(
        `/api/admin/users/${encodeURIComponent(id)}`,
        {
          method: "DELETE",
          headers: { Accept: "application/json" },
        },
      );
      const apiResult = await readMemberResponse(response);
      if (response.status === 401) {
        redirectToAdminLogin();
        return;
      }
      if (!response.ok || !apiResult.member) {
        throw new Error(
          firstApiError(apiResult) ?? "회원 이용을 중지하지 못했습니다.",
        );
      }

      const updated = apiResult.member;
      setMemberOverrides((current) => ({
        ...current,
        [updated.id]: memberListRecord(updated),
      }));
      if (member?.id === updated.id) {
        setMember(updated);
        populateForm(updated);
      }
      pushToast({
        title: "회원 이용을 중지했습니다.",
        message: "회원 정보와 주문 기록은 삭제하지 않고 보존합니다.",
        tone: "warning",
      });
      void loadMembers({ ...result.filters, page: result.page });
      router.refresh();
    } catch (cause) {
      pushToast({
        title: "회원 이용 중지 실패",
        message:
          cause instanceof Error
            ? cause.message
            : "잠시 후 다시 시도해 주세요.",
        tone: "danger",
      });
    }
  };

  const editSelectedMember = () => {
    if (selectedKeys.size !== 1) {
      pushToast({
        title: "회원 선택",
        message: "수정할 회원 한 명을 선택해 주세요.",
        tone: "warning",
      });
      return;
    }
    const [selectedId] = selectedKeys;
    const selected = members.find(
      (record) => String(record.id) === String(selectedId),
    );
    if (selected) void openMember(selected, "edit");
  };

  const deactivateSelectedMembers = async () => {
    if (selectedKeys.size === 0) {
      pushToast({
        title: "회원 선택",
        message: "이용을 중지할 회원을 선택해 주세요.",
        tone: "warning",
      });
      return;
    }
    if (
      !window.confirm(
        `선택한 ${selectedKeys.size.toLocaleString("ko-KR")}명 회원의 이용을 중지하시겠습니까?`,
      )
    ) {
      return;
    }
    const selected = members.filter((record) => selectedKeys.has(record.id));
    for (const record of selected) {
      await deactivateMember(record);
    }
    setSelectedKeys(new Set());
  };

  const profileFields = (
    <>
      <label className={dialogStyles.field}>
        <span className={dialogStyles.label}>이름</span>
        <AdminInput
          value={name}
          maxLength={80}
          onChange={(event) => setName(event.currentTarget.value)}
          disabled={saving}
          required
        />
      </label>
      <label className={dialogStyles.field}>
        <span className={dialogStyles.label}>닉네임</span>
        <AdminInput
          value={nickname}
          maxLength={80}
          onChange={(event) => setNickname(event.currentTarget.value)}
          disabled={saving}
        />
      </label>
      <label className={dialogStyles.field}>
        <span className={dialogStyles.label}>이메일</span>
        <AdminInput
          type="email"
          value={email}
          maxLength={254}
          onChange={(event) => setEmail(event.currentTarget.value)}
          disabled={saving}
          required
        />
      </label>
      <label className={dialogStyles.field}>
        <span className={dialogStyles.label}>휴대전화</span>
        <AdminInput
          type="tel"
          value={phone}
          maxLength={30}
          onChange={(event) => setPhone(event.currentTarget.value)}
          disabled={saving}
        />
      </label>
      <label className={dialogStyles.field}>
        <span className={dialogStyles.label}>전화번호</span>
        <AdminInput
          type="tel"
          value={telephone}
          maxLength={30}
          onChange={(event) => setTelephone(event.currentTarget.value)}
          disabled={saving}
        />
      </label>
      <label className={dialogStyles.field}>
        <span className={dialogStyles.label}>홈페이지</span>
        <AdminInput
          type="url"
          value={homepage}
          maxLength={300}
          placeholder="https://"
          onChange={(event) => setHomepage(event.currentTarget.value)}
          disabled={saving}
        />
      </label>
      <label className={dialogStyles.field}>
        <span className={dialogStyles.label}>우편번호</span>
        <AdminInput
          value={postcode}
          maxLength={20}
          onChange={(event) => setPostcode(event.currentTarget.value)}
          disabled={saving}
        />
      </label>
      <label
        className={`${dialogStyles.field} ${dialogStyles.fieldFull}`}
      >
        <span className={dialogStyles.label}>기본주소</span>
        <AdminInput
          value={address1}
          maxLength={200}
          onChange={(event) => setAddress1(event.currentTarget.value)}
          disabled={saving}
        />
      </label>
      <label
        className={`${dialogStyles.field} ${dialogStyles.fieldFull}`}
      >
        <span className={dialogStyles.label}>상세주소</span>
        <AdminInput
          value={address2}
          maxLength={200}
          onChange={(event) => setAddress2(event.currentTarget.value)}
          disabled={saving}
        />
      </label>
      <label
        className={`${dialogStyles.field} ${dialogStyles.fieldFull}`}
      >
        <span className={dialogStyles.label}>참고항목</span>
        <AdminInput
          value={address3}
          maxLength={200}
          onChange={(event) => setAddress3(event.currentTarget.value)}
          disabled={saving}
        />
      </label>
      <label className={dialogStyles.field}>
        <span className={dialogStyles.label}>메일 수신</span>
        <span>
          <input
            type="checkbox"
            checked={emailOptIn}
            onChange={(event) => setEmailOptIn(event.currentTarget.checked)}
            disabled={saving}
          />{" "}
          수신 동의
        </span>
      </label>
      <label className={dialogStyles.field}>
        <span className={dialogStyles.label}>SMS 수신</span>
        <span>
          <input
            type="checkbox"
            checked={smsOptIn}
            onChange={(event) => setSmsOptIn(event.currentTarget.checked)}
            disabled={saving}
          />{" "}
          수신 동의
        </span>
      </label>
      <label
        className={`${dialogStyles.field} ${dialogStyles.fieldFull}`}
      >
        <span className={dialogStyles.label}>관리자 메모</span>
        <textarea
          className="frm_input"
          value={adminMemo}
          maxLength={2_000}
          rows={4}
          onChange={(event) => setAdminMemo(event.currentTarget.value)}
          disabled={saving}
        />
      </label>
    </>
  );

  if (dialogOpen) {
    const formId =
      dialogMode === "create"
        ? "admin-member-create-form"
        : "admin-member-operation-form";
    const submitMemberForm =
      dialogMode === "create" ? createMember : saveMember;

    return (
      <>
        <div className="btn_fixed_top legacy-member-form-actions">
          <AdminButton onClick={closeDialog} disabled={saving}>
            목록
          </AdminButton>
          <AdminButton
            variant="primary"
            type="submit"
            form={formId}
            loading={saving}
            disabled={
              dialogLoading ||
              mediaUploading ||
              (dialogMode !== "create" && !member)
            }
          >
            확인
          </AdminButton>
        </div>
        {dialogLoading ? (
          <div className="legacy-member-form-loading" role="status">
            회원 정보를 불러오는 중입니다.
          </div>
        ) : (
          <form
            id={formId}
            className="legacy-member-form-page"
            onSubmit={submitMemberForm}
          >
            {error ? (
              <p className="legacy-member-form-error" role="alert">
                {error}
              </p>
            ) : null}
            <h2>회원 기본정보</h2>
            <table className="legacy-member-form-table">
              <caption>회원 기본정보 입력</caption>
              <colgroup>
                <col className="legacy-member-form-label-col" />
                <col className="legacy-member-form-value-col-primary" />
                <col className="legacy-member-form-label-col" />
                <col className="legacy-member-form-value-col-secondary" />
              </colgroup>
              <tbody>
                <tr className="legacy-member-form-standard-row">
                  <th scope="row">아이디<strong className="required">필수</strong></th>
                  <td>
                    <AdminInput
                      value={loginId}
                      minLength={4}
                      maxLength={30}
                      autoComplete="off"
                      readOnly={dialogMode !== "create"}
                      onChange={(event) =>
                        setLoginId(event.currentTarget.value)
                      }
                      disabled={saving}
                      required
                    />
                  </td>
                  <th scope="row">
                    {dialogMode === "create" ? "비밀번호" : "새 비밀번호"}
                    <strong className="required">
                      {dialogMode === "create" ? "필수" : ""}
                    </strong>
                  </th>
                  <td>
                    <AdminInput
                      type="password"
                      name={
                        dialogMode === "create" ? "password" : "newPassword"
                      }
                      minLength={8}
                      maxLength={128}
                      autoComplete="new-password"
                      disabled={saving}
                      required={dialogMode === "create"}
                    />
                    {dialogMode !== "create" ? (
                      <AdminInput
                        type="password"
                        name="adminPassword"
                        maxLength={1_024}
                        autoComplete="current-password"
                        placeholder="변경 시 관리자 비밀번호"
                        disabled={saving}
                      />
                    ) : null}
                  </td>
                </tr>
                <tr className="legacy-member-form-standard-row">
                  <th scope="row">이름(실명)<strong className="required">필수</strong></th>
                  <td>
                    <AdminInput
                      value={name}
                      maxLength={80}
                      onChange={(event) => setName(event.currentTarget.value)}
                      disabled={saving}
                      required
                    />
                  </td>
                  <th scope="row">닉네임<strong className="required">필수</strong></th>
                  <td>
                    <AdminInput
                      value={nickname}
                      maxLength={80}
                      onChange={(event) =>
                        setNickname(event.currentTarget.value)
                      }
                      disabled={saving}
                      required
                    />
                  </td>
                </tr>
                <tr className="legacy-member-form-authority-row">
                  <th scope="row">회원 권한</th>
                  <td>
                    <AdminSelect
                      value={level}
                      onChange={(event) =>
                        setLevel(event.currentTarget.value)
                      }
                      disabled={saving}
                    >
                      {Array.from({ length: 10 }, (_, index) => (
                        <option key={index + 1} value={String(index + 1)}>
                          {index + 1}
                        </option>
                      ))}
                    </AdminSelect>
                  </td>
                  <th scope="row">포인트</th>
                  <td>
                    {dialogMode === "create" ? (
                      <span className="legacy-member-point-readonly">0 점</span>
                    ) : (
                      <>
                        <AdminInput
                          type="number"
                          min={0}
                          max={MAX_POINTS}
                          step={1}
                          value={points}
                          onChange={(event) =>
                            setPoints(event.currentTarget.value)
                          }
                          disabled={saving}
                        />
                        <span className="legacy-member-point-unit">점</span>
                      </>
                    )}
                  </td>
                </tr>
                <tr className="legacy-member-form-standard-row">
                  <th scope="row">E-mail<strong className="required">필수</strong></th>
                  <td>
                    <AdminInput
                      className="legacy-member-email-input"
                      type="email"
                      value={email}
                      maxLength={254}
                      onChange={(event) => setEmail(event.currentTarget.value)}
                      disabled={saving}
                      required
                    />
                    {dialogMode !== "create" ? (
                      <label className="legacy-member-email-verified">
                        <input
                          type="checkbox"
                          checked={emailVerified}
                          onChange={(event) =>
                            setEmailVerified(event.currentTarget.checked)
                          }
                          disabled={saving}
                        />{" "}
                        메일인증
                      </label>
                    ) : null}
                  </td>
                  <th scope="row">홈페이지</th>
                  <td>
                    <AdminInput
                      type="url"
                      value={homepage}
                      maxLength={500}
                      onChange={(event) =>
                        setHomepage(event.currentTarget.value)
                      }
                      disabled={saving}
                    />
                  </td>
                </tr>
                <tr className="legacy-member-form-standard-row">
                  <th scope="row">휴대폰번호</th>
                  <td>
                    <AdminInput
                      value={phone}
                      maxLength={30}
                      onChange={(event) => setPhone(event.currentTarget.value)}
                      disabled={saving}
                    />
                  </td>
                  <th scope="row">전화번호</th>
                  <td>
                    <AdminInput
                      value={telephone}
                      maxLength={30}
                      onChange={(event) =>
                        setTelephone(event.currentTarget.value)
                      }
                      disabled={saving}
                    />
                  </td>
                </tr>
                <tr className="legacy-member-form-radio-row">
                  <th scope="row">본인확인방법</th>
                  <td colSpan={3}>
                    <span className="legacy-member-radio-line">
                      {[
                        ["none", "간편인증"],
                        ["phone", "휴대폰"],
                        ["ipin", "아이핀"],
                      ].map(([value, label]) => (
                        <label key={value}>
                          <input
                            type="radio"
                            name="identityMethod"
                            value={value}
                            checked={identityMethod === value}
                            onChange={() =>
                              setIdentityMethod(
                                value as "none" | "phone" | "ipin",
                              )
                            }
                            disabled={saving}
                          />{" "}
                          {label}
                        </label>
                      ))}
                    </span>
                  </td>
                </tr>
                <tr className="legacy-member-form-radio-row">
                  <th scope="row">본인확인</th>
                  <td>
                    <LegacyBooleanField
                      name="identityVerified"
                      value={identityVerified}
                      onChange={setIdentityVerified}
                      disabled={saving}
                    />
                  </td>
                  <th scope="row">성인인증</th>
                  <td>
                    <LegacyBooleanField
                      name="adultVerified"
                      value={adultVerified}
                      onChange={setAdultVerified}
                      disabled={saving}
                    />
                  </td>
                </tr>
                <tr className="legacy-member-form-address-row">
                  <th scope="row">주소</th>
                  <td colSpan={3}>
                    <div className="legacy-member-address">
                      <div className="legacy-member-postcode-line">
                        <AdminInput
                          value={postcode}
                          maxLength={20}
                          placeholder="우편번호"
                          onChange={(event) =>
                            setPostcode(event.currentTarget.value)
                          }
                          disabled={saving}
                        />
                        <AdminButton
                          type="button"
                          disabled={saving}
                          onClick={() => {
                            void openPostcodeSearch((selection) => {
                              setPostcode(selection.postcode);
                              setAddress1(selection.address);
                            }).catch((cause) => {
                              setError(
                                cause instanceof Error
                                  ? cause.message
                                  : "주소검색을 실행하지 못했습니다.",
                              );
                            });
                          }}
                        >
                          주소검색
                        </AdminButton>
                      </div>
                      <label>
                        <AdminInput
                          value={address1}
                          maxLength={500}
                          onChange={(event) =>
                            setAddress1(event.currentTarget.value)
                          }
                          disabled={saving}
                        />
                        <span>기본주소</span>
                      </label>
                      <label>
                        <AdminInput
                          value={address2}
                          maxLength={500}
                          onChange={(event) =>
                            setAddress2(event.currentTarget.value)
                          }
                          disabled={saving}
                        />
                        <span>상세주소</span>
                      </label>
                      <label>
                        <AdminInput
                          value={address3}
                          maxLength={500}
                          onChange={(event) =>
                            setAddress3(event.currentTarget.value)
                          }
                          disabled={saving}
                        />
                        <span>참고항목</span>
                      </label>
                    </div>
                  </td>
                </tr>
                <tr className="legacy-member-form-icon-row">
                  <th scope="row">회원아이콘</th>
                  <td colSpan={3}>
                    <div className="legacy-member-media-field legacy-member-media-icon">
                      <span className="frm_info">
                        이미지 크기는 가로 22px, 세로 22px로 등록합니다.
                      </span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/gif,image/webp"
                        disabled={saving || mediaUploading}
                        onChange={(event) => {
                          const file = event.currentTarget.files?.[0];
                          if (file) {
                            void uploadMemberMedia(file, setMemberIcon);
                          }
                          event.currentTarget.value = "";
                        }}
                      />
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={memberIcon || MEMBER_MEDIA_PLACEHOLDER}
                        alt={memberIcon ? "현재 회원아이콘" : "기본 회원아이콘"}
                      />
                      <label className="legacy-member-media-delete">
                        <input
                          type="checkbox"
                          onChange={(event) => {
                            if (event.currentTarget.checked) setMemberIcon("");
                          }}
                          disabled={saving || mediaUploading}
                        />{" "}
                        삭제
                      </label>
                    </div>
                  </td>
                </tr>
                <tr className="legacy-member-form-image-row">
                  <th scope="row">회원이미지</th>
                  <td colSpan={3}>
                    <div className="legacy-member-media-field legacy-member-media-image">
                      <span className="frm_info">
                        이미지 크기는 가로 100px, 세로 100px로 등록합니다.
                      </span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/gif,image/webp"
                        disabled={saving || mediaUploading}
                        onChange={(event) => {
                          const file = event.currentTarget.files?.[0];
                          if (file) {
                            void uploadMemberMedia(file, setMemberImage);
                          }
                          event.currentTarget.value = "";
                        }}
                      />
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={memberImage || MEMBER_MEDIA_PLACEHOLDER}
                        alt={memberImage ? "현재 회원이미지" : "기본 회원이미지"}
                      />
                      <label className="legacy-member-media-delete">
                        <input
                          type="checkbox"
                          onChange={(event) => {
                            if (event.currentTarget.checked) setMemberImage("");
                          }}
                          disabled={saving || mediaUploading}
                        />{" "}
                        삭제
                      </label>
                    </div>
                  </td>
                </tr>
                <tr className="legacy-member-form-radio-row">
                  <th scope="row">메일 수신</th>
                  <td>
                    <LegacyBooleanField
                      name="emailOptIn"
                      value={emailOptIn}
                      onChange={setEmailOptIn}
                      disabled={saving}
                    />
                  </td>
                  <th scope="row">SMS 수신</th>
                  <td>
                    <LegacyBooleanField
                      name="smsOptIn"
                      value={smsOptIn}
                      onChange={setSmsOptIn}
                      disabled={saving}
                    />
                  </td>
                </tr>
                <tr className="legacy-member-form-radio-row">
                  <th scope="row">정보 공개</th>
                  <td colSpan={3}>
                    <LegacyBooleanField
                      name="publicProfile"
                      value={publicProfile}
                      onChange={setPublicProfile}
                      disabled={saving}
                    />
                  </td>
                </tr>
                <tr className="legacy-member-form-textarea-row">
                  <th scope="row">서명</th>
                  <td colSpan={3}>
                    <textarea
                      value={signature}
                      maxLength={1_000}
                      rows={3}
                      onChange={(event) =>
                        setSignature(event.currentTarget.value)
                      }
                      disabled={saving}
                    />
                  </td>
                </tr>
                <tr className="legacy-member-form-textarea-row">
                  <th scope="row">자기 소개</th>
                  <td colSpan={3}>
                    <textarea
                      value={profile}
                      maxLength={5_000}
                      rows={5}
                      onChange={(event) =>
                        setProfile(event.currentTarget.value)
                      }
                      disabled={saving}
                    />
                  </td>
                </tr>
                <tr className="legacy-member-form-textarea-row">
                  <th scope="row">메모</th>
                  <td colSpan={3}>
                    <textarea
                      value={adminMemo}
                      maxLength={2_000}
                      rows={4}
                      onChange={(event) =>
                        setAdminMemo(event.currentTarget.value)
                      }
                      disabled={saving}
                    />
                  </td>
                </tr>
                <tr className="legacy-member-form-history-row">
                  <th scope="row">본인인증 내역</th>
                  <td colSpan={3}>
                    {verificationHistory || "본인인증 내역이 없습니다."}
                  </td>
                </tr>
                <tr className="legacy-member-form-date-row">
                  <th scope="row">탈퇴일자</th>
                  <td>
                    <AdminInput
                      type="text"
                      value={withdrawnAt}
                      maxLength={10}
                      onChange={(event) =>
                        setWithdrawnAt(event.currentTarget.value)
                      }
                      disabled={saving}
                    />
                    <label>
                      <input
                        type="checkbox"
                        checked={withdrawnAt === todayDateInput()}
                        onChange={(event) =>
                          setWithdrawnAt(
                            event.currentTarget.checked ? todayDateInput() : "",
                          )
                        }
                        disabled={saving}
                      />{" "}
                      오늘로 지정
                    </label>
                  </td>
                  <th scope="row">접근차단일자</th>
                  <td>
                    <AdminInput
                      type="text"
                      value={blockedAt}
                      maxLength={10}
                      onChange={(event) =>
                        setBlockedAt(event.currentTarget.value)
                      }
                      disabled={saving}
                    />
                    <label>
                      <input
                        type="checkbox"
                        checked={blockedAt === todayDateInput()}
                        onChange={(event) => {
                          const checked = event.currentTarget.checked;
                          setBlockedAt(checked ? todayDateInput() : "");
                          setActive(!checked);
                        }}
                        disabled={saving}
                      />{" "}
                      오늘로 지정
                    </label>
                  </td>
                </tr>
                {Array.from({ length: 10 }, (_, index) => (
                  <tr
                    key={`extra-row-${index + 1}`}
                    className="legacy-member-form-extra-row"
                  >
                    <th scope="row">여분 필드 {index + 1}</th>
                    <td colSpan={3}>
                      <AdminInput
                        value={extras[index] ?? ""}
                        maxLength={500}
                        onChange={(event) =>
                          setExtras((current) =>
                            current.map((currentValue, currentIndex) =>
                              currentIndex === index
                                ? event.currentTarget.value
                                : currentValue,
                            ),
                          )
                        }
                        disabled={saving}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </form>
        )}
        <ToastRegion toasts={toasts} onDismiss={dismissToast} />
      </>
    );
  }

  return (
    <>
      <div className="btn_fixed_top legacy-member-actions">
        {members.length > 0 ? (
          <>
            <AdminButton onClick={editSelectedMember}>선택수정</AdminButton>
            <AdminButton onClick={() => void deactivateSelectedMembers()}>
              선택삭제
            </AdminButton>
          </>
        ) : null}
        <AdminButton
          variant="primary"
          onClick={openCreateMember}
        >
          회원추가
        </AdminButton>
      </div>
      {listError ? <Notice tone="danger">{listError}</Notice> : null}
      <FilterPanel
        fields={filterFields}
        onChange={(name, value) =>
          setFilters((current) => ({ ...current, [name]: value }))
        }
        onSearch={() => void loadMembers({ ...filters, page: 1 })}
        onReset={() => {
          const reset: AdminMemberListFilters = {
            q: "",
            status: "",
            dateStart: "",
            dateEnd: "",
            sortBy: "joinedAt",
            sortDirection: "desc",
          };
          setFilters(reset);
          void loadMembers({ ...reset, page: 1 });
        }}
        loading={listLoading}
      />
      <TableResultBar
        total={result.total}
        selectedCount={selectedKeys.size}
        prefix={
          <span className="legacy-member-summary-label">전체목록</span>
        }
        suffix={
          <>
            <span className="legacy-member-summary-chip">
              차단{" "}
              <strong>
                {members
                  .filter((record) => record.statusCode === "inactive")
                  .length.toLocaleString("ko-KR")}
              </strong>
              명
            </span>
            <span className="legacy-member-summary-chip">
              탈퇴 <strong>0</strong>명
            </span>
          </>
        }
      />
      <div
        className="legacy-member-table-wrap"
        aria-busy={listLoading}
      >
        <table className="legacy-member-table">
          <caption>회원 목록</caption>
          <colgroup>
            <col className="legacy-member-col-check" />
            <col className="legacy-member-col-name" />
            <col className="legacy-member-col-nickname" />
            <col className="legacy-member-col-identity" />
            <col className="legacy-member-col-flag" />
            <col className="legacy-member-col-flag" />
            <col className="legacy-member-col-flag" />
            <col className="legacy-member-col-status" />
            <col className="legacy-member-col-contact" />
            <col className="legacy-member-col-date" />
            <col className="legacy-member-col-point" />
            <col className="legacy-member-col-manage" />
          </colgroup>
          <thead>
            <tr>
              <th rowSpan={2} scope="col">
                <span className="sound_only">회원 전체</span>
                <input
                  type="checkbox"
                  aria-label="전체 회원 선택"
                  checked={
                    members.length > 0 &&
                    members.every((record) => selectedKeys.has(record.id))
                  }
                  onChange={(event) =>
                    setSelectedKeys(
                      event.currentTarget.checked
                        ? new Set(members.map((record) => record.id))
                        : new Set(),
                    )
                  }
                />
              </th>
              <th
                colSpan={2}
                scope="colgroup"
                aria-sort={
                  result.filters.sortBy === "loginId"
                    ? result.filters.sortDirection === "asc"
                      ? "ascending"
                      : "descending"
                    : "none"
                }
              >
                <button
                  className="legacy-member-sort"
                  type="button"
                  onClick={() => changeMemberSort("loginId")}
                  disabled={listLoading}
                >
                  아이디
                </button>
              </th>
              <th rowSpan={2} scope="col">
                본인확인
              </th>
              <th scope="col">메일인증</th>
              <th scope="col">정보공개</th>
              <th scope="col">메일수신</th>
              <th scope="col">상태</th>
              <th scope="col">휴대폰</th>
              <th
                scope="col"
                aria-sort={
                  result.filters.sortBy === "lastLoginAt"
                    ? result.filters.sortDirection === "asc"
                      ? "ascending"
                      : "descending"
                    : "none"
                }
              >
                <button
                  className="legacy-member-sort"
                  type="button"
                  onClick={() => changeMemberSort("lastLoginAt")}
                  disabled={listLoading}
                >
                  최종접속
                </button>
              </th>
              <th scope="col">접근그룹</th>
              <th rowSpan={2} scope="col">
                관리
              </th>
            </tr>
            <tr>
              <th scope="col">이름</th>
              <th scope="col">닉네임</th>
              <th scope="col">SMS수신</th>
              <th scope="col">성인인증</th>
              <th scope="col">접근차단</th>
              <th scope="col">권한</th>
              <th scope="col">전화번호</th>
              <th
                scope="col"
                aria-sort={
                  result.filters.sortBy === "joinedAt"
                    ? result.filters.sortDirection === "asc"
                      ? "ascending"
                      : "descending"
                    : "none"
                }
              >
                <button
                  className="legacy-member-sort"
                  type="button"
                  onClick={() => changeMemberSort("joinedAt")}
                  disabled={listLoading}
                >
                  가입일
                </button>
              </th>
              <th
                scope="col"
                aria-sort={
                  result.filters.sortBy === "points"
                    ? result.filters.sortDirection === "asc"
                      ? "ascending"
                      : "descending"
                    : "none"
                }
              >
                <button
                  className="legacy-member-sort"
                  type="button"
                  onClick={() => changeMemberSort("points")}
                  disabled={listLoading}
                >
                  포인트
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {members.length === 0 ? (
              <tr>
                <td className="legacy-member-empty" colSpan={12}>
                  자료가 없습니다.
                </td>
              </tr>
            ) : (
              members.flatMap((record) => {
                const selected = selectedKeys.has(record.id);
                return [
                  <tr
                    key={`${record.id}-primary`}
                    className="legacy-member-primary-row"
                    aria-selected={selected}
                  >
                    <td rowSpan={2}>
                      <input
                        type="checkbox"
                        aria-label={`${record.loginId} 선택`}
                        checked={selected}
                        onChange={(event) =>
                          setSelectedKeys((current) => {
                            const next = new Set(current);
                            if (event.currentTarget.checked) {
                              next.add(record.id);
                            } else {
                              next.delete(record.id);
                            }
                            return next;
                          })
                        }
                      />
                    </td>
                    <td colSpan={2}>
                      <button
                        type="button"
                        className="legacy-member-id-link"
                        onClick={() => void openMember(record, "view")}
                      >
                        {record.loginId}
                      </button>
                    </td>
                    <td rowSpan={2}>
                      <span className="legacy-member-identity">
                        <label>
                          <input
                            type="radio"
                            checked={record.identityMethod === "none"}
                            readOnly
                          />{" "}
                          없음
                        </label>
                        <label>
                          <input
                            type="radio"
                            checked={record.identityMethod === "phone"}
                            readOnly
                          />{" "}
                          휴대폰
                        </label>
                        <label>
                          <input
                            type="radio"
                            checked={record.identityMethod === "ipin"}
                            readOnly
                          />{" "}
                          아이핀
                        </label>
                      </span>
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`${record.loginId} 메일인증`}
                        checked={record.emailVerified}
                        readOnly
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`${record.loginId} 정보공개`}
                        checked={record.publicProfile}
                        readOnly
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`${record.loginId} 메일수신`}
                        checked={record.emailOptIn}
                        readOnly
                      />
                    </td>
                    <td>{record.active ? "정상" : "차단"}</td>
                    <td>{record.phone || "-"}</td>
                    <td>{formatLegacyMemberDate(record.lastLoginAt)}</td>
                    <td>
                      {groupCounts[String(record.id)] === undefined
                        ? "-"
                        : groupCounts[String(record.id)].toLocaleString(
                            "ko-KR",
                          )}
                    </td>
                    <td rowSpan={2}>
                      <div className="legacy-member-manage-grid">
                        <button
                          type="button"
                          className="legacy-member-manage"
                          onClick={() => void openMember(record, "edit")}
                        >
                          수정
                        </button>
                        <button
                          type="button"
                          className="legacy-member-group"
                          onClick={() => void openMemberGroups(record)}
                        >
                          그룹
                        </button>
                        <button
                          type="button"
                          className="legacy-member-wallet"
                          onClick={() => void openMemberWallet(record)}
                        >
                          충환변경
                        </button>
                        <button
                          type="button"
                          className="legacy-member-order"
                          onClick={() => void openMemberOrders(record)}
                        >
                          상품변경
                        </button>
                      </div>
                    </td>
                  </tr>,
                  <tr
                    key={`${record.id}-secondary`}
                    className="legacy-member-secondary-row"
                    aria-selected={selected}
                  >
                    <td>{record.name || "-"}</td>
                    <td>{record.nickname || "-"}</td>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`${record.loginId} SMS 수신`}
                        checked={record.smsOptIn}
                        readOnly
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`${record.loginId} 성인인증`}
                        checked={record.adultVerified}
                        readOnly
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`${record.loginId} 접근차단`}
                        checked={!record.active}
                        readOnly
                      />
                    </td>
                    <td>{record.level}</td>
                    <td>{record.telephone || "-"}</td>
                    <td>{formatLegacyMemberDate(record.joinedAt)}</td>
                    <td>{record.points.toLocaleString("ko-KR")}</td>
                  </tr>,
                ];
              })
            )}
          </tbody>
        </table>
        {listLoading ? (
          <div className="legacy-member-loading" role="status">
            회원 목록을 불러오는 중입니다.
          </div>
        ) : null}
      </div>
      {result.totalPages > 1 ? (
        <nav className="legacy-member-pagination" aria-label="회원 목록 페이지">
          <button
            type="button"
            disabled={result.page <= 1 || listLoading}
            onClick={() =>
              void loadMembers({ ...result.filters, page: result.page - 1 })
            }
          >
            이전
          </button>
          <span aria-current="page">{result.page}</span>
          <button
            type="button"
            disabled={result.page >= result.totalPages || listLoading}
            onClick={() =>
              void loadMembers({ ...result.filters, page: result.page + 1 })
            }
          >
            다음
          </button>
        </nav>
      ) : null}
      <OperationDialog
        open={groupDialogOpen}
        title="접근가능그룹"
        subtitle={
          groupMember
            ? `${groupMember.loginId} 회원의 접근 그룹을 선택합니다.`
            : undefined
        }
        busy={groupSaving}
        onClose={closeGroupDialog}
        footer={
          <>
            <AdminButton onClick={closeGroupDialog} disabled={groupSaving}>
              닫기
            </AdminButton>
            <AdminButton
              variant="primary"
              onClick={() => void saveMemberGroups()}
              loading={groupSaving}
              disabled={groupLoading || !groupMember}
            >
              선택완료
            </AdminButton>
          </>
        }
      >
        <div className="legacy-member-group-selector">
          {groupLoading ? (
            <p className="legacy-member-group-state" role="status">
              접근가능그룹을 불러오는 중입니다.
            </p>
          ) : (
            <>
              {groupError ? (
                <p className="legacy-member-group-error" role="alert">
                  {groupError}
                </p>
              ) : null}
              <p className="legacy-member-group-help">
                회원이 접근할 수 있는 그룹을 선택한 뒤 선택완료를 누르세요.
              </p>
              {groupOptions.length > 0 ? (
                <ul className="legacy-member-group-list">
                  {groupOptions.map((group) => (
                    <li key={group.id}>
                      <label>
                        <input
                          type="checkbox"
                          checked={group.selected}
                          disabled={
                            groupSaving || (!group.active && !group.selected)
                          }
                          onChange={(event) => {
                            const checked = event.currentTarget.checked;
                            setGroupOptions((current) =>
                              current.map((entry) =>
                                entry.id === group.id
                                  ? { ...entry, selected: checked }
                                  : entry,
                              ),
                            );
                          }}
                        />
                        <span>{group.name}</span>
                        {!group.active ? (
                          <em>사용중지</em>
                        ) : null}
                      </label>
                    </li>
                  ))}
                </ul>
              ) : groupError ? null : (
                <p className="legacy-member-group-state">
                  등록된 접근가능그룹이 없습니다.
                </p>
              )}
            </>
          )}
        </div>
      </OperationDialog>
      <OperationDialog
        open={orderDialogOpen}
        title="상품변경"
        subtitle={
          orderMember
            ? `${orderMember.loginId} 회원의 최근 구매상품`
            : undefined
        }
        busy={Boolean(orderSavingItemId)}
        onClose={closeOrderDialog}
        footer={
          <AdminButton
            onClick={closeOrderDialog}
            disabled={Boolean(orderSavingItemId)}
          >
            닫기
          </AdminButton>
        }
      >
        <div className="legacy-member-order-editor">
          {orderLoading ? (
            <p className="legacy-member-order-state" role="status">
              구매상품 목록을 불러오는 중입니다.
            </p>
          ) : (
            <>
              {orderError ? (
                <p className="legacy-member-order-error" role="alert">
                  {orderError}
                </p>
              ) : null}
              {orderMember ? (
                <div className="legacy-member-order-summary">
                  <span>
                    회원 <strong>{orderMember.loginId}</strong>
                  </span>
                  <span>
                    이름 <strong>{orderMember.name || "-"}</strong>
                  </span>
                  <span>
                    현재 마일리지{" "}
                    <strong>
                      {orderMember.points.toLocaleString("ko-KR")}P
                    </strong>
                  </span>
                  <span>
                    구매상품{" "}
                    <strong>
                      {memberOrders.length.toLocaleString("ko-KR")}건
                    </strong>
                  </span>
                </div>
              ) : null}
              {memberOrders.length === 0 ? (
                <p className="legacy-member-order-state">
                  등록된 구매상품이 없습니다.
                </p>
              ) : (
                <div className="legacy-member-order-list">
                  {memberOrders.map((item) => {
                    const draft = orderDrafts[item.itemId];
                    if (!draft) return null;
                    const rowSaving = orderSavingItemId === item.itemId;
                    return (
                      <article
                        className="legacy-member-order-card"
                        key={item.itemId}
                      >
                        <header>
                          <span className="legacy-member-order-number">
                            {item.orderId}
                          </span>
                          <strong>{item.productName}</strong>
                          <span className="legacy-member-order-status">
                            {memberOrderStatusLabel(item.status)}
                          </span>
                        </header>
                        <div className="legacy-member-order-fields">
                          <label>
                            <span>상품ID (it_id)</span>
                            <input
                              type="text"
                              inputMode="numeric"
                              maxLength={80}
                              value={draft.productId}
                              disabled={rowSaving}
                              onChange={(event) =>
                                updateMemberOrderDraft(item.itemId, {
                                  productId: event.currentTarget.value,
                                })
                              }
                            />
                          </label>
                          <label>
                            <span>구매일시</span>
                            <input
                              type="datetime-local"
                              step={1}
                              value={draft.purchasedAt}
                              disabled={rowSaving}
                              onChange={(event) =>
                                updateMemberOrderDraft(item.itemId, {
                                  purchasedAt: event.currentTarget.value,
                                })
                              }
                            />
                          </label>
                          <div className="legacy-member-order-product">
                            <span>현재 상품</span>
                            <a
                              href={`/shop/item.php?it_id=${encodeURIComponent(item.productId)}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {item.productName}
                            </a>
                          </div>
                          <div>
                            <span>단가 × 수량</span>
                            <strong>
                              {item.unitPrice.toLocaleString("ko-KR")}원 ×{" "}
                              {item.quantity.toLocaleString("ko-KR")}
                            </strong>
                          </div>
                          <div>
                            <span>상품금액</span>
                            <strong>
                              {item.lineTotal.toLocaleString("ko-KR")}원
                            </strong>
                          </div>
                          <div>
                            <span>주문 결제금액</span>
                            <strong className="legacy-member-order-total">
                              {item.total.toLocaleString("ko-KR")}원
                            </strong>
                          </div>
                          <div>
                            <span>사용 마일리지</span>
                            <strong>
                              {item.pointsUsed.toLocaleString("ko-KR")}P
                            </strong>
                          </div>
                          <div>
                            <span>적립 마일리지</span>
                            <strong>
                              {item.earnedPoints.toLocaleString("ko-KR")}P
                            </strong>
                          </div>
                        </div>
                        <footer>
                          <span>
                            상품ID를 변경하면 상품명·단가·주문금액·마일리지가 자동 계산됩니다.
                          </span>
                          <AdminButton
                            variant="primary"
                            loading={rowSaving}
                            disabled={Boolean(
                              orderSavingItemId && !rowSaving,
                            )}
                            onClick={() => void saveMemberOrder(item)}
                          >
                            상품 수정
                          </AdminButton>
                        </footer>
                      </article>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </OperationDialog>
      <OperationDialog
        open={walletDialogOpen}
        title="충환변경"
        subtitle={
          walletMember
            ? `${walletMember.loginId} 회원의 충전·출금 신청내역`
            : undefined
        }
        busy={Boolean(walletSavingKey)}
        onClose={closeWalletDialog}
        footer={
          <AdminButton
            onClick={closeWalletDialog}
            disabled={Boolean(walletSavingKey)}
          >
            닫기
          </AdminButton>
        }
      >
        <div className="legacy-member-wallet-editor">
          {walletLoading ? (
            <p className="legacy-member-wallet-state" role="status">
              충전·출금 내역을 불러오는 중입니다.
            </p>
          ) : (
            <>
              {walletError ? (
                <p className="legacy-member-wallet-error" role="alert">
                  {walletError}
                </p>
              ) : null}
              {walletMember ? (
                <div className="legacy-member-wallet-summary">
                  <span>
                    회원 <strong>{walletMember.loginId}</strong>
                  </span>
                  <span>
                    이름 <strong>{walletMember.name || "-"}</strong>
                  </span>
                  <span>
                    현재 포인트{" "}
                    <strong>
                      {walletMember.points.toLocaleString("ko-KR")}P
                    </strong>
                  </span>
                  <span>
                    전체 내역{" "}
                    <strong>
                      {walletRequests.length.toLocaleString("ko-KR")}건
                    </strong>
                  </span>
                </div>
              ) : null}
              {walletRequests.length === 0 ? (
                <p className="legacy-member-wallet-state">
                  등록된 충전·출금 내역이 없습니다.
                </p>
              ) : (
                <div className="legacy-member-wallet-list">
                  {walletRequests.map((request) => {
                    const key = walletRequestKey(request);
                    const draft = walletDrafts[key];
                    if (!draft) return null;
                    const rowSaving = walletSavingKey === key;
                    return (
                      <article
                        className="legacy-member-wallet-card"
                        key={key}
                      >
                        <header>
                          <span
                            className={`legacy-member-wallet-kind legacy-member-wallet-kind-${request.kind}`}
                          >
                            {request.kind === "charge" ? "충전" : "출금"}
                          </span>
                          <strong>
                            {Number(draft.amount || 0).toLocaleString("ko-KR")}
                            원
                          </strong>
                          <span
                            className={`legacy-member-wallet-status legacy-member-wallet-status-${draft.status}`}
                          >
                            {walletStatusLabel(draft.status)}
                          </span>
                        </header>
                        <div className="legacy-member-wallet-fields">
                          <label className="legacy-member-wallet-field-id">
                            <span>신청번호</span>
                            <input
                              type="text"
                              maxLength={80}
                              value={draft.id}
                              disabled={rowSaving}
                              onChange={(event) =>
                                updateWalletDraft(key, {
                                  id: event.currentTarget.value,
                                })
                              }
                            />
                          </label>
                          <label>
                            <span>금액</span>
                            <input
                              type="number"
                              min={MIN_WALLET_REQUEST_AMOUNT}
                              max={MAX_WALLET_REQUEST_AMOUNT}
                              step={1}
                              value={draft.amount}
                              disabled={rowSaving}
                              onChange={(event) =>
                                updateWalletDraft(key, {
                                  amount: event.currentTarget.value,
                                })
                              }
                            />
                          </label>
                          <label>
                            <span>처리상태</span>
                            <select
                              value={draft.status}
                              disabled={rowSaving}
                              onChange={(event) =>
                                updateWalletDraft(key, {
                                  status: event.currentTarget
                                    .value as WalletRequestStatus,
                                })
                              }
                            >
                              <option value="requested">처리대기</option>
                              <option value="approved">승인</option>
                              <option value="rejected">반려</option>
                            </select>
                          </label>
                          <label>
                            <span>신청일시</span>
                            <input
                              type="datetime-local"
                              step={1}
                              value={draft.createdAt}
                              disabled={rowSaving}
                              onChange={(event) =>
                                updateWalletDraft(key, {
                                  createdAt: event.currentTarget.value,
                                })
                              }
                            />
                          </label>
                          {request.kind === "charge" ? (
                            <label>
                              <span>입금자명</span>
                              <input
                                type="text"
                                maxLength={80}
                                value={draft.depositorName}
                                disabled={rowSaving}
                                onChange={(event) =>
                                  updateWalletDraft(key, {
                                    depositorName: event.currentTarget.value,
                                  })
                                }
                              />
                            </label>
                          ) : (
                            <>
                              <label>
                                <span>은행명</span>
                                <input
                                  type="text"
                                  maxLength={80}
                                  value={draft.bankName}
                                  disabled={rowSaving}
                                  onChange={(event) =>
                                    updateWalletDraft(key, {
                                      bankName: event.currentTarget.value,
                                    })
                                  }
                                />
                              </label>
                              <label>
                                <span>계좌번호</span>
                                <input
                                  type="text"
                                  maxLength={80}
                                  value={draft.accountNumber}
                                  disabled={rowSaving}
                                  onChange={(event) =>
                                    updateWalletDraft(key, {
                                      accountNumber:
                                        event.currentTarget.value,
                                    })
                                  }
                                />
                              </label>
                              <label>
                                <span>예금주</span>
                                <input
                                  type="text"
                                  maxLength={80}
                                  value={draft.accountHolder}
                                  disabled={rowSaving}
                                  onChange={(event) =>
                                    updateWalletDraft(key, {
                                      accountHolder:
                                        event.currentTarget.value,
                                    })
                                  }
                                />
                              </label>
                            </>
                          )}
                          <label className="legacy-member-wallet-field-memo">
                            <span>관리자 메모</span>
                            <input
                              type="text"
                              maxLength={500}
                              value={draft.adminMemo}
                              disabled={rowSaving}
                              onChange={(event) =>
                                updateWalletDraft(key, {
                                  adminMemo: event.currentTarget.value,
                                })
                              }
                            />
                          </label>
                        </div>
                        <footer>
                          <span>
                            최종변경 {formatWalletAdminDate(request.updatedAt)}
                          </span>
                          <AdminButton
                            variant="primary"
                            loading={rowSaving}
                            disabled={Boolean(
                              walletSavingKey && !rowSaving,
                            )}
                            onClick={() =>
                              void saveMemberWalletRequest(request)
                            }
                          >
                            내역 수정
                          </AdminButton>
                        </footer>
                      </article>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </OperationDialog>
      <OperationDialog
        open={dialogOpen}
        title={
          dialogMode === "create"
            ? "회원 등록"
            : member
            ? `${member.loginId} 회원 ${dialogMode === "edit" ? "수정" : "상세"}`
            : "회원 정보"
        }
        subtitle={member ? `가입일 ${member.joinedAt}` : undefined}
        busy={saving}
        onClose={closeDialog}
        footer={
          <>
            <AdminButton onClick={closeDialog} disabled={saving}>
              닫기
            </AdminButton>
            {dialogMode === "view" && member ? (
              <AdminButton
                variant="primary"
                onClick={() => {
                  setDialogMode("edit");
                  setError("");
                }}
              >
                수정
              </AdminButton>
            ) : (
              <AdminButton
                variant="primary"
                type="submit"
                form={
                  dialogMode === "create"
                    ? "admin-member-create-form"
                    : "admin-member-operation-form"
                }
                loading={saving}
                disabled={
                  dialogLoading ||
                  (dialogMode === "edit" && !member)
                }
              >
                {dialogMode === "create" ? "회원 등록" : "변경사항 저장"}
              </AdminButton>
            )}
          </>
        }
      >
        {dialogLoading ? (
          <div className={dialogStyles.loading} role="status">
            회원 정보를 불러오는 중입니다.
          </div>
        ) : (
          <>
            {error ? (
              <p className={dialogStyles.error} role="alert">
                {error}
              </p>
            ) : null}
            {dialogMode === "create" ? (
              <form
                id="admin-member-create-form"
                className={dialogStyles.section}
                onSubmit={createMember}
              >
                <h3 className={dialogStyles.sectionTitle}>회원 기본정보</h3>
                <div className={dialogStyles.formGrid}>
                  <label className={dialogStyles.field}>
                    <span className={dialogStyles.label}>회원아이디</span>
                    <AdminInput
                      value={loginId}
                      minLength={4}
                      maxLength={30}
                      autoComplete="off"
                      onChange={(event) =>
                        setLoginId(event.currentTarget.value)
                      }
                      disabled={saving}
                      required
                    />
                  </label>
                  <label className={dialogStyles.field}>
                    <span className={dialogStyles.label}>비밀번호</span>
                    <AdminInput
                      type="password"
                      name="password"
                      minLength={8}
                      maxLength={128}
                      autoComplete="new-password"
                      disabled={saving}
                      required
                    />
                  </label>
                  {profileFields}
                  <label className={dialogStyles.field}>
                    <span className={dialogStyles.label}>
                      회원 등급 (1~10)
                    </span>
                    <AdminInput
                      type="number"
                      min={1}
                      max={10}
                      step={1}
                      value={level}
                      onChange={(event) =>
                        setLevel(event.currentTarget.value)
                      }
                      disabled={saving}
                      required
                    />
                  </label>
                  <label className={dialogStyles.field}>
                    <span className={dialogStyles.label}>계정 상태</span>
                    <AdminSelect
                      value={active ? "active" : "inactive"}
                      onChange={(event) =>
                        setActive(event.currentTarget.value === "active")
                      }
                      disabled={saving}
                    >
                      <option value="active">정상</option>
                      <option value="inactive">이용 중지</option>
                    </AdminSelect>
                  </label>
                </div>
                <p className={dialogStyles.help}>
                  회원아이디는 등록 후 변경할 수 없습니다. 본인인증·회원
                  아이콘은 외부 인증 서비스가 연결되지 않아 이 화면에서
                  처리하지 않습니다.
                </p>
              </form>
            ) : null}
            {member ? (
              <>
                <p className={dialogStyles.statusLine}>
                  계정 상태:{" "}
                  <strong>{member.active ? "정상" : "이용 중지"}</strong>
                </p>
                <section className={dialogStyles.section}>
                  <h3 className={dialogStyles.sectionTitle}>회원 정보</h3>
                  <dl className={dialogStyles.definitionGrid}>
                    <dt>이름</dt>
                    <dd>
                      {member.name}
                      {member.nickname ? ` (${member.nickname})` : ""}
                    </dd>
                    <dt>이메일</dt>
                    <dd>{member.email}</dd>
                    <dt>연락처</dt>
                    <dd>{member.phone || "-"}</dd>
                    <dt>전화번호</dt>
                    <dd>{member.telephone || "-"}</dd>
                    <dt>홈페이지</dt>
                    <dd>{member.homepage || "-"}</dd>
                    <dt>주소</dt>
                    <dd>
                      {[
                        member.postcode ? `(${member.postcode})` : "",
                        member.address1,
                        member.address2,
                        member.address3,
                      ]
                        .filter(Boolean)
                        .join(" ") || "-"}
                    </dd>
                    <dt>수신 동의</dt>
                    <dd>
                      이메일 {member.emailOptIn ? "동의" : "미동의"} · 문자{" "}
                      {member.smsOptIn ? "동의" : "미동의"}
                    </dd>
                    <dt>최근 접속</dt>
                    <dd>{member.lastLoginAt || "-"}</dd>
                    <dt>주문 이력</dt>
                    <dd>
                      {member.orderCount.toLocaleString("ko-KR")}건 ·{" "}
                      {member.lifetimeValue.toLocaleString("ko-KR")}원
                    </dd>
                    <dt>비밀번호</dt>
                    <dd>보안상 표시하지 않음 · 수정 화면에서 초기화 가능</dd>
                    <dt>관리자 메모</dt>
                    <dd>{member.adminMemo || "-"}</dd>
                  </dl>
                </section>

                {dialogMode === "edit" ? (
                  <form
                    id="admin-member-operation-form"
                    className={dialogStyles.section}
                    onSubmit={saveMember}
                  >
                    <h3 className={dialogStyles.sectionTitle}>운영 정보 수정</h3>
                    <div className={dialogStyles.formGrid}>
                      {profileFields}
                      <label className={dialogStyles.field}>
                        <span className={dialogStyles.label}>
                          회원 등급 (1~10)
                        </span>
                        <AdminInput
                          type="number"
                          min={1}
                          max={10}
                          step={1}
                          value={level}
                          onChange={(event) =>
                            setLevel(event.currentTarget.value)
                          }
                          disabled={saving}
                          required
                        />
                      </label>
                      <label className={dialogStyles.field}>
                        <span className={dialogStyles.label}>보유 포인트</span>
                        <AdminInput
                          type="number"
                          min={0}
                          max={MAX_POINTS}
                          step={1}
                          value={points}
                          onChange={(event) =>
                            setPoints(event.currentTarget.value)
                          }
                          disabled={saving}
                          required
                        />
                      </label>
                      <label
                        className={`${dialogStyles.field} ${dialogStyles.fieldFull}`}
                      >
                        <span className={dialogStyles.label}>계정 상태</span>
                        <AdminSelect
                          value={active ? "active" : "inactive"}
                          onChange={(event) =>
                            setActive(event.currentTarget.value === "active")
                          }
                          disabled={saving}
                        >
                          <option value="active">정상</option>
                          <option value="inactive">이용 중지</option>
                        </AdminSelect>
                      </label>
                      <label className={dialogStyles.field}>
                        <span className={dialogStyles.label}>
                          새 비밀번호 (선택)
                        </span>
                        <AdminInput
                          type="password"
                          name="newPassword"
                          minLength={8}
                          maxLength={128}
                          autoComplete="new-password"
                          disabled={saving}
                          placeholder="변경할 때만 8~128자 입력"
                        />
                      </label>
                      <label className={dialogStyles.field}>
                        <span className={dialogStyles.label}>
                          관리자 비밀번호 재확인
                        </span>
                        <AdminInput
                          type="password"
                          name="adminPassword"
                          maxLength={1_024}
                          autoComplete="current-password"
                          disabled={saving}
                          placeholder="비밀번호 초기화 시 필수"
                        />
                      </label>
                    </div>
                    <p className={dialogStyles.help}>
                      이용 중지 상태에서는 새 로그인이 차단됩니다. 개인정보와
                      주문 기록은 삭제되지 않습니다. 새 비밀번호를 입력하면
                      관리자 재인증 후 회원의 기존 로그인 세션이 모두
                      해제됩니다.
                    </p>
                  </form>
                ) : null}
              </>
            ) : null}
          </>
        )}
      </OperationDialog>
      <ToastRegion toasts={toasts} onDismiss={dismissToast} />
    </>
  );
}

interface LegacyBooleanFieldProps {
  name: string;
  value: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}

function LegacyBooleanField({
  name,
  value,
  disabled,
  onChange,
}: LegacyBooleanFieldProps) {
  return (
    <span className="legacy-member-radio-line">
      <label>
        <input
          type="radio"
          name={name}
          checked={value}
          onChange={() => onChange(true)}
          disabled={disabled}
        />{" "}
        예
      </label>
      <label>
        <input
          type="radio"
          name={name}
          checked={!value}
          onChange={() => onChange(false)}
          disabled={disabled}
        />{" "}
        아니오
      </label>
    </span>
  );
}

function memberListRecord(member: AdminMemberDetail): LegacyMemberRecord {
  return {
    id: member.id,
    joinedAt: member.joinedAt,
    loginId: member.loginId,
    name: member.name,
    nameDisplay: member.name,
    nickname: member.nickname,
    email: member.email,
    phone: member.phone,
    telephone: member.telephone,
    emailOptIn: member.emailOptIn,
    smsOptIn: member.smsOptIn,
    emailVerified: member.emailVerified,
    identityMethod: member.identityMethod,
    identityVerified: member.identityVerified,
    adultVerified: member.adultVerified,
    publicProfile: member.publicProfile,
    active: member.active,
    level: member.level,
    contactDisplay: `${member.email}${member.phone ? ` · ${member.phone}` : ""}`,
    levelLabel: `레벨 ${member.level}`,
    points: member.points,
    statusCode: member.active ? "active" : "inactive",
    statusLabel: member.active ? "정상" : "중지",
    statusTone: member.active ? "success" : "danger",
    lastLoginAt: member.lastLoginAt ?? undefined,
  };
}

function adminMemberListRecord(member: AdminMemberRow): LegacyMemberRecord {
  return {
    id: member.id,
    joinedAt: member.joinedAt,
    loginId: member.loginId,
    name: member.name,
    nameDisplay: member.name,
    nickname: member.nickname,
    email: member.email,
    phone: member.phone,
    telephone: member.telephone,
    emailOptIn: member.emailOptIn,
    smsOptIn: member.smsOptIn,
    emailVerified: member.emailVerified,
    identityMethod: member.identityMethod,
    identityVerified: member.identityVerified,
    adultVerified: member.adultVerified,
    publicProfile: member.publicProfile,
    active: member.active,
    level: member.level,
    contactDisplay: `${member.email}${member.phone ? ` · ${member.phone}` : ""}`,
    levelLabel: `레벨 ${member.level}`,
    points: member.points,
    statusCode: member.active ? "active" : "inactive",
    statusLabel: member.active ? "정상" : "중지",
    statusTone: member.active ? "success" : "danger",
    lastLoginAt: member.lastLoginAt ?? undefined,
  };
}

function formatLegacyMemberDate(value: string | null | undefined): string {
  if (!value) return "-";
  const normalized = value.trim().replace("T", " ");
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})/u);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : normalized;
}

function todayDateInput(): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(new Date());
}

async function readMemberListResponse(
  response: Response,
): Promise<MemberListApiResponse> {
  try {
    return (await response.json()) as MemberListApiResponse;
  } catch {
    return {};
  }
}

async function readMemberResponse(
  response: Response,
): Promise<MemberApiResponse> {
  try {
    return (await response.json()) as MemberApiResponse;
  } catch {
    return {};
  }
}

async function readMemberGroupsResponse(
  response: Response,
): Promise<MemberGroupsApiResponse> {
  try {
    return (await response.json()) as MemberGroupsApiResponse;
  } catch {
    return {};
  }
}

async function readMemberWalletResponse(
  response: Response,
): Promise<MemberWalletApiResponse> {
  try {
    return (await response.json()) as MemberWalletApiResponse;
  } catch {
    return {};
  }
}

async function readMemberOrdersResponse(
  response: Response,
): Promise<MemberOrdersApiResponse> {
  try {
    return (await response.json()) as MemberOrdersApiResponse;
  } catch {
    return {};
  }
}

function memberOrderDraft(item: AdminMemberOrderItem): MemberOrderDraft {
  return {
    productId: item.productId,
    purchasedAt: walletDateTimeInput(item.purchasedAt),
  };
}

function memberOrderStatusLabel(status: AdminMemberOrderItem["status"]): string {
  const labels: Record<AdminMemberOrderItem["status"], string> = {
    ordered: "주문",
    payment_confirmed: "입금확인",
    preparing: "상품준비",
    shipped: "배송",
    delivered: "완료",
    cancelled: "취소",
    refunded: "환불",
  };
  return labels[status];
}

function walletRequestKey(request: WalletRequest): string {
  return `${request.kind}:${request.id}`;
}

function walletDraftFromRequest(request: WalletRequest): MemberWalletDraft {
  return {
    id: request.id,
    amount: String(request.amount),
    status: request.status,
    depositorName: request.depositorName,
    bankName: request.bankName,
    accountNumber: request.accountNumber,
    accountHolder: request.accountHolder,
    adminMemo: request.adminMemo,
    createdAt: walletDateTimeInput(request.createdAt),
  };
}

function walletDate(value: string): Date | null {
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/u.test(value)
    ? `${value.replace(" ", "T")}Z`
    : value;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function walletDateTimeInput(value: string): string {
  const date = walletDate(value);
  if (!date) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}:${part("second")}`;
}

function walletLocalDateTimeToIso(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/u.test(value)) {
    return null;
  }
  const date = new Date(`${value}+09:00`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function formatWalletAdminDate(value: string): string {
  const date = walletDate(value);
  return date
    ? date.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })
    : value;
}

function walletStatusLabel(status: WalletRequestStatus): string {
  return status === "requested"
    ? "처리대기"
    : status === "approved"
      ? "승인"
      : "반려";
}

function firstApiError(result: MemberApiResponse): string | undefined {
  return result.message ?? Object.values(result.fieldErrors ?? {})[0];
}

function clearPasswordInputs(
  newPasswordInput: HTMLInputElement | null,
  adminPasswordInput: HTMLInputElement | null,
): void {
  if (newPasswordInput) newPasswordInput.value = "";
  if (adminPasswordInput) adminPasswordInput.value = "";
}

function redirectToAdminLogin(): void {
  const next = `${window.location.pathname}${window.location.search}`;
  window.location.assign(`/adm/login?next=${encodeURIComponent(next)}`);
}
