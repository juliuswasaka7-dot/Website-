import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytesResumable,
} from 'firebase/storage';
import { storage } from '../lib/firebase';
import {
  compressImageToDataUrl,
  isFirebaseStorageAvailable,
} from './imageService';

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const MAX_VIDEO_BYTES = 10 * 1024 * 1024;
const MAX_AUDIO_BYTES = 2 * 1024 * 1024;
const UPLOAD_STALL_TIMEOUT_MS = 20000;

export function validateImageFile(file: File): void {
  const nameLower = (file.name || '').toLowerCase();
  const hasImageExt = /\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i.test(nameLower);
  const isSvg = file.type === 'image/svg+xml' || nameLower.endsWith('.svg');

  if (isSvg || (!file.type.startsWith('image/') && !hasImageExt)) {
    throw new Error('Please choose a valid photo from your gallery (JPG, PNG, or WebP).');
  }
  if (file.size > 15 * 1024 * 1024) {
    throw new Error('Image is too large. Please select a photo under 15 MB.');
  }
}

async function compressImageToJpeg(
  file: File,
  dataSaver: boolean
): Promise<Blob> {
  validateImageFile(file);

  const maxDimension = dataSaver ? 480 : 720;
  const jpegQuality = dataSaver ? 0.68 : 0.8;

  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    const releaseImage = () => {
      URL.revokeObjectURL(objectUrl);
      img.onload = null;
      img.onerror = null;
      img.src = '';
    };

    img.onload = () => {
      let { width, height } = img;
      if (width > maxDimension || height > maxDimension) {
        if (width >= height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        releaseImage();
        reject(new Error('Could not initialize image processor.'));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      releaseImage();

      canvas.toBlob(
        (blob) => {
          canvas.width = 0;
          canvas.height = 0;

          if (!blob) {
            reject(new Error('Failed to compress profile photo.'));
            return;
          }
          if (blob.size > MAX_UPLOAD_BYTES) {
            reject(new Error('Compressed photo exceeds 5 MB limit.'));
            return;
          }
          resolve(blob);
        },
        'image/jpeg',
        jpegQuality
      );
    };

    img.onerror = () => {
      releaseImage();
      reject(new Error('Unable to read that image file. Please try another photo.'));
    };

    img.src = objectUrl;
  });
}

function runResumableUpload(
  storagePath: string,
  payload: Blob,
  contentType: string,
  onProgress?: (percent: number) => void
): Promise<string> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return Promise.reject(
      new Error('You appear to be offline. Connect to the internet and try again.')
    );
  }

  const storageRef = ref(storage, storagePath);

  return new Promise((resolve, reject) => {
    const task = uploadBytesResumable(storageRef, payload, {
      contentType,
      cacheControl: 'public,max-age=86400',
    });

    const startedAt = Date.now();
    let lastBytes = 0;
    let lastProgressAt = startedAt;
    let settled = false;

    const cleanup = () => {
      settled = true;
      window.clearInterval(stallTimer);
    };

    const failAndCancel = (message: string) => {
      if (settled) return;
      cleanup();
      try {
        task.cancel();
      } catch {
        // Ignore if already canceled/errored
      }
      reject(new Error(message));
    };

    const stallTimer = window.setInterval(() => {
      if (settled) return;
      const now = Date.now();
      const currentBytes = task.snapshot.bytesTransferred;
      if (currentBytes > lastBytes) {
        lastBytes = currentBytes;
        lastProgressAt = now;
        return;
      }
      const idleMs = now - lastProgressAt;
      if (currentBytes === 0 && idleMs >= 12000) {
        failAndCancel(
          'Upload could not start (0% timeout). Verify Firebase Storage is enabled and retry.'
        );
        return;
      }
      if (idleMs >= UPLOAD_STALL_TIMEOUT_MS || now - startedAt >= 45000) {
        failAndCancel(
          'Upload timed out on a slow connection. Please retry when signal improves.'
        );
      }
    }, 4000);

    task.on(
      'state_changed',
      (snapshot) => {
        if (settled) return;
        if (snapshot.bytesTransferred > lastBytes) {
          lastBytes = snapshot.bytesTransferred;
          lastProgressAt = Date.now();
        }
        if (snapshot.totalBytes > 0 && onProgress) {
          const pct = Math.round(
            (snapshot.bytesTransferred / snapshot.totalBytes) * 100
          );
          onProgress(pct);
        }
      },
      (error) => {
        if (settled) return;
        cleanup();
        const errObj = error as { code?: string; serverResponse?: string };
        const code = errObj.code || '';
        const serverResp = errObj.serverResponse || '';
        if (
          code === 'storage/unauthorized' ||
          code === 'storage/bucket-not-found' ||
          code === 'storage/project-not-found' ||
          code === 'storage/retry-limit-exceeded' ||
          code === 'storage/unknown' ||
          serverResp.includes('"code": 404')
        ) {
          reject(
            new Error(
              'Firebase Storage is not yet enabled or rules are pending in Firebase Console. Open Firebase Console -> Storage -> Get Started to activate media uploads.'
            )
          );
          return;
        }
        reject(new Error(error.message || 'Upload failed.'));
      },
      async () => {
        if (settled) return;
        cleanup();
        try {
          const url = await getDownloadURL(task.snapshot.ref);
          resolve(url);
        } catch (err) {
          reject(
            err instanceof Error
              ? err
              : new Error('Upload succeeded, but could not retrieve file URL.')
          );
        }
      }
    );
  });
}

