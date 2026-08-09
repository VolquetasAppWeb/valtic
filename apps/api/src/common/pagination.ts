import type { PaginatedResponse, PaginationMeta } from "@valtic/types";

export function buildPaginationMeta(page: number, pageSize: number, totalItems: number): PaginationMeta {
  return {
    page,
    pageSize,
    totalItems,
    totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
  };
}

export function toPaginatedResponse<T>(data: T[], page: number, pageSize: number, totalItems: number): PaginatedResponse<T> {
  return { data, meta: buildPaginationMeta(page, pageSize, totalItems) };
}
