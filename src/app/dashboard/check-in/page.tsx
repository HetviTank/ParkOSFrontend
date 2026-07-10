"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Truck as TruckIcon, User, MapPin, Clock, Search, Check,
  AlertCircle, Loader2, ChevronRight,
  Car, FileText, IndianRupee, Info, ChevronDown, X as XIcon,
  BookOpen, Calendar, IndianRupee as RupeeIcon, ShieldX,
  Layers, Zap, SquareParking, Lock,
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
interface TruckItem  { id: string; truck_number: string; truck_type: string; owner_id: string | null; is_deleted?: boolean | null }
interface OwnerItem  { id: string; name: string; primary_mobile: string; company: string | null; alternate_mobile: string | null }
interface LocItem    { id: string; name: string; city: string | null }
interface DivItem    { id: string; name: string; truck_type: string; rate_per_day: number; gst_percent: number | null; status: string; total_slots?: number }
interface SlotItem   { id: string; code: string; status: string }
interface KhataItem  { id: string; owner_id: string; monthly_rate: number; billing_day: number; grace_days: number; is_active: boolean; is_deleted: boolean }

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
  const [locations,    setLocations]    = useState<LocItem[]>([]);
  const [locationId,   setLocationId]   = useState("");
  const [divisions,    setDivisions]    = useState<DivItem[]>([]);
  const [divisionId,   setDivisionId]   = useState("");
  const [divOccupancy, setDivOccupancy] = useState<Record<string, { free: number; total: number }>>({});
  const [slots,        setSlots]        = useState<SlotItem[]>([]);
  const [slotId,       setSlotId]       = useState("");
  const [divLoading,   setDivLoading]   = useState(false);
  const [slotLoading,  setSlotLoading]  = useState(false);

  const selectedDiv = divisions.find((d) => d.id === divisionId) ?? null;
  const freeSlots   = slots.filter(s => s.status === "free");
  const ratePerDay  = selectedDiv?.rate_per_day ?? 0;
  const gstPct       = selectedDiv?.gst_percent ?? 18;
  const gstAmt       = ratePerDay * gstPct / 100;
  const estPerDay    = ratePerDay + gstAmt;

  // ── check-in time
  const [checkInDate, setCheckInDate] = useState(todayStr());
  const [checkInTime, setCheckInTime] = useState(nowTimeStr());

  // ── blacklist
  const [showBlacklisted,  setShowBlacklisted]  = useState(false);
  const [blacklistReason,  setBlacklistReason]  = useState("");

  // ── deleted truck
  const [showDeletedTruck, setShowDeletedTruck] = useState(false);

  // ── already checked in
  const [showAlreadyIn,    setShowAlreadyIn]    = useState(false);
  const [alreadyInSince,   setAlreadyInSince]   = useState<string | null>(null);

  // ── submit
  const [submitting, setSubmitting]   = useState(false);
  const [submitError, setSubmitError] = useState("");

  // ── load khatas when entry type switches to khata
  useEffect(() => {
    if (entryType !== "khata") return;
    setKhataLoading(true);
    apiFetch<{ count: number; list: KhataItem[] }>("/khatas?limit=100&is_deleted=false")
      .then(async (r) => {
        const list = (r.list ?? []).filter(k => !k.is_deleted);
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

  // ── load divisions + occupancy when location changes
  useEffect(() => {
    if (!locationId) { setDivisions([]); setDivisionId(""); setDivOccupancy({}); return; }
    setDivLoading(true);
    Promise.all([
      apiFetch<{ list: DivItem[] }>(`/divisions?location_id=${locationId}&limit=100`),
      apiFetch<{ division_occupancy: Array<{ division_id: string; occupied_slots: number; total_slots: number }> }>(
        `/dashboard?location_id=${locationId}`
      ).catch(() => ({ division_occupancy: [] })),
    ])
      .then(([divRes, dashRes]) => {
        setDivisions(divRes.list ?? []);
        const occ: Record<string, { free: number; total: number }> = {};
        (dashRes.division_occupancy ?? []).forEach(o => {
          occ[o.division_id] = { free: Math.max(0, o.total_slots - o.occupied_slots), total: o.total_slots };
        });
        setDivOccupancy(occ);
        setDivisionId(""); setSlots([]); setSlotId("");
      })
      .catch(() => {})
      .finally(() => setDivLoading(false));
  }, [locationId]);

  // ── load ALL slots (free + occupied) when division changes
  useEffect(() => {
    if (!divisionId) { setSlots([]); setSlotId(""); return; }
    setSlotLoading(true);
    apiFetch<{ list: SlotItem[] }>(`/slots?division_id=${divisionId}&limit=200`)
      .then((r) => { setSlots(r.list ?? []); setSlotId(""); })
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
        type BlEntry = { truck_number: string; reason: string; is_active: boolean | null };
        const normalizedInput = number.trim().toUpperCase().replace(/\s+/g, "");

        // ── 1. find the truck ──────────────────────────────────────────────
        const r = await apiFetch<{ list: TruckItem[] }>(`/trucks?search=${encodeURIComponent(number)}&limit=5`);
        const match = r.list.find((t) => t.truck_number.toLowerCase() === number.toLowerCase());

        // ── 2. blacklist check ────────────────────────────────────────────
        // Primary: check by truck_id (reliable if entry has truck_id)
        // Fallback: check by truck_number with space-normalised comparison
        let blEntry: BlEntry | undefined;

        if (match) {
          const blById = await apiFetch<{ list: BlEntry[] }>(
            `/blacklists?truck_id=${match.id}&limit=5`
          ).catch(() => ({ list: [] as BlEntry[] }));
          blEntry = blById.list?.find(b => b.is_active !== false);
        }

        if (!blEntry) {
          const blByNum = await apiFetch<{ list: BlEntry[] }>(
            `/blacklists?search=${encodeURIComponent(number.trim())}&limit=20`
          ).catch(() => ({ list: [] as BlEntry[] }));
          blEntry = blByNum.list?.find(
            b => b.is_active !== false &&
            b.truck_number.toUpperCase().replace(/\s+/g, "") === normalizedInput
          );
        }

        if (blEntry) {
          setBlacklistReason(blEntry.reason || "No reason provided.");
          setShowBlacklisted(true);
          setTruckFound(null); setTruckId(null);
          return;
        }

        // ── 3. deleted-truck check ─────────────────────────────────────────
        if (match) {
          if (match.is_deleted) {
            setShowDeletedTruck(true);
            setTruckFound(null); setTruckId(null);
            return;
          }

          // ── 4. already-parked check ────────────────────────────────────
          const sessRes = await apiFetch<{ count: number; list: { check_in_time: string | null }[] }>(
            `/parking-sessions?truck_id=${match.id}&status=parked&limit=1`
          ).catch(() => ({ count: 0, list: [] }));
          if (sessRes.count > 0) {
            setAlreadyInSince(sessRes.list[0]?.check_in_time ?? null);
            setShowAlreadyIn(true);
            setTruckFound(null); setTruckId(null);
            return;
          }

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

    // ── real-time slot availability check ────────────────────────────────
    try {
      const slotRes = await apiFetch<{ count: number; list: SlotItem[] }>(
        `/slots?division_id=${divisionId}&status=free&limit=1`
      );
      if (!slotRes.list?.length) {
        return setSubmitError("No free slots available in this division. Please select a different division.");
      }
    } catch { /* network error — let backend enforce */ }

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
    <div className="px-4 sm:px-5 lg:px-6 py-5 w-full space-y-4">

      {/* Page header */}
      <div className="relative overflow-hidden bg-gradient-to-r from-blue-600 via-blue-600 to-indigo-700 rounded-2xl shadow-lg shadow-blue-200 px-6 py-5">
        <div className="absolute -right-6 -top-6 w-36 h-36 rounded-full bg-white/10" />
        <div className="absolute right-10 -bottom-10 w-24 h-24 rounded-full bg-white/10" />
        <div className="relative flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-1.5 text-blue-200 text-xs mb-2">
              <Link href="/dashboard" className="hover:text-white transition">Dashboard</Link>
              <ChevronRight className="w-3 h-3" />
              <span className="text-white/70">Check-in</span>
            </div>
            <h1 className="text-2xl font-extrabold text-white tracking-tight">Truck Check-in</h1>
            <p className="text-sm text-blue-100 mt-0.5">Register a new parking session</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center shrink-0 mt-1">
            <TruckIcon className="w-6 h-6 text-white" />
          </div>
        </div>
      </div>

      {/* Step indicator */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-4">
        <div className="flex items-center">
          {STEPS.map((step, idx) => (
            <div key={step.n} className="flex items-center flex-1 last:flex-none">
              <div className="flex items-center gap-2.5 shrink-0">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  idx === 0
                    ? "bg-blue-600 text-white shadow-md shadow-blue-200 ring-4 ring-blue-100"
                    : "bg-gray-100 text-gray-400"
                }`}>
                  {step.n}
                </div>
                <span className={`text-sm hidden sm:block ${idx === 0 ? "font-bold text-blue-700" : "font-medium text-gray-400"}`}>
                  {step.label}
                </span>
              </div>
              {idx < STEPS.length - 1 && (
                <div className="flex-1 mx-3 hidden sm:flex items-center">
                  <div className={`h-0.5 w-full rounded-full ${idx === 0 ? "bg-gradient-to-r from-blue-200 to-gray-100" : "bg-gray-100"}`} />
                </div>
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
              accent="blue"
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
                      className={`flex flex-col items-center justify-center p-4 rounded-2xl border-2 transition-all ${
                        entryType === type
                          ? "border-blue-500 bg-gradient-to-b from-blue-50 to-indigo-50 shadow-sm shadow-blue-100"
                          : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                      }`}
                    >
                      <div className={`w-10 h-10 rounded-xl mb-2 flex items-center justify-center transition-all ${
                        entryType === type ? "bg-blue-600 shadow-md shadow-blue-200" : "bg-gray-100"
                      }`}>
                        {type === "regular"
                          ? <Car className={`w-5 h-5 ${entryType === type ? "text-white" : "text-gray-400"}`} />
                          : <FileText className={`w-5 h-5 ${entryType === type ? "text-white" : "text-gray-400"}`} />
                        }
                      </div>
                      <span className={`text-sm font-bold ${entryType === type ? "text-blue-700" : "text-gray-700"}`}>
                        {type === "regular" ? "Regular" : "Khata"}
                      </span>
                      <span className={`text-xs mt-0.5 ${entryType === type ? "text-blue-500" : "text-gray-400"}`}>
                        {type === "regular" ? "Pay per visit" : "Monthly billing"}
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
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-medium pointer-events-none select-none">+91</span>
                      <input value={ownerMobile} onChange={(e) => setOwnerMobile(e.target.value.replace(/\D/g, "").slice(0, 10))}
                        placeholder="98765 43210" className={inputCls + " pl-9"} type="tel" maxLength={10} />
                    </div>
                  </div>
                  <div>
                    <label className={labelCls}>Company / Firm</label>
                    <input value={ownerCompany} onChange={(e) => setOwnerCompany(e.target.value)}
                      placeholder="Firm name" className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Alternate contact</label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-medium pointer-events-none select-none">+91</span>
                      <input value={ownerAlternate} onChange={(e) => setOwnerAlt(e.target.value.replace(/\D/g, "").slice(0, 10))}
                        placeholder="98765 43210" className={inputCls + " pl-9"} type="tel" maxLength={10} />
                    </div>
                  </div>
                </div>
              </div>
            </FormCard>

            {/* Driver card */}
            <FormCard
              icon={<User className="w-4 h-4 text-violet-600" />}
              title="Check-in driver details"
              accent="violet"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Driver name <Required /></label>
                  <input value={driverName} onChange={(e) => setDriverName(e.target.value)}
                    placeholder="Driver full name" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Driver mobile <Required /></label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-medium pointer-events-none select-none">+91</span>
                    <input value={driverMobile} onChange={(e) => setDriverMobile(e.target.value.replace(/\D/g, "").slice(0, 10))}
                      placeholder="98765 43210" className={inputCls + " pl-9"} type="tel" maxLength={10} />
                  </div>
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
              accent="emerald"
            >
              <div className="space-y-4">
                {/* Location */}
                <div>
                  <label className={labelCls}>Location <Required /></label>
                  <LocationDropdown
                    locations={locations}
                    locationId={locationId}
                    onSelect={(id: string) => { setLocationId(id); setDivisionId(""); setSlots([]); setSlotId(""); }}
                  />
                </div>

                {/* Division — custom searchable dropdown */}
                <div>
                  <label className={labelCls}>Division <Required /></label>
                  <DivisionDropdown
                    divisions={divisions}
                    divisionId={divisionId}
                    onSelect={setDivisionId}
                    loading={divLoading}
                    disabled={!locationId}
                    occupancy={divOccupancy}
                  />
                </div>

                {/* Slot picker — custom dropdown */}
                {divisionId && (
                  <div>
                    <label className={labelCls}>Assign slot</label>
                    <SlotDropdown
                      slots={slots}
                      slotId={slotId}
                      onSelect={setSlotId}
                      loading={slotLoading}
                    />
                  </div>
                )}

                {/* No-slot warning */}
                {divisionId && !slotLoading && freeSlots.length === 0 && slots.length > 0 && (
                  <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 rounded-xl px-3.5 py-2.5">
                    <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                    <p className="text-sm text-rose-700 font-medium">All {slots.length} slots are occupied in this division</p>
                  </div>
                )}
                {divisionId && !slotLoading && slots.length === 0 && (
                  <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 rounded-xl px-3.5 py-2.5">
                    <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                    <p className="text-sm text-rose-700 font-medium">No slots configured for this division</p>
                  </div>
                )}
              </div>
            </FormCard>

            {/* Rate preview card */}
            <FormCard
              icon={<IndianRupee className="w-4 h-4 text-amber-600" />}
              title="Rate preview"
              accent="amber"
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
              accent="sky"
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

            {/* no-slot warning */}
            {divisionId && !slotLoading && freeSlots.length === 0 && (
              <div className="flex items-start gap-2.5 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">
                <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                <p className="text-sm text-rose-700 font-medium">
                  No free slots in this division. Check-in is not allowed until a slot becomes available.
                </p>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting || (!!divisionId && !slotLoading && freeSlots.length === 0)}
              className="w-full flex items-center justify-center gap-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:from-gray-400 disabled:to-gray-400 disabled:cursor-not-allowed text-white font-bold py-4 rounded-2xl shadow-lg shadow-blue-200/60 transition-all text-sm tracking-wide"
            >
              {submitting ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> Processing…</>
              ) : (
                <><TruckIcon className="w-5 h-5" /> Confirm Check-in &amp; Print Token</>
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

      {/* ── already checked-in modal ─────────────────────────────────────── */}
      {showAlreadyIn && typeof window !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div className="relative bg-white rounded-3xl shadow-2xl px-10 py-10 flex flex-col items-center text-center max-w-sm w-full mx-4">
            <div className="relative mb-6">
              <div className="w-24 h-24 rounded-full border-4 border-amber-400 animate-ping absolute inset-0 opacity-20" />
              <div className="w-24 h-24 rounded-full border-4 border-amber-300 bg-amber-50 flex items-center justify-center">
                <TruckIcon className="w-12 h-12 text-amber-500" strokeWidth={1.5} />
              </div>
            </div>
            <h2 className="text-2xl font-extrabold text-gray-900 mb-2">Already Checked In</h2>
            <p className="text-sm text-gray-500 mb-4">
              This truck is <span className="font-semibold text-amber-600">currently parked</span> and cannot be checked in again.
            </p>
            {alreadyInSince && (
              <div className="w-full bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-5">
                <p className="text-xs font-semibold text-amber-400 uppercase tracking-widest mb-1">Checked in since</p>
                <p className="text-sm text-amber-700 font-medium">
                  {new Date(alreadyInSince).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                </p>
              </div>
            )}
            <button
              onClick={() => { setShowAlreadyIn(false); setTruckNumber(""); setTruckFound(null); setTruckId(null); }}
              className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold transition"
            >
              Understood — Go back
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* ── deleted truck modal ──────────────────────────────────────────── */}
      {showDeletedTruck && typeof window !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div className="relative bg-white rounded-3xl shadow-2xl px-10 py-10 flex flex-col items-center text-center max-w-sm w-full mx-4">
            <div className="relative mb-6">
              <div className="w-24 h-24 rounded-full border-4 border-red-400 animate-ping absolute inset-0 opacity-20" />
              <div className="w-24 h-24 rounded-full border-4 border-red-300 bg-red-50 flex items-center justify-center">
                <TruckIcon className="w-12 h-12 text-red-500" strokeWidth={1.5} />
              </div>
            </div>
            <h2 className="text-2xl font-extrabold text-gray-900 mb-2">Truck Blocked</h2>
            <p className="text-sm text-gray-500 mb-4">
              Truck <span className="font-bold text-red-600 font-mono tracking-wider">{truckNumber}</span> has been removed from the system and{" "}
              <span className="font-semibold text-red-600">cannot be checked in</span>.
            </p>
            <div className="w-full bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-5">
              <p className="text-xs font-semibold text-red-400 uppercase tracking-widest mb-1">Status</p>
              <p className="text-sm text-red-700 font-medium">This truck is marked as deleted in the system. Contact your administrator to restore it.</p>
            </div>
            <button
              onClick={() => { setShowDeletedTruck(false); setTruckNumber(""); setTruckFound(null); setTruckId(null); }}
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
        <>
          <style>{`
            @keyframes ci-backdrop { from { opacity:0 } to { opacity:1 } }
            @keyframes ci-slideUp {
              from { transform: translateY(28px) scale(0.95); opacity:0 }
              to   { transform: translateY(0)    scale(1);    opacity:1 }
            }
            @keyframes ci-popIn {
              0%   { transform: scale(0);   opacity:0 }
              60%  { transform: scale(1.18) }
              100% { transform: scale(1);   opacity:1 }
            }
            @keyframes ci-drawArc {
              from { stroke-dashoffset: 201 }
              to   { stroke-dashoffset: 0   }
            }
            @keyframes ci-fadeUp {
              from { opacity:0; transform: translateY(10px) }
              to   { opacity:1; transform: translateY(0)    }
            }
            @keyframes ci-progress {
              from { width: 0% }
              to   { width: 100% }
            }
          `}</style>
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-gray-950/80 backdrop-blur-md"
              style={{ animation: "ci-backdrop 0.3s ease forwards" }} />
            <div className="relative w-full max-w-sm overflow-hidden rounded-3xl shadow-2xl"
              style={{ animation: "ci-slideUp 0.45s cubic-bezier(0.34,1.5,0.64,1) forwards" }}>

              {/* ── emerald top band ── */}
              <div className="relative bg-gradient-to-br from-emerald-500 to-teal-600 px-8 pt-8 pb-10 flex flex-col items-center text-center overflow-hidden">
                <div className="absolute -top-6 -right-6 w-32 h-32 rounded-full bg-white/10" />
                <div className="absolute -bottom-8 -left-4 w-24 h-24 rounded-full bg-white/10" />

                {/* check ring — pops in then arc draws */}
                <div className="relative w-20 h-20 mb-4 z-10"
                  style={{ animation: "ci-popIn 0.5s cubic-bezier(0.34,1.5,0.64,1) 0.1s both" }}>
                  <svg className="absolute inset-0 w-20 h-20 -rotate-90" viewBox="0 0 80 80">
                    <circle cx="40" cy="40" r="32" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="4" />
                    <circle cx="40" cy="40" r="32" fill="none" stroke="white" strokeWidth="4"
                      strokeDasharray="201" strokeDashoffset="201" strokeLinecap="round"
                      style={{ animation: "ci-drawArc 0.55s ease 0.3s forwards" }} />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center bg-white/20 rounded-full">
                    <Check className="w-9 h-9 text-white" strokeWidth={2.5} />
                  </div>
                </div>

                <h2 className="text-2xl font-extrabold text-white tracking-tight relative z-10"
                  style={{ animation: "ci-fadeUp 0.4s ease 0.35s both" }}>
                  Check-in Complete!
                </h2>
                <p className="text-emerald-100 text-sm mt-1 relative z-10"
                  style={{ animation: "ci-fadeUp 0.4s ease 0.45s both" }}>
                  Parking session is now active
                </p>
              </div>

              {/* ── white bottom ── */}
              <div className="bg-white px-6 py-6 space-y-4">
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-2xl px-5 py-4 text-center"
                  style={{ animation: "ci-fadeUp 0.4s ease 0.5s both" }}>
                  <p className="text-[10px] font-bold text-blue-400 uppercase tracking-[0.15em] mb-1.5">Truck registered</p>
                  <p className="text-3xl font-black text-blue-700 tracking-widest font-mono">{toast.truck}</p>
                </div>

                <div className="flex items-center justify-center"
                  style={{ animation: "ci-fadeUp 0.4s ease 0.6s both" }}>
                  <span className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold px-3 py-1.5 rounded-full">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    Session Active
                  </span>
                </div>

                {/* progress bar — fills over exactly 2.5s */}
                <div style={{ animation: "ci-fadeUp 0.4s ease 0.65s both" }}>
                  <p className="text-center text-xs text-gray-400 mb-2">Redirecting to All Trucks…</p>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-500"
                      style={{ width: "0%", animation: "ci-progress 2.5s linear 0.65s forwards" }} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}

// ── sub-components ────────────────────────────────────────────────────────────

type AccentColor = "blue" | "violet" | "emerald" | "amber" | "sky";
const accentStyles: Record<AccentColor, { border: string; header: string; iconBg: string }> = {
  blue:    { border: "border-l-blue-500",    header: "bg-blue-50/50",    iconBg: "bg-blue-100"    },
  violet:  { border: "border-l-violet-500",  header: "bg-violet-50/50",  iconBg: "bg-violet-100"  },
  emerald: { border: "border-l-emerald-500", header: "bg-emerald-50/50", iconBg: "bg-emerald-100" },
  amber:   { border: "border-l-amber-500",   header: "bg-amber-50/50",   iconBg: "bg-amber-100"   },
  sky:     { border: "border-l-sky-500",     header: "bg-sky-50/50",     iconBg: "bg-sky-100"     },
};

function FormCard({
  icon, title, children, accent = "blue",
}: {
  icon: React.ReactNode; title: string; children: React.ReactNode; accent?: AccentColor;
}) {
  const st = accentStyles[accent];
  return (
    <div className={`bg-white rounded-2xl border border-gray-100 border-l-4 ${st.border} shadow-sm overflow-hidden`}>
      <div className={`flex items-center gap-3 px-5 py-3.5 border-b border-gray-100 ${st.header}`}>
        <div className={`w-8 h-8 rounded-xl ${st.iconBg} flex items-center justify-center`}>
          {icon}
        </div>
        <h2 className="text-sm font-bold text-gray-800">{title}</h2>
      </div>
      <div className="p-5 space-y-4">
        {children}
      </div>
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
const labelCls = "block text-xs font-semibold text-gray-500 mb-1.5 tracking-wide";
const inputCls  =
  "w-full px-3.5 py-2.5 text-sm text-gray-900 bg-white border border-gray-200 " +
  "rounded-xl placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400/30 " +
  "focus:border-blue-400 shadow-sm transition";
const selectCls =
  "w-full px-3.5 py-2.5 text-sm text-gray-900 bg-white border border-gray-200 " +
  "rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400/30 focus:border-blue-400 " +
  "shadow-sm transition appearance-none cursor-pointer";

// ── DivisionDropdown ──────────────────────────────────────────────────────────
function divTypeStyle(t: string) {
  switch (t.toLowerCase()) {
    case "heavy":  return { pill: "bg-violet-100 text-violet-700", avatar: "bg-gradient-to-br from-violet-500 to-indigo-600", dot: "bg-violet-400" };
    case "medium": return { pill: "bg-teal-100 text-teal-700",     avatar: "bg-gradient-to-br from-teal-500 to-cyan-600",    dot: "bg-teal-400" };
    case "light":  return { pill: "bg-emerald-100 text-emerald-700", avatar: "bg-gradient-to-br from-emerald-500 to-green-600", dot: "bg-emerald-400" };
    default:       return { pill: "bg-gray-100 text-gray-600",     avatar: "bg-gradient-to-br from-gray-400 to-slate-500",   dot: "bg-gray-400" };
  }
}

function DivisionDropdown({ divisions, divisionId, onSelect, loading, disabled, occupancy }: {
  divisions: DivItem[];
  divisionId: string;
  onSelect: (id: string) => void;
  loading: boolean;
  disabled?: boolean;
  occupancy?: Record<string, { free: number; total: number }>;
}) {
  const [open,   setOpen]   = useState(false);
  const [search, setSearch] = useState("");
  const [rect,   setRect]   = useState<DOMRect | null>(null);
  const btnRef   = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = divisions.find(d => d.id === divisionId) ?? null;

  function openDropdown() {
    if (disabled || loading) return;
    if (btnRef.current) setRect(btnRef.current.getBoundingClientRect());
    setOpen(true);
    setSearch("");
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  useEffect(() => {
    if (!open) return;
    function reposition() { if (btnRef.current) setRect(btnRef.current.getBoundingClientRect()); }
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => { window.removeEventListener("scroll", reposition, true); window.removeEventListener("resize", reposition); };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        btnRef.current   && !btnRef.current.contains(e.target as Node)
      ) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const filtered = divisions.filter(d =>
    d.name.toLowerCase().includes(search.toLowerCase()) ||
    d.truck_type.toLowerCase().includes(search.toLowerCase())
  );

  const panelStyle: React.CSSProperties = rect ? {
    position: "fixed", left: rect.left, width: rect.width, zIndex: 9999,
    ...(rect.bottom + 340 > window.innerHeight
      ? { bottom: window.innerHeight - rect.top + 4 }
      : { top: rect.bottom + 4 }),
  } : { display: "none" };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => open ? setOpen(false) : openDropdown()}
        disabled={loading || disabled}
        className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl border-2 text-sm transition-all
          ${disabled || loading
            ? "opacity-50 cursor-not-allowed border-gray-200 bg-gray-50"
            : open
            ? "border-emerald-500 bg-white shadow-lg shadow-emerald-100/60 ring-4 ring-emerald-50"
            : selected
            ? "border-emerald-300 bg-emerald-50/40 hover:border-emerald-400"
            : "border-dashed border-gray-300 bg-white hover:border-emerald-400 hover:bg-emerald-50/20"
          }`}
      >
        {loading
          ? <Loader2 className="w-5 h-5 animate-spin text-gray-400 shrink-0" />
          : selected
          ? <div className={`w-7 h-7 rounded-lg ${divTypeStyle(selected.truck_type).avatar} flex items-center justify-center shrink-0`}>
              <span className="text-[10px] font-black text-white">{selected.name.charAt(0).toUpperCase()}</span>
            </div>
          : <Layers className="w-4 h-4 text-gray-400 shrink-0" />
        }

        {selected ? (
          <div className="flex-1 min-w-0 text-left">
            <p className="text-sm font-bold text-gray-900 truncate">{selected.name}</p>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${divTypeStyle(selected.truck_type).pill}`}>
                {selected.truck_type}
              </span>
              <span className="text-[11px] text-gray-400">₹{selected.rate_per_day.toLocaleString("en-IN")}/day</span>
              {occupancy?.[selected.id] != null && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                  occupancy[selected.id].free > 0 ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                }`}>
                  {occupancy[selected.id].free} free
                </span>
              )}
            </div>
          </div>
        ) : (
          <span className="flex-1 text-left text-gray-400 font-medium">
            {loading ? "Loading divisions…" : disabled ? "Select a location first" : "Select division…"}
          </span>
        )}

        {selected && !loading && (
          <span role="button"
            onClick={(e) => { e.stopPropagation(); onSelect(""); setOpen(false); }}
            className="p-1 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition shrink-0">
            <XIcon className="w-3.5 h-3.5" />
          </span>
        )}
        {!selected && !loading && (
          <ChevronDown className={`w-4 h-4 text-gray-400 shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
        )}
      </button>

      {open && typeof window !== "undefined" && createPortal(
        <div ref={panelRef} style={panelStyle}
          className="bg-white rounded-2xl border border-gray-200 shadow-2xl shadow-gray-300/40 overflow-hidden">

          <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-gray-100 bg-gray-50/80">
            <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <input ref={inputRef} value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search divisions…"
              className="flex-1 text-xs bg-transparent outline-none text-gray-700 placeholder-gray-400" />
            {search && (
              <button type="button" onClick={() => setSearch("")} className="text-gray-300 hover:text-gray-600 transition">
                <XIcon className="w-3 h-3" />
              </button>
            )}
          </div>

          <ul className="max-h-64 overflow-y-auto py-1.5">
            {filtered.length === 0 && (
              <li className="px-4 py-8 text-center text-xs text-gray-400">
                {divisions.length === 0 ? "No divisions for this location" : "No results"}
              </li>
            )}
            {filtered.map(d => {
              const ts = divTypeStyle(d.truck_type);
              const isSelected = d.id === divisionId;
              return (
                <li key={d.id}>
                  <button type="button"
                    onClick={() => { onSelect(d.id); setOpen(false); }}
                    className={`w-full flex items-center gap-3 px-3.5 py-3 text-left transition
                      ${isSelected ? "bg-emerald-50" : "hover:bg-gray-50"}`}>
                    <div className={`w-10 h-10 rounded-xl ${ts.avatar} flex items-center justify-center shrink-0 shadow-sm`}>
                      <span className="text-xs font-black text-white">{d.name.charAt(0).toUpperCase()}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-bold truncate ${isSelected ? "text-emerald-700" : "text-gray-900"}`}>{d.name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${ts.pill}`}>{d.truck_type}</span>
                        <span className="text-[11px] text-gray-400">₹{d.rate_per_day.toLocaleString("en-IN")}/day</span>
                        {occupancy?.[d.id] != null ? (
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                            occupancy[d.id].free > 0 ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                          }`}>
                            {occupancy[d.id].free}/{occupancy[d.id].total} free
                          </span>
                        ) : d.total_slots != null ? (
                          <span className="text-[11px] text-gray-400">{d.total_slots} slots</span>
                        ) : null}
                      </div>
                    </div>
                    {isSelected && (
                      <div className="w-6 h-6 rounded-full bg-emerald-600 flex items-center justify-center shrink-0 shadow-sm">
                        <Check className="w-3.5 h-3.5 text-white" />
                      </div>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="px-4 py-2 border-t border-gray-100 bg-gray-50/60">
            <p className="text-[11px] text-gray-400">{filtered.length} of {divisions.length} division{divisions.length !== 1 ? "s" : ""}</p>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

// ── LocationDropdown ──────────────────────────────────────────────────────────
function LocationDropdown({ locations, locationId, onSelect }: {
  locations: LocItem[];
  locationId: string;
  onSelect: (id: string) => void;
}) {
  const [open,   setOpen]   = useState(false);
  const [search, setSearch] = useState("");
  const [rect,   setRect]   = useState<DOMRect | null>(null);
  const btnRef   = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = locations.find(l => l.id === locationId) ?? null;

  function openDropdown() {
    if (btnRef.current) setRect(btnRef.current.getBoundingClientRect());
    setOpen(true); setSearch("");
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  useEffect(() => {
    if (!open) return;
    function reposition() { if (btnRef.current) setRect(btnRef.current.getBoundingClientRect()); }
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => { window.removeEventListener("scroll", reposition, true); window.removeEventListener("resize", reposition); };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        btnRef.current   && !btnRef.current.contains(e.target as Node)
      ) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const filtered = locations.filter(l =>
    l.name.toLowerCase().includes(search.toLowerCase()) ||
    (l.city ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const panelStyle: React.CSSProperties = rect ? {
    position: "fixed", left: rect.left, width: rect.width, zIndex: 9999,
    ...(rect.bottom + 300 > window.innerHeight
      ? { bottom: window.innerHeight - rect.top + 4 }
      : { top: rect.bottom + 4 }),
  } : { display: "none" };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => open ? setOpen(false) : openDropdown()}
        className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl border-2 text-sm transition-all
          ${open
            ? "border-emerald-500 bg-white shadow-lg shadow-emerald-100/60 ring-4 ring-emerald-50"
            : selected
            ? "border-emerald-300 bg-emerald-50/40 hover:border-emerald-400"
            : "border-dashed border-gray-300 bg-white hover:border-emerald-400 hover:bg-emerald-50/20"
          }`}
      >
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${selected ? "bg-gradient-to-br from-emerald-500 to-teal-600" : "bg-gray-100"}`}>
          <MapPin className={`w-3.5 h-3.5 ${selected ? "text-white" : "text-gray-400"}`} />
        </div>

        {selected ? (
          <div className="flex-1 min-w-0 text-left">
            <p className="text-sm font-bold text-gray-900 truncate">{selected.name}</p>
            {selected.city && <p className="text-[11px] text-gray-400">{selected.city}</p>}
          </div>
        ) : (
          <span className="flex-1 text-left text-gray-400 font-medium">
            {locations.length === 0 ? "Loading locations…" : "Select location…"}
          </span>
        )}

        {selected ? (
          <span role="button"
            onClick={(e) => { e.stopPropagation(); onSelect(""); setOpen(false); }}
            className="p-1 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition shrink-0">
            <XIcon className="w-3.5 h-3.5" />
          </span>
        ) : (
          <ChevronDown className={`w-4 h-4 text-gray-400 shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
        )}
      </button>

      {open && typeof window !== "undefined" && createPortal(
        <div ref={panelRef} style={panelStyle}
          className="bg-white rounded-2xl border border-gray-200 shadow-2xl shadow-gray-300/40 overflow-hidden">
          <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-gray-100 bg-gray-50/80">
            <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <input ref={inputRef} value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search locations…"
              className="flex-1 text-xs bg-transparent outline-none text-gray-700 placeholder-gray-400" />
            {search && (
              <button type="button" onClick={() => setSearch("")} className="text-gray-300 hover:text-gray-600 transition">
                <XIcon className="w-3 h-3" />
              </button>
            )}
          </div>
          <ul className="max-h-56 overflow-y-auto py-1.5">
            {filtered.length === 0 && (
              <li className="px-4 py-8 text-center text-xs text-gray-400">No locations found</li>
            )}
            {filtered.map(l => {
              const isSel = l.id === locationId;
              return (
                <li key={l.id}>
                  <button type="button"
                    onClick={() => { onSelect(l.id); setOpen(false); }}
                    className={`w-full flex items-center gap-3 px-3.5 py-3 text-left transition
                      ${isSel ? "bg-emerald-50" : "hover:bg-gray-50"}`}>
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shrink-0 shadow-sm">
                      <MapPin className="w-4 h-4 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-bold truncate ${isSel ? "text-emerald-700" : "text-gray-900"}`}>{l.name}</p>
                      {l.city && <p className="text-[11px] text-gray-400">{l.city}</p>}
                    </div>
                    {isSel && (
                      <div className="w-6 h-6 rounded-full bg-emerald-600 flex items-center justify-center shrink-0 shadow-sm">
                        <Check className="w-3.5 h-3.5 text-white" />
                      </div>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="px-4 py-2 border-t border-gray-100 bg-gray-50/60">
            <p className="text-[11px] text-gray-400">{filtered.length} of {locations.length} location{locations.length !== 1 ? "s" : ""}</p>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

// ── SlotDropdown ──────────────────────────────────────────────────────────────
function SlotDropdown({ slots, slotId, onSelect, loading }: {
  slots: SlotItem[];
  slotId: string;
  onSelect: (id: string) => void;
  loading: boolean;
}) {
  const [open,   setOpen]   = useState(false);
  const [rect,   setRect]   = useState<DOMRect | null>(null);
  const btnRef   = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const freeSlots     = slots.filter(s => s.status === "free");
  const occupiedSlots = slots.filter(s => s.status !== "free");
  const selected      = freeSlots.find(s => s.id === slotId) ?? null;

  function openDropdown() {
    if (loading) return;
    if (btnRef.current) setRect(btnRef.current.getBoundingClientRect());
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    function reposition() { if (btnRef.current) setRect(btnRef.current.getBoundingClientRect()); }
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => { window.removeEventListener("scroll", reposition, true); window.removeEventListener("resize", reposition); };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        btnRef.current   && !btnRef.current.contains(e.target as Node)
      ) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const panelStyle: React.CSSProperties = rect ? {
    position: "fixed", left: rect.left, width: rect.width, zIndex: 9999,
    ...(rect.bottom + 320 > window.innerHeight
      ? { bottom: window.innerHeight - rect.top + 4 }
      : { top: rect.bottom + 4 }),
  } : { display: "none" };

  if (loading) return (
    <div className="flex items-center gap-2.5 px-3.5 py-3 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 text-sm text-gray-400">
      <Loader2 className="w-4 h-4 animate-spin shrink-0" /> Loading slots…
    </div>
  );

  if (slots.length === 0) return null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => open ? setOpen(false) : openDropdown()}
        className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl border-2 text-sm transition-all
          ${open
            ? "border-emerald-500 bg-white shadow-lg shadow-emerald-100/60 ring-4 ring-emerald-50"
            : selected
            ? "border-emerald-300 bg-emerald-50/40 hover:border-emerald-400"
            : "border-dashed border-gray-300 bg-white hover:border-emerald-400 hover:bg-emerald-50/20"
          }`}
      >
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${selected ? "bg-gradient-to-br from-emerald-500 to-teal-600" : "bg-gray-100"}`}>
          <SquareParking className={`w-3.5 h-3.5 ${selected ? "text-white" : "text-gray-400"}`} />
        </div>

        {selected ? (
          <div className="flex-1 min-w-0 text-left">
            <p className="text-sm font-bold text-gray-900">{selected.code}</p>
            <p className="text-[11px] text-emerald-600 font-semibold">Free slot selected</p>
          </div>
        ) : (
          <div className="flex-1 text-left">
            <p className="text-sm font-medium text-gray-400">Auto-assign</p>
            <p className="text-[11px] text-gray-400">Best available slot picked automatically</p>
          </div>
        )}

        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-700">
            {freeSlots.length} free
          </span>
          {selected ? (
            <span role="button"
              onClick={(e) => { e.stopPropagation(); onSelect(""); setOpen(false); }}
              className="p-1 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition">
              <XIcon className="w-3.5 h-3.5" />
            </span>
          ) : (
            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
          )}
        </div>
      </button>

      {open && typeof window !== "undefined" && createPortal(
        <div ref={panelRef} style={panelStyle}
          className="bg-white rounded-2xl border border-gray-200 shadow-2xl shadow-gray-300/40 overflow-hidden">

          {/* Auto-assign option */}
          <button type="button"
            onClick={() => { onSelect(""); setOpen(false); }}
            className={`w-full flex items-center gap-3 px-3.5 py-3 border-b border-gray-100 transition
              ${!slotId ? "bg-blue-50" : "hover:bg-gray-50"}`}>
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${!slotId ? "bg-blue-600" : "bg-gray-100"}`}>
              <Zap className={`w-4 h-4 ${!slotId ? "text-white" : "text-gray-400"}`} />
            </div>
            <div className="flex-1 text-left">
              <p className={`text-sm font-bold ${!slotId ? "text-blue-700" : "text-gray-700"}`}>Auto-assign</p>
              <p className={`text-[11px] ${!slotId ? "text-blue-500" : "text-gray-400"}`}>Best available slot picked automatically</p>
            </div>
            {!slotId && <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center shrink-0"><Check className="w-3.5 h-3.5 text-white" /></div>}
          </button>

          <ul className="max-h-56 overflow-y-auto py-1.5">
            {freeSlots.map(s => {
              const isSel = s.id === slotId;
              return (
                <li key={s.id}>
                  <button type="button"
                    onClick={() => { onSelect(s.id); setOpen(false); }}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-left transition
                      ${isSel ? "bg-emerald-50" : "hover:bg-gray-50"}`}>
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${isSel ? "bg-gradient-to-b from-emerald-500 to-teal-500" : "bg-emerald-50 border border-emerald-200"}`}>
                      <SquareParking className={`w-4 h-4 ${isSel ? "text-white" : "text-emerald-500"}`} />
                    </div>
                    <div className="flex-1">
                      <p className={`text-sm font-bold ${isSel ? "text-emerald-700" : "text-gray-900"}`}>{s.code}</p>
                      <p className="text-[10px] font-semibold text-emerald-500">FREE</p>
                    </div>
                    {isSel && <div className="w-6 h-6 rounded-full bg-emerald-600 flex items-center justify-center shrink-0"><Check className="w-3.5 h-3.5 text-white" /></div>}
                  </button>
                </li>
              );
            })}
            {occupiedSlots.map(s => (
              <li key={s.id}>
                <div className="w-full flex items-center gap-3 px-3.5 py-2.5 opacity-50 cursor-not-allowed">
                  <div className="w-9 h-9 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center shrink-0">
                    <Lock className="w-4 h-4 text-rose-400" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-gray-400">{s.code}</p>
                    <p className="text-[10px] font-semibold text-rose-400">OCCUPIED</p>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <div className="px-4 py-2 border-t border-gray-100 bg-gray-50/60 flex items-center gap-3">
            <span className="flex items-center gap-1 text-[11px] text-emerald-600 font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />{freeSlots.length} free
            </span>
            {occupiedSlots.length > 0 && (
              <span className="flex items-center gap-1 text-[11px] text-rose-500 font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />{occupiedSlots.length} occupied
              </span>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

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
