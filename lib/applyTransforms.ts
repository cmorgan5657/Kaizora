export async function applyTransformsToImage(
  imageUrl: string,
  transforms: {
    rotation: number;
    flipH: boolean;
    flipV: boolean;
    scale: number;
  }
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        reject(new Error("Could not get canvas context"));
        return;
      }

      // Calculate dimensions after rotation
      const radians = (transforms.rotation * Math.PI) / 180;
      const cos = Math.abs(Math.cos(radians));
      const sin = Math.abs(Math.sin(radians));

      const scaleFactor = transforms.scale / 100;

      // Calculate new canvas size
      const rotatedWidth = img.width * cos + img.height * sin;
      const rotatedHeight = img.width * sin + img.height * cos;

      canvas.width = rotatedWidth * scaleFactor;
      canvas.height = rotatedHeight * scaleFactor;

      // Move to center
      ctx.translate(canvas.width / 2, canvas.height / 2);

      // Apply rotation
      ctx.rotate(radians);

      // Apply flips
      ctx.scale(transforms.flipH ? -1 : 1, transforms.flipV ? -1 : 1);

      // Apply scale
      ctx.scale(scaleFactor, scaleFactor);

      // Draw image centered
      ctx.drawImage(img, -img.width / 2, -img.height / 2);

      // Convert to blob
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error("Failed to create blob"));
          }
        },
        "image/png",
        0.95
      );
    };

    img.onerror = () => {
      reject(new Error("Failed to load image"));
    };

    img.src = imageUrl;
  });
}