export async function uploadProfilePhoto(
  uid: string,
  file: File,
  onProgress?: (percent: number) => void,
  dataSaver = false
): Promise<string> {
  const compressedBlob = await compressImageToJpeg(file, dataSaver);
  return runResumableUpload(
    `avatars/${uid}/${Date.now()}.jpg`,
    compressedBlob,
    'image/jpeg',
    onProgress
  );
}

export async function uploadCroppedProfileImage(
  uid: string,
  kind: 'avatar' | 'cover',
  croppedBlob: Blob,
  onProgress?: (percent: number) => void
): Promise<string> {
  if (croppedBlob.size > MAX_UPLOAD_BYTES) {
    throw new Error('Cropped image exceeds the 5 MB upload limit. Please zoom or choose a smaller photo.');
  }
  const fileName = `${kind}_${Date.now()}.jpg`;
  return runResumableUpload(
    `avatars/${uid}/${fileName}`,
    croppedBlob,
    'image/jpeg',
    onProgress
  );
}

export async function deleteStorageFileByUrl(
  downloadUrl?: string | null
): Promise<void> {
  if (!downloadUrl || typeof downloadUrl !== 'string') return;
  try {
    if (!downloadUrl.includes('firebasestorage.googleapis.com')) return;
    const match = downloadUrl.match(/\/o\/([^?]+)/);
    if (!match?.[1]) return;
    const objectPath = decodeURIComponent(match[1]);
    if (
      !objectPath.startsWith('avatars/') &&
      !objectPath.startsWith('covers/')
    ) {
      return;
    }
    await deleteObject(ref(storage, objectPath));
  } catch {
    // Non-fatal cleanup if file already removed or owned elsewhere
  }
}

export async function uploadPrivateAlbumPhoto(
  uid: string,
  file: File,
  onProgress?: (percent: number) => void,
  dataSaver = false
): Promise<string> {
  if (await isFirebaseStorageAvailable()) {
    const compressedBlob = await compressImageToJpeg(file, dataSaver);
    return runResumableUpload(
      `private_albums/${uid}/${Date.now()}.jpg`,
      compressedBlob,
      'image/jpeg',
      onProgress
    );
  }
  if (onProgress) onProgress(0);
  const { dataUrl } = await compressImageToDataUrl(file, {
    maxWidth: dataSaver ? 480 : 640,
    maxHeight: dataSaver ? 480 : 640,
    maxChars: 170000,
    initialQuality: dataSaver ? 0.72 : 0.82,
    label: 'privateAlbum',
  });
  if (onProgress) onProgress(100);
  return dataUrl;
}

export async function uploadVideoIntro(
  uid: string,
  file: File,
  onProgress?: (percent: number) => void
): Promise<string> {
  if (!file.type.startsWith('video/')) {
    throw new Error('Please choose a valid video file (MP4 or WebM).');
  }
  if (file.size > MAX_VIDEO_BYTES) {
    throw new Error('Video intro must be 10 MB or smaller for fast mobile playback.');
  }
  const ext = file.type.includes('webm') ? 'webm' : 'mp4';
  return runResumableUpload(
    `video_intros/${uid}/${Date.now()}.${ext}`,
    file,
    file.type || 'video/mp4',
    onProgress
  );
}

function blobToDataUrl(
  blob: Blob,
  onProgress?: (percent: number) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0 && onProgress) {
        onProgress(Math.min(95, Math.round((e.loaded / e.total) * 100)));
      }
    };
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (!result) {
        reject(new Error('Failed to encode recorded media. Please try again.'));
        return;
      }
      if (onProgress) onProgress(100);
      resolve(result);
    };
    reader.onerror = () => {
      reject(new Error('Could not read recorded media on this device.'));
    };
    if (onProgress) onProgress(10);
    reader.readAsDataURL(blob);
  });
}

