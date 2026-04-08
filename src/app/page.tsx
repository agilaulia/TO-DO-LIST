"use client";

import { useState, useRef, useEffect } from "react";
import { Camera, Upload, Trash2, Check, Loader2 } from "lucide-react";

type VehicleEntry = {
  id: string;
  namaPT: string;
  nomorPlat: string;
  timestamp: string;
  status: "Active" | "Inactive";
};

const fetchWithRetry = async (url: string, options: RequestInit, retries = 2): Promise<Response> => {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, options);
      if (response.ok || (response.status >= 400 && response.status < 500 && response.status !== 429)) {
        return response;
      }
      console.warn(`Percobaan ${i + 1} gagal (Status: ${response.status}). Mengulang kembali...`);
    } catch (err) {
      console.warn(`Percobaan ${i + 1} error jaringan. Mengulang kembali...`, err);
    }
    await new Promise(r => setTimeout(r, 2500)); // wait 2.5s before retrying to clear rate limit burst
  }
  return fetch(url, options);
};

export default function Home() {
  const [entries, setEntries] = useState<VehicleEntry[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [namaPT, setNamaPT] = useState("");
  const [nomorPlat, setNomorPlat] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const updateFileInputRef = useRef<HTMLInputElement>(null);

  const formatPlatNomor = (p: string) => {
    const clean = p.replace(/[^A-Z0-9]/gi, '').toUpperCase();
    const match = clean.match(/^([A-Z]{1,2})(\d+)([A-Z]{0,3})$/);
    return match ? `${match[1]} ${match[2]} ${match[3]}`.trim() : p.toUpperCase();
  };

  useEffect(() => {
    const saved = localStorage.getItem('vehicleEntries');
    if (saved) {
      try {
        setEntries(JSON.parse(saved));
      } catch (e) {
        console.error("Gagal load localStorage:", e);
      }
    }
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem('vehicleEntries', JSON.stringify(entries));
    }
  }, [entries, isLoaded]);

  const handleScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);

    try {
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onloadend = () => {
          const result = reader.result?.toString().split(',')[1];
          if (result) resolve(result);
          else reject(new Error("Failed to read file"));
        };
        reader.onerror = reject;
      });

      const response = await fetchWithRetry('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64Data }),
      }, 2); // 2 retries allowed

      if (!response.ok) {
        let errorMsg = `Server API Error (${response.status})`;
        try {
          const errData = await response.json();
          if (errData.error) errorMsg = errData.error;
        } catch {
          errorMsg = await response.text();
        }
        throw new Error(errorMsg);
      }

      const data = await response.json();

      if (data.error) {
        console.error("API Error:", data.error);
        alert("Gagal terhubung ke AI. Pastikan format foto benar dan API key sudah tersimpan.");
      } else {
        if (data.namaPT && data.namaPT.trim() !== "" && data.namaPT.trim() !== "Tulis Nama PT di sini jika ada, kalau tidak kosongkan saja") {
          setNamaPT(data.namaPT.trim());
        }
        if (data.nomorPlats && Array.isArray(data.nomorPlats) && data.nomorPlats.length > 0) {
          setNomorPlat(data.nomorPlats.map((p: string) => formatPlatNomor(p)).join(", "));
        } else if (data.nomorPlat && typeof data.nomorPlat === "string" && data.nomorPlat.trim() !== "") {
          setNomorPlat(formatPlatNomor(data.nomorPlat));
        }
      }
    } catch (error: unknown) {
      console.error("Scan error details:", error);
      alert(`Terjadi kesalahan sistem: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleUpdateStatusScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUpdatingStatus(true);

    try {
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onloadend = () => {
          const result = reader.result?.toString().split(',')[1];
          if (result) resolve(result);
          else reject(new Error("Failed to read file"));
        };
        reader.onerror = reject;
      });

      const response = await fetchWithRetry('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64Data }),
      }, 2); // 2 retries allowed

      if (!response.ok) {
        let errorMsg = `Server API Error (${response.status})`;
        try {
          const errData = await response.json();
          if (errData.error) errorMsg = errData.error;
        } catch {
          errorMsg = await response.text();
        }
        throw new Error(errorMsg);
      }

      const data = await response.json();

      if (data.error) {
        alert("Gagal terhubung ke AI.");
      } else {
        const detectedPT = (data.namaPT || "").trim().toUpperCase();
        let scannedPlats: string[] = [];
        if (data.nomorPlats && Array.isArray(data.nomorPlats)) {
          scannedPlats = data.nomorPlats.map((p: string) => formatPlatNomor(p));
        } else if (data.nomorPlat && typeof data.nomorPlat === "string") {
          scannedPlats = [formatPlatNomor(data.nomorPlat)];
        }

        if (scannedPlats.length === 0) {
          alert("Tidak ada nomor plat yang terdeteksi di foto.");
          return;
        }

        const normalizePlat = (p: string) => p.replace(/[^A-Z0-9]/gi, '').toUpperCase();
        const normalizedScanned = scannedPlats.map(normalizePlat);

        setEntries(prev => prev.map(entry => {
          const entryPlatNormal = normalizePlat(entry.nomorPlat);
          if (normalizedScanned.includes(entryPlatNormal)) {
            return { ...entry, status: "Active" };
          }
          // Kembalikan ke Inactive jika ingin me-reset yang tidak ada di foto, 
          // tapi jika sistemnya scan berkali-kali, lebih baik biarkan status sebelumnya.
          // Untuk amannya, kita set yang tidak terdeteksi di foto ini menjadi Inactive jika 
          // memang prosesnya selalu mereset. Saya akan biarkan entry saja (tidak mereset).
          // Namun jika permintaan user adalah HANYA yang difoto yang aktif:
          // return { ...entry, status: "Inactive" };
          // Mari kita ubah yang HANYA match yang jadi Active, lainnya tetap.

          return entry;
        }));

        alert(`Berhasil memperbarui status kendaraan! Plat terdeteksi mendapat status Active.`);
      }
    } catch (error: unknown) {
      alert(`Terjadi kesalahan sistem: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsUpdatingStatus(false);
      if (updateFileInputRef.current) updateFileInputRef.current.value = "";
    }
  };

  const handleSave = () => {
    if (!namaPT || !nomorPlat) {
      alert("Harap isi Nama PT dan Nomor Plat");
      return;
    }

    const plats = nomorPlat.split(',').map(p => p.trim()).filter(p => p !== '');

    const newEntries: VehicleEntry[] = plats.map((plat, index) => ({
      id: Date.now().toString() + index,
      namaPT,
      nomorPlat: formatPlatNomor(plat),
      timestamp: new Date().toLocaleString("id-ID"),
      status: "Inactive",
    }));

    setEntries([...newEntries, ...entries]);
    setNamaPT("");
    setNomorPlat("");
  };

  const handleToggleStatus = (id: string) => {
    setEntries(
      entries.map((entry) =>
        entry.id === id
          ? { ...entry, status: entry.status === "Active" ? "Inactive" : "Active" }
          : entry
      )
    );
  };

  const handleDelete = (id: string) => {
    setEntries(entries.filter((entry) => entry.id !== id));
  };

  const groupedEntries = entries.reduce((acc, entry) => {
    const key = entry.namaPT.trim().toUpperCase();
    if (!acc[key]) {
      acc[key] = { originalName: entry.namaPT.trim(), items: [] };
    }
    acc[key].items.push(entry);
    return acc;
  }, {} as Record<string, { originalName: string; items: VehicleEntry[] }>);

  return (
    <main className="w-full min-h-screen p-3 sm:p-6 md:p-8 max-w-7xl mx-auto flex flex-col gap-6 md:gap-8 overflow-x-hidden">
      {/* Header */}
      <header className="text-center mt-4 md:mt-8 px-2">
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-gradient mb-2 pb-1 drop-shadow-sm">
          Vehicle To-Do List
        </h1>
        <p className="text-slate-600 dark:text-slate-300 font-medium">
          Sistem Pencatatan Kendaraan Otomatis
        </p>
      </header>

      {/* Main Form Layout */}
      <div className="flex flex-col gap-10 items-center w-full">

        {/* Input Panel */}
        <section className="glass-panel w-full max-w-2xl mx-auto p-4 sm:p-6 md:p-8 rounded-2xl md:rounded-3xl flex flex-col gap-4 sm:gap-5 relative overflow-hidden shadow-lg hover:shadow-xl transition-all duration-300">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500"></div>

          <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-2">
            Input Data Baru
          </h2>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">Nama PT</label>
            <input
              type="text"
              value={namaPT}
              onChange={(e) => setNamaPT(e.target.value)}
              placeholder="Cth: PT Alam Makmur"
              className="w-full px-4 py-3 text-base rounded-xl border border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-800/50 focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all placeholder:text-slate-400 shadow-inner"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">Nomor Plat</label>
            <input
              type="text"
              value={nomorPlat}
              onChange={(e) => setNomorPlat(e.target.value)}
              placeholder="Cth: B 1234 CD, D 9999 XX"
              className="w-full px-4 py-3 text-base rounded-xl border border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-800/50 focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all placeholder:text-slate-400 uppercase shadow-inner"
            />
            <span className="text-[10px] text-slate-500 italic mt-0.5 ml-1">Bisa lebih dari 1, pisahkan dengan koma (,)</span>
          </div>

          <input
            type="file"
            accept="image/*"
            ref={fileInputRef}
            className="hidden"
            onChange={handleScan}
          />

          <div className="flex flex-col sm:flex-row gap-3 mt-4">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
              className="flex-1 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-900/40 dark:hover:bg-indigo-900/60 text-indigo-600 dark:text-indigo-300 py-3 px-2 rounded-xl font-semibold flex items-center justify-center gap-2 transition-colors border border-indigo-200 dark:border-indigo-800 disabled:opacity-50"
            >
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Camera className="w-5 h-5" />}
              {isLoading ? "Memproses..." : "Scan Foto"}
            </button>

            <button
              onClick={handleSave}
              className="flex-1 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white py-3 px-2 rounded-xl font-semibold shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 transform hover:-translate-y-0.5 active:translate-y-0"
            >
              <Check className="w-5 h-5" />
              Simpan
            </button>
          </div>
        </section>

        {/* Rekap Panel */}
        {entries.length > 0 && (
          <section className="glass-panel w-full max-w-7xl mx-auto p-4 sm:p-6 md:p-8 rounded-2xl md:rounded-3xl flex flex-col gap-4 sm:gap-5 shadow-lg">
            <h2 className="text-lg sm:text-xl font-bold text-slate-800 dark:text-white mb-1 sm:mb-2 flex items-center gap-2">
              <span className="w-2 h-5 sm:h-6 bg-gradient-to-b from-indigo-500 to-purple-500 rounded-full"></span>
              Rekap Status Kendaraan
            </h2>
            <div className="grid grid-cols-1 min-[400px]:grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
              {Object.values(groupedEntries).map((group) => {
                const activeItems = group.items.filter((item) => item.status === 'Active');
                const inactiveItems = group.items.filter((item) => item.status === 'Inactive');
                const activeCount = activeItems.length;
                const totalCount = group.items.length;
                return (
                  <div key={group.originalName} className="bg-white/60 dark:bg-slate-800/60 p-4 rounded-xl border border-slate-200/80 dark:border-slate-700/80 shadow-sm flex flex-col relative overflow-hidden group hover:shadow-md transition-shadow h-full min-w-0">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-400 to-purple-500 opacity-80 flex-none"></div>

                    <div className="flex flex-col gap-3 flex-none">
                      <span className="font-bold text-slate-800 dark:text-slate-100 truncate text-sm">{group.originalName}</span>

                      <div className="flex justify-between items-end">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">Active</span>
                          <span className="text-2xl font-black text-slate-800 dark:text-white leading-none">{activeCount}</span>
                        </div>
                        <div className="w-px h-8 bg-slate-200 dark:bg-slate-600 mx-2"></div>
                        <div className="flex flex-col gap-0.5 text-right">
                          <span className="text-[10px] font-bold text-blue-500 dark:text-blue-400 uppercase tracking-wide">Total</span>
                          <span className="text-2xl font-black text-slate-600 dark:text-slate-300 leading-none">{totalCount}</span>
                        </div>
                      </div>
                    </div>

                    {(activeCount > 0 || inactiveItems.length > 0) && (
                      <div className="mt-3 pt-3 border-t border-slate-200/50 dark:border-slate-700/50 flex flex-col gap-2 pb-1">
                        {activeCount > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {activeItems.map(item => (
                              <span key={item.id} className="text-[9px] font-mono font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 px-1.5 py-0.5 rounded-md border border-emerald-200/50 dark:border-emerald-800/50 shadow-sm">
                                {item.nomorPlat}
                              </span>
                            ))}
                          </div>
                        )}
                        {inactiveItems.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {inactiveItems.map(item => (
                              <span key={item.id} className="text-[9px] font-mono font-bold bg-slate-200 text-slate-600 dark:bg-slate-700/50 dark:text-slate-300 px-1.5 py-0.5 rounded-md border border-slate-300/50 dark:border-slate-600/50 shadow-sm opacity-80">
                                {item.nomorPlat}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* List Panel */}
        <section className="glass-panel w-full p-4 sm:p-6 md:p-8 rounded-2xl md:rounded-3xl flex flex-col gap-4 shadow-lg">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-2 gap-3">
            <h2 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-3">
              <span>Daftar Kendaraan</span>
              <span className="text-sm font-medium bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300 py-1 px-3 rounded-full">
                {entries.length} Entri
              </span>
            </h2>

            <button
              onClick={() => updateFileInputRef.current?.click()}
              disabled={isUpdatingStatus}
              className="bg-indigo-100 hover:bg-indigo-200 dark:bg-indigo-900/40 dark:hover:bg-indigo-800/60 text-indigo-700 dark:text-indigo-300 py-2 px-4 rounded-xl font-semibold flex items-center justify-center gap-2 transition-colors border border-indigo-200 dark:border-indigo-700 disabled:opacity-50 text-sm w-full sm:w-auto shadow-sm"
            >
              {isUpdatingStatus ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
              {isUpdatingStatus ? "Memproses..." : "Scan Foto Aktif"}
            </button>
            <input
              type="file"
              accept="image/*"
              ref={updateFileInputRef}
              className="hidden"
              onChange={handleUpdateStatusScan}
            />
          </div>

          <div className={`overflow-y-auto max-h-[65vh] md:h-[700px] md:max-h-none pr-1 sm:pr-2 custom-scrollbar ${entries.length === 0 ? 'flex flex-col' : ''}`}>
            {entries.length === 0 ? (
              <div className="text-center py-12 flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 min-h-[300px] border-2 border-dashed border-slate-200/60 dark:border-slate-700/60 rounded-2xl">
                <Upload className="w-12 h-12 mb-3 opacity-30" />
                <p className="font-medium text-slate-500 dark:text-slate-400">Belum ada data kendaraan.</p>
                <p className="text-sm mt-1">Scan foto atau input manual untuk memulai.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-start w-full">
                {Object.values(groupedEntries).map((group) => (
                  <div key={group.originalName} className="bg-white/40 dark:bg-slate-800/40 rounded-3xl p-5 border border-slate-200/80 dark:border-slate-700/80 shadow-md hover:shadow-lg transition-shadow flex flex-col gap-4">
                    <h3 className="font-extrabold text-lg text-slate-800 dark:text-slate-100 border-b border-slate-200 dark:border-slate-700 pb-2.5 flex justify-between items-center">
                      <span className="flex items-center gap-2 truncate pr-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 flex-shrink-0 shadow-sm"></span>
                        <span className="truncate">{group.originalName}</span>
                      </span>
                      <span className="text-[10px] font-bold bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 flex-shrink-0 shadow-sm">
                        {group.items.filter(item => item.status === 'Active').length}/{group.items.length}
                      </span>
                    </h3>

                    <div className="flex flex-col gap-3.5">
                      {group.items.map((entry) => (
                        <div key={entry.id} className={`bg-white/80 dark:bg-slate-900/60 p-4 rounded-xl border ${entry.status === 'Active' ? 'border-emerald-500/40' : 'border-slate-500/30'} shadow-sm hover:shadow-md transition-all flex flex-col gap-2 relative overflow-hidden group/item`}>
                          <div className={`absolute left-0 top-0 h-full w-2 ${entry.status === 'Active' ? 'bg-gradient-to-b from-emerald-400 to-green-500' : 'bg-slate-400'} opacity-80`}></div>

                          <div className="flex flex-col pl-3 pt-0.5">
                            <div className="flex items-center justify-between gap-2 w-full">
                              <span className="text-indigo-700 dark:text-indigo-400 font-mono font-extrabold tracking-widest text-[18px]">{entry.nomorPlat}</span>
                              <span className={`text-[9px] px-2.5 py-1 rounded-full font-extrabold uppercase tracking-wider shadow-sm ${entry.status === 'Active' ? 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-400' : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-400'}`}>
                                {entry.status}
                              </span>
                            </div>
                            <span className="text-[10px] text-slate-500 mt-1 opacity-80 font-medium">{entry.timestamp}</span>
                          </div>

                          <div className="flex w-full pt-3 mt-1.5 border-t border-slate-100 dark:border-slate-700/50 justify-between items-center gap-2 lg:opacity-0 group-hover/item:opacity-100 focus-within:opacity-100 transition-opacity pl-2">
                            <button
                              onClick={() => handleToggleStatus(entry.id)}
                              className={`px-3 py-1.5 text-[10px] font-bold rounded-lg transition-all flex-1 shadow-sm ${entry.status === 'Active' ? 'bg-slate-100 hover:bg-slate-200 text-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300' : 'bg-green-50 hover:bg-green-100 text-green-700 dark:bg-green-900/40 dark:hover:bg-green-900/60 dark:text-green-400'}`}
                            >
                              {entry.status === 'Active' ? 'INACTIVE' : 'ACTIVE'}
                            </button>
                            <button
                              onClick={() => handleDelete(entry.id)}
                              className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/40 rounded-lg transition-colors flex-none"
                              title="Hapus"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

      </div>
    </main>
  );
}
