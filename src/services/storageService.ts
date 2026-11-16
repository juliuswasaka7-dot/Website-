import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytesResumable,
} from 'firebase/storage';
import { storage } from '../lib/firebase';

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const MAX_VIDEO_BYTES = 10 * 1024 * 1024;
const MAX_AUDIO_BYTES = 2 * 1024 * 1024;
const UPLOAD_STALL_TIMEOUT_MS = 20000;

async function compressImageToJpeg(
  file: File,
  dataSaver: boolean
): Promise<Blob> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose a valid image file (JPG, PNG, or WebP).');
  }
  if (file.size > 15 * 1024 * 1024) {
    throw new Error('Image is too large. Please select a photo under 15 MB.');
  }

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
  const storageRef = ref(storage, storagePath);

  return new Promise((resolve, reject) => {
    const task = uploadBytesResumable(storageRef, payload, {
      contentType,
      cacheControl: 'public,max-age=86400',
    });

    let lastBytes = -1;
    let settled = false;
    const stallTimer = window.setInterval(() => {
      if (settled) return;
      const currentBytes = task.snapshot.bytesTransferred;
      if (currentBytes === lastBytes) {
        settled = true;
        window.clearInterval(stallTimer);
        task.cancel();
        reject(
          new Error(
            'Upload timed out on a slow connection. Please retry when signal improves.'
          )
        );
      } else {
        lastBytes = currentBytes;
      }
    }, UPLOAD_STALL_TIMEOUT_MS);

    const cleanup = () => {
      settled = true;
      window.clearInterval(stallTimer);
    };

    task.on(
      'state_changed',
      (snapshot) => {
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
        const code = (error as { code?: string }).code || '';
        if (
          code === 'storage/unauthorized' ||
          code === 'storage/bucket-not-found' ||
          code === 'storage/unknown'
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

export async function uploadPrivateAlbumPhoto(
  uid: string,
  file: File,
  onProgress?: (percent: number) => void,
  dataSaver = false
): Promise<string> {
  const compressedBlob = await compressImageToJpeg(file, dataSaver);
  return runResumableUpload(
    `private_albums/${uid}/${Date.now()}.jpg`,
    compressedBlob,
    'image/jpeg',
    onProgress
  );
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
  const storagePath = `chat_audio/${matchId}/${uid}_${Date.now()}.${ext}`;
  const url = await runResumableUpload(storagePath, blob, mime, onProgress);
  return { url, storagePath };
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
  const isImage = file.type.startsWith('image/');
  const isPdfOrText =
    file.type === 'application/pdf' || file.type === 'text/plain';

  if (!isImage && !isPdfOrText) {
    throw new Error(
      'Supported attachments are images (JPG, PNG, WebP), PDF, and TXT files.'
    );
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
