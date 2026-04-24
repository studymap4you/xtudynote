import { useCallback, useEffect, useRef } from "react";
import styles from "@/components/assignments/handwritingCanvas.module.css";

type Props = {
  /** JPEG data URL (빈 문자열이면 흰 캔버스) */
  value: string;
  onChange: (dataUrl: string) => void;
  disabled?: boolean;
};

const W = 560;
const H = 220;

/**
 * 포인터(마우스·터치·펜)로 필기 입력.
 * `touch-action: none` + Pointer Events로 스크롤과 필기 충돌을 줄입니다.
 */
export function HandwritingCanvas({ value, onChange, disabled }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const loadedValue = useRef<string | null>(null);

  const emitSnapshot = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    try {
      onChange(c.toDataURL("image/jpeg", 0.82));
    } catch {
      /* */
    }
  }, [onChange]);

  const initBlank = useCallback(() => {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = "#111827";
  }, []);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    c.width = W;
    c.height = H;
    initBlank();
    loadedValue.current = null;
  }, [initBlank]);

  useEffect(() => {
    if (!value || !value.startsWith("data:image")) {
      loadedValue.current = value;
      return;
    }
    if (loadedValue.current === value) return;
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (!ctx) return;
    const img = new Image();
    img.onload = () => {
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, W, H);
      ctx.drawImage(img, 0, 0, W, H);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = "#111827";
      loadedValue.current = value;
    };
    img.src = value;
  }, [value]);

  const line = useCallback((x: number, y: number) => {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (!ctx || !last.current) return;
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(x, y);
    ctx.stroke();
    last.current = { x, y };
  }, []);

  const pos = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current;
    if (!c) return { x: 0, y: 0 };
    const r = c.getBoundingClientRect();
    const scaleX = W / r.width;
    const scaleY = H / r.height;
    return {
      x: (e.clientX - r.left) * scaleX,
      y: (e.clientY - r.top) * scaleY,
    };
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (disabled) return;
      const c = canvasRef.current;
      if (!c) return;
      c.setPointerCapture(e.pointerId);
      drawing.current = true;
      const p = pos(e);
      last.current = p;
      const ctx = c.getContext("2d");
      if (ctx) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 0.65, 0, Math.PI * 2);
        ctx.fillStyle = "#111827";
        ctx.fill();
      }
    },
    [disabled, pos],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!drawing.current || disabled) return;
      const p = pos(e);
      line(p.x, p.y);
    },
    [disabled, line, pos],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!drawing.current) return;
      drawing.current = false;
      last.current = null;
      try {
        canvasRef.current?.releasePointerCapture(e.pointerId);
      } catch {
        /* */
      }
      emitSnapshot();
    },
    [emitSnapshot],
  );

  const clear = useCallback(() => {
    initBlank();
    loadedValue.current = "";
    onChange("");
  }, [initBlank, onChange]);

  return (
    <div className={styles.wrap}>
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        width={W}
        height={H}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{ touchAction: "none" }}
        aria-label="손글씨·펜 입력 영역"
      />
      <button type="button" className={styles.clearBtn} onClick={clear} disabled={disabled}>
        필기 지우기
      </button>
    </div>
  );
}
