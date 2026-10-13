"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Camera, FileText, Loader2, Mic, Paperclip, Plus, Square, X } from "lucide-react";

export type Upload = { localId: string; name: string; type: string; size: number; status: "uploading" | "ready" | "error"; id?: string; preview?: string; error?: string };

type SpeechRec = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: any) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: any) => void) | null;
};

const ACCEPT = "image/*,video/*,application/pdf,.csv,.txt,.json,.xlsx";

/**
 * The writing bar: text that grows, "+" to attach files or take a photo, voice dictation in Hebrew,
 * drag-and-drop and paste. Files upload as soon as they are picked, so sending is instant.
 */
export function Composer({ busy, placeholder, onSend }: { busy: boolean; placeholder: string; onSend: (text: string, attachmentIds: string[], uploads: Upload[]) => void }) {
  const [text, setText] = useState("");
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [menu, setMenu] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [listening, setListening] = useState(false);
  const [canDictate, setCanDictate] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const rec = useRef<SpeechRec | null>(null);
  const baseText = useRef("");

  useEffect(() => {
    setCanDictate(!!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition));
  }, []);

  useEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [text]);

  function addFiles(list: FileList | File[]) {
    for (const file of Array.from(list).slice(0, 10)) {
      const localId = crypto.randomUUID();
      const preview = file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined;
      setUploads((u) => [...u, { localId, name: file.name, type: file.type, size: file.size, status: "uploading", preview }]);
      const form = new FormData();
      form.append("file", file);
      fetch("/api/uploads", { method: "POST", body: form })
        .then(async (r) => {
          const data = await r.json().catch(() => ({}));
          setUploads((u) => u.map((x) => (x.localId === localId ? (r.ok ? { ...x, status: "ready", id: data.id } : { ...x, status: "error", error: data.error }) : x)));
        })
        .catch(() => setUploads((u) => u.map((x) => (x.localId === localId ? { ...x, status: "error", error: "ההעלאה נכשלה" } : x))));
    }
  }

  function toggleDictation() {
    if (listening) {
      rec.current?.stop();
      return;
    }
    const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Ctor) return;
    const r: SpeechRec = new Ctor();
    r.lang = "he-IL";
    r.interimResults = true;
    r.continuous = true;
    baseText.current = text ? `${text.trimEnd()} ` : "";
    r.onresult = (e) => {
      let finalText = "";
      let interim = "";
      for (let i = 0; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t;
        else interim += t;
      }
      setText(baseText.current + finalText + interim);
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    rec.current = r;
    r.start();
    setListening(true);
  }

  const uploading = uploads.some((u) => u.status === "uploading");
  const ready = uploads.filter((u) => u.status === "ready");
  const canSend = !busy && !uploading && (text.trim().length > 0 || ready.length > 0);

  function submit() {
    if (!canSend) return;
    if (listening) rec.current?.stop();
    onSend(text.trim(), ready.map((u) => u.id!), ready);
    setText("");
    setUploads([]);
  }

  return (
    <div
      className={`glass relative rounded-[28px] shadow-[var(--shadow-float)] transition-shadow duration-300 focus-within:shadow-[var(--shadow-float),0_0_0_5px_var(--brand-tint)] ${
        dragging ? "shadow-[var(--shadow-float),0_0_0_2px_var(--brand)]" : ""
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
      }}
    >
      {uploads.length > 0 && (
        <div className="no-scrollbar flex gap-2 overflow-x-auto px-3 pt-3">
          {uploads.map((u) => (
            <div key={u.localId} className="tile relative flex h-16 shrink-0 items-center gap-2.5 overflow-hidden pe-3 ps-1.5">
              {u.preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={u.preview} alt="" className="h-[52px] w-[52px] rounded-[10px] object-cover" />
              ) : (
                <span className="icon-chip h-[52px] w-[52px] rounded-[10px]">
                  <FileText className="h-5 w-5" />
                </span>
              )}
              <span className="max-w-36 leading-tight">
                <span className="block truncate text-[14px] font-medium">{u.name}</span>
                <span className={`block text-[12px] ${u.status === "error" ? "text-bad" : "text-ink-3"}`}>
                  {u.status === "uploading" ? "מעלה…" : u.status === "error" ? (u.error ?? "שגיאה") : `${Math.max(1, Math.round(u.size / 1024))} KB`}
                </span>
              </span>
              {u.status === "uploading" && <Loader2 className="h-4 w-4 animate-spin text-ink-3" />}
              <button
                type="button"
                aria-label="הסרה"
                onClick={() => setUploads((x) => x.filter((y) => y.localId !== u.localId))}
                className="absolute end-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-ink/70 text-white"
              >
                <X className="h-3 w-3" strokeWidth={3} />
              </button>
            </div>
          ))}
        </div>
      )}

      <textarea
        ref={field}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onPaste={(e) => {
          const files = Array.from(e.clipboardData.files);
          if (files.length) {
            e.preventDefault();
            addFiles(files);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          }
        }}
        rows={1}
        placeholder={listening ? "מקשיב…" : placeholder}
        className="block max-h-[220px] min-h-14 w-full resize-none bg-transparent px-5 pb-1 pt-4 text-[18px] leading-[1.5] outline-none placeholder:text-ink-3"
      />

      <div className="flex items-center gap-1.5 px-2.5 pb-2.5">
        <div className="relative">
          <button
            type="button"
            aria-label="צירוף"
            onClick={() => setMenu((m) => !m)}
            className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors duration-200 ${menu ? "bg-brand-tint text-brand" : "text-ink-2 hover:bg-surface-2"}`}
          >
            <Plus className={`h-5 w-5 transition-transform duration-300 ${menu ? "rotate-45" : ""}`} strokeWidth={2} />
          </button>
          {menu && (
            <div className="card rise absolute bottom-12 start-0 z-30 w-60 p-1.5" onMouseLeave={() => setMenu(false)}>
              <button
                type="button"
                onClick={() => {
                  setMenu(false);
                  fileInput.current?.click();
                }}
                className="flex w-full items-center gap-3 rounded-[12px] px-3 py-2.5 text-start text-[15px] hover:bg-surface-2"
              >
                <span className="icon-chip h-8 w-8 rounded-[10px]">
                  <Paperclip className="h-4 w-4" />
                </span>
                קבצים ותמונות
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenu(false);
                  cameraInput.current?.click();
                }}
                className="flex w-full items-center gap-3 rounded-[12px] px-3 py-2.5 text-start text-[15px] hover:bg-surface-2"
              >
                <span className="icon-chip h-8 w-8 rounded-[10px]">
                  <Camera className="h-4 w-4" />
                </span>
                צילום
              </button>
            </div>
          )}
        </div>
        <input ref={fileInput} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => e.target.files && addFiles(e.target.files)} />
        <input ref={cameraInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => e.target.files && addFiles(e.target.files)} />

        <div className="ms-auto flex items-center gap-1.5">
          {canDictate && (
            <button
              type="button"
              aria-label={listening ? "עצירת הקלטה" : "הקלטה"}
              onClick={toggleDictation}
              className={`relative flex h-10 w-10 items-center justify-center rounded-full transition-colors duration-200 ${
                listening ? "bg-brand-tint text-brand" : "text-ink-2 hover:bg-surface-2"
              }`}
            >
              {listening && <span className="absolute inset-0 animate-ping rounded-full bg-brand/20" />}
              {listening ? <Square className="h-4 w-4 fill-current" /> : <Mic className="h-5 w-5" strokeWidth={2} />}
            </button>
          )}
          <button
            type="button"
            onClick={submit}
            disabled={!canSend}
            aria-label="שליחה"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-brand text-on-brand transition-[transform,opacity,background-color] duration-200 ease-[var(--ease)] hover:opacity-90 active:scale-[0.97] disabled:bg-surface-2 disabled:text-ink-3"
          >
            <ArrowUp className="h-5 w-5" strokeWidth={2.2} />
          </button>
        </div>
      </div>
    </div>
  );
}
