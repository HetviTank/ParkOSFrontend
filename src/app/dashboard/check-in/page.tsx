"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Truck as TruckIcon, User, MapPin, Clock, Search, Check,
  AlertCircle, Loader2, CheckCircle2, ChevronRight,
  Car, FileText, IndianRupee, Info, ChevronDown, X as XIcon,
  BookOpen, Calendar, IndianRupee as RupeeIcon, ShieldX,
} from "lucide-react";

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

// ── helpers ───────────────────────────────────────────────────────────────────
function getToken(): string {
  return typeof window !== "undefined" ? localStorage.getItem("token") ?? "" : "";
}

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json", token, ...(opts?.headers ?? {}) },
    ...opts,
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({ detail: "Request failed" }));
    throw new Error((e as { detail?: string }).detail ?? "Request failed");
  }
  return res.json() as Promise<T>;
}

function todayStr() {
  return new Date().toISOString().split("T")[0];
}
function nowTimeStr() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
const fmt = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

// ── local types ───────────────────────────────────────────────────────────────
interface TruckItem  { id: string; truck_number: string; truck_type: string; owner_id: string | null }
interface OwnerItem  { id: string; name: string; primary_mobile: string; company: string | null; alternate_mobile: string | null }
interface LocItem    { id: string; name: string; city: string | null }
interface DivItem    { id: string; name: string; truck_type: string; rate_per_day: number; gst_percent: number | null; status: string }
interface SlotItem   { id: string; code: string; status: string }
interface KhataItem  { id: string; owner_id: string; monthly_rate: number; billing_day: number; grace_days: number; is_active: boolean }

const TRUCK_TYPES   = ["Heavy (20T+)", "Heavy (10-20T)", "Medium (5-10T)", "Light (<5T)", "Trailer", "Tanker"];
const ID_PROOFS: Record<string, string> = {
  aadhaar: "Aadhaar Card", pan: "PAN Card",
  driving_license: "Driving License", passport: "Passport", voter_id: "Voter ID",
};
const STEPS = [
  { n: 1, label: "Truck & owner" },
  { n: 2, label: "Driver"        },
  { n: 3, label: "Slot assignment"},
  { n: 4, label: "Confirm"       },
];

