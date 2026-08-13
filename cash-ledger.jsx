import React, { useState, useEffect, useMemo } from "react";
import { Plus, X, Search, Trash2, Pencil, Check, ChevronDown, ArrowDownLeft, ArrowUpRight, Wallet, Clock, RotateCcw } from "lucide-react";

const STORAGE_KEY = "entries";

const INFLOW_CATEGORIES = ["Client payment", "Owner investment", "Loan received", "Cash deposit", "Other inflow"];
const OUTFLOW_CATEGORIES = ["Travel advance (TA)", "Expense reimbursement", "Petty cash", "Salary advance", "Vendor payment", "Other outflow"];
const ADVANCE_CATEGORIES = ["Travel advance (TA)", "Salary advance"];

const money = (n) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n || 0);

const todayISO = () => new Date().toISOString().slice(0, 10);

const emptyForm = {
  id: null,
  date: todayISO(),
  type: "outflow",
  employeeName: "",
  category: OUTFLOW_CATEGORIES[0],
  amount: "",
  note: "",
  status: "settled",
};

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export default function CashLedger() {
  const [entries, setEntries] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);

  const [panelOpen, setPanelOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [employeeFilter, setEmployeeFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get(STORAGE_KEY, false);
        if (res && res.value) {
          setEntries(JSON.parse(res.value));
        }
      } catch (e) {
        // key not present yet on first run — not a real error
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const persist = async (next) => {
    setEntries(next);
    setSaving(true);
    try {
      await window.storage.set(STORAGE_KEY, JSON.stringify(next), false);
    } catch (e) {
      setLoadError(true);
    } finally {
      setSaving(false);
    }
  };

  const employees = useMemo(() => {
    const names = new Set(entries.map((e) => e.employeeName).filter(Boolean));
    return Array.from(names).sort();
  }, [entries]);

  // chronological order (oldest first) for running balance
  const chronological = useMemo(() => {
    const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    let running = 0;
    return sorted.map((e) => {
      running += e.type === "inflow" ? Number(e.amount) : -Number(e.amount);
      return { ...e, balance: running };
    });
  }, [entries]);

  const withBalanceById = useMemo(() => {
    const map = new Map();
    chronological.forEach((e) => map.set(e.id, e.balance));
    return map;
  }, [chronological]);

  const totals = useMemo(() => {
    let inflow = 0,
      outflow = 0,
      pending = 0;
    entries.forEach((e) => {
      if (e.type === "inflow") inflow += Number(e.amount);
      else outflow += Number(e.amount);
      if (e.type === "outflow" && ADVANCE_CATEGORIES.includes(e.category) && e.status === "pending") {
        pending += Number(e.amount);
      }
    });
    return { inflow, outflow, net: inflow - outflow, pending };
  }, [entries]);

  const filtered = useMemo(() => {
    return chronological
      .filter((e) => {
        if (typeFilter !== "all" && e.type !== typeFilter) return false;
        if (employeeFilter !== "all" && e.employeeName !== employeeFilter) return false;
        if (dateFrom && e.date < dateFrom) return false;
        if (dateTo && e.date > dateTo) return false;
        if (search) {
          const s = search.toLowerCase();
          const hay = `${e.employeeName} ${e.note} ${e.category}`.toLowerCase();
          if (!hay.includes(s)) return false;
        }
        return true;
      })
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  }, [chronological, typeFilter, employeeFilter, dateFrom, dateTo, search]);

  const resetFilters = () => {
    setSearch("");
    setTypeFilter("all");
    setEmployeeFilter("all");
    setDateFrom("");
    setDateTo("");
  };

  const openAdd = () => {
    setForm(emptyForm);
    setFormError("");
    setPanelOpen(true);
  };

  const openEdit = (entry) => {
    setForm({ ...entry, amount: String(entry.amount) });
    setFormError("");
    setPanelOpen(true);
  };

  const closePanel = () => {
    setPanelOpen(false);
    setFormError("");
  };

  const handleTypeChange = (type) => {
    setForm((f) => ({
      ...f,
      type,
      category: type === "inflow" ? INFLOW_CATEGORIES[0] : OUTFLOW_CATEGORIES[0],
      status: "settled",
    }));
  };

  const submitForm = async (e) => {
    e.preventDefault();
    if (!form.employeeName.trim()) {
      setFormError("Enter a name — who this cash moved with.");
      return;
    }
    const amt = Number(form.amount);
    if (!form.amount || isNaN(amt) || amt <= 0) {
      setFormError("Enter an amount greater than zero.");
      return;
    }
    if (!form.date) {
      setFormError("Pick a date.");
      return;
    }

    const isAdvance = form.type === "outflow" && ADVANCE_CATEGORIES.includes(form.category);
    const payload = {
      id: form.id || uid(),
      date: form.date,
      type: form.type,
      employeeName: form.employeeName.trim(),
      category: form.category,
      amount: amt,
      note: form.note.trim(),
      status: isAdvance ? form.status || "pending" : "settled",
    };

    let next;
    if (form.id) {
      next = entries.map((en) => (en.id === form.id ? payload : en));
    } else {
      next = [...entries, payload];
    }
    await persist(next);
    setPanelOpen(false);
  };

  const doDelete = async (id) => {
    const next = entries.filter((e) => e.id !== id);
    await persist(next);
    setConfirmDeleteId(null);
  };

  const toggleSettled = async (entry) => {
    const next = entries.map((e) =>
      e.id === entry.id ? { ...e, status: e.status === "pending" ? "settled" : "pending" } : e
    );
    await persist(next);
  };

  const isAdvanceForm = form.type === "outflow" && ADVANCE_CATEGORIES.includes(form.category);
  const categoryOptions = form.type === "inflow" ? INFLOW_CATEGORIES : OUTFLOW_CATEGORIES;

  return (
    <div
      style={{ fontFamily: "'Inter', ui-sans-serif, system-ui" }}
      className="min-h-screen w-full bg-[#FAF8F2] text-[#22241F] relative"
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Source+Serif+4:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500&family=Inter:wght@400;500;600&display=swap');
        .ledger-font { font-family: 'Source Serif 4', Georgia, serif; }
        .mono-font { font-family: 'IBM Plex Mono', monospace; }
        .margin-rule { border-left: 2px solid #B9433A; }
      `}</style>

      {/* Header */}
      <div className="border-b border-[#E4DFD2] px-6 md:px-10 py-6 flex items-center justify-between gap-4 sticky top-0 bg-[#FAF8F2]/95 backdrop-blur z-20">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-sm bg-[#22241F] flex items-center justify-center flex-shrink-0">
            <Wallet size={17} className="text-[#FAF8F2]" strokeWidth={1.75} />
          </div>
          <div>
            <p className="text-[10px] tracking-[0.18em] uppercase text-[#8A8474]">Company cash</p>
            <h1 className="ledger-font text-2xl md:text-[26px] font-semibold leading-tight -mt-0.5">Cash Ledger</h1>
          </div>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-1.5 bg-[#22241F] text-[#FAF8F2] px-4 py-2.5 rounded-sm text-sm font-medium hover:bg-[#3A3D34] transition-colors"
        >
          <Plus size={16} strokeWidth={2} />
          Add entry
        </button>
      </div>

      <div className="px-6 md:px-10 py-6 max-w-6xl mx-auto">
        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <SummaryCard label="Cash in" value={money(totals.inflow)} icon={<ArrowDownLeft size={15} />} tone="green" />
          <SummaryCard label="Cash out" value={money(totals.outflow)} icon={<ArrowUpRight size={15} />} tone="rust" />
          <SummaryCard
            label="Net balance"
            value={money(totals.net)}
            icon={<Wallet size={15} />}
            tone={totals.net >= 0 ? "ink" : "rust"}
          />
          <SummaryCard label="Pending advances" value={money(totals.pending)} icon={<Clock size={15} />} tone="gold" />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="relative flex-1 min-w-[180px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9C9686]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, note, or category"
              className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-[#E4DFD2] rounded-sm outline-none focus:border-[#B9433A]"
            />
          </div>
          <SelectField value={typeFilter} onChange={setTypeFilter}>
            <option value="all">All types</option>
            <option value="inflow">Cash in</option>
            <option value="outflow">Cash out</option>
          </SelectField>
          <SelectField value={employeeFilter} onChange={setEmployeeFilter}>
            <option value="all">Everyone</option>
            {employees.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </SelectField>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="text-sm bg-white border border-[#E4DFD2] rounded-sm px-2.5 py-2 outline-none focus:border-[#B9433A]"
          />
          <span className="text-[#9C9686] text-sm">to</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="text-sm bg-white border border-[#E4DFD2] rounded-sm px-2.5 py-2 outline-none focus:border-[#B9433A]"
          />
          {(search || typeFilter !== "all" || employeeFilter !== "all" || dateFrom || dateTo) && (
            <button
              onClick={resetFilters}
              className="flex items-center gap-1 text-sm text-[#8A8474] hover:text-[#22241F] px-2 py-2"
            >
              <RotateCcw size={13} /> Clear
            </button>
          )}
        </div>

        {/* Table / empty state */}
        {!loaded ? (
          <div className="py-24 text-center text-[#9C9686] text-sm">Loading ledger…</div>
        ) : entries.length === 0 ? (
          <div className="border border-dashed border-[#E4DFD2] rounded-sm py-20 text-center margin-rule">
            <p className="ledger-font text-lg mb-1">Start your ledger</p>
            <p className="text-sm text-[#8A8474] mb-5">
              Log the first cash movement — an advance to an employee, a client payment, anything.
            </p>
            <button
              onClick={openAdd}
              className="inline-flex items-center gap-1.5 bg-[#22241F] text-[#FAF8F2] px-4 py-2.5 rounded-sm text-sm font-medium hover:bg-[#3A3D34] transition-colors"
            >
              <Plus size={16} /> Add entry
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-[#9C9686] text-sm border border-[#E4DFD2] rounded-sm">
            No entries match these filters.
          </div>
        ) : (
          <div className="border border-[#E4DFD2] rounded-sm overflow-hidden bg-white margin-rule">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-[#E4DFD2] text-left text-[11px] uppercase tracking-wide text-[#8A8474]">
                    <th className="py-2.5 px-4 font-medium">Date</th>
                    <th className="py-2.5 px-4 font-medium">Employee</th>
                    <th className="py-2.5 px-4 font-medium">Category</th>
                    <th className="py-2.5 px-4 font-medium">Note</th>
                    <th className="py-2.5 px-4 font-medium text-right">Amount</th>
                    <th className="py-2.5 px-4 font-medium text-right">Balance</th>
                    <th className="py-2.5 px-4 font-medium">Status</th>
                    <th className="py-2.5 px-4 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((e, i) => {
                    const isAdvance = e.type === "outflow" && ADVANCE_CATEGORIES.includes(e.category);
                    const balance = withBalanceById.get(e.id) ?? 0;
                    return (
                      <tr
                        key={e.id}
                        className={`border-b border-[#F0ECE1] last:border-b-0 ${i % 2 === 1 ? "bg-[#FBFAF6]" : ""}`}
                      >
                        <td className="py-2.5 px-4 mono-font text-[13px] text-[#5B5748] whitespace-nowrap">{e.date}</td>
                        <td className="py-2.5 px-4 font-medium whitespace-nowrap">{e.employeeName}</td>
                        <td className="py-2.5 px-4 text-[#5B5748] whitespace-nowrap">{e.category}</td>
                        <td className="py-2.5 px-4 text-[#5B5748] max-w-[220px] truncate">{e.note || "—"}</td>
                        <td
                          className={`py-2.5 px-4 mono-font text-right whitespace-nowrap ${
                            e.type === "inflow" ? "text-[#2F6B4F]" : "text-[#B9433A]"
                          }`}
                        >
                          {e.type === "inflow" ? "+" : "−"}
                          {money(e.amount)}
                        </td>
                        <td className="py-2.5 px-4 mono-font text-right whitespace-nowrap text-[#22241F]">
                          {money(balance)}
                        </td>
                        <td className="py-2.5 px-4 whitespace-nowrap">
                          {isAdvance ? (
                            <button
                              onClick={() => toggleSettled(e)}
                              className={`text-[11px] font-medium px-2 py-1 rounded-sm border transition-colors ${
                                e.status === "pending"
                                  ? "bg-[#FBF1DC] text-[#8A6414] border-[#EBD9A9] hover:bg-[#F5E7C4]"
                                  : "bg-[#EAF2ED] text-[#2F6B4F] border-[#CFE3D6] hover:bg-[#DDECE2]"
                              }`}
                            >
                              {e.status === "pending" ? "Pending" : "Settled"}
                            </button>
                          ) : (
                            <span className="text-[11px] text-[#B7B2A2]">—</span>
                          )}
                        </td>
                        <td className="py-2.5 px-4">
                          <div className="flex items-center justify-end gap-1">
                            {confirmDeleteId === e.id ? (
                              <>
                                <button
                                  onClick={() => doDelete(e.id)}
                                  className="text-[11px] font-medium text-[#FAF8F2] bg-[#B9433A] px-2 py-1 rounded-sm"
                                >
                                  Delete
                                </button>
                                <button
                                  onClick={() => setConfirmDeleteId(null)}
                                  className="text-[11px] text-[#8A8474] px-2 py-1"
                                >
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={() => openEdit(e)}
                                  className="p-1.5 text-[#8A8474] hover:text-[#22241F] hover:bg-[#F0ECE1] rounded-sm"
                                  aria-label="Edit entry"
                                >
                                  <Pencil size={14} />
                                </button>
                                <button
                                  onClick={() => setConfirmDeleteId(e.id)}
                                  className="p-1.5 text-[#8A8474] hover:text-[#B9433A] hover:bg-[#F0ECE1] rounded-sm"
                                  aria-label="Delete entry"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {loadError && (
          <p className="text-xs text-[#B9433A] mt-3">
            Couldn't save your last change. Check your connection and try again.
          </p>
        )}
      </div>

      {/* Add / edit panel */}
      {panelOpen && (
        <div className="fixed inset-0 z-30 flex justify-end">
          <div className="absolute inset-0 bg-[#22241F]/30" onClick={closePanel} />
          <form
            onSubmit={submitForm}
            className="relative w-full max-w-md bg-[#FAF8F2] h-full overflow-y-auto border-l border-[#E4DFD2] p-6 md:p-8"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="ledger-font text-xl font-semibold">{form.id ? "Edit entry" : "New entry"}</h2>
              <button type="button" onClick={closePanel} className="p-1.5 text-[#8A8474] hover:text-[#22241F]">
                <X size={18} />
              </button>
            </div>

            {/* Type toggle */}
            <div className="flex gap-2 mb-5">
              <TypeButton active={form.type === "outflow"} tone="rust" onClick={() => handleTypeChange("outflow")}>
                <ArrowUpRight size={14} /> Cash out
              </TypeButton>
              <TypeButton active={form.type === "inflow"} tone="green" onClick={() => handleTypeChange("inflow")}>
                <ArrowDownLeft size={14} /> Cash in
              </TypeButton>
            </div>

            <Field label="Date">
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                className="w-full px-3 py-2.5 text-sm bg-white border border-[#E4DFD2] rounded-sm outline-none focus:border-[#B9433A]"
              />
            </Field>

            <Field label={form.type === "inflow" ? "Received from" : "Paid to / employee"}>
              <input
                list="employee-list"
                value={form.employeeName}
                onChange={(e) => setForm((f) => ({ ...f, employeeName: e.target.value }))}
                placeholder="e.g. Priya Sharma"
                className="w-full px-3 py-2.5 text-sm bg-white border border-[#E4DFD2] rounded-sm outline-none focus:border-[#B9433A]"
              />
              <datalist id="employee-list">
                {employees.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </Field>

            <Field label="Category">
              <div className="relative">
                <select
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  className="w-full appearance-none px-3 py-2.5 text-sm bg-white border border-[#E4DFD2] rounded-sm outline-none focus:border-[#B9433A] pr-8"
                >
                  {categoryOptions.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9C9686] pointer-events-none" />
              </div>
            </Field>

            <Field label="Amount (₹)">
              <input
                type="number"
                min="0"
                step="1"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                placeholder="0"
                className="w-full px-3 py-2.5 text-sm mono-font bg-white border border-[#E4DFD2] rounded-sm outline-none focus:border-[#B9433A]"
              />
            </Field>

            <Field label="Note (optional)">
              <textarea
                value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                placeholder="What's this for?"
                rows={2}
                className="w-full px-3 py-2.5 text-sm bg-white border border-[#E4DFD2] rounded-sm outline-none focus:border-[#B9433A] resize-none"
              />
            </Field>

            {isAdvanceForm && (
              <Field label="Settlement status">
                <div className="flex gap-2">
                  <TypeButton
                    small
                    active={form.status !== "settled"}
                    tone="gold"
                    onClick={() => setForm((f) => ({ ...f, status: "pending" }))}
                  >
                    Pending
                  </TypeButton>
                  <TypeButton
                    small
                    active={form.status === "settled"}
                    tone="green"
                    onClick={() => setForm((f) => ({ ...f, status: "settled" }))}
                  >
                    <Check size={13} /> Settled
                  </TypeButton>
                </div>
              </Field>
            )}

            {formError && <p className="text-sm text-[#B9433A] mb-4">{formError}</p>}

            <div className="flex gap-2 mt-6">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 bg-[#22241F] text-[#FAF8F2] px-4 py-2.5 rounded-sm text-sm font-medium hover:bg-[#3A3D34] transition-colors disabled:opacity-60"
              >
                {form.id ? "Save changes" : "Add entry"}
              </button>
              <button
                type="button"
                onClick={closePanel}
                className="px-4 py-2.5 rounded-sm text-sm font-medium text-[#5B5748] border border-[#E4DFD2] hover:bg-[#F0ECE1]"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, icon, tone }) {
  const tones = {
    green: "text-[#2F6B4F]",
    rust: "text-[#B9433A]",
    gold: "text-[#8A6414]",
    ink: "text-[#22241F]",
  };
  return (
    <div className="bg-white border border-[#E4DFD2] rounded-sm p-4">
      <div className={`flex items-center gap-1.5 mb-2 ${tones[tone]}`}>
        {icon}
        <p className="text-[11px] uppercase tracking-wide text-[#8A8474]">{label}</p>
      </div>
      <p className={`ledger-font text-xl font-semibold ${tones[tone]}`}>{value}</p>
    </div>
  );
}

function SelectField({ value, onChange, children }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none text-sm bg-white border border-[#E4DFD2] rounded-sm pl-3 pr-7 py-2 outline-none focus:border-[#B9433A]"
      >
        {children}
      </select>
      <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#9C9686] pointer-events-none" />
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="mb-4">
      <label className="block text-xs font-medium text-[#5B5748] mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function TypeButton({ active, tone, onClick, children, small }) {
  const tones = {
    rust: active ? "bg-[#B9433A] text-[#FAF8F2] border-[#B9433A]" : "bg-white text-[#5B5748] border-[#E4DFD2]",
    green: active ? "bg-[#2F6B4F] text-[#FAF8F2] border-[#2F6B4F]" : "bg-white text-[#5B5748] border-[#E4DFD2]",
    gold: active ? "bg-[#B98A2E] text-[#FAF8F2] border-[#B98A2E]" : "bg-white text-[#5B5748] border-[#E4DFD2]",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-1.5 border rounded-sm font-medium transition-colors ${
        small ? "text-xs py-1.5" : "text-sm py-2.5"
      } ${tones[tone]}`}
    >
      {children}
    </button>
  );
}
