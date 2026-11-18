export type CallMediaType = 'video' | 'audio';

export type MediaPermissionStateValue =
  | 'granted'
  | 'denied'
  | 'prompt'
  | 'unknown';

export interface MediaPermissionSnapshot {
  camera: MediaPermissionStateValue;
  microphone: MediaPermissionStateValue;
}

export type MediaRequestFailureReason =
  | 'denied'
  | 'insecure_context'
  | 'unsupported'
  | 'not_found'
  | 'busy'
  | 'unknown';

export interface MediaRequestSuccess {
  ok: true;
  stream: MediaStream;
  callType: CallMediaType;
}

export interface MediaRequestFailure {
  ok: false;
  callType: CallMediaType;
  reason: MediaRequestFailureReason;
  message: string;
  permissions: MediaPermissionSnapshot;
}

export type MediaRequestResult = MediaRequestSuccess | MediaRequestFailure;

function isConstraintError(err: unknown): boolean {
  const name = (err as { name?: string })?.name || '';
  return (
    name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError'
  );
}

export function isSecureMediaContext(): boolean {
  if (typeof window === 'undefined') return false;
  const { hostname, protocol } = window.location;
  if (
    window.isSecureContext ||
    protocol === 'https:' ||
    hostname === 'localhost' ||
    hostname === '127.0.0.1'
  ) {
    return true;
  }
  return false;
}

async function querySinglePermission(
  name: 'camera' | 'microphone'
): Promise<MediaPermissionStateValue> {
  if (typeof navigator === 'undefined' || !navigator.permissions?.query) {
    return 'unknown';
  }
  try {
    const status = await navigator.permissions.query({
      name: name as PermissionName,
    });
    if (
      status.state === 'granted' ||
      status.state === 'denied' ||
      status.state === 'prompt'
    ) {
      return status.state;
    }
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

export async function checkMediaPermissionState(
  callType: CallMediaType
): Promise<MediaPermissionSnapshot> {
  const [microphone, camera] = await Promise.all([
    querySinglePermission('microphone'),
    callType === 'video'
      ? querySinglePermission('camera')
      : Promise.resolve<MediaPermissionStateValue>('unknown'),
  ]);
  return { camera, microphone };
}

export function stopMediaStream(stream: MediaStream | null | undefined): void {
  if (!stream) return;
  stream.getTracks().forEach((track) => {
    try {
      track.stop();
    } catch {
      // Ignore track stop errors on already-ended tracks
    }
  });
}

async function acquireStreamWithFallback(
  callType: CallMediaType
): Promise<MediaStream> {
  if (callType === 'audio') {
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
    } catch (err) {
      if (isConstraintError(err)) {
        return await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: false,
        });
      }
      throw err;
    }
  }

  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: {
        facingMode: 'user',
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: 24, max: 30 },
      },
    });
  } catch (err) {
    if (isConstraintError(err)) {
      return await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true,
      });
    }
    throw err;
  }
}

