"use client";

import { useEffect, useState } from "react";

type UsePaginationOptions = {
  pageSize?: number;
  resetKeys?: readonly unknown[];
};

export function usePagination<T>(
  items: T[],
  { pageSize = 15, resetKeys = [] }: UsePaginationOptions = {},
) {
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setCurrentPage(1);
  }, resetKeys);

  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const paginatedItems = items.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  const rangeStart = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const rangeEnd = Math.min(currentPage * pageSize, totalItems);

  return {
    currentPage,
    setCurrentPage,
    totalItems,
    totalPages,
    pageSize,
    paginatedItems,
    rangeStart,
    rangeEnd,
  };
}
