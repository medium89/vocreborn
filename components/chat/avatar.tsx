"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type AvatarProps = {
  value?: string | null;
  name: string;
  className?: string;
  previewUrl?: string | null;
  previewHint?: string;
  onPreviewClick?: () => void;
};

type PreviewPosition = { left: number; top: number };

export function Avatar({ value, name, className = "", previewUrl, previewHint, onPreviewClick }: AvatarProps) {
  const image = value?.startsWith("http://") || value?.startsWith("https://") || value?.startsWith("blob:");
  const preview = previewUrl?.startsWith("http://") || previewUrl?.startsWith("https://") || previewUrl?.startsWith("blob:");
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewPosition, setPreviewPosition] = useState<PreviewPosition | null>(null);

  function cancelClose() {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }

  function scheduleClose() {
    cancelClose();
    closeTimerRef.current = window.setTimeout(() => {
      setPreviewOpen(false);
      closeTimerRef.current = null;
    }, 90);
  }

  function positionPreview() {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const width = 112;
    const height = previewHint ? 142 : 112;
    const gap = 10;
    const leftCandidate = rect.left - width - gap;
    const left = leftCandidate >= 12
      ? leftCandidate
      : Math.min(window.innerWidth - width - 12, rect.right + gap);
    const top = Math.max(12, Math.min(rect.top - 35, window.innerHeight - height - 12));
    setPreviewPosition({ left, top });
  }

  function openPreview() {
    if (!preview) return;
    cancelClose();
    positionPreview();
    setPreviewOpen(true);
  }

  useEffect(() => {
    if (!previewOpen) return;
    const sync = () => positionPreview();
    window.addEventListener("resize", sync);
    window.addEventListener("scroll", sync, true);
    return () => {
      window.removeEventListener("resize", sync);
      window.removeEventListener("scroll", sync, true);
    };
  }, [previewOpen, previewHint]);

  useEffect(() => () => {
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
  }, []);

  return (
    <span
      ref={anchorRef}
      className={"avatar " + className}
      onMouseEnter={openPreview}
      onMouseLeave={scheduleClose}
      onFocus={openPreview}
      onBlur={scheduleClose}
    >
      {image ? <img src={value ?? undefined} alt="" /> : value || name[0]?.toUpperCase() || "?"}
      {preview && previewOpen && previewPosition && typeof document !== "undefined" && createPortal(
        <button
          type="button"
          className={"avatar-preview avatar-preview-portal" + (previewHint ? " has-hint" : "")}
          style={{ left: previewPosition.left, top: previewPosition.top }}
          aria-label={previewHint || ("Увеличенное фото " + name)}
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
          onFocus={cancelClose}
          onBlur={scheduleClose}
          onClick={onPreviewClick}
        >
          <img src={previewUrl ?? undefined} alt="" />
          {previewHint && <span className="avatar-preview-hint">{previewHint}</span>}
        </button>,
        document.body,
      )}
    </span>
  );
}
