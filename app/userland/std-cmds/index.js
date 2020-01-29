import { resolveParse, parseLocation, joinPath } from './util.js'
import * as commandsModule from './commands.js'
import * as socialModule from './social.js'

export const commands = commandsModule
export const social = socialModule

// current working directory methods
// =

export async function ls (opts = {}, location = '') {
  // pick target location
  location = this.env.resolve(location)
  var {drive, protocol, pathname} = parseLocation(location)

  // read
  var listing
  var st = await drive.stat(pathname)
  if (st.isUnsupportedProtocol) {
    throw new Error(`ls() is not supported on ${protocol} addresses`)
  } else if (st.isFile()) {
    return {
      listing: [{name: pathname.split('/').pop(), stat: st}],
      toHTML: () => html`Is a file.\nSize: ${st.size}`
    }
  } else {
    listing = await drive.readdir(pathname, {includeStats: true})
    return {
      listing,
      toHTML () {
        return listing
          .sort((a, b) => {
            // dirs on top
            if (a.stat.isDirectory() && !b.stat.isDirectory()) return -1
            if (!a.stat.isDirectory() && b.stat.isDirectory()) return 1
            return a.name.localeCompare(b.name)
          })
          .map(entry => {
            // coloring
            var color = 'default'
            if (entry.name.startsWith('.')) {
              color = 'gray'
            }

            // render
            const icon = entry.stat.isDirectory() ? 'folder' : 'file'
            const mountInfo = entry.stat.mount
              ? html` <span class="color-lightgray" style="font-weight: lighter">(<term-icon solid fw icon="external-link-square-alt"></term-icon>${entry.stat.mount.key.slice(0, 4)}..${entry.stat.mount.key.slice(-2)})</span>`
              : ''
            return html`<div><a
              href="${joinPath(joinPath(drive.url, pathname), entry.name)}"
              class="color-${color}"
            ><term-icon icon="${icon}"></term-icon> ${entry.name}${mountInfo}</a></div>`
          })
      }
    }
  }
}

export async function cd (opts = {}, location = '') {
  var cwd = this.env.resolve(location)
  if (cwd.startsWith('hyper://')) {
    // make sure the target location can be visited
    let urlp = new URL(cwd)
    let drive = new Hyperdrive(urlp.origin)
    let st
    try { st = await drive.stat(urlp.pathname) }
    catch (e) {
      throw new Error(`${location}: No such file or directory`)
    }
    if (!st.isDirectory()) {
      throw new Error(`${location}: Not a directory`)
    }
  }
  this.env.goto(cwd)
}

export function pwd (opts = {}) {
  let cwd = this.env.get('cwd')
  return {
    cwd,
    toHTML: () => html`<a href="${cwd}">${cwd}</div>`
  }
}

// folder manipulation
// =

export async function mkdir (opts, dst) {
  if (!dst) throw new Error('dst is required')
  var {drive, pathname} = resolveParse(this.env, dst)
  await drive.mkdir(pathname)
}

// file & folder manipulation
// =

export async function mv (opts, src, dst) {
  if (!src) throw new Error('src is required')
  if (!dst) throw new Error('dst is required')
  var srcp = resolveParse(this.env, src)
  var dstp = resolveParse(this.env, dst)
  
  let st = await dstp.drive.stat(dstp.pathname).catch(e => undefined)
  if (st && st.isDirectory()) {
    dstp.pathname = joinPath(dstp.pathname, src.split('/').pop())
  }

  await srcp.drive.rename(srcp.pathname, dstp.toString())
}

export async function cp (opts, src, dst) {
  if (!src) throw new Error('src is required')
  if (!dst) throw new Error('dst is required')
  var srcp = resolveParse(this.env, src)
  var dstp = resolveParse(this.env, dst)
  
  let st = await dstp.drive.stat(dstp.pathname).catch(e => undefined)
  if (st && st.isDirectory()) {
    dstp.pathname = joinPath(dstp.pathname, src.split('/').pop())
  }

  await srcp.drive.copy(srcp.pathname, dstp.toString())
}

export async function rm (opts, dst) {
  if (!dst) throw new Error('dst is required')
  var {drive, pathname} = resolveParse(this.env, dst)
  var st = await drive.stat(pathname)
  if (st.isDirectory()) {
    await drive.rmdir(pathname, {recursive: true})
  } else {
    await drive.unlink(pathname)
  }
}

export async function mount (opts, mountUrl, dst) {
  if (!mountUrl) throw new Error('mount-url is required')
  if (!dst) throw new Error('dst is required')
  var {drive, pathname} = resolveParse(this.env, dst)
  await drive.mount(pathname, mountUrl)
}

