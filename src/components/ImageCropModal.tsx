import {
  Check,
  Move,
  RefreshCw,
  RotateCcw,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';

interface ImageCropModalProps {
  file: File;
  preset: 'avatar' | 'cover';
  dataSaver?: boolean;
  onConfirm: (
    croppedBlob: Blob,
    onProgress: (percent: number) => void
  ) => Promise<void>;
  onClose: () => void;
}

export function ImageCropModal({
  file,
  preset,
  dataSaver = false,
  onConfirm,
  onClose,
}: ImageCropModalProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const [objectUrl, setObjectUrl] = useState<string>('');
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(
    null
  );
  const [viewportSize, setViewportSize] = useState<{ w: number; h: number }>(
    () =>
      preset === 'avatar' ? { w: 280, h: 280 } : { w: 480, h: 180 }
  );
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [loadError, setLoadError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const dragRef = useRef<{
    active: boolean;
    pointerId: number;
    startX: number;
    startY: number;
    baseOffsetX: number;
    baseOffsetY: number;
  } | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setObjectUrl(url);
    setNaturalSize(null);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setLoadError(null);
    setSubmitError(null);
    setProgress(null);

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [file]);

  // Measure responsive viewport so drag/crop math stays accurate on all screen widths
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const measure = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setViewportSize({ w: rect.width, h: rect.height });
      }
    };

    measure();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(measure);
      ro.observe(el);
      return () => ro.disconnect();
    }
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const baseScale = naturalSize
    ? Math.max(viewportSize.w / naturalSize.w, viewportSize.h / naturalSize.h)
    : 1;
  const totalScale = baseScale * zoom;
  const dispW = naturalSize ? naturalSize.w * totalScale : viewportSize.w;
  const dispH = naturalSize ? naturalSize.h * totalScale : viewportSize.h;

  const clampOffset = useCallback(
    (x: number, y: number, w: number, h: number) => {
      const maxX = Math.max(0, (w - viewportSize.w) / 2);
      const maxY = Math.max(0, (h - viewportSize.h) / 2);
      return {
        x: Math.max(-maxX, Math.min(maxX, x)),
        y: Math.max(-maxY, Math.min(maxY, y)),
      };
    },
    [viewportSize.w, viewportSize.h]
  );

  // Re-clamp whenever zoom or viewport size changes
  useEffect(() => {
    if (!naturalSize) return;
    setOffset((prev) => clampOffset(prev.x, prev.y, dispW, dispH));
  }, [naturalSize, dispW, dispH, clampOffset]);

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!naturalSize || submitting) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      active: true,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      baseOffsetX: offset.x,
      baseOffsetY: offset.y,
    };
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || !drag.active || drag.pointerId !== e.pointerId) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    setOffset(clampOffset(drag.baseOffsetX + dx, drag.baseOffsetY + dy, dispW, dispH));
  };

  const handlePointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore if already released
    }
  };

  const handleZoomStep = (delta: number) => {
    setZoom((z) => Math.max(1, Math.min(3, Number((z + delta).toFixed(2)))));
  };

  const handleReset = () => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  };

  const handleSaveCrop = async () => {
    if (!imgRef.current || !naturalSize || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    setProgress(0);

    try {
      const outW =
        preset === 'avatar' ? (dataSaver ? 384 : 512) : dataSaver ? 800 : 1200;
      const outH =
        preset === 'avatar' ? (dataSaver ? 384 : 512) : dataSaver ? 300 : 450;
      const quality =
        preset === 'avatar'
          ? dataSaver
            ? 0.72
            : 0.85
          : dataSaver
            ? 0.7
            : 0.82;

      const vpLeftOnDisp = (dispW - viewportSize.w) / 2 - offset.x;
      const vpTopOnDisp = (dispH - viewportSize.h) / 2 - offset.y;

      const sx = Math.max(0, vpLeftOnDisp / totalScale);
      const sy = Math.max(0, vpTopOnDisp / totalScale);
      const sWidth = Math.max(1, Math.min(naturalSize.w - sx, viewportSize.w / totalScale));
      const sHeight = Math.max(1, Math.min(naturalSize.h - sy, viewportSize.h / totalScale));

      const canvas = document.createElement('canvas');
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Could not initialize image cropper on this browser.');
      }

      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, outW, outH);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(imgRef.current, sx, sy, sWidth, sHeight, 0, 0, outW, outH);

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (result) => {
            canvas.width = 0;
            canvas.height = 0;
            if (!result) {
              reject(new Error('Failed to process image. Please try another photo.'));
              return;
            }
            resolve(result);
          },
          'image/jpeg',
          quality
        );
      });

      await onConfirm(blob, (pct) => setProgress(pct));
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : 'Could not save cropped image.'
      );
      setProgress(null);
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={
        preset === 'avatar' ? 'Adjust Profile Picture' : 'Adjust Profile Cover'
      }
      className="fixed inset-0 z-50 bg-[#1A0A26]/80 flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
    >
      <div className="bg-white rounded-3xl max-w-lg w-full p-5 sm:p-6 border border-purple-950/15 shadow-xl my-auto space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-[#2E1065]">
              {preset === 'avatar'
                ? 'Preview & Crop Profile Picture'
                : 'Preview & Crop Profile Cover'}
            </h2>
            <p className="text-xs text-purple-950/65 flex items-center gap-1 mt-0.5">
              <Move className="w-3.5 h-3.5 text-pink-600" />
              <span>Drag image to reposition · Use zoom slider to adjust</span>
            </p>
          </div>
          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
            aria-label="Close image editor"
            className="min-h-[44px] min-w-[44px] rounded-xl flex items-center justify-center text-purple-950/60 hover:bg-purple-50 disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Interactive Crop Viewport */}
        <div className="flex justify-center bg-[#1A0A26]/5 rounded-2xl p-3 sm:p-4">
          <div
            ref={viewportRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className={`relative overflow-hidden bg-[#1A0A26] touch-none select-none cursor-grab active:cursor-grabbing border border-purple-950/20 ${
              preset === 'avatar'
                ? 'w-[256px] h-[256px] sm:w-[296px] sm:h-[296px] rounded-2xl'
                : 'w-full aspect-[16/6] rounded-xl'
            }`}
          >
            {objectUrl && !loadError && (
              <img
                ref={imgRef}
                src={objectUrl}
                alt="Crop preview"
                draggable={false}
                onLoad={(e) => {
                  const target = e.currentTarget;
                  if (target.naturalWidth > 0 && target.naturalHeight > 0) {
                    setNaturalSize({
                      w: target.naturalWidth,
                      h: target.naturalHeight,
                    });
                  } else {
                    setLoadError('Could not read image dimensions.');
                  }
                }}
                onError={() =>
                  setLoadError(
                    'Unable to preview this image format. Please choose a JPG or PNG photo.'
                  )
                }
                className="pointer-events-none max-w-none max-h-none absolute left-1/2 top-1/2"
                style={{
                  width: `${dispW}px`,
                  height: `${dispH}px`,
                  transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
                }}
              />
            )}

            {/* Circular guide mask overlay for avatar preset */}
            {preset === 'avatar' && !loadError && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-2 rounded-full ring-2 ring-white/90 shadow-[0_0_0_999px_rgba(26,10,38,0.48)]"
              />
            )}

            {loadError && (
              <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-xs text-red-200 bg-[#1A0A26]">
                {loadError}
              </div>
            )}
          </div>
        </div>

        {/* Zoom Controls */}
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            disabled={submitting || zoom <= 1}
            onClick={() => handleZoomStep(-0.15)}
            aria-label="Zoom out"
            className="min-h-[44px] min-w-[44px] rounded-xl border border-purple-950/20 flex items-center justify-center text-[#2E1065] hover:bg-purple-50 disabled:opacity-40"
          >
            <ZoomOut className="w-4 h-4" />
          </button>

          <input
            type="range"
            min={1}
            max={3}
            step={0.05}
            value={zoom}
            disabled={submitting || !naturalSize}
            onChange={(e) => setZoom(Number(e.target.value))}
            aria-label="Zoom level"
            className="flex-1 accent-[#6B21A8] cursor-pointer h-2"
          />

          <button
            type="button"
            disabled={submitting || zoom >= 3}
            onClick={() => handleZoomStep(0.15)}
            aria-label="Zoom in"
            className="min-h-[44px] min-w-[44px] rounded-xl border border-purple-950/20 flex items-center justify-center text-[#2E1065] hover:bg-purple-50 disabled:opacity-40"
          >
            <ZoomIn className="w-4 h-4" />
          </button>

          <button
            type="button"
            disabled={submitting}
            onClick={handleReset}
            aria-label="Reset position and zoom"
            title="Reset"
            className="min-h-[44px] px-3 rounded-xl border border-purple-950/20 text-xs font-semibold text-[#2E1065] hover:bg-purple-50 inline-flex items-center gap-1"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Reset</span>
          </button>
        </div>

        {/* Real Upload Progress Bar (0% -> 100%) */}
        {submitting && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-semibold text-[#2E1065]">
              <span>
                {progress === null || progress === 0
                  ? 'Optimizing image...'
                  : progress < 100
                    ? 'Uploading image...'
                    : 'Finalizing profile...'}
              </span>
              {progress !== null && (
                <span className="tabular-nums">{progress}%</span>
              )}
            </div>
            <div className="h-2 rounded-full bg-purple-100 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#6B21A8] to-[#DB2777] transition-all duration-150"
                style={{ width: `${Math.max(0, Math.min(100, progress ?? 0))}%` }}
              />
            </div>
          </div>
        )}

        {submitError && (
          <div
            role="alert"
            className="text-xs text-red-800 bg-red-50 border border-red-200 rounded-xl p-3 flex items-start justify-between gap-3"
          >
            <span>{submitError}</span>
            <button
              type="button"
              onClick={() => void handleSaveCrop()}
              className="shrink-0 min-h-[32px] px-2.5 py-1 rounded-lg bg-red-100 hover:bg-red-200 text-red-900 font-semibold inline-flex items-center gap-1"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry</span>
            </button>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
            className="min-h-[44px] px-4 py-2 rounded-xl border border-purple-950/20 text-sm font-semibold text-[#2E1065] hover:bg-purple-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={submitting || !naturalSize || Boolean(loadError)}
            onClick={() => void handleSaveCrop()}
            className="min-h-[44px] px-5 py-2 rounded-xl bg-gradient-to-r from-[#6B21A8] to-[#DB2777] hover:from-[#581C87] hover:to-[#BE185D] disabled:opacity-55 text-white text-sm font-semibold inline-flex items-center gap-1.5"
          >
            <Check className="w-4 h-4" />
            <span>
              {submitting
                ? 'Saving...'
                : preset === 'avatar'
                  ? 'Save Profile Picture'
                  : 'Save Cover Photo'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
