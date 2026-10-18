import { useState } from "react";
import { format, parse } from "date-fns";
import { CalendarDays, X } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { slug } from "@/lib/format";

export const UiSelect = ({ value, onChange, options, placeholder = "Select", testId, className = "", disabled }) => {
  const opts = options.map((o) => (typeof o === "string" ? { value: o, label: o } : o)).filter((o) => o.value !== "");
  return (
    <Select value={value ? String(value) : ""} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger data-testid={testId} className={`h-10 rounded-xl border-slate-200 bg-white text-sm focus:ring-emerald-500/30 ${className}`}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {opts.map((o) => <SelectItem key={o.value} value={String(o.value)} data-testid={`${testId}-option-${slug(o.value)}`}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
};

export const DatePicker = ({ value, onChange, placeholder = "Pick a date", testId, className = "", fromDate, toDate }) => {
  const [open, setOpen] = useState(false);
  const date = value ? parse(value, "yyyy-MM-dd", new Date()) : undefined;
  const pick = (d) => {
    onChange(d ? format(d, "yyyy-MM-dd") : "");
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" data-testid={testId} className={`flex h-10 w-full items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-left text-sm transition-colors hover:border-slate-300 ${value ? "text-slate-900" : "text-slate-400"} ${className}`}>
          <CalendarDays className="h-4 w-4 shrink-0 text-slate-400" />
          <span className="truncate">{date ? format(date, "dd MMM yyyy") : placeholder}</span>
          {value && <X className="ml-auto h-3.5 w-3.5 shrink-0 text-slate-400 hover:text-slate-700" data-testid={`${testId}-clear`} onClick={(e) => { e.stopPropagation(); onChange(""); }} />}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar mode="single" selected={date} onSelect={pick} fromDate={fromDate} toDate={toDate} initialFocus />
      </PopoverContent>
    </Popover>
  );
};

export const toDate = (s) => (s ? parse(s, "yyyy-MM-dd", new Date()) : undefined);
