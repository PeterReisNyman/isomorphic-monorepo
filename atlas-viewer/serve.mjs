// Local human reference browser. Storage and labels use permanent global video IDs.
// Usage: node atlas-viewer/serve.mjs (PORT overrides 4949; ATLAS_ROOT supports fixtures).
// Reads the generated index only; never derives or annotates videos.
import { createServer } from 'node:http'
import { createReadStream } from 'node:fs'
import { readdir, readFile, realpath, rename, stat, writeFile } from 'node:fs/promises'
import { extname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = fileURLToPath(new URL('.', import.meta.url))
const atlas = resolve(process.env.ATLAS_ROOT || resolve(here, '../isomorphic-atlas'))
const storage = join(atlas, 'atlas')
const marksFile = join(atlas, 'marks.json')
const port = Number(process.env.PORT) || 4949
const exists = (p) => stat(p).then((s) => s.isFile(), () => false)
const globalId = /^v\d{4,}$/
const asText = (value, fallback = '') => typeof value === 'string' ? value : fallback
const httpUrl = (value) => /^https?:\/\//.test(asText(value)) ? value : null

let cachedIndex
let cachedMtime
async function readIndex() {
  const file = join(atlas, 'index.json')
  const info = await stat(file)
  if (!cachedIndex || cachedMtime !== info.mtimeMs) {
    const index = JSON.parse(await readFile(file, 'utf8'))
    if (index.schema_version !== 1 || !Array.isArray(index.videos)) throw new Error('Run isomorphic-atlas/scripts/index.py to build the Storage v1 index.')
    cachedIndex = index
    cachedMtime = info.mtimeMs
  }
  return cachedIndex
}

function registeredPath(relative) {
  const path = resolve(atlas, relative)
  if (!path.startsWith(storage + sep)) throw new Error('Indexed media path escapes atlas/')
  return path
}

async function posterFor(record) {
  // Protected sources may be played by people, but never get automatic analysis.
  if (record.meta.annotate === false) return null
  const directory = registeredPath(record.path)
  const cuts = join(directory, 'derived/frames/cuts')
  const frames = await readdir(cuts).catch(() => [])
  const first = frames.filter((name) => /^\d+(?:\.\d+)?s\.(?:jpe?g|png)$/i.test(name)).sort((a, b) => parseFloat(a) - parseFloat(b))[0]
  if (first) return join(cuts, first)
  const cover = join(directory, 'collected/poster.jpg')
  return await exists(cover) ? cover : null
}

function shelfOf(record) { return `${record.meta.type}/${record.meta.platform}` }
function collectionOf(record) {
  return typeof record.meta.collection === 'string' && record.meta.collection ? `${shelfOf(record)} — ${record.meta.collection}` : null
}

async function listVideos(records) {
  return Promise.all(records.map(async (record) => {
    const meta = record.meta
    const handle = asText(meta.creator, asText(meta.account, record.id))
    const media = record.media?.status === 'present' && record.media.path ? registeredPath(record.media.path) : null
    const poster = await posterFor(record)
    return {
      key: record.id,
      path: record.path,
      handle,
      url: httpUrl(meta.source) || httpUrl(meta.url) || httpUrl(meta.legacy_metadata?.url),
      profileUrl: meta.platform === 'instagram' ? `https://www.instagram.com/${encodeURIComponent(handle)}/` : null,
      platform: asText(meta.platform, 'source'),
      views: meta.views ?? null,
      likes: meta.likes ?? null,
      comments: meta.comments ?? null,
      duration: meta.duration_s ?? (typeof meta.duration_ms === 'number' ? meta.duration_ms / 1000 : null),
      posted: asText(meta.posted_at) || null,
      caption: asText(meta.caption) || asText(meta.title),
      category: asText(meta.kima?.category) || null,
      hasVideo: media ? await exists(media) : false,
      hasPoster: Boolean(poster),
      mediaUrl: `/media/${record.id}/video`,
      posterUrl: poster ? `/media/${record.id}/poster` : null,
    }
  }))
}

// ---------- marks ----------
function legacyKey(record) {
  const old = record.meta.legacy_metadata || {}
  const path = asText(record.meta.migration?.original_path)
  const match = /\/accounts\/([^/]+)\/videos\/([^/]+)$/.exec('/' + path)
  const handle = asText(old.account, asText(record.meta.account, match?.[1]))
  const shortcode = asText(old.id, match?.[2])
  return handle && shortcode ? `${handle}/${shortcode}` : null
}

async function readMarks() {
  let marks
  try { marks = JSON.parse(await readFile(marksFile, 'utf8')) }
  catch (error) { if (error.code !== 'ENOENT') throw error; marks = {} }
  const videos = { ...(marks.videos || {}) }
  // Map in memory on reads. The first human edit persists IDs atomically; the archive remains intact.
  for (const record of (await readIndex()).videos) {
    const oldKey = legacyKey(record)
    if (oldKey && Object.hasOwn(videos, oldKey)) {
      if (!Object.hasOwn(videos, record.id)) videos[record.id] = videos[oldKey]
      delete videos[oldKey]
    }
  }
  return {
    _note: 'Human marks made in atlas-viewer, keyed by permanent video ID (vNNNN). Unmatched legacy marks are retained.',
    labels: marks.labels?.length ? marks.labels : ['marked'],
    videos,
  }
}

let writing = Promise.resolve()
function updateMarks(change) {
  const next = writing.catch(() => {}).then(async () => {
    const marks = await readMarks()
    change(marks)
    await writeFile(marksFile + '.tmp', JSON.stringify(marks, null, 2) + '\n')
    await rename(marksFile + '.tmp', marksFile)
    return marks
  })
  writing = next
  return next
}

// ---------- http ----------
const types = { '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.m4v': 'video/mp4', '.webm': 'video/webm', '.mkv': 'video/x-matroska', '.avi': 'video/x-msvideo', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png' }
function sendFile(req, res, file, size) {
  const type = types[extname(file).toLowerCase()] || 'application/octet-stream'
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '')
  if (!range) {
    res.writeHead(200, { 'content-type': type, 'content-length': size, 'accept-ranges': 'bytes' })
    return createReadStream(file).pipe(res)
  }
  let start = range[1] === '' ? size - Number(range[2]) : Number(range[1])
  let end = range[1] !== '' && range[2] !== '' ? Number(range[2]) : size - 1
  start = Math.max(0, start)
  end = Math.min(end, size - 1)
  if (start > end) return res.writeHead(416, { 'content-range': `bytes */${size}` }).end()
  res.writeHead(206, { 'content-type': type, 'content-length': end - start + 1, 'content-range': `bytes ${start}-${end}/${size}`, 'accept-ranges': 'bytes' })
  createReadStream(file, { start, end }).pipe(res)
}

const json = (res, data) => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(data))
const badRequest = (res, message) => res.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ error: message }))
const body = (req) => new Promise((ok, fail) => {
  let s = ''
  req.on('data', (c) => { s += c; if (s.length > 65536) { fail(new Error('Request too large')); req.destroy() } }).on('end', () => { try { ok(JSON.parse(s)) } catch (e) { fail(e) } })
})
const validLabels = (labels) => Array.isArray(labels) && labels.every((label) => typeof label === 'string' && label.trim().length > 0)

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost')
    const path = decodeURIComponent(url.pathname)
    if (path === '/') return res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(await readFile(join(here, 'index.html')))
    if (path === '/api/videos') {
      const records = (await readIndex()).videos
      const roots = [...new Set(records.map(shelfOf)), ...new Set(records.map(collectionOf).filter(Boolean))]
      const root = roots.includes(url.searchParams.get('root')) ? url.searchParams.get('root') : roots[0] || null
      return json(res, { roots, root, videos: await listVideos(records.filter((record) => shelfOf(record) === root || collectionOf(record) === root)) })
    }
    if (path === '/api/marks' && req.method === 'GET') return json(res, await readMarks())
    if (path === '/api/marks' && req.method === 'POST') {
      const { key, labels } = await body(req)
      if (!globalId.test(key) || !(await readIndex()).videos.some((record) => record.id === key) || !validLabels(labels)) return badRequest(res, 'Expected an existing video ID and label strings')
      return json(res, await updateMarks((m) => {
        if (labels.length) m.videos[key] = [...new Set(labels)]
        else delete m.videos[key]
      }))
    }
    if (path === '/api/labels' && req.method === 'POST') {
      const { labels } = await body(req)
      if (!validLabels(labels) || !labels.length) return badRequest(res, 'Expected a nonempty list of labels')
      return json(res, await updateMarks((m) => {
        m.labels = [...new Set(labels)]
        for (const [key, ls] of Object.entries(m.videos)) {
          const kept = ls.filter((l) => labels.includes(l))
          if (kept.length) m.videos[key] = kept
          else delete m.videos[key]
        }
      }))
    }
    const mediaRequest = /^\/media\/(v\d{4,})\/(video|poster)$/.exec(path)
    if (mediaRequest) {
      const record = (await readIndex()).videos.find((video) => video.id === mediaRequest[1])
      const file = record && (mediaRequest[2] === 'poster' ? await posterFor(record) : record.media?.path && registeredPath(record.media.path))
      if (file) {
        const actual = await realpath(file).catch(() => null)
        const info = actual?.startsWith(storage + sep) ? await stat(actual).catch(() => null) : null
        if (info?.isFile()) return sendFile(req, res, actual, info.size)
      }
    }
    res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found')
  } catch (e) {
    res.writeHead(500, { 'content-type': 'text/plain' }).end(String(e.message || e))
  }
}).listen(port, '127.0.0.1', () => console.log(`Atlas viewer at http://localhost:${port}`))
