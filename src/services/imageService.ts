import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytesResumable,
  type UploadTask,
} from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  auth,
  db,
  handleFirestoreError,
  OperationType,
  storage,
} from '../lib/firebase';

export type ProfileImageType = 'avatar' | 'cover';

export interface UploadImageOptions {
  uid: string;
  type: ProfileImageType;
  onProgress?: (percent: number) => void;
  dataSaver?: boolean;
  updateFirestore?: boolean;
  previousUrl?: string | null;
}

export interface UploadImageResult {
  url: string;
  storagePath: string;
  type: ProfileImageType;
}

const MAX_INPUT_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_STORAGE_BYTES = 5 * 1024 * 1024;
const AVATAR_MAX_DATA_URL_CHARS = 125_000;
const COVER_MAX_DATA_URL_CHARS = 220_000;
const STALL_CHECK_INTERVAL_MS = 4000;
const INITIAL_PROGRESS_TIMEOUT_MS = 12000;
const STALL_TIMEOUT_MS = 15000;
const TOTAL_UPLOAD_TIMEOUT_MS = 35000;
const STORAGE_PROBE_CACHE_MS = 5 * 60 * 1000;

let cachedStorageSupport: { available: boolean; checkedAt: number } | null = null;
let cachedWebpSupport: boolean | null = null;

function supportsWebpEncoding(): boolean {
  if (cachedWebpSupport !== null) return cachedWebpSupport;
  if (typeof document === 'undefined') {
    cachedWebpSupport = false;
    return false;
  }
  try {
    const testCanvas = document.createElement('canvas');
    testCanvas.width = 2;
    testCanvas.height = 2;
    const dataUrl = testCanvas.toDataURL('image/webp');
    testCanvas.width = 0;
    testCanvas.height = 0;
    cachedWebpSupport = dataUrl.startsWith('data:image/webp');
  } catch {
    cachedWebpSupport = false;
  }
  return cachedWebpSupport;
}

function yieldToMainThread(): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, 0);
  });
}

export function validateImageFile(file: File | Blob): void {
  if (!file || file.size === 0) {
    throw new Error('Selected image file is empty. Please choose another photo.');
  }

  const nameLower = file instanceof File ? (file.name || '').toLowerCase() : '';
  const typeLower = (file.type || '').toLowerCase();
  const hasSupportedExt = /\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i.test(nameLower);
  const isSvg = typeLower === 'image/svg+xml' || nameLower.endsWith('.svg');

  if (isSvg) {
    throw new Error(
      'SVG files are not supported. Please choose a JPG, JPEG, PNG, or WEBP photo.'
    );
  }

  if (file instanceof File && !typeLower.startsWith('image/') && !hasSupportedExt) {
    throw new Error(
      'Unsupported file type. Please select a JPG, JPEG, PNG, or WEBP image from your gallery.'
    );
  }

  if (!(file instanceof File) && typeLower && !typeLower.startsWith('image/')) {
    throw new Error('Invalid image format. Please choose a JPG, PNG, or WEBP photo.');
  }

  if (file.size > MAX_INPUT_IMAGE_BYTES) {
    throw new Error('Image is too large (over 20 MB). Please choose a smaller photo.');
  }
}

function loadImageElement(input: File | Blob): Promise<{
  img: HTMLImageElement;
  release: () => void;
}> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(input);

    const release = () => {
      URL.revokeObjectURL(objectUrl);
      img.onload = null;
      img.onerror = null;
      img.src = '';
    };

    img.onload = () => {
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      if (!w || !h) {
        release();
        reject(new Error('Could not read image dimensions. Please choose another photo.'));
        return;
      }
      resolve({ img, release });
    };

    img.onerror = () => {
      release();
      reject(
        new Error(
          'Unable to decode this photo on your device. Please pick a JPG, JPEG, PNG, or WEBP photo.'
        )
      );
    };

    img.src = objectUrl;
  });
}

function canvasToBlobAsync(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), mimeType, quality);
  });
}

