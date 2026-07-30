"use client";

import { type ReactNode, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  AdminShell,
  KIEL_ADMIN_NAVIGATION,
} from "@/app/components/admin";

interface AdminFrameProps {
  children: ReactNode;
}

interface AdminRouteMeta {
  active: string;
  title: string;
  description: string;
  breadcrumb: string[];
}

const DEFAULT_META: AdminRouteMeta = {
  active: "",
  title: "관리자메인",
  description: "",
  breadcrumb: [],
};

const LEGACY_TOOL_PAGE_TITLE_BY_HREF: Readonly<Record<string, string>> = {
  "/adm/tools/sms-member-sync": "회원정보 업데이트",
  "/adm/tools/sms-history-message": "문자전송 내역",
  "/adm/tools/sms-history-number": "문자전송 내역 (번호별)",
};

function getToolMeta(pathname: string): AdminRouteMeta | null {
  const prefix = "/adm/tools/";
  if (!pathname.startsWith(prefix)) return null;

  const href = `${prefix}${pathname.slice(prefix.length).split("/")[0]}`;
  for (const group of KIEL_ADMIN_NAVIGATION) {
    const item = group.items.find((candidate) => candidate.href === href);
    if (item) {
      return {
        active: item.id,
        title: LEGACY_TOOL_PAGE_TITLE_BY_HREF[href] ?? item.label,
        description: `${item.label} 기능을 관리합니다.`,
        breadcrumb: [group.label, item.label],
      };
    }
  }

  return {
    active: "",
    title: "관리 도구",
    description: "관리 도구를 실행합니다.",
    breadcrumb: ["관리 도구"],
  };
}

