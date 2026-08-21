"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Mic, Square, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AudioRecorderProps {
  value: Blob | null;
  onChange: (blob: Blob | null) => void;
}

function formatSeconds(total: number): string {
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

// Graba un audio corto desde el microfono del navegador (MediaRecorder) o
// permite subir uno ya grabado (nota de voz de WhatsApp, etc) — ambos
// caminos terminan en el mismo Blob, que el llamador manda tal cual a
// Gemini para que "escuche" la orden de trabajo dictada.
export function AudioRecorder({ value, onChange }: AudioRecorderProps): JSX.Element {
  const [isRecording, setIsRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => clearInterval(intervalRef.current);
  }, []);

  async function startRecording(): Promise<void> {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        onChange(new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" }));
        stream.getTracks().forEach((track) => track.stop());
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setSeconds(0);
      intervalRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      setError("No se pudo acceder al microfono. Revisa los permisos del navegador.");
    }
  }

  function stopRecording(): void {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
    clearInterval(intervalRef.current);
  }

  function removeAudio(): void {
    onChange(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const audioUrl = useMemo(() => (value ? URL.createObjectURL(value) : null), [value]);
  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  if (value && audioUrl) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-border p-2">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <audio controls src={audioUrl} className="h-9 flex-1" />
        <Button type="button" variant="ghost" size="icon" onClick={removeAudio} aria-label="Quitar audio">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        {isRecording ? (
          <Button type="button" variant="destructive" onClick={stopRecording}>
            <Square className="h-4 w-4" /> Detener ({formatSeconds(seconds)})
          </Button>
        ) : (
          <Button type="button" variant="outline" onClick={startRecording}>
            <Mic className="h-4 w-4" /> Grabar audio
          </Button>
        )}
        <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isRecording}>
          <Upload className="h-4 w-4" /> Subir audio
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onChange(file);
          }}
        />
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