export async function compressImageWithCanvas(
  input: File | Blob,
  type: ProfileImageType,
  dataSaver = false
): Promise<Blob> {
  validateImageFile(input);
  const startedAt = Date.now();

  const maxWidth =
    type === 'avatar' ? (dataSaver ? 320 : 480) : dataSaver ? 720 : 1080;
  const maxHeight =
    type === 'avatar' ? (dataSaver ? 320 : 480) : dataSaver ? 270 : 405;
  const quality =
    type === 'avatar' ? (dataSaver ? 0.72 : 0.84) : dataSaver ? 0.7 : 0.82;

  const { img, release } = await loadImageElement(input);
  try {
    const srcW = img.naturalWidth || img.width;
    const srcH = img.naturalHeight || img.height;
    const scale = Math.min(1, maxWidth / srcW, maxHeight / srcH);
    const targetW = Math.max(1, Math.round(srcW * scale));
    const targetH = Math.max(1, Math.round(srcH * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Could not initialize image compressor on this browser.');
    }

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, targetW, targetH);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, targetW, targetH);

    const mime = supportsWebpEncoding() ? 'image/webp' : 'image/jpeg';
    const blob = await canvasToBlobAsync(canvas, mime, quality);
    canvas.width = 0;
    canvas.height = 0;

    if (!blob) {
      throw new Error('Failed to compress image. Please try another photo.');
    }
    if (blob.size > MAX_STORAGE_BYTES) {
      throw new Error('Compressed image exceeds 5 MB upload limit.');
    }

    console.log('[imageService] Canvas compression complete (Blob)', {
      type,
      mime,
      source: `${srcW}x${srcH}`,
      output: `${targetW}x${targetH}`,
      originalBytes: input.size,
      compressedBytes: blob.size,
      elapsedMs: Date.now() - startedAt,
    });

    return blob;
  } finally {
    release();
  }
}

export async function compressImageToDataUrl(
  input: File | Blob,
  options: {
    maxWidth: number;
    maxHeight: number;
    maxChars: number;
    initialQuality?: number;
    label?: string;
  }
): Promise<{ dataUrl: string; mimeType: string; bytes: number }> {
  validateImageFile(input);
  const startedAt = Date.now();
  const mime = supportsWebpEncoding() ? 'image/webp' : 'image/jpeg';

  const { img, release } = await loadImageElement(input);
  try {
    const srcW = img.naturalWidth || img.width;
    const srcH = img.naturalHeight || img.height;

    const dimensionScales = [1, 0.85, 0.72, 0.6];
    const qualitySteps = [
      options.initialQuality ?? 0.84,
      0.76,
      0.68,
      0.6,
      0.52,
    ];

    let bestDataUrl = '';

    for (const dimFactor of dimensionScales) {
      const capW = Math.round(options.maxWidth * dimFactor);
      const capH = Math.round(options.maxHeight * dimFactor);
      const scale = Math.min(1, capW / srcW, capH / srcH);
      const targetW = Math.max(1, Math.round(srcW * scale));
      const targetH = Math.max(1, Math.round(srcH * scale));

      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Could not initialize image compressor on this browser.');
      }

      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, targetW, targetH);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, targetW, targetH);

      for (const q of qualitySteps) {
        const candidate = canvas.toDataURL(mime, q);
        bestDataUrl = candidate;
        if (candidate.length <= options.maxChars) {
          canvas.width = 0;
          canvas.height = 0;
          console.log('[imageService] Adaptive compression complete (DataURL)', {
            label: options.label || 'image',
            mime,
            source: `${srcW}x${srcH}`,
            output: `${targetW}x${targetH}`,
            quality: q,
            originalBytes: input.size,
            encodedChars: candidate.length,
            elapsedMs: Date.now() - startedAt,
          });
          return {
            dataUrl: candidate,
            mimeType: mime,
            bytes: candidate.length,
          };
        }
        await yieldToMainThread();
      }

      canvas.width = 0;
      canvas.height = 0;
    }

    if (!bestDataUrl || bestDataUrl.length > options.maxChars) {
      throw new Error(
        'This image is too complex to fit within upload size limits. Please choose another photo or crop closer.'
      );
    }

    return {
      dataUrl: bestDataUrl,
      mimeType: mime,
      bytes: bestDataUrl.length,
    };
  } finally {
    release();
  }
}

