import { Pause, Play } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

interface VoiceNotePlayerProps {
  src: string;
  initialDurationSec?: number;
  variant?: 'mine' | 'partner' | 'preview';
}

export function formatAudioClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.round(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function VoiceNotePlayer({
  src,
  initialDurationSec = 0,
  variant = 'partner',
}: VoiceNotePlayerProps) {
  const playerId = useId();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(initialDurationSec);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioError, setAudioError] = useState(false);

  useEffect(() => {
    const onOtherPlay = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      if (detail !== playerId && audioRef.current && !audioRef.current.paused) {
        audioRef.current.pause();
        setPlaying(false);
      }
    };
    window.addEventListener('fyl-voice-play', onOtherPlay);
    return () => {
      window.removeEventListener('fyl-voice-play', onOtherPlay);
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, [playerId]);

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    setAudioError(false);

    if (!audio.paused) {
      audio.pause();
      setPlaying(false);
      return;
    }

    window.dispatchEvent(new CustomEvent('fyl-voice-play', { detail: playerId }));
    try {
      await audio.play();
      setPlaying(true);
    } catch {
      setPlaying(false);
      setAudioError(true);
    }
  };

  const handleSeek = (nextTime: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(nextTime)) return;
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  };

  const displayDuration =
    duration > 0 && Number.isFinite(duration) ? duration : initialDurationSec;

  const isDarkSurface = variant === 'mine';

  return (
    <div className="flex items-center gap-2.5 min-w-[205px] max-w-[270px]">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        playsInline
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) setDuration(d);
        }}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onEnded={() => {
          setPlaying(false);
          setCurrentTime(0);
        }}
        onPause={() => setPlaying(false)}
        onError={() => {
          setPlaying(false);
          setAudioError(true);
        }}
      />

      <button
        type="button"
        onClick={() => void togglePlay()}
        aria-label={playing ? 'Pause voice note' : 'Play voice note'}
        className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-colors ${
          isDarkSurface
            ? 'bg-white text-[#2E1065] hover:bg-purple-100'
            : 'bg-[#2E1065] text-white hover:bg-[#4C1D95] dark:bg-pink-600 dark:hover:bg-pink-500'
        }`}
      >
        {playing ? (
          <Pause className="w-4 h-4 fill-current" />
        ) : (
          <Play className="w-4 h-4 fill-current ml-0.5" />
        )}
      </button>

      <div className="flex-1 min-w-0">
        <input
          type="range"
          min={0}
          max={displayDuration > 0 ? displayDuration : 1}
          step={0.1}
          value={Math.min(currentTime, displayDuration || 1)}
          onChange={(e) => handleSeek(Number(e.target.value))}
          aria-label="Voice note playback progress"
          className={`w-full h-1.5 rounded-lg cursor-pointer accent-pink-500 ${
            isDarkSurface
              ? 'bg-white/25'
              : 'bg-purple-200 dark:bg-purple-900'
          }`}
        />
        <div
          className={`flex items-center justify-between text-[10px] mt-1 tabular-nums ${
            isDarkSurface
              ? 'text-purple-100/85'
              : 'text-purple-950/65 dark:text-purple-200/75'
          }`}
        >
          <span>{audioError ? 'Playback unavailable' : formatAudioClock(playing ? currentTime : displayDuration)}</span>
          <span>Voice note</span>
        </div>
      </div>
    </div>
  );
}
