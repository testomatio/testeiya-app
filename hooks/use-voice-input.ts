"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { transcribeAudio } from "@/lib/agent-output/use-testomatio";

/*
 * Push-to-talk voice dictation that routes audio through the Testomat.io
 * `/transcriptions` endpoint (batch Whisper). It approximates real-time by
 * cutting the mic stream at speech pauses (a Web Audio VAD), uploading each
 * segment, and appending its text via `onSegment` — so the composer fills in
 * phrase-by-phrase. The recorder restarts per segment so every upload is a
 * self-contained, decodable file; restart gaps fall inside the silence.
 */

const SILENCE_MS = 700;
const MAX_SEGMENT_MS = 15_000;
const FIRST_SEGMENT_MS = 3_000;
const VAD_POLL_MS = 100;
const SPEECH_RMS = 0.03;

interface UseVoiceInputOpts {
  sessionId: string | null;
  language?: string;
  onSegment: (text: string) => void;
}

interface UseVoiceInputResult {
  isListening: boolean;
  isTranscribing: boolean;
  toggle: () => void;
  stop: (discard?: boolean) => void;
}

export function useVoiceInput(opts: UseVoiceInputOpts): UseVoiceInputResult {
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);

  const optsRef = useRef(opts);
  optsRef.current = opts;
  const listeningRef = useRef(false);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const vadTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const hasSpeechRef = useRef(false);
  const silenceStartRef = useRef<number | null>(null);
  const segmentStartRef = useRef(0);
  const firstSegmentRef = useRef(true);
  const stoppingRef = useRef(false);
  const fatalRef = useRef(false);
  const discardRef = useRef(false);
  const inflightRef = useRef(0);
  const uploadChainRef = useRef<Promise<void>>(Promise.resolve());
  const stopRef = useRef<() => void>(() => {});

  const teardownAudio = useCallback(() => {
    if (vadTimerRef.current) clearInterval(vadTimerRef.current);
    vadTimerRef.current = null;
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) track.stop();
    }
    streamRef.current = null;
    analyserRef.current = null;
    const ctx = audioCtxRef.current;
    audioCtxRef.current = null;
    if (ctx && ctx.state !== "closed") ctx.close().catch(() => {});
    recorderRef.current = null;
    chunksRef.current = [];
  }, []);

  const enqueueUpload = useCallback((blob: Blob, filename: string) => {
    const { sessionId, language } = optsRef.current;
    if (!sessionId) return;
    inflightRef.current += 1;
    setIsTranscribing(true);
    uploadChainRef.current = uploadChainRef.current.then(async () => {
      try {
        const text = await transcribeAudio({ sessionId, blob, filename, language });
        if (text && !discardRef.current) optsRef.current.onSegment(text);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err));
        fatalRef.current = true;
        stopRef.current();
      } finally {
        inflightRef.current -= 1;
        if (inflightRef.current === 0) setIsTranscribing(false);
      }
    });
  }, []);

  const startRecorder = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;
    const mimeType = pickMimeType();
    const recorder = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream);
    chunksRef.current = [];
    hasSpeechRef.current = false;
    silenceStartRef.current = null;
    segmentStartRef.current = performance.now();

    recorder.addEventListener("dataavailable", (event: BlobEvent) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    });
    recorder.addEventListener("stop", () => {
      const mime = recorder.mimeType || "audio/webm";
      const blob = new Blob(chunksRef.current, { type: mime });
      chunksRef.current = [];
      if (!fatalRef.current && !discardRef.current && hasSpeechRef.current && blob.size > 0) {
        enqueueUpload(blob, `recording.${extensionFor(mime)}`);
      }
      firstSegmentRef.current = false;
      if (stoppingRef.current || fatalRef.current) {
        teardownAudio();
        return;
      }
      startRecorder();
    });

    recorderRef.current = recorder;
    recorder.start();
  }, [enqueueUpload, teardownAudio]);

  const cutSegment = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder?.state !== "recording") return;
    silenceStartRef.current = null;
    recorder.stop();
  }, []);

  const pollVad = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const data = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (const sample of data) {
      const v = (sample - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / data.length);
    const now = performance.now();

    if (rms >= SPEECH_RMS) {
      hasSpeechRef.current = true;
      silenceStartRef.current = null;
    } else if (hasSpeechRef.current) {
      if (silenceStartRef.current === null) silenceStartRef.current = now;
      else if (now - silenceStartRef.current >= SILENCE_MS) {
        cutSegment();
        return;
      }
    }

    const cap = firstSegmentRef.current ? FIRST_SEGMENT_MS : MAX_SEGMENT_MS;
    if (hasSpeechRef.current && now - segmentStartRef.current >= cap) {
      cutSegment();
    }
  }, [cutSegment]);

  const stop = useCallback((discard = false) => {
    if (!listeningRef.current) return;
    listeningRef.current = false;
    stoppingRef.current = true;
    discardRef.current = discard;
    setIsListening(false);
    const recorder = recorderRef.current;
    if (recorder?.state === "recording") {
      recorder.stop();
      return;
    }
    teardownAudio();
  }, [teardownAudio]);
  stopRef.current = stop;

  const start = useCallback(async () => {
    if (!optsRef.current.sessionId) {
      toast.error("Connect a Testomat.io project to use voice input");
      return;
    }
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      toast.error(`Microphone unavailable: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }

    stoppingRef.current = false;
    fatalRef.current = false;
    discardRef.current = false;
    firstSegmentRef.current = true;
    listeningRef.current = true;
    setIsListening(true);

    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    audioCtxRef.current = ctx;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    ctx.createMediaStreamSource(streamRef.current).connect(analyser);
    analyserRef.current = analyser;

    vadTimerRef.current = setInterval(pollVad, VAD_POLL_MS);
    startRecorder();
  }, [pollVad, startRecorder]);

  const toggle = useCallback(() => {
    if (listeningRef.current) {
      stop();
      return;
    }
    start();
  }, [start, stop]);

  useEffect(() => {
    if (!isListening) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") stop(true);
    };
    const onVisibility = () => {
      if (document.hidden) stop(true);
    };
    window.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [isListening, stop]);

  useEffect(() => () => teardownAudio(), [teardownAudio]);

  return { isListening, isTranscribing, toggle, stop };
}

function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  for (const candidate of ["audio/webm", "audio/mp4", "audio/ogg"]) {
    if (MediaRecorder.isTypeSupported(candidate)) return candidate;
  }
  return "";
}

function extensionFor(mime: string): string {
  if (mime.includes("mp4")) return "mp4";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("wav")) return "wav";
  return "webm";
}
