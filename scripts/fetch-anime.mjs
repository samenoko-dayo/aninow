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
  console.error("Error: Environment variables (ANNICT_ACCESS_TOKEN / TMDB_ACCESS_TOKEN) not set in .env.local");
  process.exit(1);
}

// Set up data directory and cache file path
const outDir = path.resolve(__dirname, '../data');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
const CACHE_FILE = path.join(outDir, 'image-cache.json');

// Helper to sleep for rate limiting
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Helper to load image cache from local file
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

// Helper to fetch poster image from TMDB via Bearer authentication
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

    if (!res.ok) {
      const errorData = await res.json();
      console.error(`\nTMDB API Error (${res.status}): ${errorData.status_message}`);
      return null;
    }

    const data = await res.json();
    const result = data.results?.[0];
    if (result && result.poster_path) {
      return `https://image.tmdb.org/t/p/w500${result.poster_path}`;
    }
    return null;
  } catch (error) {
    console.error(`\nTMDB request error for "${searchQuery}":`, error.message);
    return null;
  }
}

// Helper to determine the current season string
function getCurrentSeason() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  let season = 'spring';
  if (month >= 1 && month <= 3) season = 'winter';
  else if (month >= 4 && month <= 6) season = 'spring';
  else if (month >= 7 && month <= 9) season = 'summer';
  else if (month >= 10 && month <= 12) season = 'autumn';
  return `${year}-${season}`;
}

// Helper to format timestamp (YYYY/mm/dd HH:MM)
function getFormattedTimestamp() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  return `${y}/${m}/${d} ${hh}:${mm}`;
}

// Helper to translate season string to Japanese
function translateSeason(seasonStr) {
  const [year, season] = seasonStr.split('-');
  const mapping = { winter: '冬', spring: '春', summer: '夏', autumn: '秋' };
  return `${year}年 ${mapping[season]}`;
}

async function fetchAnime() {
  const now = new Date();
  const seasonOption = getCurrentSeason();
  const imageCache = loadImageCache();
  let cacheUpdated = false;

  console.log(`Fetching works for season: ${seasonOption} using GraphQL API...`);

  let allWorks = [];
  let hasNextPage = true;
  let cursor = null;

  // Fetch all works from Annict with seriesList info
  while (hasNextPage) {
    const query = `
      query searchSeasonWorks($season: String!, $cursor: String) {
        searchWorks(seasons: [$season], orderBy: { field: WATCHERS_COUNT, direction: DESC }, after: $cursor) {
          nodes {
            annictId
            title
            media
            officialSiteUrl
            seriesList {
              nodes {
                name
              }
            }
            image {
              recommendedImageUrl
            }
            programs(orderBy: { field: STARTED_AT, direction: ASC }) {
              nodes {
                startedAt
                rebroadcast
                channel {
                  name
                  channelGroup {
                    name
                  }
                }
              }
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `;

    const res = await fetch('https://api.annict.com/graphql', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${annictToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query, variables: { season: seasonOption, cursor } })
    });

    if (!res.ok) {
      console.error(`Annict API Error: ${res.status}`);
      break;
    }

    const { data } = await res.json();
    const searchWorks = data?.searchWorks;
    if (!searchWorks) break;

    // Filter only TV series (Annict GraphQL returns media as "TV")
    allWorks = allWorks.concat(searchWorks.nodes.filter(n => n.media === 'TV'));
    hasNextPage = searchWorks.pageInfo.hasNextPage;
    cursor = searchWorks.pageInfo.endCursor;
  }

  console.log(`Found ${allWorks.length} TV anime works. Validating schedules and fetching images...`);

  // Transform works matching original requirements with TMDB integration
  const animeData = [];

  for (const work of allWorks) {
    // Find the next upcoming program for this work, excluding streaming/radio/non-Kanto terrestrial
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

      // Any program that is in the future or currently airing (within last 30m)
      return new Date(new Date(p.startedAt).getTime() + 30 * 60 * 1000) >= now;
    });

    if (!nextProgram) continue;

    // Resolve poster image URL using cache or TMDB API
    let tmdbPosterUrl = null;
    if (imageCache[work.annictId] !== undefined) {
      // Use cached result if available
      tmdbPosterUrl = imageCache[work.annictId];
    } else {
      // Step 1: Search with original Annict title
      process.stdout.write(`Fetching TMDB image for: ${work.title} (Search: ${work.title}) ... `);
      tmdbPosterUrl = await fetchTmdbPoster(work.title);

      // Step 2: Fallback to series name if first attempt fails and series info is available
      const seriesName = work.seriesList?.nodes?.[0]?.name;
      if (!tmdbPosterUrl && seriesName && seriesName !== work.title) {
        process.stdout.write(`\n  Fallback searching series: ${seriesName} ... `);
        await sleep(250); // Briefly wait before retry
        tmdbPosterUrl = await fetchTmdbPoster(seriesName);
      }

      // Update cache
      imageCache[work.annictId] = tmdbPosterUrl;
      cacheUpdated = true;
      console.log(tmdbPosterUrl ? "Success" : "Not Found");
      
      // Wait to respect TMDB rate limits
      await sleep(250);
    }

    const nextDate = new Date(nextProgram.startedAt);
    const stationName = nextProgram.channel.name;

    // Fallback to Annict image if TMDB poster is not found
    const annictImage = work.image?.internalUrl || work.image?.recommendedImageUrl || '';

    animeData.push({
      id: work.annictId,
      title: work.title,
      thumbnail_url: tmdbPosterUrl || annictImage,
      official_site_url: work.officialSiteUrl || '',
      annict_id: work.annictId,
      fastest_broadcast: nextDate.toISOString(),
      station: stationName,
      day_of_week: nextDate.getDay()
    });
  }

  // Persist updated image cache to local file
  if (cacheUpdated) {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(imageCache, null, 2), 'utf8');
    console.log(`Cache updated.`);
  }

  // Generate the final anime.json file with metadata
  const finalData = {
    season: translateSeason(seasonOption),
    updated_at: getFormattedTimestamp(),
    works: animeData
  };

  const outFile = path.join(outDir, 'anime.json');
  fs.writeFileSync(outFile, JSON.stringify(finalData, null, 2), 'utf8');
  
  console.log(`\nGenerated data/anime.json with ${animeData.length} entries successfully!`);
}

fetchAnime().catch(console.error);