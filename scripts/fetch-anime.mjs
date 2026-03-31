import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Load .env.local
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const annictToken = process.env.ANNICT_ACCESS_TOKEN;
const tmdbAccessToken = process.env.TMDB_ACCESS_TOKEN || process.env.TMDB_API_KEY;

if (!annictToken || !tmdbAccessToken) {
  console.error("Error: Environment variables not set in .env.local");
  process.exit(1);
}

// Set up data directory and cache file path
const outDir = path.resolve(__dirname, '../data');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
const CACHE_FILE = path.join(outDir, 'image-cache.json');

// Helper to sleep for rate limiting
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Helper to load image cache
function loadImageCache() {
  if (fs.existsSync(CACHE_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    } catch (e) {
      return {};
    }
  }
  return {};
}

// Helper to fetch poster image from TMDB
async function fetchTmdbPoster(searchQuery) {
  try {
    const url = `https://api.themoviedb.org/3/search/multi?language=ja-JP&query=${encodeURIComponent(searchQuery)}&include_adult=false`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        Authorization: `Bearer ${tmdbAccessToken}`
      }
    });

    if (!res.ok) return null;
    const data = await res.json();
    const animationResult = data.results?.find(r => r.genre_ids?.includes(16));
    const result = animationResult;
    return result?.poster_path ? `https://image.tmdb.org/t/p/w500${result.poster_path}` : null;
  } catch (error) {
    return null;
  }
}

// Helper to determine the current season label (e.g. "2024年 春")
function getCurrentSeasonLabel() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const mapping = { winter: '冬', spring: '春', summer: '夏', autumn: '秋' };
  let season = 'spring';
  if (month >= 1 && month <= 3) season = 'winter';
  else if (month >= 4 && month <= 6) season = 'spring';
  else if (month >= 7 && month <= 9) season = 'summer';
  else if (month >= 10 && month <= 12) season = 'autumn';
  return `${year}年 ${mapping[season]}`;
}

// Helper to get a list of recent seasons (Current + last 4 seasons)
function getTargetSeasons() {
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth() + 1;
  const seasons = ['winter', 'spring', 'summer', 'autumn'];
  let currentIdx = Math.floor((month - 1) / 3); // 0: winter, 1: spring, 2: summer, 3: autumn

  const results = [];
  // Get current and past 4 seasons (covers over 1 year of series)
  for (let i = 0; i < 5; i++) {
    results.push(`${year}-${seasons[currentIdx]}`);
    currentIdx--;
    if (currentIdx < 0) {
      currentIdx = 3;
      year--;
    }
  }
  return results;
}

// Helper to format timestamp
function getFormattedTimestamp() {
  const now = new Date();
  return `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

async function fetchAnime() {
  const now = new Date();
  const imageCache = loadImageCache();
  let cacheUpdated = false;

  const targetSeasons = getTargetSeasons();
  console.log(`Fetching works for seasons: ${targetSeasons.join(', ')}...`);

  let allWorks = [];
  let hasNextPage = true;
  let cursor = null;

  // 1. Fetch works from multiple seasons to catch ongoing series
  while (hasNextPage) {
    const query = `
      query searchOngoingWorks($seasons: [String!], $cursor: String) {
        searchWorks(seasons: $seasons, orderBy: { field: WATCHERS_COUNT, direction: DESC }, after: $cursor) {
          nodes {
            annictId
            title
            media
            officialSiteUrl
            seriesList { nodes { name } }
            image { recommendedImageUrl }
            programs(orderBy: { field: STARTED_AT, direction: ASC }) {
              nodes {
                startedAt
                rebroadcast
                channel {
                  name
                  channelGroup { name }
                }
              }
            }
          }
          pageInfo { hasNextPage endCursor }
        }
      }
    `;

    const res = await fetch('https://api.annict.com/graphql', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${annictToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query, variables: { seasons: targetSeasons, cursor } })
    });

    if (!res.ok) {
      console.error(`Annict API Error: ${res.status}`);
      break;
    }

    const { data } = await res.json();
    const searchWorks = data?.searchWorks;
    if (!searchWorks) break;

    // Filter TV anime
    allWorks = allWorks.concat(searchWorks.nodes.filter(n => n.media === 'TV'));
    hasNextPage = searchWorks.pageInfo.hasNextPage;
    cursor = searchWorks.pageInfo.endCursor;
  }

  console.log(`Found ${allWorks.length} candidate TV anime works. Filtering for active schedules...`);

  // 2. Filter works that have an upcoming program
  const animeData = [];

  for (const work of allWorks) {
    const excludedGroups = ['動画サービス', 'ラジオ', 'ABEMA'];
    const nextProgram = (work.programs?.nodes || []).find(p => {
      const groupName = p.channel?.channelGroup?.name || '';

      // Basic exclusions
      if (excludedGroups.includes(groupName) || groupName.includes('動画サービス')) {
        return false;
      }

      // Restrict terrestrial to Kanto region only
      if (groupName.startsWith('テレビ ') && groupName !== 'テレビ 関東') {
        return false;
      }

      if (p.rebroadcast) {
        return false;
      }

      // Find programs starting in the future or currently airing (within last 30m)
      const startTime = new Date(p.startedAt);
      return new Date(startTime.getTime() + 30 * 60 * 1000) >= now;
    });

    // Skip works that no longer have scheduled programs
    if (!nextProgram) continue;

    // Resolve poster image URL using cache or TMDB API
    let tmdbPosterUrl = null;
    if (imageCache[work.annictId] !== undefined) {
      tmdbPosterUrl = imageCache[work.annictId];
    } else {
      process.stdout.write(`Fetching TMDB image for: ${work.title} ... `);
      tmdbPosterUrl = await fetchTmdbPoster(work.title);

      const seriesName = work.seriesList?.nodes?.[0]?.name;
      if (!tmdbPosterUrl && seriesName && seriesName !== work.title) {
        process.stdout.write(`(Fallback: ${seriesName}) ... `);
        await sleep(250);
        tmdbPosterUrl = await fetchTmdbPoster(seriesName);
      }

      imageCache[work.annictId] = tmdbPosterUrl;
      cacheUpdated = true;
      console.log(tmdbPosterUrl ? "Success" : "Not Found");
      await sleep(250);
    }

    const nextDate = new Date(nextProgram.startedAt);
    animeData.push({
      id: work.annictId,
      title: work.title,
      thumbnail_url: tmdbPosterUrl || work.image?.internalUrl || work.image?.recommendedImageUrl || '',
      official_site_url: work.officialSiteUrl || '',
      annict_id: work.annictId,
      fastest_broadcast: nextDate.toISOString(),
      station: nextProgram.channel.name,
      day_of_week: nextDate.getDay()
    });
  }

  // Persist updated image cache
  if (cacheUpdated) {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(imageCache, null, 2), 'utf8');
    console.log(`Cache updated.`);
  }

  // Final JSON output
  const finalData = {
    season: getCurrentSeasonLabel(),
    updated_at: getFormattedTimestamp(),
    works: animeData
  };

  const outFile = path.join(outDir, 'anime.json');
  fs.writeFileSync(outFile, JSON.stringify(finalData, null, 2), 'utf8');

  console.log(`\nGenerated data/anime.json with ${animeData.length} active entries!`);
}

fetchAnime().catch(console.error);