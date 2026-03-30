"use client";

import { useEffect, useState } from "react";
import { isBefore, addMinutes, isAfter, parseISO } from "date-fns";
import { Radio } from "lucide-react";
import AnimeCard, { AnimeWork } from "./AnimeCard";

export default function NowOnAir({ animeList }: { animeList: AnimeWork[] }) {
  const [nowOnAirData, setNowOnAirData] = useState<AnimeWork[]>([]);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);

    const checkNowOnAir = () => {
      const now = new Date();
      const onAir = animeList.filter((anime) => {
        if (!anime.fastest_broadcast) return false;
        const broadcastTime = parseISO(anime.fastest_broadcast);
        const endTime = addMinutes(broadcastTime, 30);
        // isAfter or isEqual (we check loosely here)
        return (isBefore(broadcastTime, now) || broadcastTime.getTime() === now.getTime()) && isBefore(now, endTime);
      });
      setNowOnAirData(onAir);
    };

    // Check immediately, then set interval for every minute
    checkNowOnAir();
    const interval = setInterval(checkNowOnAir, 60 * 1000);

    return () => clearInterval(interval);
  }, [animeList]);

  if (!isClient || nowOnAirData.length === 0) {
    return null;
  }

  return (
    <section className="mb-16 w-full animate-in fade-in slide-in-from-bottom-5 duration-700">
      <div className="mb-6 flex items-center gap-3">
        <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-red-100 border-2 border-red-200">
          <div className="absolute inline-flex h-2 w-2 top-2 right-2 animate-ping rounded-full bg-red-500 opacity-75"></div>
          <Radio className="relative z-10 text-red-600" size={20} />
        </div>
        <h2 className="text-2xl font-black uppercase tracking-widest text-red-600">
          現在放送中
        </h2>
      </div>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {nowOnAirData.map((anime) => (
          <AnimeCard key={anime.id} anime={anime} active={true} />
        ))}
      </div>
    </section>
  );
}
