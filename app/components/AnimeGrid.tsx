"use client";

import { useState, useEffect } from "react";
import AnimeCard, { AnimeWork } from "./AnimeCard";
import { CalendarDays } from "lucide-react";

export default function AnimeGrid({ animeList }: { animeList: AnimeWork[] }) {
  const [activeDay, setActiveDay] = useState<number>(1); // Default to Monday
  const [isClient, setIsClient] = useState(false);

  const days = [
    { label: "月曜日", value: 1 },
    { label: "火曜日", value: 2 },
    { label: "水曜日", value: 3 },
    { label: "木曜日", value: 4 },
    { label: "金曜日", value: 5 },
    { label: "土曜日", value: 6 },
    { label: "日曜日", value: 0 },
  ];

  useEffect(() => {
    setIsClient(true);
    // Initialize with today's day of week
    const today = new Date().getDay();
    setActiveDay(today);
  }, []);

  if (!isClient) {
    return (
      <div className="space-y-16 pb-20 opacity-0 transition-opacity duration-300">
        <div className="h-10 w-full animate-pulse rounded-xl bg-slate-200"></div>
      </div>
    );
  }

  const activeDayLabel = days.find(d => d.value === activeDay)?.label || "";
  const filteredAnime = animeList
    .filter((a) => a.day_of_week === activeDay)
    .sort((a, b) => new Date(a.fastest_broadcast).getTime() - new Date(b.fastest_broadcast).getTime());

  return (
    <div className="pb-20">
      {/* Tab Navigation */}
      <div className="sticky top-4 z-30 mb-12 grid grid-flow-col auto-cols-[minmax(80px,1fr)] gap-2 rounded-2xl border-2 border-slate-200 bg-white/90 p-2 shadow-sm backdrop-blur-md overflow-x-auto no-scrollbar">
        {days.map((day) => (
          <button
            key={day.value}
            onClick={() => setActiveDay(day.value)}
            className={`rounded-xl px-4 py-3 text-sm font-black transition-all duration-200 border-2 cursor-pointer
        ${activeDay === day.value
                ? "bg-indigo-600 border-indigo-700 text-white shadow-lg shadow-indigo-600/20"
                : "bg-slate-50 border-transparent text-slate-500 hover:bg-white hover:border-slate-200 hover:text-indigo-600"
              }`}
          >
            {day.label.charAt(0)}
          </button>
        ))}
      </div>

      {/* Active Day Section */}
      <section className="w-full animate-in fade-in slide-in-from-bottom-5 duration-500">
        <div className="mb-8 flex items-center gap-3 border-b-2 border-slate-200 pb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 border-2 border-indigo-200 text-indigo-600">
            <CalendarDays size={20} />
          </div>
          <h2 className="text-3xl font-black tracking-tight text-slate-900">
            {activeDayLabel}
          </h2>
          <span className="ml-2 text-sm font-bold text-slate-400">
            ({filteredAnime.length}作品)
          </span>
        </div>

        {filteredAnime.length > 0 ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredAnime.map((anime) => (
              <AnimeCard key={anime.id} anime={anime} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-3xl">
            <CalendarDays size={48} className="mb-4 opacity-20" />
            <p className="text-xl font-medium">この曜日の放送予定はありません。</p>
          </div>
        )}
      </section>
    </div>
  );
}
