import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseName, sortTitle } from './filename.js';

test('parses a movie filename with year and release noise', () => {
  const parsed = parseName('The.Grand.Budapest.Hotel.2014.1080p.BluRay.x264');
  assert.equal(parsed.title, 'The Grand Budapest Hotel');
  assert.equal(parsed.year, 2014);
  assert.equal(parsed.series, null);
});

test('parses an episode filename', () => {
  const parsed = parseName('Some.Show.S02E07.The.Reckoning.1080p.WEB-DL', 'Season 2');
  assert.equal(parsed.series, 'Some Show');
  assert.equal(parsed.season, 2);
  assert.equal(parsed.episode, 7);
  assert.equal(parsed.title, 'S02E07 · The Reckoning');
});

test('falls back to the parent folder when the episode file has no series', () => {
  const parsed = parseName('S01E01', 'Breaking Bread');
  assert.equal(parsed.series, 'Breaking Bread');
  assert.equal(parsed.title, 'S01E01');
});

test('keeps a plain title when nothing matches', () => {
  const parsed = parseName('home_video_clip');
  assert.equal(parsed.title, 'Home Video Clip');
  assert.equal(parsed.year, null);
});

test('sorts titles ignoring a leading article', () => {
  assert.equal(sortTitle('The Matrix'), 'matrix');
  assert.equal(sortTitle('Arrival'), 'arrival');
});
