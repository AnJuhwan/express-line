"use client";

import { useEffect, useRef, useState } from "react";
import type { CctvMediaKind } from "@/lib/cctv";

declare global {
  interface Window {
    Hls?: HlsConstructor;
    __hlsLoader?: Promise<HlsConstructor>;
  }
}

interface HlsConstructor {
  isSupported(): boolean;
  new (): HlsInstance;
  Events: {
    ERROR: string;
  };
}

interface HlsInstance {
  loadSource(src: string): void;
  attachMedia(video: HTMLVideoElement): void;
  destroy(): void;
  on(event: string, callback: () => void): void;
}

interface CctvVideoPlayerProps {
  src: string;
  title: string;
  mediaKind: CctvMediaKind;
}

export function CctvVideoPlayer({ src, title, mediaKind }: CctvVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "link-only">("loading");

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const videoElement = video;

    let cancelled = false;
    let hls: HlsInstance | null = null;

    async function attach() {
      if (mediaKind !== "hls") {
        videoElement.src = src;
        setState("ready");
        return;
      }

      if (videoElement.canPlayType("application/vnd.apple.mpegurl")) {
        videoElement.src = src;
        setState("ready");
        return;
      }

      try {
        const Hls = await loadHls();
        if (cancelled) return;
        if (!Hls.isSupported()) {
          setState("link-only");
          return;
        }
        hls = new Hls();
        hls.loadSource(src);
        hls.attachMedia(videoElement);
        hls.on(Hls.Events.ERROR, () => setState("link-only"));
        setState("ready");
      } catch {
        setState("link-only");
      }
    }

    attach();

    return () => {
      cancelled = true;
      hls?.destroy();
      videoElement.removeAttribute("src");
      videoElement.load();
    };
  }, [mediaKind, src]);

  return (
    <div className="cctv-player">
      <video ref={videoRef} title={title} controls muted playsInline preload="metadata" />
      {state === "link-only" ? (
        <a className="cctv-open-link" href={src} target="_blank" rel="noreferrer">
          영상 URL 열기
        </a>
      ) : null}
      {state === "loading" ? <span className="cctv-loading">영상 준비중</span> : null}
    </div>
  );
}

function loadHls(): Promise<HlsConstructor> {
  if (window.Hls) return Promise.resolve(window.Hls);
  if (window.__hlsLoader) return window.__hlsLoader;

  window.__hlsLoader = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls.min.js";
    script.async = true;
    script.onload = () => {
      if (window.Hls) resolve(window.Hls);
      else reject(new Error("hls.js loaded without Hls global"));
    };
    script.onerror = () => reject(new Error("failed to load hls.js"));
    document.head.appendChild(script);
  });

  return window.__hlsLoader;
}