function getRouteMeta(
  pathname: string,
  selectedView: string | null,
  selectedKind: string | null,
  selectedPrint: string | null,
): AdminRouteMeta {
  const toolMeta = getToolMeta(pathname);
  if (toolMeta) return toolMeta;

  if (pathname === "/adm") return DEFAULT_META;

  if (pathname === "/adm/shop-overview") {
    return {
      active: "item-400-shop-overview",
      title: "쇼핑몰현황",
      description: "",
      breadcrumb: ["쇼핑몰관리", "쇼핑몰현황"],
    };
  }

  if (pathname === "/adm/products/new") {
    return {
      active: "item-400-products",
      title: "상품 등록",
      description: "신규 상품 정보를 등록합니다.",
      breadcrumb: ["쇼핑몰관리", "상품관리", "상품 등록"],
    };
  }

  if (pathname.startsWith("/adm/products/")) {
    return {
      active: "item-400-products",
      title: "상품 수정",
      description: "상품 정보와 판매 상태를 수정합니다.",
      breadcrumb: ["쇼핑몰관리", "상품관리", "상품 수정"],
    };
  }

  if (pathname.startsWith("/adm/products")) {
    if (selectedView === "stock") {
      return {
        active: "item-400-product-stock",
        title: "상품재고관리",
        description: "상품별 현재 재고를 확인하고 수정합니다.",
        breadcrumb: ["쇼핑몰관리", "상품재고관리"],
      };
    }
    return {
      active: "item-400-products",
      title: "상품관리",
      description: "상품 정보와 판매 상태를 관리합니다.",
      breadcrumb: ["쇼핑몰관리", "상품관리"],
    };
  }

  if (pathname.startsWith("/adm/categories")) {
    return {
      active: "item-400-categories",
      title: "분류관리",
      description: "상품 분류와 노출 순서를 관리합니다.",
      breadcrumb: ["쇼핑몰관리", "분류관리"],
    };
  }

  if (pathname.startsWith("/adm/banners")) {
    return {
      active: "item-500-banners",
      title: "배너관리",
      description: "쇼핑몰 배너와 노출 순서를 관리합니다.",
      breadcrumb: ["쇼핑몰현황/기타", "배너관리"],
    };
  }

  if (pathname.startsWith("/adm/orders")) {
    if (selectedPrint === "1") {
      return {
        active: "item-500-order-print",
        title: "주문내역출력",
        description: "기간 또는 주문번호 구간별 주문내역을 출력합니다.",
        breadcrumb: ["쇼핑몰현황/기타", "주문내역출력"],
      };
    }
    return {
      active: "item-400-orders",
      title: "주문내역",
      description: "쇼핑몰에서 접수된 주문을 관리합니다.",
      breadcrumb: ["쇼핑몰관리", "주문내역"],
    };
  }

  if (pathname.startsWith("/adm/wallet")) {
    if (selectedKind === "withdrawal") {
      return {
        active: "item-200-exchange-requests",
        title: "환전신청",
        description: "회원 환전 신청을 관리합니다.",
        breadcrumb: ["회원관리", "환전신청"],
      };
    }

    return {
      active: "item-200-charge-requests",
      title: "충전신청",
      description: "회원 충전 신청을 관리합니다.",
      breadcrumb: ["회원관리", "충전신청"],
    };
  }

  if (pathname.startsWith("/adm/reports")) {
    if (selectedView === "points") {
      return {
        active: "item-200-points",
        title: "포인트관리",
        description: "회원 포인트 내역을 관리합니다.",
        breadcrumb: ["회원관리", "포인트관리"],
      };
    }

    if (selectedView === "ranking") {
      return {
        active: "item-500-product-ranking",
        title: "상품판매순위",
        description: "상품별 판매 순위를 확인합니다.",
        breadcrumb: ["쇼핑몰현황/기타", "상품판매순위"],
      };
    }

    if (selectedView === "incomplete") {
      return {
        active: "item-400-incomplete-orders",
        title: "미완료주문",
        description: "결제가 완료되지 않은 주문을 확인합니다.",
        breadcrumb: ["쇼핑몰관리", "미완료주문"],
      };
    }

    return {
      active: "item-500-sales",
      title: "매출현황",
      description: "기간별 쇼핑몰 매출 현황을 확인합니다.",
      breadcrumb: ["쇼핑몰현황/기타", "매출현황"],
    };
  }

  if (pathname.startsWith("/adm/users")) {
    return {
      active: "item-200-members",
      title: "회원관리",
      description: "가입 회원 정보를 관리합니다.",
      breadcrumb: ["회원관리", "회원관리"],
    };
  }

  if (pathname.startsWith("/adm/settings")) {
    if (selectedView === "permissions") {
      return {
        active: "item-100-admin-permissions",
        title: "관리권한설정",
        description: "관리자 권한을 설정합니다.",
        breadcrumb: ["환경설정", "관리권한설정"],
      };
    }

    if (selectedView === "shop") {
      return {
        active: "item-400-shop-settings",
        title: "쇼핑몰설정",
        description: "쇼핑몰 운영 설정을 관리합니다.",
        breadcrumb: ["쇼핑몰관리", "쇼핑몰설정"],
      };
    }

    return {
      active: "item-100-basic-settings",
      title: "환경설정",
      description: "사이트 기본 운영 정보를 설정합니다.",
      breadcrumb: ["환경설정", "기본환경설정"],
    };
  }

  if (pathname.startsWith("/adm/content")) {
    if (selectedView === "inquiries") {
      return {
        active: "item-400-product-inquiries",
        title: "상품문의",
        description: "상품 문의를 관리합니다.",
        breadcrumb: ["쇼핑몰관리", "상품문의"],
      };
    }

    if (selectedView === "reviews") {
      return {
        active: "item-400-reviews",
        title: "사용후기",
        description: "상품 사용후기를 관리합니다.",
        breadcrumb: ["쇼핑몰관리", "사용후기"],
      };
    }

    return {
      active: "item-300-content",
      title: selectedView === "faq" ? "FAQ관리" : "내용관리",
      description: "사이트에 표시되는 내용을 관리합니다.",
      breadcrumb: [
        "게시판관리",
        selectedView === "faq" ? "FAQ관리" : "내용관리",
      ],
    };
  }

  if (pathname.startsWith("/adm/community")) {
    if (selectedView === "boards") {
      return {
        active: "item-300-boards",
        title: "게시판관리",
        description: "게시판 설정을 관리합니다.",
        breadcrumb: ["게시판관리", "게시판관리"],
      };
    }

    if (selectedView === "posts" || selectedView === "comments") {
      return {
        active: "item-300-post-comment-status",
        title: "글,댓글 현황",
        description: "게시글과 댓글 현황을 관리합니다.",
        breadcrumb: ["게시판관리", "글,댓글 현황"],
      };
    }

    if (
      selectedView === "inquiries" ||
      selectedView === "inquiry-settings"
    ) {
      return {
        active: "item-300-inquiry-settings",
        title: "1:1문의설정",
        description: "1:1 문의 설정과 문의 내역을 관리합니다.",
        breadcrumb: ["게시판관리", "1:1문의설정"],
      };
    }

    return {
      active: "item-300-board-groups",
      title: "게시판그룹관리",
      description: "게시판 그룹을 관리합니다.",
      breadcrumb: ["게시판관리", "게시판그룹관리"],
    };
  }

  return DEFAULT_META;
}

export function AdminFrame({ children }: AdminFrameProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const meta = getRouteMeta(
    pathname,
    searchParams.get("view"),
    searchParams.get("kind"),
    searchParams.get("print"),
  );

  if (pathname === "/adm/tools/phpinfo") {
    return <>{children}</>;
  }

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await fetch("/api/admin/session", { method: "DELETE" });
    } finally {
      router.replace("/adm/login");
      router.refresh();
    }
  }

  return (
    <AdminShell
      activeNavId={meta.active}
      pageTitle={meta.title}
      pageDescription={meta.description}
      breadcrumb={meta.breadcrumb}
      userName="관리자"
      onLogout={handleLogout}
    >
      {children}
    </AdminShell>
  );
}
