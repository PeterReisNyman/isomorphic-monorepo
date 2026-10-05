// Local reader for the blog: lists the dated posts in this folder and renders them as markdown.
// Usage: node blog/serve.mjs  (PORT overrides the default 4848)
import { createServer } from 'node:http'
import { readdir, readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = fileURLToPath(new URL('.', import.meta.url))
const port = Number(process.env.PORT) || 4848
const POST = /^(\d{4}-\d{2}-\d{2})-(.+)\.md$/

// Only posts and images are served; everything else in the folder stays private.
const types = {
  '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
}

async function listPosts() {
  const files = (await readdir(dir)).filter((f) => POST.test(f)).sort().reverse()
  return Promise.all(
    files.map(async (file) => {
      const [, date, slug] = file.match(POST)
      const text = await readFile(join(dir, file), 'utf8')
      const title = text.match(/^#\s+(.+)$/m)?.[1].trim() ?? slug.replace(/-/g, ' ')
      return { file, date, title }
    }),
  )
}

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Blog</title>
<style>
  :root { --bg: #fbfaf7; --fg: #1d1d1f; --muted: #6e6e73; --line: #e5e3dd; --accent: #2f5fd0; --code: #f1efe9; }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #161616; --fg: #e8e6e1; --muted: #9a9893; --line: #2c2c2c; --accent: #8fb0ff; --code: #232323; }
  }
  body { margin: 0; background: var(--bg); color: var(--fg); font: 17px/1.65 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  main { max-width: 680px; margin: 0 auto; padding: 48px 16px 96px; }
  a { color: var(--accent); text-decoration: none; }
  a:hover { text-decoration: underline; }
  header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 32px; }
  header h1 { font-size: 20px; margin: 0; }
  header h1 a { color: var(--fg); }
  .muted { color: var(--muted); font-size: 14px; }
  ul.posts { list-style: none; padding: 0; margin: 0; }
  ul.posts li { display: flex; gap: 16px; padding: 10px 0; border-bottom: 1px solid var(--line); }
  ul.posts time { flex: none; white-space: nowrap; color: var(--muted); font-size: 15px; font-variant-numeric: tabular-nums; }
  article h1 { font-size: 30px; line-height: 1.25; margin: 4px 0 24px; }
  article img { max-width: 100%; }
  code { background: var(--code); padding: 1px 5px; border-radius: 4px; font-size: 0.9em; }
  pre { background: var(--code); padding: 14px 16px; border-radius: 8px; overflow-x: auto; }
  pre code { padding: 0; background: none; }
  blockquote { margin: 0; padding-left: 16px; border-left: 3px solid var(--line); color: var(--muted); }
  table { border-collapse: collapse; }
  td, th { border: 1px solid var(--line); padding: 4px 10px; }
</style>
</head>
<body>
<main>
  <header><h1><a href="#">Blog</a></h1><span class="muted" id="count"></span></header>
  <div id="view"></div>
</main>
<script type="module">
  import { marked } from 'https://cdn.jsdelivr.net/npm/marked@15/+esm'

  const view = document.getElementById('view')
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

  async function render() {
    const posts = await (await fetch('/posts.json')).json()
    document.getElementById('count').textContent = posts.length === 1 ? '1 post' : posts.length + ' posts'
    const post = posts.find((p) => p.file === decodeURIComponent(location.hash.slice(1)))
    if (post) {
      const text = await (await fetch('/' + encodeURIComponent(post.file))).text()
      document.title = post.title
      view.innerHTML = '<p class="muted"><a href="#">← All posts</a> · <time>' + post.date + '</time></p>'
        + '<article>' + marked.parse(text) + '</article>'
    } else if (posts.length) {
      document.title = 'Blog'
      view.innerHTML = '<ul class="posts">' + posts.map((p) =>
        '<li><time>' + p.date + '</time><a href="#' + encodeURIComponent(p.file) + '">' + esc(p.title) + '</a></li>'
      ).join('') + '</ul>'
    } else {
      document.title = 'Blog'
      const name = new Date().toISOString().slice(0, 10) + '-my-first-note.md'
      view.innerHTML = '<p class="muted">No posts yet. Add <code>blog/' + name + '</code> starting with a <code># Title</code> line, then come back here.</p>'
    }
  }

  addEventListener('hashchange', () => { render(); scrollTo(0, 0) })
  addEventListener('focus', render) // pick up edits made in the editor
  render()
</script>
</body>
</html>`

createServer(async (req, res) => {
  const send = (status, type, body) => res.writeHead(status, { 'content-type': type }).end(body)
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
    if (path === '/') return send(200, 'text/html; charset=utf-8', page)
    if (path === '/posts.json') return send(200, 'application/json', JSON.stringify(await listPosts()))
    const file = join(dir, path)
    const type = types[extname(file).toLowerCase()]
    if (!file.startsWith(dir) || !type) return send(404, 'text/plain', 'Not found')
    send(200, type, await readFile(file))
  } catch {
    send(404, 'text/plain', 'Not found')
  }
}).listen(port, () => console.log(`Blog at http://localhost:${port}`))
