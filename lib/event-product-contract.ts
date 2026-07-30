export type EventProductSearchField = "name" | "id";
export type EventProductSort = "id" | "name";
export type EventProductSortDirection = "asc" | "desc";

export interface EventProductListFilters {
  eventId: string;
  categoryId: string;
  searchField: EventProductSearchField;
  query: string;
  sortBy: EventProductSort;
  sortDirection: EventProductSortDirection;
}

export interface EventProductListRow {
  id: string;
  categoryId: string;
  name: string;
  image: string;
  assigned: boolean;
}

export interface EventProductCategory {
  id: string;
  label: string;
}

export interface EventProductListResult {
  products: EventProductListRow[];
  categories: EventProductCategory[];
  filters: EventProductListFilters;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}
