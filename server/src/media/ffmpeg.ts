import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

export interface ProbeResult {
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  videoCodec: string | null;
  audioCodec: string | null;
  container: string | null;
}

interface FfprobeStream {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
}

interface FfprobeOutput {
  streams?: FfprobeStream[];
  format?: { duration?: string; format_name?: string };
}

export async function probe(path: string): Promise<ProbeResult> {
  const { stdout } = await run(
    'ffprobe',
    ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', path],
    { maxBuffer: 8 * 1024 * 1024 },
  );
  const parsed = JSON.parse(stdout) as FfprobeOutput;
  const streams = parsed.streams ?? [];
  const video = streams.find((stream) => stream.codec_type === 'video');
  const audio = streams.find((stream) => stream.codec_type === 'audio');
  const duration = parsed.format?.duration ? Number(parsed.format.duration) : null;
  return {
    durationSeconds: duration !== null && Number.isFinite(duration) ? duration : null,
    width: video?.width ?? null,
    height: video?.height ?? null,
    videoCodec: video?.codec_name ?? null,
    audioCodec: audio?.codec_name ?? null,
    container: parsed.format?.format_name ?? null,
  };
}

/** Grabs a single frame as artwork, preferring a frame 10% into the runtime. */
export async function extractThumbnail(
  path: string,
  destination: string,
  durationSeconds: number | null,
): Promise<void> {
  const seek = durationSeconds && durationSeconds > 30 ? durationSeconds * 0.1 : 1;
  await run(
    'ffmpeg',
    [
      '-hide_banner',
      '-loglevel', 'error',
      '-ss', seek.toFixed(2),
      '-i', path,
      '-frames:v', '1',
      '-vf', 'scale=480:-2',
      '-y', destination,
    ],
    { maxBuffer: 8 * 1024 * 1024 },
  );
}
