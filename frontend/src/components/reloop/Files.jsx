import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { FileText, Loader2, Upload, X, Camera } from "lucide-react";
import { api, formatApiError } from "@/lib/api";

export async function uploadFile(category, file) {
  const fd = new FormData();
  fd.append("category", category);
  fd.append("file", file);
  const { data } = await api.post("/files/upload", fd);
  return data;
}

export const AuthImage = ({ file, className = "h-20 w-20", testId }) => {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let objectUrl;
    let alive = true;
    api.get(`/files/${file.id}`, { responseType: "blob" }).then((r) => {
      objectUrl = URL.createObjectURL(r.data);
      if (alive) setUrl(objectUrl);
    }).catch(() => {});
    return () => { alive = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [file.id]);
  const isPdf = file.content_type === "application/pdf";
  return (
    <button type="button" data-testid={testId} onClick={() => url && window.open(url, "_blank")}
      className={`${className} grid shrink-0 place-items-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50`}>
      {!url ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : isPdf ? <FileText className="h-6 w-6 text-slate-500" /> : <img src={url} alt={file.original_filename} className="h-full w-full object-cover" />}
    </button>
  );
};

export const FileField = ({ category, label, hint, value, onChange, capture, testId }) => {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  const pick = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setBusy(true);
    try {
      onChange(await uploadFile(category, f));
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setBusy(false);
    }
  };
  const Icon = capture ? Camera : Upload;
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 p-4" data-testid={`${testId}-field`}>
      <p className="text-sm font-semibold text-slate-800">{label}</p>
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
      <div className="mt-3 flex items-center gap-3">
        {value && <AuthImage file={value} className="h-16 w-16" testId={`${testId}-preview`} />}
        <input ref={ref} type="file" accept={capture ? "image/*" : "image/*,application/pdf"} capture={capture} onChange={pick} className="hidden" data-testid={`${testId}-input`} />
        <button type="button" onClick={() => ref.current?.click()} disabled={busy} data-testid={`${testId}-btn`}
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />} {value ? "Replace" : capture ? "Take / Upload" : "Upload"}
        </button>
      </div>
    </div>
  );
};

export const PhotoPicker = ({ value, onChange, max = 5 }) => {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  const pick = async (e) => {
    const files = [...(e.target.files || [])].slice(0, max - value.length);
    e.target.value = "";
    if (!files.length) return;
    setBusy(true);
    const added = [];
    for (const f of files) {
      try {
        added.push(await uploadFile("scrap", f));
      } catch (err) {
        toast.error(`${f.name}: ${formatApiError(err)}`);
      }
    }
    onChange([...value, ...added]);
    setBusy(false);
  };
  return (
    <div data-testid="scrap-photo-picker">
      <div className="flex flex-wrap gap-3">
        {value.map((f) => (
          <div key={f.id} className="relative">
            <AuthImage file={f} testId={`scrap-photo-${f.id}`} />
            <button type="button" aria-label="Remove photo" data-testid={`remove-photo-${f.id}`} onClick={() => onChange(value.filter((x) => x.id !== f.id))}
              className="absolute -right-2 -top-2 grid h-6 w-6 place-items-center rounded-full bg-slate-950 text-white"><X className="h-3 w-3" /></button>
          </div>
        ))}
        {value.length < max && (
          <button type="button" onClick={() => ref.current?.click()} disabled={busy} data-testid="add-scrap-photo-btn"
            className="grid h-20 w-20 place-items-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-slate-500 hover:border-emerald-500 hover:text-emerald-600">
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
          </button>
        )}
      </div>
      <input ref={ref} type="file" accept="image/*" multiple onChange={pick} className="hidden" data-testid="scrap-photo-input" />
      <p className="mt-2 text-xs text-slate-500">Up to {max} photos · JPG/PNG/WEBP · max 5 MB each</p>
    </div>
  );
};
