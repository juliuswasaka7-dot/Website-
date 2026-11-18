import {
  AlertCircle,
  Camera,
  RefreshCw,
  RotateCcw,
  Send,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { checkMediaPermissionState } from '../services/mediaPermissionService';
import { formatAudioClock } from './VoiceNotePlayer';

interface VideoMessageRecorderProps {
  sending: boolean;
  uploadProgress: number | null;
  onCancel: () => void;
  onSendVideo: (blob: Blob, durationSec: number) => Promise<void>;
}

const MAX_VIDEO_SECONDS = 15;
const MAX_DIRECT_RECORD_BYTES = 490 * 1024;

function pickSupportedVideoMime(): string | undefined {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) {
    return undefined;
  }
  const candidates = [
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9,opus',
    'video/webm',
    'video/mp4',
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

async function mapCameraError(err: unknown): Promise<string> {
  const name = (err as { name?: string })?.name || '';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'No camera or microphone was found on this device.';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return 'Your camera is currently in use by another app. Close other camera apps and try again.';
  }
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    const perm = await checkMediaPermissionState('video');
    if (perm.camera === 'granted' && perm.microphone === 'granted') {
      return 'Camera and microphone access are enabled, but the camera stream could not be opened right now. Close any other camera app and tap Enable Permissions.';
    }
    return 'Camera or microphone access is needed to record video messages. Allow access in your browser site settings and tap Retry Camera.';
  }
  return err instanceof Error
    ? err.message
    : 'Unable to open camera for video recording.';
}