export async function isFirebaseStorageAvailable(): Promise<boolean> {
  const bucket = firebaseConfig.storageBucket;
  if (!bucket) return false;

  const now = Date.now();
  if (
    cachedStorageSupport &&
    now - cachedStorageSupport.checkedAt < STORAGE_PROBE_CACHE_MS
  ) {
    return cachedStorageSupport.available;
  }

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 2500);
  try {
    const res = await fetch(
      `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket)}/o?maxResults=1`,
      {
        method: 'GET',
        signal: controller.signal,
      }
    );
    // 200, 401, or 403 means the bucket exists; 404 means Storage is not provisioned
    const available = res.status !== 404;
    cachedStorageSupport = { available, checkedAt: Date.now() };
    console.log('[imageService] Storage bucket probe', {
      bucket,
      status: res.status,
      available,
    });
    return available;
  } catch (err) {
    console.warn('[imageService] Storage probe skipped/offline', err);
    return false;
  } finally {
    window.clearTimeout(timer);
  }
}

function mapStorageUploadError(error: unknown): Error {
  const err = error as { code?: string; message?: string; serverResponse?: string };
  const code = err?.code || '';
  const serverResp = err?.serverResponse || '';

  if (
    code === 'storage/bucket-not-found' ||
    code === 'storage/project-not-found' ||
    serverResp.includes('"code": 404') ||
    serverResp.includes('Not Found')
  ) {
    return new Error('STORAGE_BUCKET_NOT_FOUND');
  }

  if (code === 'storage/unauthorized' || code === 'storage/unauthenticated') {
    return new Error(
      'Upload blocked by Firebase Storage permissions. Ensure you are signed in and Storage rules are deployed.'
    );
  }

  if (code === 'storage/retry-limit-exceeded') {
    return new Error(
      'Upload timed out because Firebase Storage did not respond. Please retry.'
    );
  }

  if (code === 'storage/quota-exceeded') {
    return new Error('Firebase Storage quota exceeded for this project.');
  }

  if (code === 'storage/canceled') {
    return new Error('Image upload was canceled.');
  }

  return new Error(err?.message || 'Image upload failed. Please retry.');
}

function uploadBlobResumable(
  storagePath: string,
  payload: Blob,
  onProgress?: (percent: number) => void
): Promise<string> {
  const storageRef = ref(storage, storagePath);
  console.log('[imageService] Starting Firebase Storage uploadBytesResumable', {
    storagePath,
    payloadBytes: payload.size,
  });

  return new Promise((resolve, reject) => {
    let settled = false;
    let task: UploadTask;

    try {
      task = uploadBytesResumable(storageRef, payload, {
        contentType: payload.type || 'image/jpeg',
        cacheControl: 'public,max-age=86400',
      });
    } catch (err) {
      reject(mapStorageUploadError(err));
      return;
    }

    const startedAt = Date.now();
    let lastBytes = 0;
    let lastProgressAt = startedAt;

    const cleanup = () => {
      settled = true;
      window.clearInterval(watchdogTimer);
    };

    const abortUpload = (reason: string) => {
      if (settled) return;
      cleanup();
      try {
        task.cancel();
      } catch {
        // Ignore if already finished
      }
      reject(new Error(reason));
    };

    const watchdogTimer = window.setInterval(() => {
      if (settled) return;

      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        abortUpload('Internet connection lost during upload. Please reconnect and retry.');
        return;
      }

      const now = Date.now();
      const elapsed = now - startedAt;
      const idleDuration = now - lastProgressAt;
      const bytesTransferred = task.snapshot.bytesTransferred;

      if (bytesTransferred > lastBytes) {
        lastBytes = bytesTransferred;
        lastProgressAt = now;
        return;
      }

      if (bytesTransferred === 0 && idleDuration >= INITIAL_PROGRESS_TIMEOUT_MS) {
        abortUpload('Upload stalled before starting. Please check your connection and retry.');
        return;
      }

      if (idleDuration >= STALL_TIMEOUT_MS) {
        abortUpload('Upload stalled on a slow connection. Please retry when signal improves.');
        return;
      }

      if (elapsed >= TOTAL_UPLOAD_TIMEOUT_MS) {
        abortUpload('Upload timed out before completing. Please retry.');
      }
    }, STALL_CHECK_INTERVAL_MS);

    task.on(
      'state_changed',
      (snapshot) => {
        if (settled) return;
        if (snapshot.bytesTransferred > lastBytes) {
          lastBytes = snapshot.bytesTransferred;
          lastProgressAt = Date.now();
        }
        if (snapshot.totalBytes > 0 && onProgress) {
          const pct = Math.min(
            99,
            Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)
          );
          onProgress(pct);
        }
      },
      (error) => {
        if (settled) return;
        cleanup();
        reject(mapStorageUploadError(error));
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
              : new Error('Upload completed, but download URL could not be retrieved.')
          );
        }
      }
    );
  });
}