export async function uploadVoiceMessage(
  matchId: string,
  uid: string,
  blob: Blob,
  onProgress?: (percent: number) => void
): Promise<{ url: string; storagePath: string }> {
  if (blob.size > MAX_AUDIO_BYTES) {
    throw new Error('Voice note is too large. Please keep voice notes under 60 seconds.');
  }
  const mime = blob.type || 'audio/webm';
  const ext = mime.includes('mp4') ? 'm4a' : mime.includes('ogg') ? 'ogg' : 'webm';

  if (await isFirebaseStorageAvailable()) {
    const storagePath = `chat_audio/${matchId}/${uid}_${Date.now()}.${ext}`;
    const url = await runResumableUpload(storagePath, blob, mime, onProgress);
    return { url, storagePath };
  }

  if (blob.size > 350 * 1024) {
    throw new Error(
      'Voice message is too large to store directly (keep under 45 seconds or speak closer to the mic).'
    );
  }
  const dataUrl = await blobToDataUrl(blob, onProgress);
  if (dataUrl.length > 490_000) {
    throw new Error(
      'Voice message exceeded direct message size limit. Please send a shorter voice note.'
    );
  }
  return { url: dataUrl, storagePath: '' };
}

export async function uploadVideoMessage(
  matchId: string,
  uid: string,
  blob: Blob,
  onProgress?: (percent: number) => void
): Promise<{ url: string; storagePath: string }> {
  if (blob.size === 0) {
    throw new Error('Recorded video is empty. Please record again.');
  }
  const mime = blob.type || 'video/webm';
  const ext = mime.includes('mp4') ? 'mp4' : 'webm';

  if (await isFirebaseStorageAvailable()) {
    if (blob.size > MAX_VIDEO_BYTES) {
      throw new Error('Video message must be 10 MB or smaller.');
    }
    const storagePath = `chat_video/${matchId}/${uid}_${Date.now()}.${ext}`;
    const url = await runResumableUpload(storagePath, blob, mime, onProgress);
    return { url, storagePath };
  }

  if (blob.size > 540 * 1024) {
    throw new Error(
      'Video message is too large. Please keep video clips short (up to 15 seconds).'
    );
  }
  const dataUrl = await blobToDataUrl(blob, onProgress);
  if (dataUrl.length > 740_000) {
    throw new Error(
      'Video message exceeded direct message size limit. Please record a slightly shorter clip.'
    );
  }
  return { url: dataUrl, storagePath: '' };
}

export async function uploadChatAttachment(
  matchId: string,
  uid: string,
  file: File,
  dataSaver = false,
  onProgress?: (percent: number) => void
): Promise<{
  url: string;
  storagePath: string;
  attachmentName: string;
  attachmentMime: string;
  messageType: 'image' | 'file';
}> {
  const nameLower = (file.name || '').toLowerCase();
  const isImage =
    file.type.startsWith('image/') ||
    /\.(jpe?g|png|webp|gif|bmp)$/i.test(nameLower);
  const isPdfOrText =
    file.type === 'application/pdf' || file.type === 'text/plain';

  if (!isImage && !isPdfOrText) {
    throw new Error(
      'Supported attachments are images (JPG, JPEG, PNG, WEBP), PDF, and TXT files.'
    );
  }

  if (isImage && !(await isFirebaseStorageAvailable())) {
    if (onProgress) onProgress(0);
    const { dataUrl, mimeType } = await compressImageToDataUrl(file, {
      maxWidth: dataSaver ? 560 : 800,
      maxHeight: dataSaver ? 560 : 800,
      maxChars: 200000,
      initialQuality: dataSaver ? 0.72 : 0.82,
      label: 'chatImage',
    });
    if (onProgress) onProgress(100);
    const ext = mimeType === 'image/webp' ? 'webp' : 'jpg';
    return {
      url: dataUrl,
      storagePath: '',
      attachmentName: file.name.slice(0, 200) || `photo.${ext}`,
      attachmentMime: mimeType,
      messageType: 'image',
    };
  }

  let payload: Blob = file;
  let mime = file.type;
  let ext = isImage ? 'jpg' : file.type === 'application/pdf' ? 'pdf' : 'txt';

  if (isImage) {
    payload = await compressImageToJpeg(file, dataSaver);
    mime = 'image/jpeg';
    ext = 'jpg';
  } else if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error('Attachment must be 5 MB or smaller.');
  }

  const storagePath = `chat_attachments/${matchId}/${uid}_${Date.now()}.${ext}`;
  const url = await runResumableUpload(storagePath, payload, mime, onProgress);

  return {
    url,
    storagePath,
    attachmentName: file.name.slice(0, 200) || `attachment.${ext}`,
    attachmentMime: mime.slice(0, 100),
    messageType: isImage ? 'image' : 'file',
  };
}

export async function deleteChatMediaFile(storagePath?: string): Promise<void> {
  if (!storagePath) return;
  try {
    await deleteObject(ref(storage, storagePath));
  } catch {
    // Non-fatal if file already deleted or storage unavailable
  }
}
