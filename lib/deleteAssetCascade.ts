import { supabaseAdmin } from "@/lib/supabaseServer";

type BundleRow = {
  id: string;
  asset_ids: string[] | null;
};

type AssetRow = {
  id: string;
  owner_id: string;
  storage_path: string | null;
  thumbnail_path: string | null;
};

async function deleteByColumn(
  table: string,
  column: string,
  value: string,
) {
  const { error } = await supabaseAdmin.from(table).delete().eq(column, value);
  if (error) throw new Error(`[${table}] ${error.message}`);
}

async function deleteByIds(table: string, ids: string[]) {
  if (ids.length === 0) return;
  const { error } = await supabaseAdmin.from(table).delete().in("id", ids);
  if (error) throw new Error(`[${table}] ${error.message}`);
}

async function isAssetPathStillReferenced(
  assetId: string,
  path: string | null | undefined,
) {
  if (!path) return;

  const [
    { data: storageRefs, error: storageError },
    { data: thumbnailRefs, error: thumbnailError },
  ] = await Promise.all([
    supabaseAdmin
      .from("assets")
      .select("id")
      .eq("storage_path", path)
      .neq("id", assetId)
      .limit(1),
    supabaseAdmin
      .from("assets")
      .select("id")
      .eq("thumbnail_path", path)
      .neq("id", assetId)
      .limit(1),
  ]);

  if (storageError) throw new Error(`[assets] ${storageError.message}`);
  if (thumbnailError) throw new Error(`[assets] ${thumbnailError.message}`);

  return (storageRefs || []).length > 0 || (thumbnailRefs || []).length > 0;
}

async function deleteStorageObjectIfUnused(
  assetId: string,
  path: string | null | undefined,
) {
  if (!path) return;

  const stillReferenced = await isAssetPathStillReferenced(assetId, path);
  if (stillReferenced) return;

  const { error } = await supabaseAdmin.storage.from("assets").remove([path]);
  if (error) throw new Error(`[storage:assets] ${error.message}`);
}

async function deleteThumbnailIfUnused(
  assetId: string,
  path: string | null | undefined,
) {
  if (!path) return;

  const stillReferenced = await isAssetPathStillReferenced(assetId, path);
  if (stillReferenced) return;

  const { error } = await supabaseAdmin.storage.from("assets").remove([path]);
  if (error) throw new Error(`[storage:assets] ${error.message}`);
}

async function reconcileBundles(assetId: string) {
  const { data: bundles, error } = await supabaseAdmin
    .from("bundles")
    .select("id, asset_ids")
    .contains("asset_ids", [assetId]);

  if (error) throw new Error(`[bundles] ${error.message}`);

  for (const bundle of ((bundles || []) as BundleRow[])) {
    const remainingAssetIds = (bundle.asset_ids || []).filter(
      (id) => id !== assetId,
    );

    if (remainingAssetIds.length < 2) {
      await deleteByColumn("bundle_purchases", "bundle_id", bundle.id);
      await deleteByColumn("bundles", "id", bundle.id);
      continue;
    }

    const { data: remainingAssets, error: assetsError } = await supabaseAdmin
      .from("assets")
      .select("id, price_cents, thumbnail_path, storage_path")
      .in("id", remainingAssetIds);

    if (assetsError) throw new Error(`[assets] ${assetsError.message}`);

    const assetsById = new Map(
      (remainingAssets || []).map((row: any) => [row.id, row]),
    );
    const orderedAssets = remainingAssetIds
      .map((assetRowId) => assetsById.get(assetRowId))
      .filter(Boolean);

    const totalPriceCents = orderedAssets.reduce(
      (sum, row: any) => sum + (row.price_cents || 0),
      0,
    );
    const thumbnailUrl =
      orderedAssets[0]?.thumbnail_path || orderedAssets[0]?.storage_path || null;

    const { error: updateError } = await supabaseAdmin
      .from("bundles")
      .update({
        asset_ids: remainingAssetIds,
        total_price_cents: totalPriceCents,
        thumbnail_url: thumbnailUrl,
      })
      .eq("id", bundle.id);

    if (updateError) throw new Error(`[bundles] ${updateError.message}`);
  }
}

export async function deleteAssetCascade(assetId: string, ownerId: string) {
  const { data: asset, error: assetError } = await supabaseAdmin
    .from("assets")
    .select("id, owner_id, storage_path, thumbnail_path")
    .eq("id", assetId)
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (assetError) throw new Error(`[assets] ${assetError.message}`);
  if (!asset) return { notFound: true as const };

  const assetRow = asset as AssetRow;

  const { data: listings, error: listingsError } = await supabaseAdmin
    .from("listings")
    .select("id")
    .eq("cover_asset_id", assetId);

  if (listingsError) throw new Error(`[listings] ${listingsError.message}`);

  const listingIds = (listings || []).map((listing: { id: string }) => listing.id);

  await reconcileBundles(assetId);

  if (listingIds.length > 0) {
    const { error: cartListingError } = await supabaseAdmin
      .from("cart")
      .delete()
      .in("listing_id", listingIds);
    if (cartListingError) throw new Error(`[cart] ${cartListingError.message}`);

    const { error: transactionListingError } = await supabaseAdmin
      .from("transactions")
      .delete()
      .in("listing_id", listingIds);
    if (transactionListingError) {
      throw new Error(`[transactions] ${transactionListingError.message}`);
    }
  }

  await deleteByColumn("cart", "asset_id", assetId);
  await deleteByColumn("asset_licenses", "asset_id", assetId);
  await deleteByColumn("asset_metadata", "asset_id", assetId);
  await deleteByColumn("asset_commerce_profiles", "asset_id", assetId);
  await deleteByColumn("asset_saves", "asset_id", assetId);
  await deleteByColumn("purchased_licenses", "asset_id", assetId);
  await deleteByColumn("purchased_assets", "asset_id", assetId);
  await deleteByColumn("transactions", "asset_id", assetId);
  await deleteByColumn("royalty_payouts", "asset_id", assetId);
  await deleteByColumn("content_flags", "asset_id", assetId);
  await deleteByColumn("agent_decisions", "asset_id", assetId);
  await deleteByColumn("remix_relations", "original_asset_id", assetId);
  await deleteByColumn("remix_relations", "derived_asset_id", assetId);
  await deleteByIds("listings", listingIds);

  const { error: deleteAssetError } = await supabaseAdmin
    .from("assets")
    .delete()
    .eq("id", assetId)
    .eq("owner_id", ownerId);

  if (deleteAssetError) throw new Error(`[assets] ${deleteAssetError.message}`);

  await deleteStorageObjectIfUnused(assetRow.id, assetRow.storage_path);

  if (assetRow.thumbnail_path !== assetRow.storage_path) {
    await deleteThumbnailIfUnused(assetRow.id, assetRow.thumbnail_path);
  }

  return { notFound: false as const };
}
