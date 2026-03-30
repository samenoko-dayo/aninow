import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Load .env.local
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const token = process.env.ANNICT_ACCESS_TOKEN;

if (!token) {
  console.error("Error: ANNICT_ACCESS_TOKEN is not set in .env.local");
  process.exit(1);
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
  const mapping = {
    winter: '冬',
    spring: '春',
    summer: '夏',
    autumn: '秋'
  };
  return `${year}年 ${mapping[season]}`;
}

async function fetchAnime() {
  const now = new Date();
  const seasonOption = getCurrentSeason();
  console.log(`Fetching works for season: ${seasonOption} using GraphQL API...`);

  let allWorks = [];
  let hasNextPage = true;
  let cursor = null;

  while (hasNextPage) {
    const query = `
      query searchSeasonWorks($season: String!, $cursor: String) {
        searchWorks(seasons: [$season], orderBy: { field: WATCHERS_COUNT, direction: DESC }, after: $cursor) {
          nodes {
            id
            annictId
            title
            media
            officialSiteUrl
            image {
              recommendedImageUrl
              facebookOgImageUrl
              twitterAvatarUrl
              twitterBiggerAvatarUrl
              twitterNormalAvatarUrl
              internalUrl(size: "master")
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
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query,
        variables: { season: seasonOption, cursor }
      })
    });

    if (!res.ok) {
      console.error(`API Error: ${res.status}`);
      const text = await res.text();
      console.error(text);
      break;
    }

    const { data, errors } = await res.json();

    if (errors) {
      console.error('GraphQL Errors:', errors);
      break;
    }

    const searchWorks = data?.searchWorks;
    if (!searchWorks) break;

    // Filter only TV series (Annict GraphQL returns media as "TV")
    const tvNodes = searchWorks.nodes.filter(node => node.media === 'TV');
    allWorks = allWorks.concat(tvNodes);

    hasNextPage = searchWorks.pageInfo.hasNextPage;
    cursor = searchWorks.pageInfo.endCursor;
  }

  console.log(`Found ${allWorks.length} TV anime works. Validating schedules...`);

  // Transform works matching original requirements
  const animeData = allWorks.map((work) => {
    // Find the next upcoming program for this work, excluding streaming/radio/non-Kanto terrestrial
    const excludedGroups = ['動画サービス', 'ラジオ', 'ABEMA'];
    const allPrograms = (work.programs?.nodes || []).filter(p => {
      const groupName = p.channel?.channelGroup?.name || '';
      
      // Basic exclusions
      if (excludedGroups.includes(groupName) || groupName.includes('動画サービス')) {
        return false;
      }

      // Restrict terrestrial to Kanto region only
      if (groupName.startsWith('テレビ ') && groupName !== 'テレビ 関東') {
        return false;
      }

      if (p.rebroadcast === true) {
        return false;
      }

      return p.startedAt && p.channel?.name;
    });
    
    // Any program that is in the future or currently airing (within last 30m)
    const nextProgram = allPrograms.find(p => {
      const start = new Date(p.startedAt);
      return new Date(start.getTime() + 30 * 60 * 1000) >= now;
    });

    if (!nextProgram) return null;

    const nextDate = new Date(nextProgram.startedAt);
    const stationName = nextProgram.channel.name;

    return {
      id: work.annictId,
      title: work.title,
      thumbnail_url: work.image?.internalUrl || work.image?.recommendedImageUrl || work.image?.facebookOgImageUrl || work.image?.twitterAvatarUrl || work.image?.twitterBiggerAvatarUrl || work.image?.twitterNormalAvatarUrl || '',
      official_site_url: work.officialSiteUrl || '',
      annict_id: work.annictId,
      fastest_broadcast: nextDate.toISOString(),
      station: stationName,
      day_of_week: nextDate.getDay()
    };
  }).filter(anime => anime !== null); 

  const outDir = path.resolve(__dirname, '../data');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const finalData = {
    season: translateSeason(seasonOption),
    updated_at: getFormattedTimestamp(),
    works: animeData
  };

  const outFile = path.join(outDir, 'anime.json');
  fs.writeFileSync(outFile, JSON.stringify(finalData, null, 2), 'utf8');
  console.log(`Generated data/anime.json with ${animeData.length} entries and metadata successfully!`);
}

fetchAnime().catch(console.error);