export async function requestCallMediaStream(
  callType: CallMediaType
): Promise<MediaRequestResult> {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return {
      ok: false,
      callType,
      reason: 'unsupported',
      message: 'Calling is only available inside a browser.',
      permissions: { camera: 'unknown', microphone: 'unknown' },
    };
  }

  if (!isSecureMediaContext()) {
    return {
      ok: false,
      callType,
      reason: 'insecure_context',
      message:
        'Voice and video calls require a secure HTTPS connection. Open this site over HTTPS and try again.',
      permissions: { camera: 'unknown', microphone: 'unknown' },
    };
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    return {
      ok: false,
      callType,
      reason: 'unsupported',
      message:
        'Your browser does not support live audio/video calling. Please use Chrome, Safari, Edge, or Firefox.',
      permissions: { camera: 'unknown', microphone: 'unknown' },
    };
  }

  try {
    const stream = await acquireStreamWithFallback(callType);
    return {
      ok: true,
      stream,
      callType,
    };
  } catch (err) {
    const permissions = await checkMediaPermissionState(callType);
    const errName = (err as { name?: string })?.name || '';
    const rawMsg = err instanceof Error ? err.message : '';

    const requiredGranted =
      callType === 'audio'
        ? permissions.microphone === 'granted'
        : permissions.microphone === 'granted' &&
          permissions.camera === 'granted';

    if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
      return {
        ok: false,
        callType,
        reason: 'not_found',
        message:
          callType === 'audio'
            ? 'No working microphone was detected on this device.'
            : 'No working camera or microphone was detected on this device.',
        permissions,
      };
    }

    if (errName === 'NotReadableError' || errName === 'TrackStartError') {
      return {
        ok: false,
        callType,
        reason: 'busy',
        message:
          callType === 'audio'
            ? 'Your microphone is currently in use by another app or tab. Close the other app and tap Enable Permissions.'
            : 'Your camera or microphone is currently in use by another app or tab. Close the other app and tap Enable Permissions.',
        permissions,
      };
    }

    // Never report "permissions were denied" if the Permissions API confirms access is already granted
    if (requiredGranted) {
      return {
        ok: false,
        callType,
        reason: 'busy',
        message:
          rawMsg && !/denied|not allowed|permission/i.test(rawMsg)
            ? rawMsg
            : callType === 'audio'
              ? 'Microphone access is already allowed, but the browser could not open your microphone right now. Make sure no other app is using it and retry.'
              : 'Camera and microphone access are already allowed, but the browser could not start the stream right now. Close any app using your camera/mic or refresh and retry.',
        permissions,
      };
    }

    if (
      errName === 'NotAllowedError' ||
      errName === 'PermissionDeniedError' ||
      permissions.microphone === 'denied' ||
      (callType === 'video' && permissions.camera === 'denied')
    ) {
      return {
        ok: false,
        callType,
        reason: 'denied',
        message:
          callType === 'audio'
            ? 'Microphone access is needed for voice calls. Tap Enable Permissions below, or allow Microphone in your browser site settings.'
            : 'Camera and microphone access are needed for video calls. Tap Enable Permissions below, or allow Camera & Microphone in your browser site settings.',
        permissions,
      };
    }

    return {
      ok: false,
      callType,
      reason: 'unknown',
      message:
        rawMsg ||
        (callType === 'audio'
          ? 'Could not start microphone for voice call. Tap Enable Permissions to retry.'
          : 'Could not start camera and microphone for video call. Tap Enable Permissions to retry.'),
      permissions,
    };
  }
}

export function getBrowserSiteSettingsSteps(callType: CallMediaType): {
  browserLabel: string;
  steps: string[];
} {
  if (typeof navigator === 'undefined') {
    return {
      browserLabel: 'Browser Site Settings',
      steps: [
        `Allow ${callType === 'audio' ? 'Microphone' : 'Camera and Microphone'} access in your browser site settings.`,
        'Tap Enable Permissions below to retry.',
      ],
    };
  }

  const ua = navigator.userAgent || '';
  const isAndroid = /Android/i.test(ua);
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const isFirefox = /Firefox/i.test(ua);

  const mediaLabel =
    callType === 'audio' ? 'Microphone' : 'Camera and Microphone';

  if (isAndroid) {
    return {
      browserLabel: 'Android Chrome / Browser Settings',
      steps: [
        'Tap the lock or tune icon next to the website address bar.',
        'Open Permissions (or Site settings).',
        `Set ${mediaLabel} to Allow.`,
        'Tap Enable Permissions below to connect your call.',
      ],
    };
  }

  if (isIOS) {
    return {
      browserLabel: 'iPhone / iPad Safari Settings',
      steps: [
        'Tap the AA or Page Settings icon in the Safari address bar.',
        'Tap Website Settings.',
        `Change ${mediaLabel} from Deny/Ask to Allow.`,
        'Tap Enable Permissions below to connect your call.',
      ],
    };
  }

  if (isFirefox) {
    return {
      browserLabel: 'Firefox Site Settings',
      steps: [
        'Click the lock or permissions icon on the left side of the address bar.',
        `Clear any blocked ${mediaLabel} permission, or allow access.`,
        'Click Enable Permissions below to connect your call.',
      ],
    };
  }

  return {
    browserLabel: 'Desktop Browser Site Settings',
    steps: [
      'Click the tune or lock icon to the left of the website address bar.',
      'Open Site settings or toggle Permissions.',
      `Switch ${mediaLabel} to Allow.`,
      'Click Enable Permissions below to connect your call.',
    ],
  };
}