export async function query (opts = {}, ...paths) {
  var queriesMap = {}
  for (let path of paths) {
    let p = resolveParse(this.env, path)
    if (p.origin in queriesMap) {
      queriesMap[p.origin].opts.path.push(p.pathname)
    } else {
      queriesMap[p.origin] = {
        drive: p.drive,
        opts: Object.assign({}, opts, {path: [p.pathname]})
      }
    }
  }
  
  var allResults = []
  for (let query of Object.values(queriesMap)) {
    let res = await query.drive.query(query.opts)
    allResults = allResults.concat(res)
  }
  allResults.toHTML = () => html`${allResults.map(r => html`<a href=${r.url}>${r.path}</a><br>`)}`
  return allResults
}

export async function meta (opts, location, key = undefined, ...value) {
  if (!location) throw new Error('path is required')
  var {drive, pathname} = resolveParse(this.env, location)
  if (value.length) {
    await drive.updateMetadata(pathname, {[key]: value.join(' ')})
  } else if (opts.delete) {
    await drive.deleteMetadata(pathname, key)
  } else {
    var st = await drive.stat(pathname)
    if (key) {
      return st.metadata[key]
    } else {
      var meta = st.metadata
      Object.defineProperty(meta, 'toHTML', {
        enumerable: false,
        value: () => {
          return html`<table>${Object.entries(meta).map(([k, v]) => html`<tr><td><strong>${k || ''}&ensp;</strong></td><td>&quot;${v || ''}&quot;</td></tr>`)}</table>`
        }
      })
      return meta
    }
  }
}

export async function mkgoto (opts, location, href) {
  if (!location) throw new Error('path is required')
  if (!href) throw new Error('href is required')
  var {drive, pathname} = resolveParse(this.env, location)

  if (!pathname.endsWith('.goto')) {
    pathname += '.goto'
  }

  await drive.writeFile(pathname, '', {
    metadata: {
      href,
      title: opts.title
    }
  })
}

export async function bookmark (opts = {}, href = '.') {
  href = this.env.resolve(href || '.')
  var name = opts.filename || href.split('/').filter(Boolean).pop()
  if (!name.endsWith('.goto')) name += '.goto'
  await navigator.filesystem.writeFile(`/library/bookmarks/${name}`, '', {metadata: {href}})
}

// utilities
// =

export async function peek (opts = {}, location = '') {
  var {drive, origin, pathname} = resolveParse(this.env, location)
  if (/\.(png|jpe?g|gif)$/.test(pathname)) {
    return {toHTML: () => html`<img src=${(origin + pathname)}>`}
  }
  if (/\.(mp4|webm|mov)$/.test(pathname)) {
    return {toHTML: () => html`<video controls><source src=${(origin + pathname)}></video>`}
  }
  if (/\.(mp3|ogg)$/.test(pathname)) {
    return {toHTML: () => html`<audio controls><source src=${(origin + pathname)}></audio>`}
  }
  var content = await drive.readFile(pathname, 'utf8')
  return {toHTML: () => html`<pre>${content}</pre>`}
}

export async function go (opts = {}, location = '') {
  if (opts.bookmark) {
    location = `~/library/bookmarks/${location}`
    if (!location.endsWith('.goto')) location += '.goto'
  }
  location = this.env.resolve(location)
  if (location.endsWith('.goto')) {
    let urlp = parseLocation(location)
    let st = await urlp.drive.stat(urlp.pathname).catch(e => undefined)
    if (st && st.metadata.href) {
      location = st.metadata.href
    }
  }
  try {
    this.env.goto(location.toString())
  } catch (e) {
    // will fail if not a directory, don't worry about it
    if (!e.notADirectory) throw e
  }
  await this.page.goto(location, {newTab: opts.n})
}

export async function edit (opts = {}, location = '') {
  location = this.env.resolve(location)

  // create if dne
  var urlp = parseLocation(location)
  let st = await urlp.drive.stat(urlp.pathname).catch(e => undefined)
  if (!st) await urlp.drive.writeFile(urlp.pathname, '')

  await this.panel.open('editor-app', location)
  await this.panel.goto('editor-app', location)
  await this.panel.focus('editor-app')
}

// env vars
// =

export const env = {
  ls (opts) {
    var vars = this.env.getAll()
    Object.defineProperty(vars, 'toHTML', {
      enumerable: false,
      value: () => {
        return Object.entries(vars).map(([k, v]) => html`<strong>${k}</strong>: ${v}<br>`)
      }
    })
    return vars
  },
  get (opts, name) {
    if (name.startsWith('$')) name = name.slice(1)
    return this.env.get(name)
  },
  set (opts, name, value) {
    if (name.startsWith('$')) name = name.slice(1)
    return this.env.set(name, value)
  }
}

// page interactions
// =

export const page = {
  async exec (opts, js) {
    var result = await this.page.exec(js)
    return {
      result,
      toHTML: () => html`<pre>${result}</pre>`
    }
  },
  async inject (opts, css) {
    var id = await this.page.inject(css)
    const uninject = e => {
      e.preventDefault()
      this.page.uninject(id)
    } 
    this.out(html`<button @click=${uninject}>Uninject</button>`)
    return id
  },
  async uninject (opts, id) {
    return this.page.uninject(''+id)
  }
}