export interface ManagedCategory {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
  active: boolean;
  manager?: string;
  identityRequired?: boolean;
  adultOnly?: boolean;
  imageWidth?: number;
  imageHeight?: number;
  desktopColumns?: number;
  desktopRows?: number;
  mobileColumns?: number;
  mobileRows?: number;
  skinDirectory?: string;
  skin?: string;
  mobileSkinDirectory?: string;
  mobileSkin?: string;
}

export type CategoryChangeType = "override" | "created" | "deleted";
export type CategoryRecordSource = "static" | CategoryChangeType;

export interface CategoryRecord {
  category: ManagedCategory;
  source: CategoryRecordSource;
  deleted: boolean;
  revision: number;
  updatedBy: string;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface AdminCategoryRecord extends CategoryRecord {
  productCount: number;
  childCount: number;
}

export interface CategoryNavigationItem {
  id: string;
  label: string;
  href: string;
  children?: CategoryNavigationItem[];
}
