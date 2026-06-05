'use client';
import React, { useEffect, useRef, useState } from 'react';

// Free voice input. Primary: the browser's Web Speech API (SpeechRecognition) —
// streams text live as you speak. Fallback (Firefox / unsupported): record with
// MediaRecorder and transcribe via /api/transcribe (Groq Whisper). A getUserMedia
// stream feeds an AnalyserNode for the live waveform.

/* eslint-disable @typescript-eslint/no-explicit-any */
type DictOpts = { onTranscript: (text: string) => void; onError?: (code: string) => void };

// One shared AudioContext, reused across sessions. Creating/closing a context per
// use makes the OS re-init the audio device, which briefly stutters other media
// (e.g. the background video). We resume/suspend the same context instead.
let sharedCtx: AudioContext | null = null;
function getCtx(): AudioContext {
  if (!sharedCtx) sharedCtx = new ((window as any).AudioContext || (window as any).webkitAudioContext)();
  return sharedCtx as AudioContext;
}

export function useDictation({ onTranscript, onError }: DictOpts) {
  const [recording, setRecording] = useState(false);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const streaming = typeof window !== 'undefined' && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
  const ref = useRef<{ rec?: any; stream?: MediaStream; src?: MediaStreamAudioSourceNode; an?: AnalyserNode; recorder?: MediaRecorder; chunks: Blob[] }>({ chunks: [] });
  const finalRef = useRef('');

  const cleanup = () => {
    const r = ref.current;
    try { r.rec?.stop(); } catch { /* ignore */ }
    try { r.src?.disconnect(); } catch { /* ignore */ }
    r.stream?.getTracks().forEach(t => t.stop());
    // Keep the shared context alive (suspended) to avoid device re-init glitches.
    try { sharedCtx?.suspend(); } catch { /* ignore */ }
    ref.current = { chunks: [] };
    setAnalyser(null);
  };

  const start = async () => {
    if (recording) return;
    finalRef.current = '';
    try {
      // Disable audio processing so opening the mic doesn't reconfigure the system
      // audio device (the cause of the ~1s background-video stutter).
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      ref.current.stream = stream;

      const ctx = getCtx();
      if (ctx.state === 'suspended') { try { await ctx.resume(); } catch { /* ignore */ } }
      const src = ctx.createMediaStreamSource(stream);
      const an = ctx.createAnalyser();
      an.fftSize = 512;
      an.smoothingTimeConstant = 0.6;
      src.connect(an);
      ref.current.src = src;
      ref.current.an = an;
      setAnalyser(an);
      setRecording(true);

      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SR) {
        const rec = new SR();
        rec.continuous = true;
        rec.interimResults = true;
        rec.lang = navigator.language || 'en-US';
        rec.onresult = (e: any) => {
          let interim = '';
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const res = e.results[i];
            if (res.isFinal) finalRef.current += res[0].transcript + ' ';
            else interim += res[0].transcript;
          }
          onTranscript((finalRef.current + interim).replace(/\s+/g, ' ').trim());
        };
        rec.onerror = (e: any) => { if (e.error && e.error !== 'no-speech' && e.error !== 'aborted') onError?.(e.error); };
        ref.current.rec = rec;
        rec.start();
      } else {
        const recorder = new MediaRecorder(stream);
        ref.current.recorder = recorder;
        ref.current.chunks = [];
        recorder.ondataavailable = ev => { if (ev.data.size) ref.current.chunks.push(ev.data); };
        recorder.start();
      }
    } catch {
      onError?.('mic-denied');
      cleanup();
      setRecording(false);
    }
  };

  const stop = async () => {
    const r = ref.current;
    if (r.recorder && r.recorder.state !== 'inactive') {
      await new Promise<void>(resolve => { r.recorder!.onstop = () => resolve(); r.recorder!.stop(); });
      const blob = new Blob(r.chunks, { type: r.recorder.mimeType || 'audio/webm' });
      try {
        const fd = new FormData();
        fd.append('file', blob, 'audio.webm');
        const resp = await fetch('/api/transcribe', { method: 'POST', body: fd });
        const { content } = await resp.json();
        if (content) onTranscript(String(content).trim());
      } catch { /* ignore */ }
    }
    cleanup();
    setRecording(false);
  };

  // Cancel: stop everything WITHOUT transcribing (discard the take).
  const cancel = () => {
    const r = ref.current;
    if (r.recorder && r.recorder.state !== 'inactive') { try { r.recorder.ondataavailable = null; r.recorder.stop(); } catch { /* ignore */ } }
    cleanup();
    setRecording(false);
  };

  useEffect(() => cleanup, []);

  return { recording, streaming, analyser, start, stop, cancel };
}

// Live waveform — white, minimal, linear. New samples enter on the RIGHT and the
// trace scrolls LEFT while recording. rAF only; no React re-renders per frame.
export function Waveform({ analyser, color = '#ffffff', height = 30 }: { analyser: AnalyserNode | null; color?: string; height?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const hist = useRef<number[]>([]);
  useEffect(() => {
    const canvas = ref.current;
    if (!analyser || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const data = new Uint8Array(analyser.fftSize);
    hist.current = [];
    let raf = 0;
    let last = 0;
    const spacing = 6;    // px between bars (wider = calmer)
    const barW = 2.5;
    const interval = 70;  // ms — throttle ALL work to ~14fps so the fullscreen
                          // video layer isn't forced to re-composite every frame.
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (now - last < interval) return;
      last = now;
      // Cap device-pixel-ratio: keeps the canvas cheap to repaint on hi-dpi screens.
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      // Amplitude: blend RMS (loudness) and peak, high gain so quiet speech shows.
      analyser.getByteTimeDomainData(data);
      let sum = 0, mx = 0;
      for (let i = 0; i < data.length; i++) { const x = Math.abs((data[i] - 128) / 128); sum += x * x; if (x > mx) mx = x; }
      const rms = Math.sqrt(sum / data.length);
      const level = Math.min(1, Math.max(rms * 6.5, mx * 1.6));

      const n = Math.max(8, Math.floor(w / spacing));
      const arr = hist.current;
      arr.push(level);
      while (arr.length > n) arr.shift();

      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = color;
      const mid = h / 2;
      for (let i = 0; i < arr.length; i++) {
        const bh = Math.max(2.5, arr[i] * (h - 3));
        const x = w - (arr.length - i) * spacing; // newest on the right, scrolls left
        if (x < -barW) continue;
        ctx.beginPath();
        ctx.roundRect(x, mid - bh / 2, barW, bh, barW / 2);
        ctx.fill();
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [analyser, color]);
  return <canvas ref={ref} style={{ width: '100%', height: `${height}px`, display: 'block' }} />;
}
