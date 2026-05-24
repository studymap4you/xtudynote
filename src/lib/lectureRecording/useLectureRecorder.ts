import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

export type RecorderStatus = "idle" | "recording" | "paused";

function pickMimeType(): string {
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  for (const t of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) {
      return t;
    }
  }
  return "video/webm";
}

function downloadWebm(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  a.href = url;
  a.download = `강의녹화-${stamp}.webm`;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function useLectureRecorder(stageRef: RefObject<HTMLElement | null>) {
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const compositeRafRef = useRef<number>(0);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);
  const timerRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);
  const pausedAccumRef = useRef(0);
  const pauseStartedRef = useRef(0);

  const stopCompositeLoop = useCallback(() => {
    if (compositeRafRef.current) {
      cancelAnimationFrame(compositeRafRef.current);
      compositeRafRef.current = 0;
    }
  }, []);

  const startCompositeLoop = useCallback(
    (container: HTMLElement, targetCanvas: HTMLCanvasElement) => {
      const dpr = window.devicePixelRatio || 1;
      const draw = () => {
        const rect = container.getBoundingClientRect();
        const w = Math.max(1, Math.floor(rect.width * dpr));
        const h = Math.max(1, Math.floor(rect.height * dpr));
        if (targetCanvas.width !== w || targetCanvas.height !== h) {
          targetCanvas.width = w;
          targetCanvas.height = h;
        }
        const ctx = targetCanvas.getContext("2d");
        if (!ctx) return;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);
        const layers = container.querySelectorAll("canvas");
        layers.forEach((layer) => {
          const cr = layer.getBoundingClientRect();
          if (cr.width < 1 || cr.height < 1) return;
          const dx = (cr.left - rect.left) * dpr;
          const dy = (cr.top - rect.top) * dpr;
          const dw = cr.width * dpr;
          const dh = cr.height * dpr;
          try {
            ctx.drawImage(layer, dx, dy, dw, dh);
          } catch {
            /* cross-origin 등 */
          }
        });
        compositeRafRef.current = requestAnimationFrame(draw);
      };
      draw();
    },
    [],
  );

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const tickElapsed = useCallback(() => {
    const base = Date.now() - startedAtRef.current - pausedAccumRef.current;
    setElapsedSec(Math.max(0, Math.floor(base / 1000)));
  }, []);

  const startTimer = useCallback(() => {
    clearTimer();
    timerRef.current = window.setInterval(tickElapsed, 500);
  }, [clearTimer, tickElapsed]);

  const stopRecordingInternal = useCallback(() => {
    stopCompositeLoop();
    clearTimer();
    const rec = recorderRef.current;
    recorderRef.current = null;
    if (rec && rec.state !== "inactive") {
      try {
        rec.stop();
      } catch {
        /* */
      }
    }
  }, [stopCompositeLoop, clearTimer]);

  const start = useCallback(async () => {
    setError(null);
    const container = stageRef.current;
    if (!container) {
      setError("녹화 영역을 찾을 수 없습니다.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("이 브라우저는 마이크 녹음을 지원하지 않습니다.");
      return;
    }

    try {
      const offscreen = document.createElement("canvas");
      offscreenRef.current = offscreen;
      startCompositeLoop(container, offscreen);
      const videoStream = offscreen.captureStream(30);

      const audioStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      const tracks = [...videoStream.getVideoTracks(), ...audioStream.getAudioTracks()];
      const mixed = new MediaStream(tracks);
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(mixed, { mimeType });
      chunksRef.current = [];

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };

      recorder.onstop = () => {
        audioStream.getTracks().forEach((t) => t.stop());
        videoStream.getTracks().forEach((t) => t.stop());
        stopCompositeLoop();
        offscreenRef.current = null;
        const blob = new Blob(chunksRef.current, { type: mimeType });
        if (blob.size > 0) downloadWebm(blob);
        chunksRef.current = [];
        setStatus("idle");
        setElapsedSec(0);
        pausedAccumRef.current = 0;
      };

      recorder.onerror = () => {
        setError("녹화 중 오류가 발생했습니다.");
        setStatus("idle");
      };

      recorderRef.current = recorder;
      recorder.start(1000);
      startedAtRef.current = Date.now();
      pausedAccumRef.current = 0;
      setElapsedSec(0);
      startTimer();
      setStatus("recording");
    } catch (err) {
      stopCompositeLoop();
      setError(err instanceof Error ? err.message : "녹화를 시작할 수 없습니다.");
      setStatus("idle");
    }
  }, [stageRef, startCompositeLoop, stopCompositeLoop, startTimer]);

  const pause = useCallback(() => {
    const rec = recorderRef.current;
    if (!rec || rec.state !== "recording") return;
    try {
      rec.pause();
      pauseStartedRef.current = Date.now();
      stopCompositeLoop();
      clearTimer();
      setStatus("paused");
    } catch {
      setError("일시정지에 실패했습니다.");
    }
  }, [stopCompositeLoop, clearTimer]);

  const resume = useCallback(() => {
    const rec = recorderRef.current;
    const container = stageRef.current;
    const offscreen = offscreenRef.current;
    if (!rec || rec.state !== "paused" || !container || !offscreen) return;
    try {
      pausedAccumRef.current += Date.now() - pauseStartedRef.current;
      startCompositeLoop(container, offscreen);
      rec.resume();
      startTimer();
      setStatus("recording");
    } catch {
      setError("녹화 재개에 실패했습니다.");
    }
  }, [stageRef, startCompositeLoop, startTimer]);

  const stop = useCallback(() => {
    stopRecordingInternal();
  }, [stopRecordingInternal]);

  useEffect(() => {
    return () => {
      stopRecordingInternal();
    };
  }, [stopRecordingInternal]);

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  return {
    status,
    error,
    elapsedLabel: formatTime(elapsedSec),
    start,
    pause,
    resume,
    stop,
    setError,
  };
}
