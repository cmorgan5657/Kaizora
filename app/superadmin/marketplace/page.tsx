"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import AssetsTableSkeleton from "../../components/AssetsTableSkeleton";



import {
  MagnifyingGlass,
  Download,
  Image,
  FileText,
  Link as LinkIcon,
  CaretLeft,
  CaretRight,
} from "phosphor-react";

type Asset = {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  content_type: string;
  storage_path: string;
  thumbnail_path: string | null;
  created_at: string;
  updated_at: string;
  is_public: boolean;
  price_cents: number | null;
  featured: boolean;
  purchases_count: number;
  agent_mode: string | null;
  last_agent_action: string | null;
  last_agent_run_at: string | null;
  manual_override_until: string | null;
};

type AssetMetadata = {
  asset_id: string;
  file_size: number | null;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
  word_count: number | null;
  language: string | null;
  programming_language: string | null;
};

type RemixRelation = {
  id: string;
  original_asset_id: string;
  derived_asset_id: string;
  created_at: string;
};

const PAGE_SIZE = 15;

function SkeletonRow() {
  return (
    <div className="flex gap-4 p-4 border-b border-white/10 animate-pulse">
      <div className="w-12 h-12 bg-white/10 rounded" />
      <div className="flex-1 space-y-2">
        <div className="h-4 bg-white/10 rounded w-1/3" />
        <div className="h-3 bg-white/10 rounded w-1/2" />
      </div>
      <div className="w-20 h-4 bg-white/10 rounded" />
    </div>
  );
}