async function uploadProfileFieldViaFirestoreXhr(
  uid: string,
  type: ProfileImageType,
  dataUrl: string,
  onProgress?: (percent: number) => void
): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Your session expired. Please sign in again to upload photos.');
  }

  const idToken = await currentUser.getIdToken();
  const fieldName = type === 'avatar' ? 'photoUrl' : 'coverUrl';
  const endpoint = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${firebaseConfig.firestoreDatabaseId}/documents:commit`;
  const docName = `projects/${firebaseConfig.projectId}/databases/${firebaseConfig.firestoreDatabaseId}/documents/profiles/${uid}`;

  const body = JSON.stringify({
    writes: [
      {
        update: {
          name: docName,
          fields: {
            [fieldName]: { stringValue: dataUrl },
          },
        },
        updateMask: {
          fieldPaths: [fieldName],
        },
        updateTransforms: [
          {
            fieldPath: 'updatedAt',
            setToServerValue: 'REQUEST_TIME',
          },
        ],
        currentDocument: {
          exists: true,
        },
      },
    ],
  });

  console.log('[imageService] Uploading compressed image via Firestore REST commit', {
    uid,
    fieldName,
    payloadBytes: body.length,
  });

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', endpoint, true);
    xhr.timeout = TOTAL_UPLOAD_TIMEOUT_MS;
    xhr.setRequestHeader('Authorization', `Bearer ${idToken}`);
    xhr.setRequestHeader('Content-Type', 'application/json');

    xhr.upload.onprogress = (event) => {
      if (!onProgress) return;
      if (event.lengthComputable && event.total > 0) {
        const realPct = Math.min(99, Math.round((event.loaded / event.total) * 100));
        console.log('[imageService] XHR upload bytes progress', {
          fieldName,
          loaded: event.loaded,
          total: event.total,
          percent: realPct,
        });
        onProgress(realPct);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        console.log('[imageService] Firestore REST commit succeeded', {
          uid,
          fieldName,
          status: xhr.status,
        });
        resolve();
        return;
      }

      let serverMsg = `Upload failed with status ${xhr.status}.`;
      try {
        const parsed = JSON.parse(xhr.responseText) as {
          error?: { message?: string; status?: string };
        };
        if (parsed?.error?.message) {
          serverMsg = parsed.error.message;
        }
      } catch {
        // Keep HTTP status fallback
      }

      console.error('[imageService] Firestore REST commit failed', {
        status: xhr.status,
        serverMsg,
      });

      if (xhr.status === 403) {
        reject(
          new Error(
            'Permission denied while saving image. Ensure your account is active and signed in.'
          )
        );
        return;
      }
      if (xhr.status === 401) {
        reject(new Error('Authentication expired. Please sign out and sign in again.'));
        return;
      }
      reject(new Error(serverMsg));
    };

    xhr.onerror = () => {
      console.error('[imageService] XHR network error during image upload');
      reject(
        new Error(
          'Network error during upload. Check your internet connection and tap Retry.'
        )
      );
    };

    xhr.ontimeout = () => {
      console.error('[imageService] XHR upload timed out', {
        timeoutMs: TOTAL_UPLOAD_TIMEOUT_MS,
      });
      reject(
        new Error(
          'Upload timed out on a slow connection. Tap Retry or enable Data Saver mode.'
        )
      );
    };

    xhr.onabort = () => {
      reject(new Error('Image upload was canceled.'));
    };

    xhr.send(body);
  });
}

async function updateFirestoreProfileImageField(
  uid: string,
  type: ProfileImageType,
  url: string
): Promise<void> {
  const maxLen = type === 'avatar' ? 140_000 : 240_000;
  const safeUrl = url.slice(0, maxLen);
  const patch =
    type === 'avatar'
      ? { photoUrl: safeUrl, updatedAt: serverTimestamp() }
      : { coverUrl: safeUrl, updatedAt: serverTimestamp() };

  try {
    await updateDoc(doc(db, 'profiles', uid), patch);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `profiles/${uid}`);
  }
}

export async function deleteStorageImageByUrl(
  downloadUrl?: string | null
): Promise<void> {
  if (!downloadUrl || typeof downloadUrl !== 'string') return;
  try {
    if (!downloadUrl.includes('firebasestorage.googleapis.com')) return;
    const match = downloadUrl.match(/\/o\/([^?]+)/);
    if (!match?.[1]) return;
    const objectPath = decodeURIComponent(match[1]);
    if (!objectPath.startsWith('avatars/') && !objectPath.startsWith('covers/')) {
      return;
    }
    await deleteObject(ref(storage, objectPath));
  } catch {
    // Non-fatal cleanup if object already removed
  }
}

export async function uploadImage(
  file: File | Blob,
  options: UploadImageOptions
): Promise<UploadImageResult> {
  const {
    uid,
    type,
    onProgress,
    dataSaver = false,
    updateFirestore = true,
    previousUrl,
  } = options;

  console.log('[imageService] uploadImage start', {
    uid,
    type,
    authUid: auth.currentUser?.uid ?? null,
    online: typeof navigator !== 'undefined' ? navigator.onLine : 'unknown',
    fileName: file instanceof File ? file.name : 'cropped-blob',
    fileSize: file?.size ?? 0,
    updateFirestore,
  });

  if (!uid) {
    throw new Error('You must be signed in to upload images.');
  }

  if (auth.currentUser && auth.currentUser.uid !== uid) {
    throw new Error('You can only update images on your own profile.');
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error('You appear to be offline. Connect to the internet and try again.');
  }

  if (onProgress) onProgress(0);

  const storageAvailable = await isFirebaseStorageAvailable();

  if (storageAvailable) {
    try {
      const compressedBlob = await compressImageWithCanvas(file, type, dataSaver);
      const folder = type === 'avatar' ? 'avatars' : 'covers';
      const ext = compressedBlob.type === 'image/webp' ? 'webp' : 'jpg';
      const storagePath = `${folder}/${uid}/${type}_${Date.now()}.${ext}`;
      const downloadUrl = await uploadBlobResumable(
        storagePath,
        compressedBlob,
        onProgress
      );

      if (updateFirestore) {
        await updateFirestoreProfileImageField(uid, type, downloadUrl);
      }

      if (onProgress) onProgress(100);
      if (previousUrl && previousUrl !== downloadUrl) {
        void deleteStorageImageByUrl(previousUrl);
      }

      return { url: downloadUrl, storagePath, type };
    } catch (err) {
      // If Storage bucket returned 404 despite earlier cache, invalidate cache and fall through to Firestore XHR upload
      if (err instanceof Error && err.message === 'STORAGE_BUCKET_NOT_FOUND') {
        cachedStorageSupport = { available: false, checkedAt: Date.now() };
      } else {
        throw err;
      }
    }
  }

  // Persistent Cloud Firestore XHR upload (real byte-level upload progress, works on Spark free tier)
  const compressed = await compressImageToDataUrl(file, {
    maxWidth: type === 'avatar' ? (dataSaver ? 300 : 400) : dataSaver ? 720 : 960,
    maxHeight: type === 'avatar' ? (dataSaver ? 300 : 400) : dataSaver ? 270 : 360,
    maxChars:
      type === 'avatar' ? AVATAR_MAX_DATA_URL_CHARS : COVER_MAX_DATA_URL_CHARS,
    initialQuality: type === 'avatar' ? (dataSaver ? 0.74 : 0.84) : dataSaver ? 0.72 : 0.82,
    label: type,
  });

  if (updateFirestore) {
    await uploadProfileFieldViaFirestoreXhr(uid, type, compressed.dataUrl, onProgress);
  } else if (onProgress) {
    onProgress(100);
  }

  if (onProgress) onProgress(100);

  if (previousUrl && previousUrl !== compressed.dataUrl) {
    void deleteStorageImageByUrl(previousUrl);
  }

  console.log('[imageService] Persistent Firestore upload complete', {
    uid,
    type,
    encodedChars: compressed.dataUrl.length,
  });

  return {
    url: compressed.dataUrl,
    storagePath: `firestore:profiles/${uid}/${type}`,
    type,
  };
}

export async function removeProfileImage(
  uid: string,
  type: ProfileImageType,
  previousUrl?: string | null
): Promise<void> {
  if (!uid) {
    throw new Error('You must be signed in to remove profile images.');
  }
  await updateFirestoreProfileImageField(uid, type, '');
  if (previousUrl) {
    void deleteStorageImageByUrl(previousUrl);
  }
}