// ── main component ────────────────────────────────────────────────────────────
export default function CheckInPage() {
  const router = useRouter();
  const [toast, setToast] = useState<{ truck: string } | null>(null);

  // ── truck search
  const [truckNumber,   setTruckNumber]   = useState("");
  const [truckId,       setTruckId]       = useState<string | null>(null);
  const [truckFound,    setTruckFound]    = useState<boolean | null>(null);
  const [truckType,     setTruckType]     = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const searchRef = useRef<ReturnType<typeof setTimeout>>(null);

  // ── owner
  const [ownerId,        setOwnerId]       = useState<string | null>(null);
  const [ownerName,      setOwnerName]     = useState("");
  const [ownerMobile,    setOwnerMobile]   = useState("");
  const [ownerCompany,   setOwnerCompany]  = useState("");
  const [ownerAlternate, setOwnerAlt]      = useState("");

  // ── entry type
  const [entryType, setEntryType] = useState<"regular" | "khata">("regular");

  // ── khata
  const [khatas,      setKhatas]      = useState<KhataItem[]>([]);
  const [khataId,     setKhataId]     = useState("");
  const [khataLoading,setKhataLoading]= useState(false);
  const [ownerNames,  setOwnerNames]  = useState<Record<string, string>>({});
  const ownerCache = useRef<Record<string, OwnerItem>>({});

  // ── driver
  const [driverName,   setDriverName]   = useState("");
  const [driverMobile, setDriverMobile] = useState("");
  const [driverLic,    setDriverLic]    = useState("");
  const [idProofType,  setIdProofType]  = useState("aadhaar");
  const [remarks,      setRemarks]      = useState("");

  // ── location / division / slot
  const [locations,  setLocations]  = useState<LocItem[]>([]);
  const [locationId, setLocationId] = useState("");
  const [divisions,  setDivisions]  = useState<DivItem[]>([]);
  const [divisionId, setDivisionId] = useState("");
  const [slots,      setSlots]      = useState<SlotItem[]>([]);
  const [slotId,     setSlotId]     = useState("");
  const [divLoading, setDivLoading] = useState(false);
  const [slotLoading,setSlotLoading]= useState(false);

  const selectedDiv  = divisions.find((d) => d.id === divisionId) ?? null;
  const selectedSlot = slots.find((s) => s.id === slotId) ?? null;
  const ratePerDay   = selectedDiv?.rate_per_day ?? 0;
  const gstPct       = selectedDiv?.gst_percent ?? 18;
  const gstAmt       = ratePerDay * gstPct / 100;
  const estPerDay    = ratePerDay + gstAmt;

  // ── check-in time
  const [checkInDate, setCheckInDate] = useState(todayStr());
  const [checkInTime, setCheckInTime] = useState(nowTimeStr());

  // ── blacklist
  const [showBlacklisted, setShowBlacklisted] = useState(false);
  const [blacklistReason,  setBlacklistReason]  = useState("");

  // ── submit
  const [submitting, setSubmitting]   = useState(false);
  const [submitError, setSubmitError] = useState("");

  // ── load khatas when entry type switches to khata
  useEffect(() => {
    if (entryType !== "khata") return;
    setKhataLoading(true);
    apiFetch<{ count: number; list: KhataItem[] }>("/khatas?limit=100")
      .then(async (r) => {
        const list = (r.list ?? []).filter(k => k.is_active);
        setKhatas(list);
        // enrich owner names + cache full owner objects
        const uniqueIds = [...new Set(list.map(k => k.owner_id))];
        const names: Record<string, string> = {};
        await Promise.all(uniqueIds.map(async (id) => {
          try {
            const o = await apiFetch<OwnerItem>(`/owners/${id}`);
            names[id] = o.name;
            ownerCache.current[id] = o;
          } catch { /* ignore */ }
        }));
        setOwnerNames(names);
        // auto-select khata if current owner already has one
        if (ownerId) {
          const match = list.find(k => k.owner_id === ownerId);
          if (match) setKhataId(match.id);
        }
      })
      .catch(() => {})
      .finally(() => setKhataLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryType]);

  // ── auto-fill owner fields when a khata is selected
  useEffect(() => {
    if (!khataId) return;
    const khata = khatas.find(k => k.id === khataId);
    if (!khata) return;
    const cached = ownerCache.current[khata.owner_id];
    if (cached) {
      setOwnerId(cached.id);
      setOwnerName(cached.name);
      setOwnerMobile(cached.primary_mobile);
      setOwnerCompany(cached.company ?? "");
      setOwnerAlt(cached.alternate_mobile ?? "");
    } else {
      // not cached yet — fetch on-demand
      apiFetch<OwnerItem>(`/owners/${khata.owner_id}`).then(o => {
        ownerCache.current[o.id] = o;
        setOwnerId(o.id);
        setOwnerName(o.name);
        setOwnerMobile(o.primary_mobile);
        setOwnerCompany(o.company ?? "");
        setOwnerAlt(o.alternate_mobile ?? "");
      }).catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [khataId]);

  // ── load locations on mount
  useEffect(() => {
    apiFetch<{ list: LocItem[] }>("/locations?limit=100")
      .then((r) => {
        setLocations(r.list);
        if (r.list.length === 1) setLocationId(r.list[0].id);
      })
      .catch(() => {});
  }, []);

  // ── load divisions when location changes
  useEffect(() => {
    if (!locationId) { setDivisions([]); setDivisionId(""); return; }
    setDivLoading(true);
    apiFetch<{ list: DivItem[] }>(`/divisions?location_id=${locationId}&limit=100`)
      .then((r) => { setDivisions(r.list); setDivisionId(""); setSlots([]); setSlotId(""); })
      .catch(() => {})
      .finally(() => setDivLoading(false));
  }, [locationId]);

  // ── load free slots when division changes
  useEffect(() => {
    if (!divisionId) { setSlots([]); setSlotId(""); return; }
    setSlotLoading(true);
    apiFetch<{ list: SlotItem[] }>(`/slots?division_id=${divisionId}&status=free&limit=200`)
      .then((r) => { setSlots(r.list); setSlotId(""); })
      .catch(() => {})
      .finally(() => setSlotLoading(false));
  }, [divisionId]);

  // ── debounced truck search
  const searchTruck = useCallback((number: string) => {
    if (searchRef.current) clearTimeout(searchRef.current);
    if (!number.trim()) { setTruckFound(null); setTruckId(null); return; }
    searchRef.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        // ── blacklist check first ──────────────────────────────────────────
        const blRes = await apiFetch<{ list: { truck_number: string; reason: string; is_active: boolean }[] }>(
          `/blacklists?search=${encodeURIComponent(number)}&limit=10`
        ).catch(() => ({ list: [] }));
        const blEntry = blRes.list?.find(
          b => b.is_active && b.truck_number.toUpperCase() === number.trim().toUpperCase()
        );
        if (blEntry) {
          setBlacklistReason(blEntry.reason || "No reason provided.");
          setShowBlacklisted(true);
          setTruckFound(null); setTruckId(null);
          return;
        }

        const r = await apiFetch<{ list: TruckItem[] }>(`/trucks?search=${encodeURIComponent(number)}&limit=5`);
        const match = r.list.find((t) => t.truck_number.toLowerCase() === number.toLowerCase());
        if (match) {
          setTruckId(match.id);
          setTruckType(match.truck_type);
          setTruckFound(true);
          if (match.owner_id) {
            const owner = await apiFetch<OwnerItem>(`/owners/${match.owner_id}`);
            setOwnerId(owner.id);
            setOwnerName(owner.name);
            setOwnerMobile(owner.primary_mobile);
            setOwnerCompany(owner.company ?? "");
            setOwnerAlt(owner.alternate_mobile ?? "");
            // auto-select khata for this owner if khata entry is active
            if (entryType === "khata" && khatas.length > 0) {
              const kMatch = khatas.find(k => k.owner_id === owner.id);
              if (kMatch) setKhataId(kMatch.id);
            }
          } else {
            setOwnerId(null);
          }
        } else {
          setTruckId(null); setTruckFound(false);
          setTruckType(""); setOwnerId(null);
          setOwnerName(""); setOwnerMobile("");
          setOwnerCompany(""); setOwnerAlt("");
        }
      } catch { setTruckFound(null); }
      finally { setSearchLoading(false); }
    }, 600);
  }, []);

  function handleTruckNumberChange(v: string) {
    setTruckNumber(v.toUpperCase());
    searchTruck(v);
  }

  // ── form submit ───────────────────────────────────────────────────────────
  async function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    setSubmitError("");

    // basic validation
    if (!truckNumber.trim()) return setSubmitError("Truck number is required.");
    if (!truckType)          return setSubmitError("Truck type is required.");
    if (!ownerName.trim())   return setSubmitError("Owner name is required.");
    if (!ownerMobile.trim()) return setSubmitError("Owner mobile is required.");
    if (!driverName.trim())  return setSubmitError("Driver name is required.");
    if (!driverMobile.trim())return setSubmitError("Driver mobile is required.");
    if (!locationId)         return setSubmitError("Location is required.");
    if (!divisionId)         return setSubmitError("Division is required.");

    // ── final blacklist guard ─────────────────────────────────────────────
    try {
      const blRes = await apiFetch<{ list: { truck_number: string; reason: string; is_active: boolean }[] }>(
        `/blacklists?search=${encodeURIComponent(truckNumber.trim())}&limit=10`
      );
      const blEntry = blRes.list?.find(
        b => b.is_active && b.truck_number.toUpperCase() === truckNumber.trim().toUpperCase()
      );
      if (blEntry) {
        setBlacklistReason(blEntry.reason || "No reason provided.");
        setShowBlacklisted(true);
        return;
      }
    } catch { /* network error — allow submit to proceed */ }

    setSubmitting(true);
    try {
      let finalTruckId = truckId;
      let finalOwnerId = ownerId;

      // create owner if new
      if (!finalOwnerId) {
        const newOwner = await apiFetch<OwnerItem>("/owners", {
          method: "POST",
          body: JSON.stringify({
            name: ownerName.trim(),
            primary_mobile: ownerMobile.trim(),
            company: ownerCompany.trim() || null,
            alternate_mobile: ownerAlternate.trim() || null,
            is_active: true,
          }),
        });
        finalOwnerId = newOwner.id;
      }

      // create truck if new
      if (!finalTruckId) {
        const newTruck = await apiFetch<TruckItem>("/trucks", {
          method: "POST",
          body: JSON.stringify({
            truck_number: truckNumber.trim().toUpperCase(),
            truck_type: truckType,
            owner_id: finalOwnerId,
          }),
        });
        finalTruckId = newTruck.id;
      }

      // combine date + time into ISO datetime
      const checkInISO = new Date(`${checkInDate}T${checkInTime}`).toISOString();

      // create parking session
      await apiFetch<{ id: string }>("/parking-sessions", {
        method: "POST",
        body: JSON.stringify({
          truck_id:            finalTruckId,
          owner_id:            finalOwnerId,
          location_id:         locationId,
          division_id:         divisionId,
          slot_id:             slotId || null,
          entry_type:          entryType,
          checkin_driver_name: driverName.trim(),
          checkin_driver_mobile: driverMobile.trim(),
          checkin_driver_licence: driverLic.trim() || null,
          checkin_id_proof_type:  idProofType,
          check_in_time:       checkInISO,
          checkin_remarks:     remarks.trim() || null,
          rate_per_day:        ratePerDay > 0 ? ratePerDay : 1,
          gst_percent:         gstPct,
        }),
      });

      // link truck to khata master if khata entry
      if (entryType === "khata" && khataId) {
        try {
          await apiFetch("/khata-trucks", {
            method: "POST",
            body: JSON.stringify({ khata_id: khataId, truck_id: finalTruckId }),
          });
        } catch { /* already linked — ignore duplicate errors */ }
      }

      // show toast then redirect to All Trucks
      const checkedTruck = truckNumber;
      setToast({ truck: checkedTruck });
      setTimeout(() => {
        setToast(null);
        router.push("/dashboard/trucks");
      }, 2500);

    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Check-in failed.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── form ──────────────────────────────────────────────────────────────────
  return (
    <div className="px-4 sm:px-6 py-6 max-w-screen-xl mx-auto space-y-5">

      {/* Page title */}
      <div>
        <div className="flex items-center gap-2 text-sm text-gray-400 mb-2">
          <Link href="/dashboard" className="hover:text-blue-600 transition">Dashboard</Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <span className="text-gray-600 font-medium">Truck Check-in</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Truck Check-in</h1>
        <p className="text-sm text-gray-400 mt-0.5">Fill in the details to register a new parking session</p>
      </div>

      {/* Step indicator */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-4">
        <div className="flex items-center">
          {STEPS.map((step, idx) => (
            <div key={step.n} className="flex items-center flex-1 last:flex-none">
              <div className="flex items-center gap-2.5 shrink-0">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  idx === 0
                    ? "bg-blue-600 text-white shadow-sm shadow-blue-200"
                    : "bg-gray-100 text-gray-400"
                }`}>
                  {step.n}
                </div>
                <span className={`text-sm font-medium hidden sm:block ${idx === 0 ? "text-blue-700" : "text-gray-400"}`}>
                  {step.label}
                </span>
              </div>
              {idx < STEPS.length - 1 && (
                <div className="flex-1 mx-3 h-px bg-gray-200 hidden sm:block" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Main form */}
      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">

          {/* ── LEFT COLUMN ── */}
          <div className="xl:col-span-3 space-y-5">

            {/* Truck & owner card */}
            <FormCard
              icon={<TruckIcon className="w-4 h-4 text-blue-600" />}
              title="Truck & owner details"
            >
              {/* Truck number */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-1">
                  <label className={labelCls}>Truck number <Required /></label>
                  <div className="relative">
                    <input
                      value={truckNumber}
                      onChange={(e) => handleTruckNumberChange(e.target.value)}
                      placeholder="e.g. GJ11AB1234"
                      className={inputCls + " pr-10 font-mono uppercase tracking-wider"}
                      maxLength={15}
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      {searchLoading && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
                      {!searchLoading && truckFound === true  && <Check className="w-4 h-4 text-emerald-500" />}
                      {!searchLoading && truckFound === false && <Search className="w-4 h-4 text-gray-400" />}
                    </div>
                  </div>
                  {truckFound === true  && <TruckBadge type="found"   text="Existing truck found" />}
                  {truckFound === false && <TruckBadge type="new"     text="New truck — will be registered" />}
                </div>

                <div>
                  <label className={labelCls}>Truck type <Required /></label>
                  <select
                    value={truckType}
                    onChange={(e) => setTruckType(e.target.value)}
                    className={selectCls}
                  >
                    <option value="">Select type…</option>
                    {TRUCK_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>

              {/* Entry type */}
              <div>
                <label className={labelCls}>Entry type</label>
                <div className="grid grid-cols-2 gap-3 mt-1">
                  {(["regular", "khata"] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setEntryType(type)}
                      className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all ${
                        entryType === type
                          ? "border-blue-500 bg-blue-50 text-blue-700"
                          : "border-gray-200 text-gray-500 hover:border-gray-300 hover:bg-gray-50"
                      }`}
                    >
                      {type === "regular"
                        ? <Car className={`w-5 h-5 mb-1 ${entryType === type ? "text-blue-600" : "text-gray-400"}`} />
                        : <FileText className={`w-5 h-5 mb-1 ${entryType === type ? "text-blue-600" : "text-gray-400"}`} />
                      }
                      <span className="text-sm font-semibold capitalize">{type === "regular" ? "Regular vehicle" : "Khata vehicle"}</span>
                      <span className={`text-xs mt-0.5 ${entryType === type ? "text-blue-500" : "text-gray-400"}`}>
                        {type === "regular" ? "Pays per visit at checkout" : "Monthly billing on account"}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Khata selector — shown only for khata entry type */}
              {entryType === "khata" && (
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center shadow-sm shadow-blue-300">
                      <BookOpen className="w-3.5 h-3.5 text-white" />
                    </div>
                    <div>
                      <p className="text-xs font-black text-blue-800 leading-tight">Khata account</p>
                      <p className="text-[11px] text-blue-500 leading-tight">Monthly billing on account</p>
                    </div>
                  </div>
                  <KhataDropdown
                    khatas={khatas}
                    khataId={khataId}
                    onSelect={setKhataId}
                    ownerNames={ownerNames}
                    loading={khataLoading}
                  />
                  {khataId && (
                    <div className="flex items-center gap-1.5 bg-blue-600 text-white text-xs font-semibold rounded-xl px-3 py-2 shadow-sm shadow-blue-300">
                      <Check className="w-3.5 h-3.5 shrink-0" />
                      Truck will be linked to this khata on check-in
                    </div>
                  )}
                  {!khataLoading && khatas.length === 0 && (
                    <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
                      <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      <p className="text-xs text-amber-700">No active khata accounts found. Create one in Khata Master first.</p>
                    </div>
                  )}
                </div>
              )}

              {/* Owner details */}
              <div className="pt-1">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Owner information</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>Owner name <Required /></label>
                    <input value={ownerName} onChange={(e) => setOwnerName(e.target.value)}
                      placeholder="Full name" className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Owner mobile <Required /></label>
                    <input value={ownerMobile} onChange={(e) => setOwnerMobile(e.target.value)}
                      placeholder="+91 XXXXX XXXXX" className={inputCls} type="tel" maxLength={15} />
                  </div>
                  <div>
                    <label className={labelCls}>Company / Firm</label>
                    <input value={ownerCompany} onChange={(e) => setOwnerCompany(e.target.value)}
                      placeholder="Firm name" className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Alternate contact</label>
                    <input value={ownerAlternate} onChange={(e) => setOwnerAlt(e.target.value)}
                      placeholder="+91 XXXXX XXXXX" className={inputCls} type="tel" maxLength={15} />
                  </div>
                </div>
              </div>
            </FormCard>

            {/* Driver card */}
            <FormCard
              icon={<User className="w-4 h-4 text-violet-600" />}
              title="Check-in driver details"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Driver name <Required /></label>
                  <input value={driverName} onChange={(e) => setDriverName(e.target.value)}
                    placeholder="Driver full name" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Driver mobile <Required /></label>
                  <input value={driverMobile} onChange={(e) => setDriverMobile(e.target.value)}
                    placeholder="+91 XXXXX XXXXX" className={inputCls} type="tel" maxLength={15} />
                </div>
                <div>
                  <label className={labelCls}>Licence number</label>
                  <input value={driverLic} onChange={(e) => setDriverLic(e.target.value)}
                    placeholder="DL number" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>ID proof type</label>
                  <select value={idProofType} onChange={(e) => setIdProofType(e.target.value)} className={selectCls}>
                    {Object.entries(ID_PROOFS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className={labelCls}>Notice / Remarks</label>
                <textarea
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  rows={3}
                  placeholder="Any instructions, damage notes, or observations about this truck..."
                  className={inputCls + " resize-none"}
                />
              </div>
            </FormCard>
          </div>

          {/* ── RIGHT COLUMN ── */}
          <div className="xl:col-span-2 space-y-4">

            {/* Location & Slot card */}
            <FormCard
              icon={<MapPin className="w-4 h-4 text-emerald-600" />}
              title="Location & slot"
            >
              <div className="space-y-3">
                <div>
                  <label className={labelCls}>Location <Required /></label>
                  <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className={selectCls}>
                    <option value="">Select location…</option>
                    {locations.map((l) => (
                      <option key={l.id} value={l.id}>{l.name}{l.city ? ` — ${l.city}` : ""}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className={labelCls}>Division <Required /></label>
                  <div className="relative">
                    <select
                      value={divisionId}
                      onChange={(e) => setDivisionId(e.target.value)}
                      disabled={!locationId || divLoading}
                      className={selectCls + (!locationId ? " opacity-50 cursor-not-allowed" : "")}
                    >
                      <option value="">{divLoading ? "Loading…" : "Select division…"}</option>
                      {divisions.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name} ({d.truck_type}, {slots.filter(s => s.status === "free").length} free)
                        </option>
                      ))}
                    </select>
                    {divLoading && <Loader2 className="absolute right-8 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-gray-400 pointer-events-none" />}
                  </div>
                </div>

                <div>
                  <label className={labelCls}>Assign slot</label>
                  <div className="relative">
                    <select
                      value={slotId}
                      onChange={(e) => setSlotId(e.target.value)}
                      disabled={!divisionId || slotLoading}
                      className={selectCls + (!divisionId ? " opacity-50 cursor-not-allowed" : "")}
                    >
                      <option value="">{slotLoading ? "Loading…" : "Auto-assign (any free slot)"}</option>
                      {slots.map((s) => (
                        <option key={s.id} value={s.id}>{s.code} — Free</option>
                      ))}
                    </select>
                    {slotLoading && <Loader2 className="absolute right-8 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-gray-400 pointer-events-none" />}
                  </div>
                </div>

                {/* Slot availability badge */}
                {selectedSlot && (
                  <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3.5 py-2.5">
                    <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                    <p className="text-sm text-emerald-700 font-medium">
                      Slot {selectedSlot.code} — {selectedDiv?.name} is available
                    </p>
                  </div>
                )}
                {divisionId && !slotId && slots.length === 0 && !slotLoading && (
                  <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 rounded-xl px-3.5 py-2.5">
                    <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                    <p className="text-sm text-rose-700 font-medium">No free slots in this division</p>
                  </div>
                )}
              </div>
            </FormCard>

            {/* Rate preview card */}
            <FormCard
              icon={<IndianRupee className="w-4 h-4 text-amber-600" />}
              title="Rate preview"
            >
              {selectedDiv ? (
                <div className="space-y-2.5">
                  <RateRow label={`${selectedDiv.name} daily rate`} value={fmt(ratePerDay)} />
                  <RateRow label={`GST (${gstPct}%)`} value={fmt(gstAmt)} />
                  <div className="border-t border-gray-100 pt-2.5">
                    <RateRow label="Est. per day" value={fmt(estPerDay)} bold />
                  </div>
                  <div className="flex items-start gap-2 bg-amber-50 rounded-xl px-3 py-2.5 mt-1">
                    <Info className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-700">Final bill calculated at checkout based on actual days parked.</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-400 text-center py-4">Select a division to see rate preview</p>
              )}
            </FormCard>

            {/* Check-in time card */}
            <FormCard
              icon={<Clock className="w-4 h-4 text-sky-600" />}
              title="Check-in time"
            >
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Date</label>
                  <input type="date" value={checkInDate} onChange={(e) => setCheckInDate(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Time</label>
                  <input type="time" value={checkInTime} onChange={(e) => setCheckInTime(e.target.value)} className={inputCls} />
                </div>
              </div>
            </FormCard>

            {/* Error */}
            {submitError && (
              <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">{submitError}</p>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-3.5 rounded-xl shadow-sm shadow-blue-200 transition text-sm"
            >
              {submitting ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Processing…</>
              ) : (
                <><CheckCircle2 className="w-4 h-4" /> Confirm check-in &amp; print token</>
              )}
            </button>
          </div>
        </div>
      </form>

      {/* ── blacklist blocked modal ───────────────────────────────────────── */}
      {showBlacklisted && typeof window !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div className="relative bg-white rounded-3xl shadow-2xl px-10 py-10 flex flex-col items-center text-center max-w-sm w-full mx-4">
            <div className="relative mb-6">
              <div className="w-24 h-24 rounded-full border-4 border-red-400 animate-ping absolute inset-0 opacity-20" />
              <div className="w-24 h-24 rounded-full border-4 border-red-300 bg-red-50 flex items-center justify-center">
                <ShieldX className="w-12 h-12 text-red-500" strokeWidth={1.5} />
              </div>
            </div>
            <h2 className="text-2xl font-extrabold text-gray-900 mb-2">Truck Blacklisted</h2>
            <p className="text-sm text-gray-500 mb-4">This truck is on the blacklist and <span className="font-semibold text-red-600">cannot be checked in</span>.</p>
            {blacklistReason && (
              <div className="w-full bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-5">
                <p className="text-xs font-semibold text-red-400 uppercase tracking-widest mb-1">Reason</p>
                <p className="text-sm text-red-700 font-medium">{blacklistReason}</p>
              </div>
            )}
            <button
              onClick={() => { setShowBlacklisted(false); setTruckNumber(""); setTruckFound(null); setTruckId(null); }}
              className="w-full py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold transition"
            >
              Understood — Go back
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* ── success modal ─────────────────────────────────────────────────── */}
      {toast && typeof window !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center">
          {/* backdrop */}
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          {/* card */}
          <div className="relative bg-white rounded-3xl shadow-2xl px-10 py-10 flex flex-col items-center text-center max-w-sm w-full mx-4 animate-in zoom-in-95 fade-in duration-300">
            {/* animated ring + icon */}
            <div className="relative mb-6">
              <div className="w-24 h-24 rounded-full border-4 border-emerald-400 animate-ping absolute inset-0 opacity-20" />
              <div className="w-24 h-24 rounded-full border-4 border-emerald-400 flex items-center justify-center">
                <CheckCircle2 className="w-12 h-12 text-emerald-500" strokeWidth={1.5} />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Check-in Successful!</h2>
            <p className="text-gray-500 text-sm leading-relaxed">
              Truck <span className="font-semibold text-gray-800">{toast.truck}</span> has been checked in successfully.
            </p>
            <p className="text-xs text-gray-400 mt-4">Redirecting to All Trucks…</p>
            {/* progress bar */}
            <div className="w-full bg-gray-100 rounded-full h-1 mt-3 overflow-hidden">
              <div className="h-1 bg-emerald-500 rounded-full animate-[shrink_2.5s_linear_forwards]" />
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// ── sub-components ────────────────────────────────────────────────────────────

function FormCard({
  icon, title, children,
}: {
  icon: React.ReactNode; title: string; children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
      <div className="flex items-center gap-2.5 pb-1 border-b border-gray-100">
        <div className="w-7 h-7 rounded-lg bg-gray-50 flex items-center justify-center border border-gray-100">
          {icon}
        </div>
        <h2 className="text-sm font-bold text-gray-800">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function RateRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={`text-sm ${bold ? "font-semibold text-gray-900" : "text-gray-500"}`}>{label}</span>
      <span className={`text-sm ${bold ? "font-bold text-blue-700 text-base" : "text-gray-800 font-medium"}`}>{value}</span>
    </div>
  );
}

function TruckBadge({ type, text }: { type: "found" | "new"; text: string }) {
  return (
    <div className={`flex items-center gap-1.5 mt-1.5 text-xs font-medium ${
      type === "found" ? "text-emerald-600" : "text-blue-500"
    }`}>
      {type === "found"
        ? <Check className="w-3.5 h-3.5" />
        : <Search className="w-3.5 h-3.5" />}
      {text}
    </div>
  );
}

function Required() {
  return <span className="text-red-400 ml-0.5">*</span>;
}

// ── shared class strings ──────────────────────────────────────────────────────
const labelCls = "block text-xs font-semibold text-gray-600 mb-1.5";
const inputCls  =
  "w-full px-3.5 py-2.5 text-sm text-gray-900 bg-gray-50 border border-gray-200 " +
  "rounded-xl placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 " +
  "focus:border-transparent focus:bg-white transition";
const selectCls =
  "w-full px-3.5 py-2.5 text-sm text-gray-900 bg-gray-50 border border-gray-200 " +
  "rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent " +
  "focus:bg-white transition appearance-none cursor-pointer";

// ── KhataDropdown (defined here to avoid forward-reference issues) ─────────────
interface KhataDropdownProps {
  khatas: KhataItem[];
  khataId: string;
  onSelect: (id: string) => void;
  ownerNames: Record<string, string>;
  loading: boolean;
}

function KhataDropdown({ khatas, khataId, onSelect, ownerNames, loading }: KhataDropdownProps) {
  const [open,   setOpen]   = useState(false);
  const [search, setSearch] = useState("");
  const [rect,   setRect]   = useState<DOMRect | null>(null);
  const btnRef   = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = khatas.find(k => k.id === khataId) ?? null;

  function openDropdown() {
    if (btnRef.current) setRect(btnRef.current.getBoundingClientRect());
    setOpen(true);
    setSearch("");
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  // reposition on scroll/resize instead of closing
  useEffect(() => {
    if (!open) return;
    function reposition() {
      if (btnRef.current) setRect(btnRef.current.getBoundingClientRect());
    }
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open]);

  // click-outside to close
  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        btnRef.current  && !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  const filtered = khatas.filter(k => {
    const name = (ownerNames[k.owner_id] ?? "").toLowerCase();
    const q    = search.toLowerCase();
    return name.includes(q) || String(k.monthly_rate).includes(q);
  });

  // compute portal position: open below button, flip up if needed
  const panelStyle: React.CSSProperties = rect ? {
    position:  "fixed",
    left:       rect.left,
    width:      rect.width,
    zIndex:     9999,
    ...(rect.bottom + 320 > window.innerHeight
      ? { bottom: window.innerHeight - rect.top + 4 }
      : { top: rect.bottom + 4 }),
  } : { display: "none" };

  return (
    <>
      {/* trigger button */}
      <button
        ref={btnRef}
        type="button"
        onClick={() => open ? setOpen(false) : openDropdown()}
        disabled={loading}
        className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl border-2 text-sm font-medium transition-all
          ${open
            ? "border-blue-500 bg-white shadow-lg shadow-blue-100"
            : khataId
            ? "border-blue-300 bg-white"
            : "border-dashed border-blue-300 bg-white/70 hover:bg-white hover:border-blue-400"
          }`}
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin text-blue-400 shrink-0" />
        ) : (
          <BookOpen className={`w-4 h-4 shrink-0 ${khataId ? "text-blue-600" : "text-blue-300"}`} />
        )}

        <span className={`flex-1 text-left truncate ${khataId ? "text-gray-900 font-semibold" : "text-gray-400"}`}>
          {loading
            ? "Loading khata accounts…"
            : selected
            ? `${ownerNames[selected.owner_id] ?? "Unknown"} — ₹${selected.monthly_rate.toLocaleString("en-IN")}/mo`
            : "Select khata account…"}
        </span>

        {/* clear button */}
        {khataId && !loading && (
          <span
            role="button"
            onClick={(e) => { e.stopPropagation(); onSelect(""); setOpen(false); }}
            className="p-0.5 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 transition shrink-0"
          >
            <XIcon className="w-3.5 h-3.5" />
          </span>
        )}

        {!khataId && !loading && (
          <ChevronDown className={`w-4 h-4 text-blue-300 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
        )}
      </button>

      {/* portal panel */}
      {open && typeof window !== "undefined" && createPortal(
        <div ref={panelRef} style={panelStyle}
          className="bg-white rounded-2xl border border-gray-200 shadow-2xl shadow-gray-200/80 overflow-hidden">

          {/* search bar */}
          <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-gray-100 bg-gray-50/80">
            <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <input
              ref={inputRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by owner or amount…"
              className="flex-1 text-xs bg-transparent outline-none text-gray-700 placeholder-gray-400"
            />
            {search && (
              <button type="button" onClick={() => setSearch("")}
                className="text-gray-300 hover:text-gray-600 transition">
                <XIcon className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* list */}
          <ul className="max-h-60 overflow-y-auto py-1.5">
            {filtered.length === 0 && (
              <li className="px-4 py-6 text-center text-xs text-gray-400">
                {khatas.length === 0 ? "No active khata accounts" : "No results match your search"}
              </li>
            )}
            {filtered.map(k => {
              const ownerName = ownerNames[k.owner_id] ?? `Account ${k.id.slice(0, 6)}`;
              const isSelected = k.id === khataId;
              const initials   = ownerName.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
              return (
                <li key={k.id}>
                  <button
                    type="button"
                    onClick={() => { onSelect(k.id); setOpen(false); }}
                    className={`w-full flex items-center gap-3 px-3.5 py-3 text-left transition
                      ${isSelected ? "bg-blue-50" : "hover:bg-gray-50"}`}
                  >
                    {/* avatar */}
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-black shrink-0 shadow-sm
                      ${isSelected ? "bg-blue-600 text-white" : "bg-gradient-to-br from-blue-100 to-indigo-100 text-blue-700"}`}>
                      {initials}
                    </div>

                    {/* info */}
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold truncate ${isSelected ? "text-blue-700" : "text-gray-900"}`}>
                        {ownerName}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="flex items-center gap-0.5 text-[11px] text-gray-400">
                          <RupeeIcon className="w-2.5 h-2.5" />
                          {k.monthly_rate.toLocaleString("en-IN")}/mo
                        </span>
                        <span className="text-gray-200">·</span>
                        <span className="flex items-center gap-0.5 text-[11px] text-gray-400">
                          <Calendar className="w-2.5 h-2.5" />
                          Bills on day {k.billing_day}
                        </span>
                        <span className="text-gray-200">·</span>
                        <span className="text-[11px] text-gray-400">{k.grace_days}d grace</span>
                      </div>
                    </div>

                    {isSelected && (
                      <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center shrink-0">
                        <Check className="w-3 h-3 text-white" />
                      </div>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>

          {/* footer count */}
          <div className="px-4 py-2 border-t border-gray-100 bg-gray-50/60">
            <p className="text-[11px] text-gray-400">
              {filtered.length} of {khatas.length} account{khatas.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
