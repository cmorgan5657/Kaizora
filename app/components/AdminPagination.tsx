"use client";

import { CaretLeft, CaretRight } from "phosphor-react";

type AdminPaginationProps = {
  currentPage: number;
  totalItems: number;
  totalPages: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  itemLabel?: string;
  className?: string;
};

function getPageNumbers(currentPage: number, totalPages: number) {
  const pages: (number | string)[] = [];

  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
    return pages;
  }

  pages.push(1);
  if (currentPage > 3) pages.push("...");

  for (
    let i = Math.max(2, currentPage - 1);
    i <= Math.min(totalPages - 1, currentPage + 1);
    i++
  ) {
    pages.push(i);
  }

  if (currentPage < totalPages - 2) pages.push("...");
  pages.push(totalPages);

  return pages;
}

export default function AdminPagination({
  currentPage,
  totalItems,
  totalPages,
  pageSize,
  onPageChange,
  itemLabel = "results",
  className = "",
}: AdminPaginationProps) {
  const safeTotalPages = Math.max(1, totalPages);
  const rangeStart = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const rangeEnd = Math.min(currentPage * pageSize, totalItems);

  return (
    <div className={className}>
      <p className="text-xs text-gray-500 mb-3">
        Showing {rangeStart}–{rangeEnd} of {totalItems} {itemLabel}
      </p>

      <div className="flex items-center justify-between mt-4">
        <p className="text-xs text-gray-500">
          Page {Math.min(currentPage, safeTotalPages)} of {safeTotalPages}
        </p>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onPageChange(1)}
            disabled={currentPage === 1}
            className="px-2 py-1 text-xs text-gray-400 hover:text-white border border-white/10 hover:bg-white/5 transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
          >
            First
          </button>
          <button
            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            className="p-1 text-gray-400 hover:text-white border border-white/10 hover:bg-white/5 transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <CaretLeft size={14} />
          </button>

          {getPageNumbers(Math.min(currentPage, safeTotalPages), safeTotalPages).map((page, i) =>
            typeof page === "string" ? (
              <span key={`dot-${i}`} className="px-1 text-xs text-gray-600">
                ...
              </span>
            ) : (
              <button
                key={page}
                onClick={() => onPageChange(page)}
                className={`px-2.5 py-1 text-xs border transition-all cursor-pointer ${
                  currentPage === page
                    ? "bg-red-500/20 border-red-500/30 text-red-400"
                    : "border-white/10 text-gray-400 hover:bg-white/5 hover:text-white"
                }`}
              >
                {page}
              </button>
            ),
          )}

          <button
            onClick={() => onPageChange(Math.min(safeTotalPages, currentPage + 1))}
            disabled={currentPage === safeTotalPages}
            className="p-1 text-gray-400 hover:text-white border border-white/10 hover:bg-white/5 transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <CaretRight size={14} />
          </button>
          <button
            onClick={() => onPageChange(safeTotalPages)}
            disabled={currentPage === safeTotalPages}
            className="px-2 py-1 text-xs text-gray-400 hover:text-white border border-white/10 hover:bg-white/5 transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Last
          </button>
        </div>
      </div>
    </div>
  );
}
