'use client';
import React, { useEffect, useRef, useState } from 'react';

// Free voice input. Primary: the browser's Web Speech API (SpeechRecognition) —
// streams text live as you speak. Fallback (Firefox / unsupported): record with
// MediaRecorder and transcribe via /api/transcribe (Groq Whisper). A separate
// getUserMedia stream feeds an AnalyserNode so we can draw the live waveform.

/* eslint-disable @typescript-eslint/no-explicit-any */
type DictOpts = { onTranscript: (text: string) => void; onError?: (code: string) => void };

export function useDictation({ onTranscript, onError }: DictOpts) {
  const [recording, setRecording] = useState(false);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const streaming = typeof window !== 'undefined' && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
  const ref = useRef<{ rec?: any; stream?: MediaStream; ctx?: AudioContext; recorder?: MediaRecorder; chunks: Blob[] }>({ chunks: [] });
  const finalRef = useRef('');

  const cleanup = () => {
    const r = ref.current;
    try { r.rec?.stop(); } catch { /* ignore */ }
    r.stream?.getTracks().forEach(t => t.stop());
    try { r.ctx?.close(); } catch { /* ignore */ }
    ref.current = { chunks: [] };
    setAnalyser(null);
  };

  const start = async () => {
    if (recording) return;
    finalRef.current = '';
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      ref.current.stream = stream;
      const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
      const ctx: AudioContext = new Ctx();
      const src = ctx.createMediaStreamSource(stream);
      const an = ctx.createAnalyser();
      an.fftSize = 256;
      src.connect(an);
      ref.current.ctx = ctx;
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
    // Fallback path: finalize the recording and transcribe via Whisper.
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

  // Stop everything if the component unmounts mid-recording.
  useEffect(() => cleanup, []);

  return { recording, streaming, analyser, start, stop };
}

// Live waveform drawn from the AnalyserNode (rAF, no React re-renders per frame).
export function Waveform({ analyser, color = '#65ca9d', height = 34 }: { analyser: AnalyserNode | null; color?: string; height?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!analyser || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const data = new Uint8Array(analyser.frequencyBinCount);
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; ctx.scale(dpr, dpr); }
      analyser.getByteFrequencyData(data);
      ctx.clearRect(0, 0, w, h);
      const bars = 32;
      const step = Math.floor(data.length / bars) || 1;
      const bw = w / bars;
      ctx.fillStyle = color;
      for (let i = 0; i < bars; i++) {
        const v = data[i * step] / 255;
        const bh = Math.max(2, v * h);
        const x = i * bw + bw * 0.25;
        ctx.beginPath();
        ctx.roundRect(x, (h - bh) / 2, bw * 0.5, bh, 1.5);
        ctx.fill();
      }
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [analyser, color]);
  return <canvas ref={ref} style={{ width: '100%', height: `${height}px`, display: 'block' }} />;
}
