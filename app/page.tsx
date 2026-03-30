import fs from 'fs';
import path from 'path';
import NowOnAir from './components/NowOnAir';
import AnimeGrid from './components/AnimeGrid';
import { Tv } from 'lucide-react';

async function getAnimeData() {
  const filePath = path.join(process.cwd(), 'data', 'anime.json');
  try {
    const fileContents = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(fileContents);
  } catch (error) {
    console.error("Failed to read anime.json", error);
    return [];
  }
}

export default async function Home() {
  const animeData = await getAnimeData();
  const season = animeData?.season || "今期";
  const updatedAt = animeData?.updated_at || "";
  const works = animeData?.works || [];

  return (
    <main className="min-h-screen bg-slate-50 font-sans text-slate-900 selection:bg-indigo-500/30">
      {/* Background decoration */}
      <div className="fixed inset-0 z-0 bg-slate-50"></div>

      <div className="relative z-10 mx-auto max-w-7xl px-4 pt-12 sm:px-6 lg:px-8 lg:pt-20">

        {/* Header */}
        <header className="mb-16 flex flex-col items-center justify-center text-center space-y-4">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-600 shadow-md">
            <Tv size={32} className="text-white" />
          </div>
          <div className="flex flex-col items-center gap-2">
            <h1 className="text-5xl font-black tracking-tighter sm:text-7xl">
              <span className="text-indigo-600">
                AniNow
              </span>
            </h1>
            <div className="inline-flex items-center rounded-2xl bg-indigo-50 px-4 py-2 text-xl font-black text-indigo-600 border-2 border-indigo-100 shadow-sm">
              {season}
            </div>
          </div>
          <p className="max-w-xl text-lg text-slate-600 font-medium">
            今期のアニメをまとめてチェック！放送中のアニメを逃さない！
          </p>
          {updatedAt && (
            <div className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500 uppercase tracking-wider">
              <span className="h-1.5 w-1.5 rounded-full bg-slate-400"></span>
              最終更新: {updatedAt}
            </div>
          )}
        </header>

        {works.length > 0 ? (
          <>
            <NowOnAir animeList={works} />
            <AnimeGrid animeList={works} />
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center text-slate-400">
            <Tv size={48} className="mb-4 opacity-40" />
            <p className="text-xl font-medium">今期の番組データが見つかりませんでした。</p>
          </div>
        )}

      </div>
    </main>
  );
}