export default function MarketplacePage() {
  const [activeTab, setActiveTab] = useState<
    "assets" | "metadata" | "remix"
  >("assets");

  // Assets
  const [assets, setAssets] = useState<Asset[]>([]);
  const [filteredAssets, setFilteredAssets] = useState<Asset[]>([]);
  const [assetsSearch, setAssetsSearch] = useState("");

  // Asset Metadata
  const [metadata, setMetadata] = useState<AssetMetadata[]>([]);
  const [filteredMetadata, setFilteredMetadata] = useState<AssetMetadata[]>([]);
  const [metadataSearch, setMetadataSearch] = useState("");

  // Remix Relations
  const [remixRelations, setRemixRelations] = useState<RemixRelation[]>([]);
  const [filteredRemixRelations, setFilteredRemixRelations] = useState<
    RemixRelation[]
  >([]);
  const [remixSearch, setRemixSearch] = useState("");
  const [currentPageByTab, setCurrentPageByTab] = useState({
    assets: 1,
    metadata: 1,
    remix: 1,
  });

  const [loading, setLoading] = useState(true);

  const currentPage = currentPageByTab[activeTab];
  const currentData =
    activeTab === "assets"
      ? filteredAssets
      : activeTab === "metadata"
        ? filteredMetadata
        : filteredRemixRelations;
  const totalPages = Math.ceil(currentData.length / PAGE_SIZE);
  const paginatedData = currentData.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  // Load all data
  useEffect(() => {
    const loadData = async () => {
      const [assetsRes, metadataRes, remixRes] = await Promise.all([
        supabase
          .from("assets")
          .select("*")
          .order("created_at", { ascending: false }),
        supabase.from("asset_metadata").select("*"),
        supabase
          .from("remix_relations")
          .select("*")
          .order("created_at", { ascending: false }),
      ]);

      if (assetsRes.data) {
        setAssets(assetsRes.data);
        setFilteredAssets(assetsRes.data);
      }
      if (metadataRes.data) {
        setMetadata(metadataRes.data);
        setFilteredMetadata(metadataRes.data);
      }
      if (remixRes.data) {
        setRemixRelations(remixRes.data);
        setFilteredRemixRelations(remixRes.data);
      }

      setLoading(false);
    };

    loadData();
  }, []);

  // Search filters
  useEffect(() => {
    if (!assetsSearch) {
      setFilteredAssets(assets);
    } else {
      setFilteredAssets(
        assets.filter(
          (a) =>
            a.title.toLowerCase().includes(assetsSearch.toLowerCase()) ||
            a.description?.toLowerCase().includes(assetsSearch.toLowerCase()) ||
            a.content_type.toLowerCase().includes(assetsSearch.toLowerCase())
        )
      );
    }
    setCurrentPageByTab((pages) => ({ ...pages, assets: 1 }));
  }, [assetsSearch, assets]);

  useEffect(() => {
    if (!metadataSearch) {
      setFilteredMetadata(metadata);
    } else {
      setFilteredMetadata(
        metadata.filter((m) =>
          m.asset_id.toLowerCase().includes(metadataSearch.toLowerCase())
        )
      );
    }
    setCurrentPageByTab((pages) => ({ ...pages, metadata: 1 }));
  }, [metadataSearch, metadata]);

  useEffect(() => {
    if (!remixSearch) {
      setFilteredRemixRelations(remixRelations);
    } else {
      setFilteredRemixRelations(
        remixRelations.filter(
          (r) =>
            r.original_asset_id
              .toLowerCase()
              .includes(remixSearch.toLowerCase()) ||
            r.derived_asset_id.toLowerCase().includes(remixSearch.toLowerCase())
        )
      );
    }
    setCurrentPageByTab((pages) => ({ ...pages, remix: 1 }));
  }, [remixSearch, remixRelations]);

  // Export functions
  const exportAssetsCSV = () => {
    const headers = [
      "ID",
      "Owner ID",
      "Title",
      "Description",
      "Content Type",
      "Storage Path",
      "Thumbnail Path",
      "Created At",
      "Updated At",
      "Is Public",
      "Price Cents",
      "Featured",
      "Purchases Count",
      "Agent Mode",
      "Last Agent Action",
      "Last Agent Run At",
      "Manual Override Until",
    ];

    const rows = filteredAssets.map((a) => [
      a.id,
      a.owner_id,
      a.title,
      a.description || "",
      a.content_type,
      a.storage_path,
      a.thumbnail_path || "",
      a.created_at,
      a.updated_at,
      a.is_public,
      a.price_cents || "",
      a.featured,
      a.purchases_count,
      a.agent_mode || "",
      a.last_agent_action || "",
      a.last_agent_run_at || "",
      a.manual_override_until || "",
    ]);

    downloadCSV("assets", headers, rows);
  };

  const exportMetadataCSV = () => {
    const headers = [
      "Asset ID",
      "File Size",
      "Width",
      "Height",
      "Duration Seconds",
      "Word Count",
      "Language",
      "Programming Language",
    ];
    const rows = filteredMetadata.map((m) => [
      m.asset_id,
      m.file_size || "",
      m.width || "",
      m.height || "",
      m.duration_seconds || "",
      m.word_count || "",
      m.language || "",
      m.programming_language || "",
    ]);
    downloadCSV("asset_metadata", headers, rows);
  };

  const exportRemixCSV = () => {
    const headers = [
      "ID",
      "Original Asset ID",
      "Derived Asset ID",
      "Created At",
    ];
    const rows = filteredRemixRelations.map((r) => [
      r.id,
      r.original_asset_id,
      r.derived_asset_id,
      r.created_at,
    ]);
    downloadCSV("remix_relations", headers, rows);
  };

  const downloadCSV = (filename: string, headers: string[], rows: any[][]) => {
    const csvContent = [
      headers.join(","),
      ...rows.map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
  };

  const setCurrentPage = (page: number) => {
    setCurrentPageByTab((pages) => ({
      ...pages,
      [activeTab]: page,
    }));
  };

  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
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
    }
    return pages;
  };

  const renderPagination = () => {
    if (currentData.length === 0) {
      return null;
    }

    return (
      <>
        <p className="text-xs text-gray-500 mb-3">
          Showing {(currentPage - 1) * PAGE_SIZE + 1}–
          {Math.min(currentPage * PAGE_SIZE, currentData.length)} of{" "}
          {currentData.length} results
        </p>

        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <p className="text-xs text-gray-500">
              Page {currentPage} of {totalPages}
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className="px-2 py-1 text-xs text-gray-400 hover:text-white border border-white/10 hover:bg-white/5 transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
              >
                First
              </button>
              <button
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="p-1 text-gray-400 hover:text-white border border-white/10 hover:bg-white/5 transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <CaretLeft size={14} />
              </button>

              {getPageNumbers().map((page, i) =>
                typeof page === "string" ? (
                  <span key={`dot-${i}`} className="px-1 text-xs text-gray-600">
                    ...
                  </span>
                ) : (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={`px-2.5 py-1 text-xs border transition-all cursor-pointer ${
                      currentPage === page
                        ? "bg-red-500/20 border-red-500/30 text-red-400"
                        : "border-white/10 text-gray-400 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    {page}
                  </button>
                )
              )}

              <button
                onClick={() =>
                  setCurrentPage(Math.min(totalPages, currentPage + 1))
                }
                disabled={currentPage === totalPages}
                className="p-1 text-gray-400 hover:text-white border border-white/10 hover:bg-white/5 transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <CaretRight size={14} />
              </button>
              <button
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
                className="px-2 py-1 text-xs text-gray-400 hover:text-white border border-white/10 hover:bg-white/5 transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Last
              </button>
            </div>
          </div>
        )}
      </>
    );
  };

  // if (loading) {
  //   return (
  //     <div className="flex items-center justify-center min-h-[calc(100vh-6rem)]">
  //       <p className="text-sm text-gray-400">Loading marketplace data...</p>
  //     </div>
  //   );
  // }

  if (loading) {
  return (
    <div>
      <h1 className="text-2xl font-light mb-6">Marketplace</h1>

      <div className="border border-white/10 rounded-lg overflow-hidden">
        {[1, 2, 3, 4, 5].map((i) => (
          // <SkeletonRow key={i} />
          <AssetsTableSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}


  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-light mb-1">Marketplace</h1>
        <p className="text-sm text-gray-400">
          {assets.length} assets · {metadata.length} metadata records
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-white/10">
        <button
          onClick={() => setActiveTab("assets")}
          className={`flex items-center gap-2 px-4 py-2 border-b-2 transition-all ${
            activeTab === "assets"
              ? "border-white text-white"
              : "border-transparent text-gray-400 hover:text-white"
          }`}
        >
          <Image size={18} weight="duotone" />
          Assets ({assets.length})
        </button>

        <button
          onClick={() => setActiveTab("metadata")}
          className={`flex items-center gap-2 px-4 py-2 border-b-2 transition-all ${
            activeTab === "metadata"
              ? "border-white text-white"
              : "border-transparent text-gray-400 hover:text-white"
          }`}
        >
          <FileText size={18} weight="duotone" />
          Metadata ({metadata.length})
        </button>

        <button
          onClick={() => setActiveTab("remix")}
          className={`flex items-center gap-2 px-4 py-2 border-b-2 transition-all ${
            activeTab === "remix"
              ? "border-white text-white"
              : "border-transparent text-gray-400 hover:text-white"
          }`}
        >
          <LinkIcon size={18} weight="duotone" />
          Remix Relations ({remixRelations.length})
        </button>
      </div>

      {/* Assets Tab */}
      {activeTab === "assets" && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="relative flex-1 max-w-md">
              <MagnifyingGlass
                size={20}
                weight="duotone"
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                type="text"
                placeholder="Search assets..."
                value={assetsSearch}
                onChange={(e) => setAssetsSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-md text-sm focus:outline-none focus:border-white/20"
              />
            </div>
            <button
              onClick={exportAssetsCSV}
              className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-md transition-all text-sm"
            >
              <Download size={18} weight="duotone" />
              Export
            </button>
          </div>

          <div className="overflow-x-auto border border-white/10 rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-white/5 sticky top-0">
                <tr className="text-left text-gray-400">
                  <th className="p-3">Thumbnail</th>
                  <th className="p-3">Title</th>
                  <th className="p-3">Type</th>
                  <th className="p-3">Price</th>
                  <th className="p-3">Featured</th>
                  <th className="p-3">Purchases</th>
                  <th className="p-3">Public</th>
                  <th className="p-3">Agent Mode</th>
                  <th className="p-3">Last Action</th>
                  <th className="p-3">Created</th>
                  <th className="p-3">ID</th>
                </tr>
              </thead>
              <tbody>
                {filteredAssets.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="p-8 text-center text-gray-500">
                      No assets found
                    </td>
                  </tr>
                ) : (
                  (paginatedData as Asset[]).map((asset) => (
                    <tr
                      key={asset.id}
                      className="border-t border-white/10 hover:bg-white/5"
                    >
                      <td className="p-3">
                        {asset.thumbnail_path || asset.storage_path ? (
                          <img
                            src={`${
                              process.env.NEXT_PUBLIC_SUPABASE_URL
                            }/storage/v1/object/public/assets/${
                              asset.thumbnail_path || asset.storage_path
                            }`}
                            alt={asset.title}
                            className="w-12 h-12 object-cover rounded"
                            onError={(e) => {
                              e.currentTarget.style.display = "none";
                            }}
                          />
                        ) : (
                          <div className="w-12 h-12 bg-white/10 rounded flex items-center justify-center">
                            <Image
                              size={20}
                              weight="duotone"
                              className="text-gray-500"
                            />
                          </div>
                        )}
                      </td>
                      <td className="p-3 max-w-xs">
                        <div className="font-medium">{asset.title}</div>
                        {asset.description && (
                          <div className="text-xs text-gray-500 truncate">
                            {asset.description}
                          </div>
                        )}
                      </td>
                      <td className="p-3 text-xs">
                        <code className="bg-white/5 px-2 py-1 rounded">
                          {asset.content_type}
                        </code>
                      </td>
                      <td className="p-3">
                        {asset.price_cents
                          ? `$${(asset.price_cents / 100).toFixed(2)}`
                          : "—"}
                      </td>
                      <td className="p-3">
                        {asset.featured ? (
                          <span className="px-2 py-1 text-xs rounded bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
                            Featured
                          </span>
                        ) : (
                          <span className="text-gray-500">—</span>
                        )}
                      </td>
                      <td className="p-3">{asset.purchases_count}</td>
                      <td className="p-3">
                        {asset.is_public ? (
                          <span className="text-green-400">Yes</span>
                        ) : (
                          <span className="text-gray-500">No</span>
                        )}
                      </td>
                      <td className="p-3 text-xs">{asset.agent_mode || "—"}</td>
                      <td className="p-3 text-xs">
                        {asset.last_agent_action || "—"}
                      </td>
                      <td className="p-3 text-xs text-gray-500">
                        {new Date(asset.created_at).toLocaleDateString()}
                      </td>
                      <td className="p-3">
                        <code className="text-xs text-gray-500 bg-white/5 px-2 py-1 rounded">
                          {asset.id.slice(0, 8)}...
                        </code>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-4">{renderPagination()}</div>
        </div>
      )}

      {/* Asset Metadata Tab */}
      {activeTab === "metadata" && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="relative flex-1 max-w-md">
              <MagnifyingGlass
                size={20}
                weight="duotone"
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                type="text"
                placeholder="Search by asset ID..."
                value={metadataSearch}
                onChange={(e) => setMetadataSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-md text-sm focus:outline-none focus:border-white/20"
              />
            </div>
            <button
              onClick={exportMetadataCSV}
              className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-md transition-all text-sm"
            >
              <Download size={18} weight="duotone" />
              Export
            </button>
          </div>

          <div className="overflow-x-auto border border-white/10 rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-white/5">
                <tr className="text-left text-gray-400">
                  <th className="p-3">Asset ID</th>
                  <th className="p-3">File Size</th>
                  <th className="p-3">Dimensions</th>
                  <th className="p-3">Duration</th>
                  <th className="p-3">Word Count</th>
                  <th className="p-3">Language</th>
                  <th className="p-3">Programming Language</th>
                </tr>
              </thead>
              <tbody>
                {filteredMetadata.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-gray-500">
                      No metadata found
                    </td>
                  </tr>
                ) : (
                  (paginatedData as AssetMetadata[]).map((meta) => (
                    <tr
                      key={meta.asset_id}
                      className="border-t border-white/10 hover:bg-white/5"
                    >
                      <td className="p-3">
                        <code className="text-xs text-gray-500 bg-white/5 px-2 py-1 rounded">
                          {meta.asset_id.slice(0, 8)}...
                        </code>
                      </td>
                      <td className="p-3">
                        {meta.file_size
                          ? `${(meta.file_size / 1024 / 1024).toFixed(2)} MB`
                          : "—"}
                      </td>
                      <td className="p-3">
                        {meta.width && meta.height
                          ? `${meta.width} × ${meta.height}`
                          : "—"}
                      </td>
                      <td className="p-3">
                        {meta.duration_seconds
                          ? `${Math.floor(meta.duration_seconds / 60)}:${String(
                              meta.duration_seconds % 60
                            ).padStart(2, "0")}`
                          : "—"}
                      </td>
                      <td className="p-3">{meta.word_count || "—"}</td>
                      <td className="p-3">{meta.language || "—"}</td>
                      <td className="p-3">
                        {meta.programming_language ? (
                          <code className="bg-white/5 px-2 py-1 rounded text-xs">
                            {meta.programming_language}
                          </code>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-4">{renderPagination()}</div>
        </div>
      )}

      {/* Remix Relations Tab */}
      {activeTab === "remix" && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="relative flex-1 max-w-md">
              <MagnifyingGlass
                size={20}
                weight="duotone"
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                type="text"
                placeholder="Search by asset ID..."
                value={remixSearch}
                onChange={(e) => setRemixSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-md text-sm focus:outline-none focus:border-white/20"
              />
            </div>
            <button
              onClick={exportRemixCSV}
              className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-md transition-all text-sm"
            >
              <Download size={18} weight="duotone" />
              Export
            </button>
          </div>

          <div className="overflow-x-auto border border-white/10 rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-white/5">
                <tr className="text-left text-gray-400">
                  <th className="p-3">ID</th>
                  <th className="p-3">Original Asset</th>
                  <th className="p-3">Derived Asset</th>
                  <th className="p-3">Created At</th>
                </tr>
              </thead>
              <tbody>
                {filteredRemixRelations.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-gray-500">
                      No remix relations found
                    </td>
                  </tr>
                ) : (
                  (paginatedData as RemixRelation[]).map((remix) => (
                    <tr
                      key={remix.id}
                      className="border-t border-white/10 hover:bg-white/5"
                    >
                      <td className="p-3">
                        <code className="text-xs text-gray-500 bg-white/5 px-2 py-1 rounded">
                          {remix.id.slice(0, 8)}...
                        </code>
                      </td>
                      <td className="p-3">
                        <code className="text-xs text-gray-500 bg-white/5 px-2 py-1 rounded">
                          {remix.original_asset_id.slice(0, 8)}...
                        </code>
                      </td>
                      <td className="p-3">
                        <code className="text-xs text-gray-500 bg-white/5 px-2 py-1 rounded">
                          {remix.derived_asset_id.slice(0, 8)}...
                        </code>
                      </td>
                      <td className="p-3 text-xs text-gray-500">
                        {new Date(remix.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-4">{renderPagination()}</div>
        </div>
      )}
    </div>
  );
}
