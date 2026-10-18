import { useState } from "react";
import { Download, Languages } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { FLOW, GUIDES, manualText } from "@/lib/guides";
import { ROLE_LABELS } from "@/lib/menu";
import { btnGhost, btnPrimary } from "@/lib/format";
import { Panel, PageHeader } from "@/components/reloop/Primitives";

const download = (lang) => {
  const blob = new Blob(["\ufeff" + manualText(lang)], { type: "text/plain;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `ReLoop-User-Manual-${lang === "ta" ? "Tamil" : "English"}.txt`;
  document.body.appendChild(a);
  a.click();
  a.remove();
};

export default function HelpView() {
  const { user } = useAuth();
  const [lang, setLang] = useState("en");
  const [role, setRole] = useState(user.role);
  const flow = FLOW[lang];
  const guide = GUIDES[role][lang];

  return (
    <div className="space-y-6">
      <PageHeader title={lang === "ta" ? "உதவி & வழிகாட்டி" : "Help & User Guide"} subtitle={lang === "ta" ? "ஒவ்வொரு பயனருக்கான படிப்படியான கையேடு" : "Step-by-step manual for every user type."}>
        <button type="button" className={btnGhost} onClick={() => setLang(lang === "en" ? "ta" : "en")} data-testid="help-language-toggle">
          <Languages className="h-4 w-4" /> {lang === "en" ? "தமிழ்" : "English"}
        </button>
        <button type="button" className={btnPrimary} onClick={() => download(lang)} data-testid="download-manual-btn"><Download className="h-4 w-4" /> Download Manual</button>
      </PageHeader>

      <Panel title={flow.title} testId="help-flow-panel">
        <ol className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {flow.steps.map(([t, d], i) => (
            <li key={t} className="rounded-xl border border-slate-100 bg-slate-50/60 p-4" data-testid={`help-flow-step-${i + 1}`}>
              <p className="font-mono text-xs font-bold text-emerald-600">STEP {String(i + 1).padStart(2, "0")}</p>
              <p className="mt-1 text-sm font-bold text-slate-900">{t}</p>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">{d}</p>
            </li>
          ))}
        </ol>
      </Panel>

      <Panel title={guide.title} subtitle={lang === "ta" ? "பயனர் வகையை தேர்வு செய்யவும்" : "Choose a user type"} testId="help-role-guide"
        actions={<div className="flex flex-wrap gap-1.5">{Object.keys(GUIDES).map((r) => (
          <button key={r} type="button" onClick={() => setRole(r)} data-testid={`help-role-tab-${r}`}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${role === r ? "bg-slate-950 text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>{ROLE_LABELS[r]}</button>
        ))}</div>}>
        <ol className="space-y-3">
          {guide.steps.map((s, i) => (
            <li key={i} className="flex gap-3">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-emerald-50 font-mono text-xs font-bold text-emerald-700">{i + 1}</span>
              <p className="pt-0.5 text-sm leading-relaxed text-slate-700">{s}</p>
            </li>
          ))}
        </ol>
      </Panel>
    </div>
  );
}
