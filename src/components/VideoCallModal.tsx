import {
  Camera,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  Settings,
  SwitchCamera,
  User,
  Video,
  VideoOff,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { updateCallSession } from '../services/datingService';
import {
  getBrowserSiteSettingsSteps,
  requestCallMediaStream,
  stopMediaStream,
  type CallMediaType,
} from '../services/mediaPermissionService';
import type { CallSession } from '../types/app';

interface VideoCallModalProps {
  matchId: string;
  myUid: string;
  partnerName: string;
  partnerPhoto?: string;
  mode: 'outgoing' | 'incoming';
  callType?: CallMediaType;
  callId: string;
  callSession: CallSession | null;
  initialStream?: MediaStream | null;
  onCreatedOutgoing?: (
    localOfferSdp: string,
    callType: CallMediaType
  ) => Promise<string>;
  onClose: () => void;
}

function getRtcConfiguration(): RTCConfiguration {
  return {
    iceServers: [
      {
        urls: [
          'stun:stun.l.google.com:19302',
          'stun:stun1.l.google.com:19302',
          'stun:stun2.l.google.com:19302',
          'stun:stun.cloudflare.com:3478',
        ],
      },
    ],
    iceCandidatePoolSize: 5,
  };
}

function formatCallDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export function VideoCallModal({
  matchId,
  myUid,
  partnerName,
  partnerPhoto,
  mode,
  callType = 'video',
  callId: initialCallId,
  callSession,
  initialStream = null,
  onCreatedOutgoing,
  onClose,
}: VideoCallModalProps) {
  const effectiveCallType: CallMediaType =
    callSession?.callType || callType || 'video';
  const isVoiceOnly = effectiveCallType === 'audio';

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const ownedFallbackStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const activeCallIdRef = useRef<string>(initialCallId);
  const outgoingStartedRef = useRef(false);
  const incomingAnsweredRef = useRef(false);
  const appliedAnswerRef = useRef(false);
  const remoteDescReadyRef = useRef(false);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const seenCandidatesRef = useRef<Set<string>>(new Set());
  const disconnectTimeoutRef = useRef<number | undefined>(undefined);
  const missedTimeoutRef = useRef<number | undefined>(undefined);
  const callSessionRef = useRef<CallSession | null>(callSession);
  callSessionRef.current = callSession;

  const [callId, setCallId] = useState<string>(initialCallId);
  const [localMediaReady, setLocalMediaReady] = useState(
    Boolean(
      initialStream &&
        initialStream.getTracks().some((t) => t.readyState === 'live')
    )
  );
  const [statusText, setStatusText] = useState(
    mode === 'outgoing'
      ? `Calling ${partnerName}...`
      : `Connecting to ${partnerName}...`
  );
  const [connected, setConnected] = useState(false);
  const [callSeconds, setCallSeconds] = useState(0);
  const [micMuted, setMicMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(isVoiceOnly);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [canSwitchCamera, setCanSwitchCamera] = useState(false);
  const [switchingCamera, setSwitchingCamera] = useState(false);
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [retryingPermission, setRetryingPermission] = useState(false);
  const [mediaAttemptNonce, setMediaAttemptNonce] = useState(0);

  useEffect(() => {
    activeCallIdRef.current = callId;
  }, [callId]);

  const stopAllLocalAndFallbackTracks = useCallback(() => {
    stopMediaStream(localStreamRef.current);
    stopMediaStream(ownedFallbackStreamRef.current);
    stopMediaStream(initialStream);
    localStreamRef.current = null;
    ownedFallbackStreamRef.current = null;
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
  }, [initialStream]);

  const attachLocalPreview = useCallback((stream: MediaStream | null) => {
    if (!localVideoRef.current || !stream) return;
    if (localVideoRef.current.srcObject !== stream) {
      localVideoRef.current.srcObject = stream;
    }
    void localVideoRef.current.play().catch(() => {});
  }, []);

  const attachRemoteElement = useCallback((stream: MediaStream | null) => {
    if (!remoteVideoRef.current || !stream) return;
    if (remoteVideoRef.current.srcObject !== stream) {
      remoteVideoRef.current.srcObject = stream;
    }
    void remoteVideoRef.current.play().catch(() => {});
  }, []);

  const flushPendingRemoteCandidates = useCallback(
    async (pc: RTCPeerConnection) => {
      if (
        !remoteDescReadyRef.current ||
        pendingCandidatesRef.current.length === 0
      ) {
        return;
      }
      const queue = [...pendingCandidatesRef.current];
      pendingCandidatesRef.current = [];
      for (const candidate of queue) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch {
          // Ignore stale ICE candidates
        }
      }
    },
    []
  );

  // Re-attach local preview if video tag mounts after stream readiness
  useEffect(() => {
    if (!isVoiceOnly && localMediaReady && localStreamRef.current) {
      attachLocalPreview(localStreamRef.current);
    }
  }, [isVoiceOnly, localMediaReady, error, attachLocalPreview]);

  // Call timer when connected
  useEffect(() => {
    if (!connected) return;
    const timer = window.setInterval(() => {
      setCallSeconds((s) => s + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [connected]);

  // Outgoing missed-call timeout (45s while ringing)
  useEffect(() => {
    if (mode !== 'outgoing' || !callId) return;
    if (callSession && callSession.status !== 'ringing') {
      if (missedTimeoutRef.current) {
        window.clearTimeout(missedTimeoutRef.current);
        missedTimeoutRef.current = undefined;
      }
      return;
    }

    missedTimeoutRef.current = window.setTimeout(() => {
      const id = activeCallIdRef.current;
      const latestStatus = callSessionRef.current?.status;
      if (id && (!latestStatus || latestStatus === 'ringing')) {
        setStatusText(`${partnerName} did not answer`);
        void updateCallSession(matchId, id, { status: 'missed' }).catch(
          () => {}
        );
        stopAllLocalAndFallbackTracks();
        window.setTimeout(onClose, 1800);
      }
    }, 45_000);

    return () => {
      if (missedTimeoutRef.current) {
        window.clearTimeout(missedTimeoutRef.current);
        missedTimeoutRef.current = undefined;
      }
    };
  }, [
    mode,
    callId,
    callSession,
    matchId,
    partnerName,
    onClose,
    stopAllLocalAndFallbackTracks,
  ]);

  // Main WebRTC setup (StrictMode safe: does not kill parent initialStream on simulated dev unmount)
  useEffect(() => {
    let cancelled = false;
    outgoingStartedRef.current = false;
    incomingAnsweredRef.current = false;
    appliedAnswerRef.current = false;
    remoteDescReadyRef.current = false;
    pendingCandidatesRef.current = [];
    seenCandidatesRef.current.clear();

    const pc = new RTCPeerConnection(getRtcConfiguration());
    pcRef.current = pc;

    const remoteStream = new MediaStream();
    remoteStreamRef.current = remoteStream;
    attachRemoteElement(remoteStream);

    pc.ontrack = (event) => {
      const tracks = event.streams[0]?.getTracks() || [event.track];
      tracks.forEach((track) => {
        if (!remoteStream.getTracks().some((t) => t.id === track.id)) {
          remoteStream.addTrack(track);
        }
        if (track.kind === 'video') {
          setHasRemoteVideo(true);
        }
        track.onunmute = () => {
          if (track.kind === 'video') {
            setHasRemoteVideo(true);
          }
          attachRemoteElement(remoteStream);
        };
        track.onended = () => {
          if (track.kind === 'video') {
            setHasRemoteVideo(
              remoteStream
                .getVideoTracks()
                .some((vt) => vt.readyState === 'live')
            );
          }
        };
      });
      attachRemoteElement(remoteStream);
      setConnected(true);
      setStatusText(`Connected with ${partnerName}`);
    };

    const handleDisconnection = () => {
      const state = pc.connectionState;
      const iceState = pc.iceConnectionState;

      if (
        state === 'connected' ||
        iceState === 'connected' ||
        iceState === 'completed'
      ) {
        if (disconnectTimeoutRef.current) {
          window.clearTimeout(disconnectTimeoutRef.current);
          disconnectTimeoutRef.current = undefined;
        }
        attachRemoteElement(remoteStream);
        setConnected(true);
        setStatusText(`Connected with ${partnerName}`);
        return;
      }

      if (state === 'failed' || iceState === 'failed') {
        setConnected(false);
        setError(
          'Call disconnected due to network restrictions. Please try again.'
        );
        const id = activeCallIdRef.current;
        if (id) {
          void updateCallSession(matchId, id, { status: 'ended' }).catch(
            () => {}
          );
        }
        return;
      }

      if (state === 'disconnected' || iceState === 'disconnected') {
        setStatusText('Reconnecting...');
        try {
          pc.restartIce?.();
        } catch {
          // Ignore unsupported restartIce
        }
        if (!disconnectTimeoutRef.current) {
          disconnectTimeoutRef.current = window.setTimeout(() => {
            if (
              pc.connectionState === 'disconnected' ||
              pc.connectionState === 'failed' ||
              pc.iceConnectionState === 'disconnected'
            ) {
              setConnected(false);
              setError('Call disconnected. Check your internet connection.');
              const id = activeCallIdRef.current;
              if (id) {
                void updateCallSession(matchId, id, { status: 'ended' }).catch(
                  () => {}
                );
              }
            }
          }, 10_000);
        }
      }
    };

    pc.onconnectionstatechange = handleDisconnection;
    pc.oniceconnectionstatechange = handleDisconnection;

    const collectedLocalCandidates: string[] = [];
    let flushTimer: number | undefined;

    const flushCandidates = () => {
      const id = activeCallIdRef.current;
      if (!id || collectedLocalCandidates.length === 0) return;
      const batch = collectedLocalCandidates.slice(0, 28);
      void updateCallSession(
        matchId,
        id,
        mode === 'outgoing'
          ? { callerCandidates: batch }
          : { calleeCandidates: batch }
      ).catch(() => {});
    };

    pc.onicecandidate = (event) => {
      if (!event.candidate) {
        flushCandidates();
        return;
      }
      if (collectedLocalCandidates.length < 28) {
        collectedLocalCandidates.push(
          JSON.stringify(event.candidate.toJSON())
        );
        if (flushTimer) window.clearTimeout(flushTimer);
        flushTimer = window.setTimeout(flushCandidates, 300);
      }
    };

    const initializeLocalMediaAndStart = async () => {
      let activeStream: MediaStream | null = null;

      if (
        initialStream &&
        initialStream.getTracks().some((t) => t.readyState === 'live')
      ) {
        activeStream = initialStream;
      } else {
        const result = await requestCallMediaStream(effectiveCallType);
        if (cancelled) {
          if (result.ok) stopMediaStream(result.stream);
          return;
        }
        if (!result.ok) {
          setPermissionDenied(result.reason === 'denied');
          setError(result.message);
          return;
        }
        ownedFallbackStreamRef.current = result.stream;
        activeStream = result.stream;
      }

      if (cancelled || !activeStream) return;

      localStreamRef.current = activeStream;
      setError(null);
      setPermissionDenied(false);
      setLocalMediaReady(true);

      if (!isVoiceOnly) {
        attachLocalPreview(activeStream);
      }

      activeStream.getTracks().forEach((track) => {
        pc.addTrack(track, activeStream);
      });

      if (!isVoiceOnly && navigator.mediaDevices?.enumerateDevices) {
        navigator.mediaDevices
          .enumerateDevices()
          .then((devices) => {
            if (cancelled) return;
            const videoInputs = devices.filter(
              (d) => d.kind === 'videoinput'
            );
            const isTouchMobile = /Android|iPhone|iPad|iPod/i.test(
              navigator.userAgent
            );
            setCanSwitchCamera(videoInputs.length > 1 || isTouchMobile);
          })
          .catch(() => {});
      }

      if (mode === 'outgoing' && !outgoingStartedRef.current) {
        outgoingStartedRef.current = true;
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          if (onCreatedOutgoing && !cancelled) {
            const newId = await onCreatedOutgoing(
              JSON.stringify(offer),
              effectiveCallType
            );
            if (!cancelled) {
              setCallId(newId);
              activeCallIdRef.current = newId;
              flushCandidates();
            }
          }
        } catch (err) {
          if (!cancelled) {
            setError(
              err instanceof Error
                ? err.message
                : 'Could not start call signaling.'
            );
          }
        }
      } else if (
        mode === 'incoming' &&
        callSessionRef.current?.offerSdp &&
        !incomingAnsweredRef.current
      ) {
        incomingAnsweredRef.current = true;
        try {
          const remoteOffer = JSON.parse(
            callSessionRef.current.offerSdp
          ) as RTCSessionDescriptionInit;
          await pc.setRemoteDescription(new RTCSessionDescription(remoteOffer));
          remoteDescReadyRef.current = true;
          await flushPendingRemoteCandidates(pc);

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await updateCallSession(matchId, initialCallId, {
            status: 'active',
            answerSdp: JSON.stringify(answer),
          });
          if (!cancelled) {
            setStatusText(`Connecting with ${partnerName}...`);
            flushCandidates();
          }
        } catch (err) {
          incomingAnsweredRef.current = false;
          if (!cancelled) {
            setError(
              err instanceof Error
                ? err.message
                : 'Could not connect incoming call.'
            );
          }
        }
      }
    };

    void initializeLocalMediaAndStart();

    const handlePageHide = () => {
      const id = activeCallIdRef.current;
      if (id) {
        void updateCallSession(matchId, id, { status: 'ended' }).catch(
          () => {}
        );
      }
      stopAllLocalAndFallbackTracks();
    };
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      cancelled = true;
      window.removeEventListener('pagehide', handlePageHide);
      if (flushTimer) window.clearTimeout(flushTimer);
      if (disconnectTimeoutRef.current) {
        window.clearTimeout(disconnectTimeoutRef.current);
      }
      if (missedTimeoutRef.current) {
        window.clearTimeout(missedTimeoutRef.current);
      }
      stopMediaStream(ownedFallbackStreamRef.current);
      ownedFallbackStreamRef.current = null;
      pc.close();
      pcRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaAttemptNonce]);

  // Sync incoming offer (if it arrived after mount), remote answer, and ICE candidates
  useEffect(() => {
    const pc = pcRef.current;
    if (!pc || !callSession) return;

    if (
      callSession.status === 'ended' ||
      callSession.status === 'declined' ||
      callSession.status === 'missed'
    ) {
      setConnected(false);
      stopAllLocalAndFallbackTracks();
      setStatusText(
        callSession.status === 'declined'
          ? `${partnerName} declined the call`
          : callSession.status === 'missed'
            ? isVoiceOnly
              ? 'Missed voice call'
              : 'Missed video call'
            : 'Call ended'
      );
      const timer = window.setTimeout(onClose, 1300);
      return () => window.clearTimeout(timer);
    }

    const applySignaling = async () => {
      if (
        mode === 'incoming' &&
        localMediaReady &&
        callSession.offerSdp &&
        !incomingAnsweredRef.current &&
        pc.signalingState === 'stable'
      ) {
        incomingAnsweredRef.current = true;
        try {
          const remoteOffer = JSON.parse(
            callSession.offerSdp
          ) as RTCSessionDescriptionInit;
          await pc.setRemoteDescription(new RTCSessionDescription(remoteOffer));
          remoteDescReadyRef.current = true;
          await flushPendingRemoteCandidates(pc);

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await updateCallSession(matchId, callSession.id || initialCallId, {
            status: 'active',
            answerSdp: JSON.stringify(answer),
          });
          setStatusText(`Connecting with ${partnerName}...`);
        } catch {
          incomingAnsweredRef.current = false;
        }
      }

      if (
        mode === 'outgoing' &&
        callSession.answerSdp &&
        !appliedAnswerRef.current
      ) {
        appliedAnswerRef.current = true;
        try {
          const answerDesc = JSON.parse(
            callSession.answerSdp
          ) as RTCSessionDescriptionInit;
          await pc.setRemoteDescription(new RTCSessionDescription(answerDesc));
          remoteDescReadyRef.current = true;
          await flushPendingRemoteCandidates(pc);
        } catch {
          // Ignore if connection closed
        }
      }

      const remoteCandidates =
        callSession.callerUid === myUid
          ? callSession.calleeCandidates
          : callSession.callerCandidates;

      for (const raw of remoteCandidates || []) {
        if (seenCandidatesRef.current.has(raw)) continue;
        seenCandidatesRef.current.add(raw);
        try {
          const init = JSON.parse(raw) as RTCIceCandidateInit;
          if (remoteDescReadyRef.current) {
            await pc
              .addIceCandidate(new RTCIceCandidate(init))
              .catch(() => {});
          } else {
            pendingCandidatesRef.current.push(init);
          }
        } catch {
          // Ignore malformed ICE candidate
        }
      }
    };

    void applySignaling();
  }, [
    callSession,
    mode,
    myUid,
    matchId,
    initialCallId,
    localMediaReady,
    isVoiceOnly,
    onClose,
    partnerName,
    flushPendingRemoteCandidates,
    stopAllLocalAndFallbackTracks,
  ]);

  const handleHangUp = async () => {
    stopAllLocalAndFallbackTracks();
    const id = activeCallIdRef.current;
    if (id) {
      const currentStatus = callSessionRef.current?.status;
      const nextStatus =
        mode === 'outgoing' && (!currentStatus || currentStatus === 'ringing')
          ? 'missed'
          : 'ended';
      await updateCallSession(matchId, id, { status: nextStatus }).catch(
        () => {}
      );
    }
    onClose();
  };

  const handleEnablePermissionsRetry = async () => {
    setRetryingPermission(true);
    const result = await requestCallMediaStream(effectiveCallType);
    setRetryingPermission(false);
    if (!result.ok) {
      setPermissionDenied(result.reason === 'denied');
      setError(result.message);
      return;
    }
    stopMediaStream(ownedFallbackStreamRef.current);
    ownedFallbackStreamRef.current = result.stream;
    localStreamRef.current = result.stream;
    setError(null);
    setPermissionDenied(false);
    setMediaAttemptNonce((n) => n + 1);
  };

  const toggleMic = () => {
    const next = !micMuted;
    localStreamRef.current?.getAudioTracks().forEach((t) => {
      t.enabled = !next;
    });
    setMicMuted(next);
  };

  const toggleCamera = () => {
    if (isVoiceOnly) return;
    const next = !cameraOff;
    localStreamRef.current?.getVideoTracks().forEach((t) => {
      t.enabled = !next;
    });
    setCameraOff(next);
  };

  const handleSwitchCamera = async () => {
    if (
      isVoiceOnly ||
      switchingCamera ||
      !localStreamRef.current ||
      !pcRef.current
    ) {
      return;
    }
    const nextFacing = facingMode === 'user' ? 'environment' : 'user';
    setSwitchingCamera(true);
    try {
      const newVideoStream = await navigator.mediaDevices
        .getUserMedia({
          video: {
            facingMode: { exact: nextFacing },
            width: { ideal: 640 },
            height: { ideal: 480 },
          },
        })
        .catch(() =>
          navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: nextFacing,
              width: { ideal: 640 },
              height: { ideal: 480 },
            },
          })
        );

      const newTrack = newVideoStream.getVideoTracks()[0];
      if (!newTrack) {
        stopMediaStream(newVideoStream);
        return;
      }

      newTrack.enabled = !cameraOff;
      const sender = pcRef.current
        .getSenders()
        .find((s) => s.track?.kind === 'video');
      if (sender) {
        await sender.replaceTrack(newTrack);
      }

      const oldTracks = localStreamRef.current.getVideoTracks();
      oldTracks.forEach((t) => {
        localStreamRef.current?.removeTrack(t);
        t.stop();
      });
      localStreamRef.current.addTrack(newTrack);

      attachLocalPreview(localStreamRef.current);
      setFacingMode(nextFacing);
    } catch {
      setCanSwitchCamera(false);
    } finally {
      setSwitchingCamera(false);
    }
  };

  const guidance = getBrowserSiteSettingsSteps(effectiveCallType);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${isVoiceOnly ? 'Voice' : 'Video'} call with ${partnerName}`}
      className="fixed inset-0 z-50 bg-[#0F071A] text-white flex flex-col justify-between p-4 sm:p-6"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          {partnerPhoto ? (
            <img
              src={partnerPhoto}
              alt={partnerName}
              className="w-10 h-10 rounded-full object-cover border border-white/25 shrink-0"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-purple-900 flex items-center justify-center shrink-0">
              <User className="w-5 h-5 text-purple-200" />
            </div>
          )}
          <div className="min-w-0">
            <h2 className="text-base sm:text-lg font-bold truncate flex items-center gap-2">
              <span>{partnerName}</span>
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-white/10 text-purple-200 shrink-0">
                {isVoiceOnly ? 'Voice Call' : 'Video Call'}
              </span>
            </h2>
            <p className="text-xs text-purple-200 flex items-center gap-2 tabular-nums">
              <span>{statusText}</span>
              {connected && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-emerald-300 font-semibold">
                    {formatCallDuration(callSeconds)}
                  </span>
                </>
              )}
            </p>
          </div>
        </div>
      </div>

      <div className="relative flex-1 my-4 rounded-2xl overflow-hidden bg-[#180D2B] border border-white/10 flex items-center justify-center">
        {error ? (
          <div className="p-6 text-center max-w-md space-y-4">
            <p className="text-sm text-red-200 leading-relaxed">{error}</p>
            {permissionDenied && (
              <div className="rounded-xl bg-white/10 border border-white/15 p-3.5 text-left space-y-1.5">
                <p className="text-xs font-semibold text-purple-100 flex items-center gap-1.5">
                  <Settings className="w-3.5 h-3.5 shrink-0" />
                  <span>{guidance.browserLabel}:</span>
                </p>
                <ol className="list-decimal list-inside text-xs text-purple-200/90 space-y-1">
                  {guidance.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              </div>
            )}
            <div className="flex flex-wrap items-center justify-center gap-2.5">
              <button
                type="button"
                disabled={retryingPermission}
                onClick={() => void handleEnablePermissionsRetry()}
                className="min-h-[44px] px-5 py-2 rounded-xl bg-gradient-to-r from-pink-600 to-purple-600 text-white text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-60"
              >
                {isVoiceOnly ? (
                  <Mic className="w-4 h-4" />
                ) : (
                  <Camera className="w-4 h-4" />
                )}
                <span>
                  {retryingPermission
                    ? 'Requesting Access...'
                    : 'Enable Permissions'}
                </span>
              </button>
              <button
                type="button"
                onClick={() => void handleHangUp()}
                className="min-h-[44px] px-5 py-2 rounded-xl bg-white text-[#2E1065] text-sm font-semibold"
              >
                Close Call
              </button>
            </div>
          </div>
        ) : (
          <>
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className={
                isVoiceOnly
                  ? 'opacity-0 pointer-events-none absolute inset-0 w-full h-full'
                  : 'w-full h-full object-cover'
              }
            />
            {(isVoiceOnly || !hasRemoteVideo) && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#180D2B]/90 text-center p-6 pointer-events-none">
                {partnerPhoto ? (
                  <img
                    src={partnerPhoto}
                    alt={partnerName}
                    className={`w-24 h-24 sm:w-28 sm:h-28 rounded-full object-cover border-2 mb-3 ${
                      connected
                        ? 'border-emerald-400 shadow-lg shadow-emerald-500/20'
                        : 'border-white/25'
                    }`}
                  />
                ) : (
                  <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-purple-900/70 flex items-center justify-center mb-3">
                    {isVoiceOnly ? (
                      <Phone className="w-10 h-10 text-purple-200" />
                    ) : (
                      <User className="w-10 h-10 text-purple-200" />
                    )}
                  </div>
                )}
                <p className="text-base font-semibold text-white">
                  {partnerName}
                </p>
                <p className="text-xs text-purple-200/80 mt-1">{statusText}</p>
                {isVoiceOnly && connected && (
                  <p className="text-xs text-emerald-300 font-semibold mt-1 tabular-nums">
                    {formatCallDuration(callSeconds)}
                  </p>
                )}
              </div>
            )}

            {!isVoiceOnly && (
              <div className="absolute bottom-3 right-3 w-28 sm:w-36 aspect-[3/4] rounded-xl overflow-hidden border-2 border-white/40 bg-purple-950 shadow-lg">
                <video
                  ref={localVideoRef}
                  autoPlay
                  muted
                  playsInline
                  className={`w-full h-full object-cover ${
                    facingMode === 'user' ? '-scale-x-100' : ''
                  } ${cameraOff ? 'opacity-0' : 'opacity-100'}`}
                />
                {cameraOff && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-[11px] text-purple-200 bg-purple-950">
                    <VideoOff className="w-5 h-5 mb-1" />
                    <span>Camera Off</span>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <div className="flex items-center justify-center gap-3 sm:gap-4 pb-safe">
        <button
          type="button"
          onClick={toggleMic}
          aria-label={micMuted ? 'Unmute microphone' : 'Mute microphone'}
          title={micMuted ? 'Unmute microphone' : 'Mute microphone'}
          className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
            micMuted ? 'bg-red-600' : 'bg-white/15 hover:bg-white/25'
          }`}
        >
          {micMuted ? (
            <MicOff className="w-5 h-5" />
          ) : (
            <Mic className="w-5 h-5" />
          )}
        </button>
        {!isVoiceOnly && (
          <button
            type="button"
            onClick={toggleCamera}
            aria-label={cameraOff ? 'Turn camera on' : 'Turn camera off'}
            title={cameraOff ? 'Turn camera on' : 'Turn camera off'}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
              cameraOff ? 'bg-red-600' : 'bg-white/15 hover:bg-white/25'
            }`}
          >
            {cameraOff ? (
              <VideoOff className="w-5 h-5" />
            ) : (
              <Video className="w-5 h-5" />
            )}
          </button>
        )}
        {!isVoiceOnly && canSwitchCamera && (
          <button
            type="button"
            disabled={switchingCamera}
            onClick={() => void handleSwitchCamera()}
            aria-label="Switch front or back camera"
            title="Switch camera"
            className="w-12 h-12 rounded-full bg-white/15 hover:bg-white/25 disabled:opacity-50 flex items-center justify-center transition-colors"
          >
            <SwitchCamera className="w-5 h-5" />
          </button>
        )}
        <button
          type="button"
          onClick={() => void handleHangUp()}
          aria-label="End call"
          title="End call"
          className="w-14 h-14 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center transition-colors"
        >
          <PhoneOff className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
}
