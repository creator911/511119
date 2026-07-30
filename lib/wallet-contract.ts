export type WalletRequestKind = "charge" | "withdrawal";
export type WalletRequestStatus = "requested" | "approved" | "rejected";
export type WalletDecision = "approve" | "reject";

export const MIN_WALLET_REQUEST_AMOUNT = 1_000;
export const MAX_WALLET_REQUEST_AMOUNT = 100_000_000;

export interface WalletRequest {
  id: string;
  kind: WalletRequestKind;
  userId: string;
  loginId: string;
  memberName: string;
  memberNickname: string;
  memberPhone: string;
  memberPoints: number;
  amount: number;
  status: WalletRequestStatus;
  depositorName: string;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  adminMemo: string;
  createdAt: string;
  updatedAt: string;
}

export interface MemberWalletRequest {
  id: string;
  kind: WalletRequestKind;
  amount: number;
  status: WalletRequestStatus;
  summary: string;
  adminMemo: string;
  createdAt: string;
  updatedAt: string;
}
