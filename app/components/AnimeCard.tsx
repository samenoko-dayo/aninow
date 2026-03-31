import Image from "next/image";
import { ExternalLink, Tv, Clock } from "lucide-react";
import { format } from "date-fns";
import { ja } from "date-fns/locale";

export interface AnimeWork {
  id: number;
  title: string;
  thumbnail_url: string;
  official_site_url: string;
  annict_id: number;
  fastest_broadcast: string;
  station: string;
  day_of_week: number;
}

export default function AnimeCard({ anime, active = false }: { anime: AnimeWork; active?: boolean }) {
  const broadcastDate = new Date(anime.fastest_broadcast);
  const timeString = format(broadcastDate, "MM/dd (E) HH:mm", { locale: ja });

  return (
    <div className={`group relative flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg border-2 ${active ? 'border-red-500 shadow-red-500/10' : 'border-slate-200 hover:border-indigo-400'}`}>

      {/* Thumbnail */}
      <div className="relative aspect-9/16 w-full overflow-hidden bg-slate-100 border-b-2 border-slate-100">
        {anime.thumbnail_url ? (
          <Image
            src={anime.thumbnail_url}
            alt={anime.title}
            fill
            className="object-cover transition-transform duration-700 group-hover:scale-110"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            loading="eager"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-slate-300">
            <Tv size={48} />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="relative flex flex-1 flex-col p-5 bg-white">
        <h3 className="mb-3 line-clamp-2 text-lg font-extrabold leading-tight text-slate-900 transition-colors group-hover:text-indigo-600">
          {anime.title}
        </h3>

        <div className="mt-auto space-y-2 text-sm text-slate-600 font-medium">
          <div className="flex items-center gap-2">
            <Clock size={16} className={active ? "text-red-500" : "text-indigo-500"} />
            <span className="tracking-wide">{timeString} ~</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Tv size={16} className="text-slate-400" />
              <span className="text-xs font-bold text-slate-500">{anime.station}</span>
            </div>

            {anime.official_site_url && (
              <a
                href={anime.official_site_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center rounded-lg bg-slate-100 p-2 text-slate-600 transition-colors hover:bg-indigo-600 hover:text-white focus:outline-none"
                aria-label={`${anime.title} 公式サイト`}
              >
                <ExternalLink size={14} />
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
