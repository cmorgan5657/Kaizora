import { supabaseAdmin } from "@/lib/supabaseServer";

const AUDIO_TEMP_BUCKET = "audio-temp";

export async function uploadAudioTempAndGetSignedUrl(
  fileName: string,
  buffer: Buffer,
  contentType: string,
  expiresInSeconds = 60 * 60,
): Promise<{ path: string; signedUrl: string }> {
  const storagePath = `decision-layer/${fileName}`;

  const uploadResult = await supabaseAdmin.storage
    .from(AUDIO_TEMP_BUCKET)
    .upload(storagePath, buffer, {
      contentType,
      upsert: true,
    });

  if (uploadResult.error) {
    throw new Error(
      `Failed to upload audio temp file: ${uploadResult.error.message}`,
    );
  }

  const signedUrlResult = await supabaseAdmin.storage
    .from(AUDIO_TEMP_BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds);

  if (signedUrlResult.error || !signedUrlResult.data?.signedUrl) {
    throw new Error(
      `Failed to create signed URL for audio temp file: ${signedUrlResult.error?.message || "Missing signed URL"}`,
    );
  }

  return {
    path: storagePath,
    signedUrl: signedUrlResult.data.signedUrl,
  };
}