export function VideoMessageRecorder({
  sending,
  uploadProgress,
  onCancel,
  onSendVideo,
}: VideoMessageRecorderProps) {
  const liveVideoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const bytesRef = useRef(0);
  const secondsRef = useRef(0);
  const timerRef = useRef<number | undefined>(undefined);
  const cancelledRef = useRef(false);

  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [sendError, setSendError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    blob: Blob;
    url: string;
    durationSec: number;
  } | null>(null);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (liveVideoRef.current) {
      liveVideoRef.current.srcObject = null;
    }
    setCameraReady(false);
  };

  const startCamera = async (mode: 'user' | 'environment') => {
    stopStream();
    setCameraError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setCameraError('Video recording is not supported in this browser.');
      return;
    }

    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: mode,
            width: { ideal: 320, max: 480 },
            height: { ideal: 240, max: 360 },
            frameRate: { ideal: 15, max: 20 },
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
          },
        });
      } catch (firstErr) {
        const firstName = (firstErr as { name?: string })?.name || '';
        if (
          firstName !== 'OverconstrainedError' &&
          firstName !== 'ConstraintNotSatisfiedError'
        ) {
          throw firstErr;
        }
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 320, max: 480 },
            height: { ideal: 240, max: 360 },
          },
          audio: true,
        });
      }

      streamRef.current = stream;
      if (liveVideoRef.current) {
        liveVideoRef.current.srcObject = stream;
        void liveVideoRef.current.play().catch(() => {});
      }
      setCameraReady(true);
    } catch (err) {
      setCameraError(await mapCameraError(err));
    }
  };

  useEffect(() => {
    if (!preview) {
      void startCamera(facingMode);
    }
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        cancelledRef.current = true;
        recorderRef.current.stop();
      }
      stopStream();
    };
  }, [facingMode, Boolean(preview)]);

  useEffect(() => {
    return () => {
      if (preview?.url) {
        URL.revokeObjectURL(preview.url);
      }
    };
  }, [preview]);

  const stopRecording = (cancel: boolean) => {
    cancelledRef.current = cancel;
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = undefined;
    }
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
    setRecording(false);
  };

  const handleStartRecording = () => {
    const stream = streamRef.current;
    if (!stream || recording) return;
    setSendError(null);
    chunksRef.current = [];
    bytesRef.current = 0;
    secondsRef.current = 0;
    cancelledRef.current = false;
    setSeconds(0);

    const mimeType = pickSupportedVideoMime();
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, {
        videoBitsPerSecond: 160000,
        audioBitsPerSecond: 24000,
        ...(mimeType ? { mimeType } : {}),
      });
    } catch {
      recorder = new MediaRecorder(stream);
    }

    recorderRef.current = recorder;

    recorder.ondataavailable = (evt) => {
      if (evt.data.size > 0) {
        chunksRef.current.push(evt.data);
        bytesRef.current += evt.data.size;
        if (bytesRef.current >= MAX_DIRECT_RECORD_BYTES) {
          stopRecording(false);
        }
      }
    };

    recorder.onerror = () => {
      setRecording(false);
      setCameraError('Video recording was interrupted. Please try again.');
    };

    recorder.onstop = () => {
      stopStream();
      const durationSec = Math.max(1, secondsRef.current);
      const chunks = [...chunksRef.current];
      chunksRef.current = [];
      if (cancelledRef.current) {
        return;
      }
      const blob = new Blob(chunks, {
        type: recorder.mimeType || mimeType || 'video/webm',
      });
      if (blob.size < 800) {
        setCameraError('Video clip was too short. Please record at least 1 second.');
        void startCamera(facingMode);
        return;
      }
      const url = URL.createObjectURL(blob);
      setPreview({ blob, url, durationSec });
    };

    recorder.start(400);
    setRecording(true);
    timerRef.current = window.setInterval(() => {
      setSeconds((prev) => {
        const next = prev + 1;
        secondsRef.current = next;
        if (next >= MAX_VIDEO_SECONDS) {
          stopRecording(false);
          return MAX_VIDEO_SECONDS;
        }
        return next;
      });
    }, 1000);
  };

  const handleRetake = () => {
    if (preview?.url) {
      URL.revokeObjectURL(preview.url);
    }
    setPreview(null);
    setSendError(null);
  };

  const handleClose = () => {
    stopRecording(true);
    stopStream();
    if (preview?.url) {
      URL.revokeObjectURL(preview.url);
    }
    onCancel();
  };

  const handleSend = async () => {
    if (!preview || sending) return;
    setSendError(null);
    try {
      await onSendVideo(preview.blob, preview.durationSec);
    } catch (err) {
      setSendError(
        err instanceof Error ? err.message : 'Failed to send video message.'
      );
    }
  };

  return (
    <div className="p-3 sm:p-4 bg-white dark:bg-[#190F29] border-t border-purple-950/10 dark:border-white/10 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-[#2E1065] dark:text-white">
          <Camera className="w-4 h-4 text-pink-600 dark:text-pink-400" />
          <span>
            {preview
              ? 'Preview Video Message'
              : recording
                ? 'Recording Video Message'
                : 'Record Video Message'}
          </span>
        </div>
        <button
          type="button"
          disabled={sending}
          onClick={handleClose}
          aria-label="Close video recorder"
          className="min-h-[36px] min-w-[36px] rounded-lg flex items-center justify-center text-purple-950/60 dark:text-purple-200/75 hover:bg-purple-50 dark:hover:bg-white/10 disabled:opacity-50"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {cameraError || sendError ? (
        <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-xs text-red-900 dark:text-red-100 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1 space-y-2">
            <p>{cameraError || sendError}</p>
            {cameraError && !preview && (
              <button
                type="button"
                onClick={() => void startCamera(facingMode)}
                className="font-semibold underline text-red-800 dark:text-red-200"
              >
                Retry Camera
              </button>
            )}
          </div>
        </div>
      ) : null}

      {preview ? (
        <div className="space-y-3">
          <div className="relative rounded-2xl overflow-hidden bg-black max-w-sm mx-auto">
            <video
              controls
              playsInline
              src={preview.url}
              className="w-full max-h-[260px] object-contain bg-black"
            />
          </div>

          {uploadProgress !== null && (
            <div className="max-w-sm mx-auto space-y-1">
              <div className="flex items-center justify-between text-xs text-[#2E1065] dark:text-purple-100 font-semibold">
                <span>Sending video message...</span>
                <span className="tabular-nums">{uploadProgress}%</span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-purple-100 dark:bg-white/10 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#6B21A8] to-[#DB2777] transition-all"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              disabled={sending}
              onClick={handleClose}
              className="min-h-[42px] px-3 rounded-xl border border-purple-950/20 dark:border-white/20 text-xs font-semibold text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40 inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Cancel</span>
            </button>
            <button
              type="button"
              disabled={sending}
              onClick={handleRetake}
              className="min-h-[42px] px-3 rounded-xl border border-purple-950/20 dark:border-white/20 text-xs font-semibold text-[#2E1065] dark:text-purple-100 hover:bg-purple-50 dark:hover:bg-white/10 inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Record Again</span>
            </button>
            <button
              type="button"
              disabled={sending}
              onClick={() => void handleSend()}
              className="min-h-[42px] px-4 rounded-xl bg-gradient-to-r from-[#6B21A8] to-[#DB2777] text-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-60"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{sending ? 'Sending...' : 'Send Video'}</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="relative rounded-2xl overflow-hidden bg-black max-w-sm mx-auto aspect-[4/3]">
            <video
              ref={liveVideoRef}
              muted
              playsInline
              autoPlay
              className={`w-full h-full object-cover ${
                facingMode === 'user' ? 'scale-x-[-1]' : ''
              }`}
            />
            {recording && (
              <div className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-full bg-red-600/90 text-white text-xs font-bold inline-flex items-center gap-1.5 tabular-nums">
                <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                <span>
                  REC {formatAudioClock(seconds)} / {formatAudioClock(MAX_VIDEO_SECONDS)}
                </span>
              </div>
            )}
            {!recording && cameraReady && (
              <button
                type="button"
                onClick={() =>
                  setFacingMode((m) => (m === 'user' ? 'environment' : 'user'))
                }
                aria-label="Switch camera"
                title="Switch front or back camera"
                className="absolute top-2.5 right-2.5 min-h-[36px] px-2.5 rounded-full bg-black/60 hover:bg-black/80 text-white text-[11px] font-semibold inline-flex items-center gap-1"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Flip</span>
              </button>
            )}
          </div>

          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={handleClose}
              className="min-h-[42px] px-3.5 rounded-xl border border-purple-950/20 dark:border-white/20 text-xs font-semibold text-purple-950 dark:text-purple-100 hover:bg-purple-50 dark:hover:bg-white/10"
            >
              Cancel
            </button>

            {recording ? (
              <button
                type="button"
                onClick={() => stopRecording(false)}
                className="min-h-[42px] px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>Stop & Preview</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={!cameraReady}
                onClick={handleStartRecording}
                className="min-h-[42px] px-4 rounded-xl bg-gradient-to-r from-[#6B21A8] to-[#DB2777] hover:from-[#581C87] hover:to-[#BE185D] disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <span className="w-2.5 h-2.5 rounded-full bg-red-300" />
                <span>{cameraReady ? 'Start Recording' : 'Opening Camera...'}</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
