export interface ParsedName {
  title: string;
  year: number | null;
  series: string | null;
  season: number | null;
  episode: number | null;
}

const EPISODE_PATTERN = /^(?<series>.*?)[. _-]*s(?<season>\d{1,2})[. _-]*e(?<episode>\d{1,3})(?<rest>.*)$/i;
const YEAR_PATTERN = /[([. _-](?<year>19\d{2}|20\d{2})[)\]. _-]?/;
const NOISE_PATTERN =
  /\b(1080p|2160p|720p|480p|4k|uhd|hdr|x264|x265|h ?264|h ?265|hevc|av1|bluray|blu-ray|brrip|bdrip|webrip|web-dl|webdl|hdtv|dvdrip|remux|proper|repack|extended|remastered|aac|ac3|eac3|dts|truehd|atmos|5 1|7 1|multi|dual|subs)\b.*$/i;

function clean(raw: string): string {
  const spaced = raw.replace(/[._]+/g, ' ').replace(/\s+/g, ' ').trim();
  const denoised = spaced.replace(NOISE_PATTERN, '').trim();
  const trimmed = (denoised || spaced).replace(/[\s\-–—([{]+$/, '').trim();
  return trimmed || spaced;
}

function titleCase(value: string): string {
  return value
    .split(' ')
    .map((word) => (word.length > 0 ? word[0]!.toUpperCase() + word.slice(1) : word))
    .join(' ');
}

/**
 * Derives display metadata from a media filename (without extension) and, for
 * episodes that carry no series in the filename, the name of the parent folder.
 */
export function parseName(basename: string, parentFolder?: string): ParsedName {
  const episodeMatch = EPISODE_PATTERN.exec(basename);
  if (episodeMatch?.groups) {
    const { series, season, episode, rest } = episodeMatch.groups;
    const seriesName = clean(series ?? '') || clean(parentFolder ?? '') || 'Unknown series';
    const episodeTitle = clean(rest ?? '');
    const seasonNumber = Number(season);
    const episodeNumber = Number(episode);
    const label = `S${String(seasonNumber).padStart(2, '0')}E${String(episodeNumber).padStart(2, '0')}`;
    return {
      title: episodeTitle ? `${label} · ${titleCase(episodeTitle)}` : label,
      year: null,
      series: titleCase(seriesName),
      season: seasonNumber,
      episode: episodeNumber,
    };
  }

  const yearMatch = YEAR_PATTERN.exec(basename);
  const year = yearMatch?.groups?.year ? Number(yearMatch.groups.year) : null;
  const withoutYear = yearMatch ? basename.slice(0, yearMatch.index) : basename;
  const title = clean(withoutYear) || clean(basename);
  return { title: titleCase(title), year, series: null, season: null, episode: null };
}

/** Titles are sorted ignoring a leading article, mirroring how shelves are ordered. */
export function sortTitle(title: string): string {
  return title.replace(/^(the|a|an)\s+/i, '').toLowerCase();
}
