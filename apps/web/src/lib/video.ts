export const captureFrameThumbnail = (
  video: HTMLVideoElement,
  maxWidth = 160,
): string | null => {
  if (!video.videoWidth || !video.videoHeight) {
    return null;
  }

  const scale = Math.min(maxWidth / video.videoWidth, 1);
  const width = Math.floor(video.videoWidth * scale);
  const height = Math.floor(video.videoHeight * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return null;
  }

  ctx.drawImage(video, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', 0.7);
};
