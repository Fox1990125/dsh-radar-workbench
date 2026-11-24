/**
 * dsh-plugin-radar —— 宿主侧（Node 半段）。
 *
 * 干的活：把「插件市场（npm）」「技能（GitHub）」抓回来，算成卡片要用的样子，
 * 落到 ~/.dsh/dsh-plugin-radar/cache.json；再开四个同源保护的小接口给页签用。
 *
 * 三条底线：
 *   1. 所有联网都带超时（AbortSignal.timeout），失败只记 errors、不影响别的功能。
 *   2. 抓回来的东西一律先落缓存；页签永远先拿缓存，只有点「刷新」才真联网。
 *   3. 不注册任何全局事件、不改别人的东西，最坏情况就是少一个页签。
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { spawn } from 'node:child_process'

export const name = 'dsh-radar-workbench'

const DIR = path.join(os.homedir(), '.dsh', 'dsh-plugin-radar')
// 案例周报的镜像（由 插件周报/case-radar.mjs 每次出刊时写入）
const CASES_FILE = path.join(DIR, 'cases.json')
// 案例就地聊天：按案例 url 存对话，换一条案例互不影响
export const CASE_CHATS_FILE = path.join(DIR, 'case-chats.json')
// 读代码后自动讲一段的结果：按「案例链接@版本」缓存，同一版本只花一次钱
const GIST_FILE = path.join(DIR, 'case-gists.json')
// 雷达自己花过的钱（目前只记聊天；研究/报告/找 各自已有落点）
const COST_FILE = path.join(DIR, 'costs.json')
const CACHE_FILE = path.join(DIR, 'cache.json')
const STATE_FILE = path.join(DIR, 'state.json')
const PROFILE_DIR = path.join(os.homedir(), '.dsh', 'profiles', 'desktop')
const CACHE_TTL = 6 * 60 * 60 * 1000
const UA = 'dsh-plugin-radar/0.4 (+https://dshdesktop.cn; local tab)'

// ---------------------------------------------------------------- 基础工具

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'))
  } catch {
    return fallback
  }
}

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true })
  const tmp = file + '.tmp'
  await fs.writeFile(tmp, JSON.stringify(value, null, 2), 'utf8')
  await fs.rename(tmp, file)
}

function httpError(status, url) {
  const e = new Error('HTTP ' + status + ' · ' + shortUrl(url))
  e.status = Number(status) || 0
  return e
}

async function fetchJson(url, ms = 9000) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(ms),
    headers: { 'user-agent': UA, accept: 'application/json' },
  })
  if (!res.ok) throw httpError(res.status, url)
  return await res.json()
}

/** 403/429 是「次数用完了」，别的才是「这条路不通」。 */
function isRateLimit(e) {
  const s = Number((e && e.status) || 0)
  return s === 403 || s === 429
}

/** 带 HTTP 状态的才算「服务器回答了我」；连状态都没有的就是网络层断掉。 */
function isNetworkDown(e) {
  return !Number((e && e.status) || 0)
}

/** 额度什么时候恢复：读一次 rate_limit 拿 reset 时间戳；读不到就返回 0（文案退化成「过一小时」）。 */
async function resetAt() {
  try {
    const j = await fetchJson('https://api.github.com/rate_limit', 6000)
    return Number((j && j.resources && j.resources.core && j.resources.core.reset) || 0)
  } catch {
    return 0
  }
}

function shortUrl(url) {
  return String(url).replace(/^https?:\/\//, '').slice(0, 90)
}

const DAY = 86400000
const CHINESE = /[\u4e00-\u9fff]/

// ---------------------------------------------------------------- 中文关键词（不做假翻译，只给看得懂的线索）

const GLOSS = [
  ['plugin', '插件'], ['skill', '技能'], ['sidebar', '侧边栏'], ['panel', '面板'],
  ['dashboard', '看板'], ['pet', '桌宠'], ['wallpaper', '壁纸'], ['skin', '皮肤'],
  ['theme', '主题'], ['avatar', '头像'], ['emoji', '表情包'], ['meme', '梗图'],
  ['game', '小游戏'], ['music', '音乐'], ['voice', '语音'], ['tts', '朗读'],
  ['speech', '语音'], ['mcp', '外部工具'], ['browser', '浏览器'], ['chrome', '浏览器'],
  ['screenshot', '截图'], ['clipboard', '剪贴板'], ['notification', '提醒'], ['notify', '提醒'],
  ['reminder', '提醒'], ['todo', '待办'], ['task', '任务'], ['schedule', '定时任务'],
  ['cron', '定时任务'], ['calendar', '日历'], ['email', '邮件'], ['translate', '翻译'],
  ['translation', '翻译'], ['summarize', '总结'], ['summary', '总结'], ['search', '搜索'],
  ['download', '下载'], ['upload', '上传'], ['backup', '备份'], ['sync', '同步'],
  ['memory', '记忆'], ['context', '上下文'], ['token', 'token 花销'], ['cost', '花费'],
  ['usage', '用量'], ['prompt', '提示词'], ['agent', '智能体'], ['team', '多智能体'],
  ['workflow', '工作流'], ['automation', '自动化'], ['markdown', 'md 笔记'], ['note', '笔记'],
  ['notes', '笔记'], ['pdf', 'PDF'], ['excel', '表格'], ['spreadsheet', '表格'],
  ['word', 'Word 文档'], ['docx', 'Word 文档'], ['ppt', '幻灯片'], ['slide', '幻灯片'],
  ['image', '图片'], ['photo', '图片'], ['ocr', '图片识字'], ['code', '代码'],
  ['terminal', '终端'], ['shell', '命令行'], ['git', 'git'], ['api', '接口'],
  ['ui', '界面'], ['animation', '动画'], ['video', '视频'], ['audio', '音频'],
  ['weather', '天气'], ['news', '新闻'], ['stock', '股票'], ['monitor', '监控'],
  ['profile', '配置'], ['config', '配置'], ['manager', '管理器'], ['manager', '管理器'],
  ['install', '安装'], ['update', '更新'], ['cache', '缓存'], ['proxy', '代理'],
  ['keyboard', '快捷键'], ['shortcut', '快捷键'], ['file', '文件'], ['folder', '文件夹'],
  ['font', '字体'], ['color', '配色'], ['layout', '排版'], ['kanban', '看板'],
  ['chat', '聊天'], ['conversation', '对话'], ['session', '会话'], ['history', '历史记录'],
]

/** 把英文描述里认得的词翻成中文线索；返回去重后的短数组（最多 5 个）。 */
export function glossOf(text) {
  const s = String(text || '').toLowerCase()
  const out = []
  for (const [en, zh] of GLOSS) {
    if (out.indexOf(zh) >= 0) continue
    if (new RegExp('(^|[^a-z])' + en + '([^a-z]|$)').test(s)) out.push(zh)
    if (out.length >= 6) break
  }
  return out
}

/** 英文描述的第一句：卡片上直接显示它，比「英文说明，先看下面的数字」有用。 */
export function firstSentence(text, max = 108) {
  const s = String(text || '').replace(/\s+/g, ' ').trim()
  if (!s) return ''
  const hit = s.match(/^.{8,}?[.!?](?=\s|$)/)
  const cut = (hit ? hit[0] : s).trim()
  return cut.length > max ? cut.slice(0, max - 1).trimEnd() + '…' : cut
}

/**
 * 卡片上那句「人话」：中文描述直接用；英文给「原文首句 + 中文关键词线索」，
 * 真正的中文解释交给卡片上的「让 AI 研究」（宿主读 README，由模型写三句话）。
 */
export function plainOf(desc) {
  const text = String(desc || '').replace(/\s+/g, ' ').trim()
  if (!text) return { line: '（作者没写说明）', zh: [], en: '', english: false }
  if (CHINESE.test(text)) return { line: text.slice(0, 120), zh: [], en: '', english: false }
  return { line: firstSentence(text), zh: glossOf(text), en: text.slice(0, 240), english: true }
}

// ---------------------------------------------------------------- 打分与建议

const PLAY_WORDS = ['pet', 'wallpaper', 'skin', 'theme', 'emoji', 'meme', 'game', 'fish', 'cat', 'maid', 'anime', 'avatar', 'fun', 'toy', '桌宠', '皮肤', '壁纸', '表情', '游戏', '宠物', '猫', '鱼']

export function isPlayful(item) {
  const hay = (item.name + ' ' + (item.desc || '') + ' ' + (item.topics || []).join(' ')).toLowerCase()
  return PLAY_WORDS.some((w) => hay.indexOf(w) >= 0)
}

const DSH_HINT = /dsh|deepseek|harness/i
const GENERIC_HINT = /claude|anthropic|agent-skill/i

/**
 * 跟 DSH 到底有没有关系。
 * GitHub 上星最多的往往是「通用 AI 技能大合集」（十几万星），跟本机没关系；
 * 光按星排会把它们永远顶在最上面，所以排序先看这个、再看星。
 */
export function relevanceOf(item) {
  const topics = Array.isArray(item.topics) ? item.topics.join(' ') : String(item.topics || '')
  const hay = String(item.name || '') + ' ' + String(item.desc || '') + ' ' + topics
  let score = 0
  if (DSH_HINT.test(hay)) score += 3
  if (GENERIC_HINT.test(hay)) score -= 1
  if (score <= 0 && (item.stars || 0) >= 20000) score -= 2
  return score
}

/** 数据 -> 一眼能懂的「可装 / 小心 / 别装」。只在宿主算一次，存进缓存。 */
export function advise(item, installedIds) {
  const why = []
  const age = item.updatedAt ? Math.floor((Date.now() - item.updatedAt) / DAY) : -1
  const isSkill = item.type === 'skill'
  const pop = isSkill ? item.stars || 0 : item.downloads || 0

  if (item.installed) {
    return { level: 'on', label: '已经装了', why: ['本机 profile 里已经有它'] }
  }
  if (item.entryId && installedIds.indexOf(item.entryId) >= 0) {
    return { level: 'no', label: '别装', why: ['和你已装的插件抢同一个位置，两个只能留一个'] }
  }

  let level = 'ok'
  if (!isSkill) {
    if (pop >= 20000) why.push('这个月有 ' + fmtNum(pop) + ' 人下载，用的人多')
    else if (pop >= 2000) why.push('这个月 ' + fmtNum(pop) + ' 人下载，算小众但不冷')
    else if (pop > 0) { why.push('这个月只有 ' + fmtNum(pop) + ' 人下载'); level = 'careful' }
    else { why.push('查不到下载量，可能是刚上架'); level = 'careful' }
  } else {
    if (pop >= 3000) why.push('GitHub 上 ' + fmtNum(pop) + ' 颗星，认得的人多')
    else if (pop >= 200) why.push('GitHub 上 ' + fmtNum(pop) + ' 颗星，小圈子在用')
    else { why.push('星数不多（' + fmtNum(pop) + '），偏冷门'); level = 'careful' }
    if (relevanceOf(item) <= -2) {
      why.push('十几万星的通用技能大合集，跟 DSH 没直接关系')
      if (level === 'ok') level = 'careful'
    }
  }

  if (age >= 0) {
    if (age <= 14) why.push(age <= 1 ? '今天/昨天刚更新过' : age + ' 天前更新过')
    else if (age <= 90) why.push(age + ' 天前更新过')
    else if (age <= 240) { why.push(age + ' 天没更新了'); if (level === 'ok') level = 'careful' }
    else { why.push('已经 ' + Math.round(age / 30) + ' 个月没更新，大概没人维护了'); level = 'no' }
  }

  if (!isSkill) why.push(item.restart === false ? '装完不用重启' : '装完要重启 DSH')
  else why.push('技能装完当轮就能用，不用重启；但每轮对话都占一点开销')

  const label = level === 'ok' ? '可以装' : level === 'careful' ? '先别急' : '不建议'
  return { level, label, why: why.slice(0, 3) }
}

function fmtNum(n) {
  if (n >= 10000) return (n / 10000).toFixed(n >= 100000 ? 0 : 1) + ' 万'
  return String(n)
}

// ---------------------------------------------------------------- 抓 npm（插件）

const NPM_QUERIES = ['keywords:dsh-plugin', 'keywords:dsh', 'keywords:deepseek-harness']
const NPM_NOISE = /(^|\/)(types|test|demo|example)s?(-|$)/

export function normalizeNpmObject(o) {
  const p = o && o.package
  if (!p || !p.name) return null
  const name = String(p.name)
  const kw = (p.keywords || []).map((k) => String(k).toLowerCase())
  const lower = name.toLowerCase()
  if (NPM_NOISE.test(lower)) return null
  if (!(lower.indexOf('dsh') >= 0 || kw.indexOf('dsh') >= 0 || kw.indexOf('deepseek-harness') >= 0)) return null
  const t = Date.parse(p.date || '') || 0
  return {
    type: 'plugin',
    name,
    version: p.version || '',
    desc: String(p.description || ''),
    downloads: 0,
    stars: 0,
    rank: (o.score && Number(o.score.final)) || 0,
    updatedAt: t,
    publishedAt: t,
    repo: p.links && p.links.repository ? String(p.links.repository) : '',
    url: 'https://www.npmjs.com/package/' + name,
    topics: kw,
    install: 'npm',
    restart: true,
  }
}

async function fetchNpm(errors) {
  const byName = new Map()
  for (const q of NPM_QUERIES) {
    const url = 'https://registry.npmjs.org/-/v1/search?size=250&text=' + encodeURIComponent(q)
    try {
      const json = await fetchJson(url, 10000)
      for (const o of json.objects || []) {
        const item = normalizeNpmObject(o)
        if (item && !byName.has(item.name)) byName.set(item.name, item)
      }
    } catch (e) {
      errors.push('插件源：' + (e && e.message ? e.message : String(e)))
    }
  }
  const items = [...byName.values()]
  await fillDownloads(items, errors)
  return items
}

/**
 * 批量接口明确不支持 @scope/name（实测 400：scoped packages are not currently
 * supported in bulk lookups），所以：不带 @ 的走批量，带 @ 的单独查，最多查 30 个。
 */
async function fillDownloads(items, errors) {
  const plain = items.filter((i) => i.name.charAt(0) !== '@')
  const scoped = items
    .filter((i) => i.name.charAt(0) === '@')
    .sort((a, b) => (b.rank || 0) - (a.rank || 0))
    .slice(0, 30)

  const chunks = []
  for (let i = 0; i < plain.length; i += 100) chunks.push(plain.slice(i, i + 100))
  for (const chunk of chunks) {
    const url = 'https://api.npmjs.org/downloads/point/last-month/' + chunk.map((it) => it.name).join(',')
    try {
      const json = await fetchJson(url, 12000)
      for (const it of chunk) {
        const row = json[it.name]
        if (row && typeof row.downloads === 'number') it.downloads = row.downloads
      }
    } catch (e) {
      errors.push('下载量：' + (e && e.message ? e.message : String(e)))
    }
  }

  // 带 @ 的：并发 6 个一批，单个失败只跳过
  let cursor = 0
  const worker = async () => {
    while (cursor < scoped.length) {
      const it = scoped[cursor++]
      try {
        const url = 'https://api.npmjs.org/downloads/point/last-month/' + it.name
        const json = await fetchJson(url, 9000)
        if (json && typeof json.downloads === 'number') it.downloads = json.downloads
      } catch { /* 单包查不到不影响别人 */ }
    }
  }
  await Promise.all([worker(), worker(), worker(), worker(), worker(), worker()])
}

// ---------------------------------------------------------------- 抓 GitHub（技能）

const GH_QUERIES = ['topic:dsh-skill', 'topic:claude-skills', 'topic:agent-skills']

export function normalizeRepo(repo) {
  if (!repo || !repo.name) return null
  const t = Date.parse(repo.pushed_at || repo.updated_at || '') || 0
  const full = String(repo.full_name || repo.name)
  return {
    type: 'skill',
    name: String(repo.name),
    version: '',
    desc: String(repo.description || ''),
    downloads: 0,
    stars: Number(repo.stargazers_count) || 0,
    updatedAt: t,
    publishedAt: Date.parse(repo.created_at || '') || t,
    repo: String(repo.html_url || 'https://github.com/' + full),
    url: String(repo.html_url || 'https://github.com/' + full),
    topics: (repo.topics || []).map(String),
    install: 'github',
    restart: false,
    fullName: full,
  }
}

async function fetchGithub(errors) {
  const byName = new Map()
  for (const q of GH_QUERIES) {
    const url = 'https://api.github.com/search/repositories?sort=stars&order=desc&per_page=50&q=' + encodeURIComponent(q)
    try {
      const json = await fetchJson(url, 9000)
      for (const r of json.items || []) {
        const item = normalizeRepo(r)
        if (item && !byName.has(item.fullName)) byName.set(item.fullName, item)
      }
    } catch (e) {
      const msg = e && e.message ? e.message : String(e)
      // 403 = GitHub 匿名额度用完了，不是坏掉
      errors.push('技能源：' + (/401|403/.test(msg) ? 'GitHub 临时限额（等一小时自动恢复）' : msg))
    }
  }
  return [...byName.values()]
}

// ---------------------------------------------------------------- 本机已装

const SKILL_DIRS = [
  path.join(os.homedir(), '.agents', 'skills'),
  path.join(os.homedir(), '.dsh', 'skills'),
]

async function mtimeOf(file) {
  try { return (await fs.stat(file)).mtimeMs } catch { return 0 }
}

/** 读用户级技能目录：带 SKILL.md 的目录才算装好的技能（插件自带的技能不在磁盘上，读不到）。 */
async function readSkillDirs() {
  const out = []
  for (const dir of SKILL_DIRS) {
    let entries = []
    try { entries = await fs.readdir(dir, { withFileTypes: true }) } catch { continue }
    for (const e of entries) {
      if (!e.isDirectory() || /^[._]/.test(e.name)) continue
      const md = path.join(dir, e.name, 'SKILL.md')
      let desc = ''
      try {
        const raw = await fs.readFile(md, 'utf8')
        const m = raw.match(/^description:\s*(.+)$/m)
        if (m) desc = m[1].replace(/^["'\s]+|["'\s]+$/g, '').slice(0, 120)
      } catch { continue }
      out.push({ name: e.name, dir, desc, at: await mtimeOf(md) })
    }
  }
  return out
}

async function readInstalled() {
  const installed = new Set()
  const ids = new Set()
  try {
    const pkg = JSON.parse(await fs.readFile(path.join(PROFILE_DIR, 'package.json'), 'utf8'))
    for (const key of Object.keys(pkg.dependencies || {})) installed.add(key)
    for (const key of Object.keys(pkg.devDependencies || {})) installed.add(key)
  } catch {}
  try {
    const yml = await fs.readFile(path.join(PROFILE_DIR, 'cordis.yml'), 'utf8')
    for (const m of yml.matchAll(/^\s*-\s*id:\s*([A-Za-z0-9._@/-]+)/gm)) ids.add(m[1])
  } catch {}
  const skills = new Set((await readSkillDirs()).map((x) => x.name.toLowerCase()))
  return { installed, ids, skills }
}

/** 一条东西是不是已经在本机：插件看包名，技能看目录名（owner/repo 只取最后一段）。 */
export function isInstalled(item, inst) {
  if (!item || !inst) return false
  if (item.installed === true) return true
  if (inst.installed && inst.installed.has(item.name)) return true
  if (item.type === 'skill' && inst.skills) {
    const seg = String(item.name || '').split('/').pop().toLowerCase()
    if (inst.skills.has(seg)) return true
  }
  return false
}

function markInstalled(items, inst) {
  for (const it of items) it.installed = isInstalled(it, inst)
}

/** 「我装的」页签的数据：插件带版本、技能带一句话，最近装的排前面。 */
export async function listInstalled() {
  const inst = await readInstalled()
  const plugins = []
  for (const name of inst.installed) {
    let version = ''
    let desc = ''
    let at = 0
    const pkgFile = path.join(PROFILE_DIR, 'node_modules', name, 'package.json')
    try {
      const meta = JSON.parse(await fs.readFile(pkgFile, 'utf8'))
      version = String(meta.version || '')
      desc = String(meta.description || '').slice(0, 140)
      at = await mtimeOf(pkgFile)
    } catch {}
    plugins.push({ name, version, desc, at, kind: /^@deepseek-ai\//.test(name) ? '内置' : '插件' })
  }
  plugins.sort((a, b) => b.at - a.at || a.name.localeCompare(b.name))

  const seen = new Set()
  const skills = []
  for (const s of (await readSkillDirs()).sort((a, b) => b.at - a.at)) {
    const key = s.name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    skills.push(s)
  }
  return { plugins, skills, at: Date.now() }
}

// ---------------------------------------------------------------- 组装缓存

function sortFor(key, list) {
  const copy = list.slice()
  const rel = (x) => relevanceOf(x)
  const weak = (x) => (rel(x) < 0 ? 1 : 0)
  if (key === 'fresh') {
    // 「最新的」还是按时间排，但把明显跟 DSH 无关的通用大合集压到后面
    copy.sort((a, b) => weak(a) - weak(b) || (b.publishedAt || b.updatedAt) - (a.publishedAt || a.updatedAt))
  } else if (key === 'hot') {
    // 插件看月下载量，技能没有下载量就看星标 —— 不然技能这一栏三档会算出同一份名单
    const num = (x) => (x.downloads || 0) || (x.stars || 0)
    copy.sort((a, b) => rel(b) - rel(a) || num(b) - num(a) || (b.stars || 0) - (a.stars || 0))
  } else {
    const num = (x) => (x.downloads || 0) || (x.stars || 0)
    copy.sort((a, b) => (isPlayful(b) ? 1 : 0) - (isPlayful(a) ? 1 : 0) || rel(b) - rel(a) || num(b) - num(a) || (b.stars || 0) - (a.stars || 0))
  }
  return copy
}

export function buildCache({ plugins, skills, installed, errors, fetchedAt }) {
  const installedIds = [...installed.ids]
  const shape = (it) => {
    const plain = plainOf(it.desc)
    return {
      ...it,
      installed: isInstalled(it, installed),
      line: plain.line,
      zh: plain.zh,
      en: plain.en,
      english: plain.english,
      relevant: relevanceOf(it) > 0,
      emoji: emojiFor(it),
      advice: advise(it, installedIds),
      fresh: 0,
      hot: 0,
      fun: 0,
    }
  }
  const p = plugins.map(shape)
  const s = skills.map(shape)
  const buckets = {}
  for (const key of ['fresh', 'hot', 'fun']) {
    // 整份排好序的名单都要带上：前端剔掉「想要/不要/已装」后要能顺着这一档的顺序往下补，
    // 只带前 24 个的话，用户点掉几十条之后三档都会退化成同一份补位名单，页面看着一模一样。
    const pTop = sortFor(key, p).map((x) => x.name)
    const sTop = sortFor(key, s).map((x) => x.name)
    buckets[key] = { plugins: pTop, skills: sTop }
  }
  return {
    fetchedAt: fetchedAt || Date.now(),
    errors,
    installed: installedIds,
    buckets,
    plugins: p.slice(0, 200).map((x) => ({ ...x, desc: x.desc.slice(0, 400) })),
    skills: s.slice(0, 200).map((x) => ({ ...x, desc: x.desc.slice(0, 400) })),
  }
}

function emojiFor(it) {
  const hay = (it.name + ' ' + (it.desc || '')).toLowerCase()
  const map = [
    [/pet|鱼|fish|桌宠/, '🐟'], [/wallpaper|壁纸/, '🖼️'], [/skin|theme|皮肤/, '🎨'],
    [/sidebar|侧边/, '📑'], [/browser|浏览器/, '🌐'], [/office|excel|word|doc/, '📄'],
    [/memory|记忆/, '🧠'], [/cost|token|usage|花费/, '💰'], [/game|游戏/, '🎮'],
    [/music|audio|音频/, '🎵'], [/note|笔记|markdown/, '📝'], [/search|搜索/, '🔎'],
    [/screenshot|截图/, '📸'], [/terminal|shell|命令行/, '⌨️'], [/translate|翻译/, '🔁'],
    [/skill|技能/, '🧩'], [/plugin|插件/, '🔌'],
  ]
  for (const [re, em] of map) if (re.test(hay)) return em
  return it.type === 'skill' ? '🧩' : '🔌'
}

// ---------------------------------------------------------------- 拉一轮（带并发保护）

let inflight = null

async function refreshOnce() {
  const errors = []
  const installed = await readInstalled()
  const [plugins, skills] = await Promise.all([
    fetchNpm(errors).catch((e) => { errors.push('插件源：' + e.message); return [] }),
    fetchGithub(errors).catch((e) => { errors.push('技能源：' + e.message); return [] }),
  ])
  markInstalled(plugins, installed)
  markInstalled(skills, installed)
  const cache = buildCache({ plugins, skills, installed, errors, fetchedAt: Date.now() })
  if (plugins.length || skills.length) await writeJson(CACHE_FILE, cache)
  return cache
}

export async function getFeed({ force } = {}) {
  const cached = await readJson(CACHE_FILE, null)
  const fresh = cached && Date.now() - (cached.fetchedAt || 0) < CACHE_TTL
  if (cached && fresh && !force) return { ...cached, fromCache: true }
  if (inflight) return inflight
  inflight = refreshOnce().finally(() => { inflight = null })
  try {
    return await inflight
  } catch (e) {
    if (cached) return { ...cached, fromCache: true, errors: [...(cached.errors || []), '刷新失败：' + e.message] }
    throw e
  }
}

// ---------------------------------------------------------------- 状态（主题、关心、收下、不要）

const DEFAULT_STATE = { theme: 'tool', tags: [], wanted: [], wantedInfo: {}, skipped: [], reports: {}, readCases: {}, installedAt: 0 }

export async function getState() {
  const raw = await readJson(STATE_FILE, null)
  return { ...DEFAULT_STATE, ...(raw || {}) }
}

export async function patchState(patch) {
  const cur = await getState()
  const next = { ...cur }
  if (typeof patch.theme === 'string') next.theme = patch.theme.slice(0, 24)
  for (const key of ['tags', 'wanted', 'skipped']) {
    if (Array.isArray(patch[key])) next[key] = patch[key].map((x) => String(x).slice(0, 160)).slice(0, 200)
  }
  // 「想装的」存一份快照：榜单刷新后那条不在了，卡片也还在
  if (patch.wantedInfo && typeof patch.wantedInfo === 'object') {
    const info = {}
    for (const [k, v] of Object.entries(patch.wantedInfo).slice(0, 200)) {
      if (!v || typeof v !== 'object') continue
      info[String(k).slice(0, 160)] = {
        name: String(v.name || k).slice(0, 160),
        type: v.type === 'skill' ? 'skill' : 'plugin',
        version: String(v.version || '').slice(0, 40),
        line: String(v.line || '').slice(0, 300),
      }
    }
    next.wantedInfo = info
  }
  // 收藏夹报告：{名字:{at,verdict,...}}，只收认识的字段，别让前端乱塞
  if (patch.reports && typeof patch.reports === 'object') {
    const rep = { ...(cur.reports || {}) }
    for (const [k, v] of Object.entries(patch.reports).slice(0, 40)) {
      if (!v || typeof v !== 'object') continue
      const verdict = v.verdict === 'worth' || v.verdict === 'no' ? v.verdict : 'wait'
      rep[String(k).slice(0, 160)] = {
        at: Number(v.at) || Date.now(),
        name: String(v.name || k).slice(0, 160),
        type: v.type === 'skill' ? 'skill' : 'plugin',
        version: String(v.version || '').slice(0, 40),
        verdict,
        verdictText: String(v.verdictText || (verdict === 'worth' ? '值得装' : verdict === 'no' ? '不用装' : '可以等等')).slice(0, 20),
        what: String(v.what || '').slice(0, 160),
        evidence: String(v.evidence || '').slice(0, 160),
        diff: String(v.diff || '').slice(0, 160),
        dup: Array.isArray(v.dup) ? v.dup.map((x) => String(x).slice(0, 160)).slice(0, 6) : [],
        readme: !!v.readme,
        model: String(v.model || '').slice(0, 60),
        usage: v.usage && typeof v.usage === 'object' ? v.usage : null,
        cost: typeof v.cost === 'number' ? v.cost : null,
      }
    }
    next.reports = rep
  }
  // 看过的案例：{ 案例链接: 时间戳 }。只由前端在「点开原文 / 聊过」时写。
  if (patch.readCases && typeof patch.readCases === 'object') {
    const seen = { ...(cur.readCases || {}) }
    for (const [k, v] of Object.entries(patch.readCases).slice(0, 500)) {
      seen[String(k).slice(0, 300)] = Number(v) || Date.now()
    }
    next.readCases = seen
  }
  next.updatedAt = Date.now()
  await writeJson(STATE_FILE, next)
  return next
}

// ---------------------------------------------------------------- 雷达自己的花费

/** 记一笔模型开销（按日期累加，方便按天看明细）。 */
export async function addCost(kind, cost, at = Date.now()) {
  const v = Number(cost)
  if (!(v > 0)) return
  const all = await readJson(COST_FILE, {})
  const store = all && typeof all === 'object' ? all : {}
  const day = new Date(at).toISOString().slice(0, 10)
  const box = store[day] || { chat: 0, gist: 0 }
  box[kind] = (Number(box[kind]) || 0) + v
  store[day] = box
  const days = Object.keys(store).sort().slice(-120)
  const trimmed = {}
  for (const d of days) trimmed[d] = store[d]
  await writeJson(COST_FILE, trimmed)
}

/** 雷达全部花费：研究/报告/找/聊天四个数 + 按天明细 + 最近 7 天。纯汇总，不读别的插件。 */
export async function getSpend(now = Date.now()) {
  const notes = await getNotes()
  const noteList = Object.values(notes).filter(Boolean)
  const state = await getState()
  const reports = Object.values(state.reports || {}).filter(Boolean)
  const finds = await readJson(FINDS_FILE, {})
  const costs = await readJson(COST_FILE, {})
  const dayOf = (t) => new Date(Number(t) || 0).toISOString().slice(0, 10)
  const days = {}
  const bump = (day, key, v) => {
    if (!(v > 0)) return
    const b = days[day] || (days[day] = { research: 0, report: 0, find: 0, chat: 0 })
    b[key] += v
  }
  for (const n of noteList) bump(dayOf(n.firstAt || n.at), 'research', Number(n.cost) || 0)
  for (const r of reports) bump(dayOf(r.at), 'report', Number(r.cost) || 0)
  for (const f of Object.values(finds || {})) bump(dayOf(f && f.at), 'find', Number(f && f.result && f.result.cost) || 0)
  for (const [d, b] of Object.entries(costs || {})) {
    bump(d, 'chat', Number(b && b.chat) || 0)
    bump(d, 'chat', Number(b && b.gist) || 0)
  }
  const sum = (key) => Object.values(days).reduce((s, b) => s + (Number(b[key]) || 0), 0)
  const total = { research: sum('research'), report: sum('report'), find: sum('find'), chat: sum('chat') }
  // 最近 7 天（含今天，缺的补 0；按本地时区切天，跟用户看的日历一致）
  const localDay = (t) => {
    const d = new Date(t)
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
  }
  const byLocal = {}
  for (const [d, b] of Object.entries(days)) {
    const t = Date.parse(d + 'T00:00:00Z')
    const k = localDay(t + 12 * 3600_000)
    const box = byLocal[k] || (byLocal[k] = { research: 0, report: 0, find: 0, chat: 0 })
    for (const kk of Object.keys(b)) box[kk] += b[kk]
  }
  const week = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now - i * 864e5)
    const k = localDay(d.getTime())
    const b = byLocal[k] || { research: 0, report: 0, find: 0, chat: 0 }
    week.push({ day: k.slice(5), sum: b.research + b.report + b.find + b.chat })
  }
  const detail = Object.entries(byLocal).sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 60)
    .map(([day, b]) => ({ day, sum: b.research + b.report + b.find + b.chat }))
  return {
    ok: true,
    total: { ...total, all: total.research + total.report + total.find + total.chat },
    counts: { research: noteList.length, report: reports.length, find: Object.keys(finds || {}).length },
    week,
    detail,
  }
}

const NOTES_FILE = path.join(DIR, 'notes.json')
const notesInflight = new Map()
let runtimeCtx = null

/** 笔记按「名字@版本」存，版本一变就重新研究一次，同一条只花一次模型钱。 */
export function noteKey(item) {
  return String((item && item.name) || '') + '@' + String((item && item.version) || 'latest')
}

export async function getNotes() {
  const raw = await readJson(NOTES_FILE, null)
  return raw && typeof raw === 'object' ? raw : {}
}

async function saveNote(key, note) {
  const all = await getNotes()
  const prev = all[key]
  // 记住「第一次研究这条」的时间：重读不能算成新研究，否则自己点两下就把额度用光了
  note.firstAt = (prev && (prev.firstAt || prev.at)) || note.at
  all[key] = note
  await writeJson(NOTES_FILE, all)
}

function githubRepo(text) {
  const m = String(text || '').match(/github\.com[/:]([^/]+)\/([^/#?\s]+)/i)
  return m ? m[1] + '/' + m[2].replace(/\.git$/, '') : ''
}

async function fetchGithubReadme(full) {
  try {
    const res = await fetch('https://api.github.com/repos/' + full + '/readme', {
      signal: AbortSignal.timeout(12000),
      headers: { 'user-agent': UA, accept: 'application/vnd.github.raw' },
    })
    if (!res.ok) return ''
    return String(await res.text()).slice(0, 6000)
  } catch {
    return ''
  }
}

/** 抓一段能读的正文：技能读 GitHub README；插件先读 npm 包里带的 readme。 */
async function fetchReadme(item) {
  const fromRepo = githubRepo(item.repo)
  if (item.type === 'skill' && fromRepo) {
    const text = await fetchGithubReadme(fromRepo)
    if (text) return text
  }
  try {
    const meta = await fetchJson('https://registry.npmjs.org/' + encodeURIComponent(item.name), 12000)
    if (meta && typeof meta.readme === 'string' && meta.readme.trim()) return meta.readme.slice(0, 6000)
    const repo2 = githubRepo((meta && meta.repository && (meta.repository.url || meta.repository)) || '')
    if (repo2) return await fetchGithubReadme(repo2)
  } catch { /* 拿不到正文就只靠作者原话 */ }
  return ''
}

// ---------------------------------------------------------------- 案例源码快照
// 只拉「能看出它怎么做的」那几个文件，按 commit 存本地；raw.githubusercontent 不占 GitHub 接口次数。

const REPO_CACHE_DIR = path.join(DIR, 'repo-cache')
const REPO_TTL = 3 * 24 * 3600 * 1000
const REPO_MAX_BYTES = 220 * 1024
const REPO_MAX_FILE = 48 * 1024
const REPO_MAX_FILES = 24

const REPO_SKIP_DIR = /(^|\/)(node_modules|dist|build|out|coverage|vendor|assets|static|public|\.github|\.git)(\/|$)/i
const REPO_SKIP_FILE = /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb|LICENSE[^\/]*|CHANGELOG[^\/]*|CODE_OF_CONDUCT[^\/]*)$|(^|\/)\.[^\/]+$|\.(png|jpe?g|gif|webp|svg|ico|woff2?|ttf|otf|mp4|mp3|zip|gz|pdf|map)$|\.min\.js$|\.i18n\.(ya?ml|json)$|(^|\/)tsconfig[^\/]*\.json$|(^|\/)[^\/]*\.config\.(ts|js|mjs|cjs)$|(^|\/)tsdown[^\/]*\.ts$|(eslint|vite|vitest|jest|rollup|webpack|tsup|next|nuxt|tailwind|postcss|jscpd|oxlint)\.config[^\/]*$/i
const REPO_SKIP_TEST = /(^|\/)(test|tests|__tests__|spec|fixtures?|examples?)(\/|$)/i
const REPO_CODE = /\.(js|mjs|cjs|ts|tsx|jsx|json|ya?ml|toml|md)$/i

/** 越小的数越先读：根目录的配置 → 根目录的说明/入口 → 第一层源码 → 更深的源码 → 一堆子包的 package.json → 文档。 */
function repoScore(p) {
  const parts = String(p).split('/')
  const base = parts[parts.length - 1].toLowerCase()
  const depth = parts.length
  const isDoc = /\.(md|markdown)$/i.test(base)
  if (depth === 1 && base === 'package.json') return 0
  if (depth === 1 && /^cordis\.(patch\.)?ya?ml$/.test(base)) return 1
  if (depth === 1 && (/^readme/.test(base) || base === 'skill.md')) return 2
  if (isDoc) return 9 + depth / 10
  if (depth === 1 && /\.(js|mjs|cjs|ts|tsx|jsx)$/i.test(base)) {
    // 根目录一堆 vitest/tsdown/eslint 的配置文件没用，排到最后
    if (/(^|\.)config\.|^(vitest|jest|tsdown|eslint|rollup|webpack|babel|vite|tsup|playwright)\./i.test(base)) return 10
    if (/^(index|main|app|cli|server|run|bot|init)\./i.test(base)) return 3
    return 5
  }
  if (depth === 1) return 7
  if (depth === 2 && /^(lib|src|app|server|cli|plugin)\//i.test(p)) return 4
  if (/^(lib|src|app|server|cli|packages)\//i.test(p)) return 4 + depth * 0.4
  if (base === 'package.json') return 8 + depth / 10
  return 6 + depth / 10
}

/** 从仓库文件清单里挑出最值得读的几个（纯函数，测试直接调）。 */
export function pickRepoFiles(entries, limit = REPO_MAX_FILES) {
  const list = (Array.isArray(entries) ? entries : [])
    .filter((e) => e && e.type === 'blob' && typeof e.path === 'string')
    .filter((e) => REPO_CODE.test(e.path))
    .filter((e) => !REPO_SKIP_DIR.test(e.path) && !REPO_SKIP_FILE.test(e.path) && !REPO_SKIP_TEST.test(e.path))
    .filter((e) => Number(e.size || 0) > 0 && Number(e.size || 0) <= REPO_MAX_FILE)
  list.sort((a, b) => repoScore(a.path) - repoScore(b.path) || Number(a.size) - Number(b.size) || String(a.path).localeCompare(String(b.path)))
  // 同一个文件名最多留两份：否则 monorepo 里几十个 package.json 会把名额吃光
  const picked = []
  const seen = new Map()
  for (const e of list) {
    const base = String(e.path).split('/').pop().toLowerCase()
    const bucket = /^readme/.test(base) ? 'readme' : base
    const cap = bucket === 'readme' || bucket === 'skill.md' ? 1 : 2
    const n = seen.get(bucket) || 0
    if (n >= cap) continue
    seen.set(bucket, n + 1)
    picked.push({ path: e.path, size: Number(e.size || 0) })
    if (picked.length >= limit) break
  }
  return picked
}

/** 把快照拼成给模型看的上下文（纯函数）。 */
export function repoContextText(snap) {
  if (!snap || !Array.isArray(snap.files) || !snap.files.length) return ''
  const kb = Math.max(1, Math.round(Number(snap.bytes || 0) / 1024))
  const head = '下面是这个仓库里实际读到的源码/配置：共 ' + snap.files.length + ' 个文件、约 ' + kb +
    ' KB（按重要性挑的，不是全部）。回答时就指着具体文件说，没读到的别编。'
  const body = snap.files.map((f) => '===== ' + f.path + ' =====\n' + f.text).join('\n\n')
  return head + '\n\n' + body
}

function repoFailText(reason, reset) {
  if (reason === 'rate-limited') {
    const at = reset ? new Date(Number(reset) * 1000) : null
    const hhmm = at && !isNaN(at.getTime())
      ? String(at.getHours()).padStart(2, '0') + ':' + String(at.getMinutes()).padStart(2, '0')
      : ''
    return 'GitHub 今天的免费查询次数用完了' + (hhmm ? '，大约 ' + hhmm + ' 恢复' : '，过一小时左右再试') + '（不是仓库删了）'
  }
  if (reason === 'blocked') return '你这边连不上 GitHub 的下载通道，换了两个备用地址也没成功，多半是网络被拦；过一会儿再试'
  if (reason === 'not-found') return '仓库打不开（可能改名、删了或没公开）'
  if (reason === 'no-tree') return 'GitHub 那边没给文件清单，过一小时再试'
  if (reason === 'no-code') return '这个仓库里没找到能读的代码文件（比如只有图片、只有文档目录）'
  if (reason === 'no-repo') return '这条案例不是 GitHub 仓库，没有公开代码'
  return '没拉到这个仓库的代码'
}

// 取文件正文的通道：GitHub 官方 → jsDelivr 两个镜像（本机实测官方通道常被重置，镜像不占 GitHub 次数）
const REPO_TEXT_HOSTS = [
  (full, ref, p) => 'https://raw.githubusercontent.com/' + full + '/' + encodeURIComponent(ref) + '/' + p,
  (full, ref, p) => 'https://gcore.jsdelivr.net/gh/' + full + '@' + encodeURIComponent(ref) + '/' + p,
  (full, ref, p) => 'https://testingcf.jsdelivr.net/gh/' + full + '@' + encodeURIComponent(ref) + '/' + p,
]

/** 依次试每条通道，拿不到就换下一个；全失败返回 null。 */
async function fetchRepoText(full, ref, p) {
  const enc = String(p).split('/').map(encodeURIComponent).join('/')
  for (const make of REPO_TEXT_HOSTS) {
    try {
      const res = await fetch(make(full, ref, enc), {
        signal: AbortSignal.timeout(12000),
        headers: { 'user-agent': UA },
      })
      if (!res.ok) continue
      return String(await res.text())
    } catch { /* 这条通道不通，换下一条 */ }
  }
  return null
}

/** 文件清单的备用来源（不占 GitHub 次数）：jsDelivr 的扁平文件表。 */
async function fetchMirrorTree(full, ref) {
  try {
    const json = await fetchJson(
      'https://data.jsdelivr.com/v1/packages/gh/' + full + '@' + encodeURIComponent(ref) + '?structure=flat',
      15000,
    )
    const files = (json && json.files) || []
    if (!files.length) return null
    return files.map((f) => ({
      path: String(f.name || '').replace(/^\/+/, ''),
      size: Number(f.size || 0),
      type: 'blob',
    })).filter((e) => e.path)
  } catch {
    return null
  }
}


/** 拉仓库快照：仓库信息 → 文件清单 → 挑几个关键文件 → 落本地缓存。 */
export async function repoSnapshot(full) {
  if (!full) return { ok: false, reason: 'no-repo' }
  const safe = String(full).replace(/[^a-zA-Z0-9._-]+/g, '_')
  const cacheFile = path.join(REPO_CACHE_DIR, safe + '.json')
  const cached = await readJson(cacheFile, null)
  if (cached && Array.isArray(cached.files) && cached.files.length && Date.now() - Number(cached.at || 0) < REPO_TTL) {
    return { ok: true, cached: true, snap: cached }
  }
  let meta = null
  let reset = 0
  try {
    meta = await fetchJson('https://api.github.com/repos/' + full, 12000)
  } catch (e) {
    // 次数用完了 ≠ 仓库没了：这两种一定要分开说，否则用户会以为作者删了仓库
    if (isRateLimit(e)) return { ok: false, reason: 'rate-limited', reset: await resetAt() }
    if (isNetworkDown(e)) return { ok: false, reason: 'blocked' }
    return { ok: false, reason: 'not-found' }
  }
  if (!meta || !meta.default_branch) return { ok: false, reason: 'not-found' }
  let tree = null
  try {
    tree = await fetchJson(
      'https://api.github.com/repos/' + full + '/git/trees/' + encodeURIComponent(meta.default_branch) + '?recursive=1',
      15000,
    )
  } catch (e) {
    // 官方路径拿不到文件清单就试镜像；镜像也拿不到再判原因
    const mirrored = await fetchMirrorTree(full, meta.default_branch)
    if (mirrored) tree = { tree: mirrored }
    else if (isRateLimit(e)) return { ok: false, reason: 'rate-limited', reset: await resetAt() }
    else return { ok: false, reason: 'no-tree' }
  }
  if (!tree || !Array.isArray(tree.tree)) return { ok: false, reason: 'no-tree' }
  const picks = pickRepoFiles(tree.tree)
  if (!picks.length) return { ok: false, reason: 'no-code' }

  const ref = String(tree.sha || meta.default_branch)
  const files = []
  let bytes = 0
  let tried = 0
  for (const f of picks) {
    if (bytes >= REPO_MAX_BYTES) break
    tried++
    const text = await fetchRepoText(full, ref, f.path)
    if (text == null) continue
    const clipped = text.length > REPO_MAX_FILE ? text.slice(0, REPO_MAX_FILE) + '\n…（这个文件太长，截断了）' : text
    files.push({ path: f.path, size: clipped.length, text: clipped })
    bytes += clipped.length
  }
  // 一个文件都没拿到，说明三条通道全不通——这时候要说「连不上」，不能说「没代码」
  if (!files.length) return { ok: false, reason: tried ? 'blocked' : 'no-code' }
  const snap = { repo: String(full), ref, at: Date.now(), bytes, files, total: picks.length }
  try { await writeJson(cacheFile, snap) } catch { /* 缓存写不进去也照样能用 */ }
  return { ok: true, cached: false, snap }
}

const EXPLAIN_SYSTEM = [
  '你是「DSH 插件雷达」的讲解员，读者是不懂技术的中文用户。',
  '只根据给你的资料写，资料里没写的就说「资料里没写」，绝对不要编。',
  '输出恰好三行，每行一句，不加编号、不加标题、不用 Markdown、不用英文术语：',
  '第一行：它是干什么的，说用户能看见的现象。',
  '第二行：什么人适合用，什么情况下用不上。',
  '第三行：有什么坑（要重启、要另装软件、要密钥、要花钱、要联网）；没有就说「暂时没发现明显的坑」。',
  '全文不超过 120 个汉字，不许用「该插件」「此类工具」这类书面语。',
].join('\n')

function pickModel(ctx) {
  try {
    const sel = ctx && ctx.get('agentDefaultModel') && ctx.get('agentDefaultModel').currentSelection()
    if (sel && sel.provider && sel.model) return { provider: sel.provider, model: sel.model }
  } catch { /* 找不到就报错给用户看 */ }
  return null
}

async function askModel(ctx, item, body) {
  const llm = ctx && ctx.get('llm')
  const pick = pickModel(ctx)
  if (!llm || !pick) throw new Error('模型服务没接上，暂时研究不了（插件照常能用）')
  const user = [
    '名字：' + item.name,
    '类型：' + (item.type === 'skill' ? 'DSH 技能（GitHub 仓库）' : 'DSH 插件（npm 包）'),
    '版本：' + (item.version || '未知'),
    '作者原话：' + (item.desc || '（没写）'),
    '资料片段：',
    body || '（没拿到 README，只能按作者原话写）',
  ].join('\n')
  let text = ''
  let usage = null
  let timer = null
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('模型 60 秒没回，先停了')), 60000)
    if (timer.unref) timer.unref()
  })
  try {
    await Promise.race([(async () => {
      for await (const chunk of llm.stream({
        provider: pick.provider,
        model: pick.model,
        system: EXPLAIN_SYSTEM,
        messages: [{ role: 'user', content: [{ type: 'text', text: user }] }],
      })) {
        if (chunk.type === 'text-delta') text += chunk.text
        else if (chunk.type === 'usage' && chunk.usage) usage = chunk.usage
        else if (chunk.type === 'finish' && chunk.reason && (chunk.reason.kind === 'error' || chunk.reason.kind === 'aborted')) {
          throw new Error('模型那边出错了：' + ((chunk.reason.failure && chunk.reason.failure.message) || chunk.reason.kind))
        }
      }
    })(), timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
  return { text: text.trim().slice(0, 600), model: pick.model, provider: pick.provider, usage }
}

/** 按公开价目折算成人民币（元/百万 token）。不认识的模型返回 null：只报 token，不编价格。 */
const PRICES = [
  [/^deepseek-(reasoner|r1)/, { miss: 4, hit: 1, out: 16 }],
  [/^deepseek-/, { miss: 2, hit: 0.5, out: 8 }],
]

export function estimateCost(model, usage) {
  if (!usage) return null
  const id = String(model || '').toLowerCase()
  const hit = PRICES.find(([re]) => re.test(id))
  if (!hit) return null
  const p = hit[1]
  const cacheHit = Number(usage.cacheReadTokens || 0)
  const miss = Math.max(0, Number(usage.inputTokens || 0) - cacheHit)
  const out = Number(usage.outputTokens || 0)
  return (miss * p.miss + cacheHit * p.hit + out * p.out) / 1e6
}

/** 一小时内「新研究」的条数上限。重读老笔记不计数，自己点「重新研究」不会被锁。 */
const RECENT_LIMIT = 60

/** 一小时内「新研究」的条数：只看 firstAt，重读老笔记不算。 */
export function recentFreshCount(all, now = Date.now()) {
  return Object.values(all || {}).filter((n) => n && (n.firstAt || n.at) && now - (n.firstAt || n.at) < 3600_000).length
}

/** 一条只算一次：先查笔记，没有才抓 README + 调模型。 */
export async function explainItem(item, ctx, { force } = {}) {
  if (!item || !item.name) return { ok: false, message: '缺少名字' }
  const key = noteKey(item)
  const all = await getNotes()
  if (!force && all[key] && all[key].text) return { ok: true, note: all[key], cached: true }
  // 防手滑：一小时「新研究」最多 60 条；重读同一张不计数，自己点「重新研究」不会被锁
  const recently = recentFreshCount(all)
  if (recently >= RECENT_LIMIT) {
    return { ok: false, message: '这一小时新研究了 ' + RECENT_LIMIT + ' 条，先歇一会儿；重读同一张不计数，不会被锁' }
  }
  if (notesInflight.has(key)) return notesInflight.get(key)
  const run = (async () => {
    try {
      const readme = await fetchReadme(item)
      const { text, model, provider, usage } = await askModel(ctx || runtimeCtx, item, readme)
      if (!text) return { ok: false, message: '模型没写出内容，再点一次试试' }
      const note = {
        key,
        name: String(item.name),
        version: String(item.version || ''),
        text,
        model,
        provider,
        usage: usage || null,
        cost: estimateCost(model, usage),
        readme: !!readme,
        at: Date.now(),
      }
      await saveNote(key, note)
      return { ok: true, note, cached: false }
    } catch (e) {
      return { ok: false, message: (e && e.message) || String(e) }
    } finally {
      notesInflight.delete(key)
    }
  })()
  notesInflight.set(key, run)
  return run
}

// ---------------------------------------------------------------- 案例就地聊天

/** 聊天提示词：把案例身份和摘要一起给模型，用户问的通常是「能不能用 / 值不值得抄 / 怎么落地」。 */
function chatSystem(item) {
  return [
    '你是「DSH 插件雷达」的案例陪聊，对面是不懂技术的中文用户。',
    '现在在跟用户讨论这条 DSH 案例：',
    '标题：' + (item.name || '（没写）'),
    '链接：' + (item.url || '（没写）'),
    item.url2 ? '相关链接：' + item.url2 : '',
    '来源：' + (item.source || '（没写）'),
    '我们写的摘要：' + (item.what || '（没写）'),
    item.why ? '为什么值得看：' + item.why : '',
    '日期：' + (item.date || '（没写）'),
    '用户可能问它能不能用、值不值得抄、怎么落地。',
    '用中文、口语、一次不超过 120 字，不要罗列没用的清单；不确定就说不知道。',
  ].filter(Boolean).join('\n')
}

/** 读某个案例存下来的对话；坏数据一律当空。 */
export async function getCaseChat(url) {
  const key = String(url || '').trim()
  if (!key) return []
  const all = await readJson(CASE_CHATS_FILE, {})
  const list = all && typeof all === 'object' ? all[key] : null
  if (!Array.isArray(list)) return []
  return list
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string')
    .map((m) => ({ role: m.role, text: m.text, at: Number(m.at) || 0 }))
    .slice(-40)
}

/**
 * 已有历史 + 前端带来的最近 8 条。
 * 前端每次会把整段对话再发一遍，所以先找「历史尾巴 = 新消息开头」的重叠段，只追加真正新增的部分。
 */
export function mergeChat(history, incoming) {
  const hist = Array.isArray(history) ? history : []
  const inc = (Array.isArray(incoming) ? incoming : [])
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string' && m.text.trim())
    .map((m) => ({ role: m.role, text: String(m.text).slice(0, 2000).trim(), at: Number(m.at) || Date.now() }))
    .slice(-8)
  const max = Math.min(hist.length, inc.length)
  let overlap = 0
  for (let n = max; n > 0; n--) {
    let same = true
    for (let i = 0; i < n; i++) {
      const a = hist[hist.length - n + i]
      const b = inc[i]
      if (!a || a.role !== b.role || a.text !== b.text) { same = false; break }
    }
    if (same) { overlap = n; break }
  }
  return hist.concat(inc.slice(overlap))
}

/** 调模型要的多轮消息（只带最近 12 条，省 token；存档仍留 40 条）。 */
function chatModelMessages(messages) {
  // 只发一条 user：DSH 的 llm.stream 不认我们手工拼的 assistant 消息（会炸 replayState），
  // 所以把前面几轮压成一段引用文字塞进同一条 user 里。
  const list = (messages || []).filter((m) => m && m.text)
  if (!list.length) return []
  const last = list[list.length - 1]
  const prior = list.slice(0, -1).slice(-10)
  const text = prior.length
    ? ['之前聊过的内容：', ...prior.map((m) => (m.role === 'user' ? '我：' : '你：') + m.text), '', '我现在问：' + last.text].join('\n')
    : last.text
  return [{ role: 'user', content: [{ type: 'text', text }] }]
}

const CHAT_TIMEOUT_MSG = '模型没在 60 秒内回，再点一次'

/** 一次聊天回复：复用 askModel 的取词方式，但支持多轮消息。 */
async function askChat(ctx, system, messages) {
  const llm = ctx && ctx.get('llm')
  const pick = pickModel(ctx)
  if (!llm || !pick) throw new Error('模型服务没接上，暂时聊不了（插件照常能用）')
  let text = ''
  let usage = null
  let timer = null
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(CHAT_TIMEOUT_MSG)), 60000)
    if (timer.unref) timer.unref()
  })
  try {
    await Promise.race([(async () => {
      for await (const chunk of llm.stream({
        provider: pick.provider,
        model: pick.model,
        system,
        messages: chatModelMessages(messages),
      })) {
        if (chunk.type === 'text-delta') text += chunk.text
        else if (chunk.type === 'usage' && chunk.usage) usage = chunk.usage
        else if (chunk.type === 'finish' && chunk.reason && (chunk.reason.kind === 'error' || chunk.reason.kind === 'aborted')) {
          throw new Error('模型那边出错了：' + ((chunk.reason.failure && chunk.reason.failure.message) || chunk.reason.kind))
        }
      }
    })(), timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
  return { text: text.trim().slice(0, 800), model: pick.model, provider: pick.provider, usage }
}

/** 案例原文只取 GitHub README 前 3000 字；非 GitHub 或抓不到就只用摘要，不报错。 */
async function chatOriginal(item) {
  const repo = githubRepo(item.url2 || '') || githubRepo(item.url || '')
  if (!repo) return ''
  try {
    const text = await fetchReadme({ type: 'skill', repo })
    return String(text || '').slice(0, 3000)
  } catch {
    return ''
  }
}

/** POST /case-chat 的宿主实现：拼上下文 → 调模型 → 存两条。 */
export async function chatCase(body, ctx) {
  const item = {
    url: String(body && body.url || '').trim(),
    url2: String(body && body.url2 || '').trim(),
    name: String(body && body.name || '').trim(),
    what: String(body && body.what || '').trim(),
    why: String(body && body.why || '').trim(),
    source: String(body && body.source || '').trim(),
    kind: String(body && body.kind || '').trim(),
    date: String(body && body.date || '').trim(),
  }
  if (!item.url) return { status: 400, body: { ok: false, error: '缺少 url' } }

  const history = await getCaseChat(item.url)
  const merged = mergeChat(history, body && body.messages)
  const fresh = merged.slice(history.length).filter((m) => m.role === 'user')
  if (!fresh.length) return { status: 400, body: { ok: false, error: '没有要问的内容' } }

  const original = await chatOriginal(item)
  let snap = null
  if (body && body.withRepo) {
    const repoFull = githubRepo(item.url2) || githubRepo(item.url)
    if (!repoFull) return { status: 200, body: { ok: false, error: repoFailText('no-repo') } }
    const r = await repoSnapshot(repoFull)
    if (!r.ok) return { status: 200, body: { ok: false, error: repoFailText(r.reason, r.reset) } }
    snap = r.snap
  }
  const repoText = snap ? repoContextText(snap) : ''
  const system = chatSystem(item) + (original ? '\n\n案例原文节选（前 3000 字，可能被截断）：\n' + original : '') +
    (repoText ? '\n\n' + repoText : '')

  let result
  try {
    result = await askChat(ctx, system, merged)
  } catch (e) {
    return { status: 200, body: { ok: false, error: (e && e.message) || String(e) } }
  }
  if (!result.text) return { status: 200, body: { ok: false, error: '模型没写出内容，再点一次' } }

  const replyMsg = { role: 'assistant', text: result.text, at: Date.now() }
  const all = await readJson(CASE_CHATS_FILE, {})
  const store = all && typeof all === 'object' ? all : {}
  store[item.url] = merged.concat(replyMsg).slice(-40).map((m) => ({ role: m.role, text: m.text, at: m.at }))
  await writeJson(CASE_CHATS_FILE, store)
  const cost = estimateCost(result.model, result.usage)
  await addCost('chat', cost).catch(() => {})

  return {
    status: 200,
    body: {
      ok: true,
      reply: result.text,
      cost,
      usage: result.usage || null,
      repo: snap ? { files: snap.files.length, bytes: snap.bytes, total: snap.total, ref: snap.ref } : null,
    },
  }
}

/** 所有聊过的案例：链接 + 最后一句 + 时间。名字由前端拿案例清单自己配上。 */
export async function listCaseChats() {
  const all = await readJson(CASE_CHATS_FILE, {})
  const store = all && typeof all === 'object' ? all : {}
  const out = []
  for (const [url, list] of Object.entries(store)) {
    const msgs = (Array.isArray(list) ? list : []).filter((m) => m && typeof m.text === 'string')
    if (!msgs.length) continue
    const last = msgs[msgs.length - 1]
    out.push({
      url,
      last: String(last.text || '').slice(0, 120),
      at: Number(last.at) || 0,
      count: msgs.length,
    })
  }
  out.sort((a, b) => b.at - a.at)
  return out.slice(0, 60)
}

/**
 * 删掉若干条聊过的记录。urls 传数组；空数组 = 什么都不删（不误清空）。
 * 只删聊天内容，案例本身还在 cases.json，「案例」页照旧能看。
 */
export async function deleteCaseChats(urls) {
  const keys = (Array.isArray(urls) ? urls : [urls]).map((u) => String(u || '').trim()).filter(Boolean)
  const all = await readJson(CASE_CHATS_FILE, {})
  const store = all && typeof all === 'object' ? all : {}
  const before = Object.keys(store).length
  for (const k of keys) delete store[k]
  const after = Object.keys(store).length
  if (after !== before) await writeJson(CASE_CHATS_FILE, store)
  return { ok: true, removed: before - after, left: after }
}

/** 清空全部聊天记录。返回删掉了几条。 */
export async function clearCaseChats() {
  const all = await readJson(CASE_CHATS_FILE, {})
  const store = all && typeof all === 'object' ? all : {}
  const removed = Object.keys(store).length
  await writeJson(CASE_CHATS_FILE, {})
  return { ok: true, removed, left: 0 }
}

/** 读代码后的自动讲解：同一版本只讲一次，讲过的直接给缓存，不再花钱。 */
export async function caseGist(item, ctx) {
  const url = String((item && item.url) || '').trim()
  if (!url) return { ok: false, error: '这条案例没写链接，读不了代码' }
  const repoFull = githubRepo((item && item.url2) || '') || githubRepo(url)
  if (!repoFull) return { ok: false, error: repoFailText('no-repo') }
  const r = await repoSnapshot(repoFull)
  if (!r.ok) return { ok: false, error: repoFailText(r.reason, r.reset) }
  const key = url + '@' + (r.snap.ref || '') + '/' + (r.snap.total || r.snap.files.length)
  const cache = await readJson(GIST_FILE, {})
  const old = cache && typeof cache === 'object' ? cache[key] : null
  if (old && old.text) {
    return { ok: true, gist: old, cached: true, repo: { files: r.snap.files.length, bytes: r.snap.bytes, total: r.snap.total, ref: r.snap.ref } }
  }
  const sys = [
    '你是「DSH 插件雷达」的代码解说员，对面是不懂技术的中文用户。',
    '下面给你的是这个项目的真实源码节选。只根据这些代码说话，没看到的不要编。',
    '用 3～5 句中文说清四件事：它是干什么的、大概怎么实现的、值不值得抄、跟普通用户有什么关系。',
    '不要罗列文件名，不要用「该」「此」这种书面语，不要用括号补英文。',
  ].join('\n')
  let result
  try {
    result = await askChat(ctx || runtimeCtx, sys, [{ role: 'user', text: '这是源码：\n' + repoContextText(r.snap).slice(0, 12000) + '\n\n按上面四点讲给我听。' }])
  } catch (e) {
    return { ok: false, error: (e && e.message) || String(e) }
  }
  if (!result.text) return { ok: false, error: '模型没写出内容，再点一次' }
  const gist = {
    url, name: String((item && item.name) || ''), text: result.text,
    model: result.model, usage: result.usage || null,
    cost: estimateCost(result.model, result.usage), ref: r.snap.ref || '',
    at: Date.now(),
  }
  const all = await readJson(GIST_FILE, {})
  const store = all && typeof all === 'object' ? all : {}
  store[key] = gist
  const keys = Object.keys(store).sort((a, b) => Number(store[b].at || 0) - Number(store[a].at || 0)).slice(0, 200)
  const trimmed = {}
  for (const k of keys) trimmed[k] = store[k]
  await writeJson(GIST_FILE, trimmed)
  await addCost('chat', gist.cost).catch(() => {})
  return { ok: true, gist, cached: false, repo: { files: r.snap.files.length, bytes: r.snap.bytes, total: r.snap.total, ref: r.snap.ref } }
}

// ---------------------------------------------------------------- 大白话 → 关键词

const TAGS_SYSTEM = [
  '你是「DSH 插件雷达」的偏好翻译器，读者是不懂技术的中文用户。',
  '用户会用大白话描述他想用插件做什么，你把它翻成 3～5 个中文短词。',
  '短词要求：每个 2～8 个字，说的是「要做的事或东西」（如 视频剪辑、定时提醒、表格整理、桌宠），不是形容词。',
  '只输出这些词，用中文逗号隔开。不要编号、不要解释、不要英文、不要句号、不要引号。',
  '实在看不出他要做什么，就只输出：通用工具',
].join('\n')

const TAG_STOP = new Set([
  '想要', '喜欢', '东西', '一些', '可以', '帮我', '最好', '有点', '比较', '需要', '功能',
  '插件', '技能', '工具', '看看', '有没有', '什么', '就是', '一个', '这个', '那种',
])

/** 把模型吐回来的那行字清洗成关键词数组（最多 5 个）。 */
export function parseTags(text) {
  const raw = String(text || '')
    .replace(/^[^\n:：]{0,20}[:：]/, '')
    .replace(/[\n\r]+/g, '，')
  const out = []
  for (const part of raw.split(/[,，、;；\s/|]+/)) {
    let word = part
      .replace(/^[-*·•\d.、)）\s"'“”‘’]+/, '')
      .replace(/[。.!！?？"'“”‘’]+$/g, '')
      .trim()
    // 模型偶尔会写成一句话：把「我想要…」「…的东西」这类壳刮掉，留下能干活的词
    word = word
      .replace(/^我(想要|想|要|需要|希望|打算)/, '')
      .replace(/^(想要|想|需要|希望|打算)/, '')
      .replace(/^(一些|几个|几种|一点)/, '')
      .replace(/(的东西|的插件|的工具|之类|什么的|一些东西)$/, '')
    if (word.length < 2 || word.length > 12) continue
    if (TAG_STOP.has(word)) continue
    if (!CHINESE.test(word) && !/^[a-z0-9+#._-]{2,12}$/i.test(word)) continue
    if (out.includes(word)) continue
    out.push(word)
    if (out.length >= 5) break
  }
  return out
}

/** 一句话 → 关键词。一次模型调用，约一分钱；翻出来的词用户能删能改。 */
export async function askTags(ctx, text) {
  const clean = String(text || '').trim().slice(0, 300)
  if (!clean) return { ok: false, message: '先写一句你想用它做什么' }
  const llm = (ctx || runtimeCtx) && (ctx || runtimeCtx).get('llm')
  const pick = pickModel(ctx || runtimeCtx)
  if (!llm || !pick) return { ok: false, message: '模型服务没接上，暂时翻不了（词还是能手动加）' }
  let raw = ''
  let usage = null
  let timer = null
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('模型 30 秒没回，先停了')), 30000)
    if (timer.unref) timer.unref()
  })
  try {
    await Promise.race([(async () => {
      for await (const chunk of llm.stream({
        provider: pick.provider,
        model: pick.model,
        system: TAGS_SYSTEM,
        messages: [{ role: 'user', content: [{ type: 'text', text: '他想要：' + clean }] }],
      })) {
        if (chunk.type === 'text-delta') raw += chunk.text
        else if (chunk.type === 'usage' && chunk.usage) usage = chunk.usage
        else if (chunk.type === 'finish' && chunk.reason && (chunk.reason.kind === 'error' || chunk.reason.kind === 'aborted')) {
          throw new Error('模型那边出错了：' + ((chunk.reason.failure && chunk.reason.failure.message) || chunk.reason.kind))
        }
      }
    })(), timeout])
  } catch (e) {
    return { ok: false, message: (e && e.message) || String(e) }
  } finally {
    if (timer) clearTimeout(timer)
  }
  const tags = parseTags(raw)
  if (!tags.length) return { ok: false, message: '没翻出合适的词，换个说法（比如：我想做短视频，自动配字幕）' }
  return { ok: true, tags, raw: raw.trim().slice(0, 200), usage, cost: estimateCost(pick.model, usage), model: pick.model }
}

// ---------------------------------------------------------------- 帮我找（一句话 → 真去搜）
// 以前「我关心的」只是拿你填的词在本机名单里重排，一个结果都产不出来。
// 现在这一段做的是：让模型把大白话翻成搜索词 → 真的去插件商店和 GitHub 搜 → 按像不像排 → 由模型给一句人话理由。

const FINDS_FILE = path.join(DIR, 'finds.json')
const FIND_TTL = 10 * 60 * 1000
const FIND_MAX_ITEMS = 8
const FIND_KEYWORD_MAX = 6
const GITHUB_QUERY_BUDGET = 3

const FIND_INTENT_SYSTEM = [
  '你是「DSH 插件雷达」的搜索助手，对面是不懂技术的中文用户。',
  '用户用大白话说想找什么，你只负责把它变成「能拿去搜的词」，不负责回答。',
  '只输出一个 JSON 对象，不要 Markdown、不要解释、不要代码块：',
  '{"keywords":["中文词","english term"],"kinds":["plugin","skill"],"general":["通用工具名"]}',
  'keywords 3～6 个：既要有 2～4 个中文短词，也要有 2～4 个英文词（插件商店和 GitHub 上几乎只有英文搜得到东西）。',
  'kinds 从 plugin（装在桌面里的插件）、skill（放到技能目录里的 SKILL.md）里选，拿不准就两个都写。',
  'general 写 0～3 个「不是 DSH 插件、但能帮他做成这件事」的通用东西的名字（做游戏写 Phaser、PixiJS；做表格写 Excel）；没有就给空数组。',
  '绝对不要编 DSH 里不存在的插件名。',
].join('\n')

const FIND_ANSWER_SYSTEM = [
  '你是「DSH 插件雷达」的检索结果讲解员，对面是不懂技术的中文用户。',
  '给你的是刚搜出来的候选清单。只根据清单写，清单里没有的东西一个字都不要加。',
  '严格按下面两段输出，不要编号、不要 Markdown、不要英文术语：',
  '第一行：总结：<一句话，不超过 45 字，说清找到几个、最适合他的是哪个；一个都没有就直说没找到>',
  '之后每行：<名字> | <为什么适合他，不超过 30 字，写他看得见的用处>',
  '每个名字单独一行，名字必须照抄清单里的，不改写、不翻译、不加书名号。',
].join('\n')

const FIND_STOP = new Set([
  '帮我', '找一下', '找找', '看看', '推荐', '有没有', '我想要', '想要', '需要', '东西', '工具',
  '插件', '技能', '什么', '可以', '最好', '能够', '一个', '一些', '这个', '那个', '关于', '相关',
])

/** 把「帮我找一下关于做小游戏的插件」这种话剥壳，留下「小游戏」。 */
export function scrapePhrase(text) {
  return String(text || '')
    .replace(/^(帮我|给我|麻烦|请|能|能不能|想)+/, '')
    .replace(/^(找一下|找找|找|搜一下|搜|看看|推荐|要)+/, '')
    .replace(/^(一下|一个|一些|几个|点)/, '')
    .replace(/^(关于|有关|适合|用于|用来|做|搞|弄|写)+/, '')
    .replace(/(的)?(插件|技能|工具|东西|之类|相关|方面)$/, '')
    .replace(/[，。,.!！?？\s]+$/, '')
    .trim()
}

/** 没有模型时的兜底：中文命名词表 + 英文原词 + 剥过壳的中文短语。 */
export function heuristicKeywords(text) {
  const raw = String(text || '')
  const out = []
  const push = (w) => {
    const word = String(w || '').trim()
    if (word.length < 2 || word.length > 24) return
    if (FIND_STOP.has(word)) return
    if (out.some((x) => x.toLowerCase() === word.toLowerCase())) return
    out.push(word)
  }
  const phrase = scrapePhrase(raw)
  if (phrase) push(phrase)
  // 中文词表：既能拿到中文词（npm 偶尔有中文说明），也能拿到对应的英文（GitHub 只认英文）
  for (const [en, zh] of GLOSS) {
    if (raw.indexOf(zh) >= 0) { push(zh); push(en) }
  }
  for (const m of raw.matchAll(/[a-zA-Z][a-zA-Z0-9+#._-]{2,20}/g)) push(m[0])
  for (const m of raw.matchAll(/[\u4e00-\u9fff]{2,8}/g)) push(scrapePhrase(m[0]))
  return out.slice(0, FIND_KEYWORD_MAX)
}

/**
 * 模型吐的 JSON（可能带代码块、可能带废话）→ 稳定结构；解析不了就退回字面关键词。
 * raw 是模型输出，query 是用户原话。
 */
export function parseFindIntent(raw, query) {
  const text = String(raw || '')
  let obj = null
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const body = fenced ? fenced[1] : text
  const a = body.indexOf('{')
  const b = body.lastIndexOf('}')
  if (a >= 0 && b > a) {
    try { obj = JSON.parse(body.slice(a, b + 1)) } catch { obj = null }
  }
  const clean = (arr, max, minLen = 1) => {
    const out = []
    for (const v of Array.isArray(arr) ? arr : []) {
      const w = String(v == null ? '' : v).trim().replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
      if (w.length < minLen || w.length > 32) continue
      // 英文词允许带空格（html5 game、mini game），这比单个 game 搜得准
      if (!CHINESE.test(w) && !/^[a-z0-9+#._\- ]{2,32}$/i.test(w)) continue
      if (out.some((x) => x.toLowerCase() === w.toLowerCase())) continue
      out.push(w)
      if (out.length >= max) break
    }
    return out
  }
  let keywords = clean(obj && obj.keywords, FIND_KEYWORD_MAX, 2)
  let kinds = clean(obj && obj.kinds, 2, 2).filter((k) => k === 'plugin' || k === 'skill')
  const general = clean(obj && obj.general, 3, 2)
  if (!keywords.length) keywords = heuristicKeywords(query || text)
  if (!kinds.length) kinds = ['plugin', 'skill']
  return { keywords, kinds, general }
}

/** 词命中：名字、说明、中文线索、标签都算。返回命中的词，给「为什么是它」当依据。 */
export function hitWords(item, keywords) {
  const hay = [
    item && item.name, item && item.desc, item && item.line,
    item && item.en, ((item && item.zh) || []).join(' '), ((item && item.topics) || []).join(' '),
  ].join(' ').toLowerCase()
  const out = []
  for (const k of Array.isArray(keywords) ? keywords : []) {
    const w = String(k || '').toLowerCase()
    if (!w || out.indexOf(w) >= 0) continue
    if (hay.indexOf(w) >= 0) out.push(w)
  }
  return out
}

/** 排一条东西「像不像他要的」：词命中 > 已经装了 > 跟 DSH 有关 > 热度 > 新旧。 */
export function findScore(item, keywords, now = Date.now()) {
  const words = Array.isArray(keywords) ? keywords : []
  const name = String((item && item.name) || '').toLowerCase()
  let s = 0
  for (const w of words) {
    const k = String(w || '').toLowerCase()
    if (!k) continue
    if (name.indexOf(k) >= 0) s += 6
    else if (hitWords(item, [k]).length) s += 3
  }
  if (item && item.installed) s += 5
  if (item && relevanceOf(item) > 0) s += 2
  const pop = Number((item && (item.downloads || item.stars)) || 0)
  if (pop > 0) s += Math.min(3, Math.log10(pop + 1))
  const at = Number((item && item.updatedAt) || 0)
  if (at) {
    const age = (now - at) / DAY
    if (age <= 90) s += 1.5
    else if (age > 365) s -= 1
  }
  return s
}

/** 合并三个来源、去重、按分排、只留前 N 个。 */
export function rankFind(items, keywords, limit = FIND_MAX_ITEMS) {
  const seen = new Set()
  const out = []
  for (const it of Array.isArray(items) ? items : []) {
    if (!it || !it.name) continue
    const key = (it.type === 'skill' ? 'skill:' : 'plugin:') + String(it.name).toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(it)
  }
  out.sort((a, b) => {
    const d = findScore(b, keywords) - findScore(a, keywords)
    if (d) return d
    const pop = (Number(b.downloads) || 0) + (Number(b.stars) || 0) - (Number(a.downloads) || 0) - (Number(a.stars) || 0)
    if (pop) return pop
    return String(a.name).localeCompare(String(b.name))
  })
  return out.slice(0, limit)
}

/** 模型写的那段「总结 + 每条理由」→ { summary, notes }；名字对不上的行直接丢掉，不硬凑。 */
export function parseFindAnswer(text, names) {
  const list = (Array.isArray(names) ? names : []).map((n) => String(n || '')).filter(Boolean)
  const lower = new Map(list.map((n) => [n.toLowerCase(), n]))
  let summary = ''
  const notes = {}
  for (const line of String(text || '').split(/\r?\n/)) {
    const s = line.trim().replace(/^[-*·•\d.、)）\s]+/, '')
    if (!s) continue
    const sm = s.match(/^总\s*结\s*[:：]\s*(.+)$/)
    if (sm) { if (!summary) summary = sm[1].trim().slice(0, 80); continue }
    const parts = s.split(/\s*[|｜]\s*/)
    if (parts.length < 2) continue
    const rawName = parts[0].replace(/^["'“”‘’《]+|["'“”‘’》（(插件|技能)）]+$/g, '').trim()
    const why = parts.slice(1).join(' ').replace(/^["'“”‘’]+|["'“”‘’]+$/g, '').trim()
    if (!rawName || !why) continue
    const hit = lower.get(rawName.toLowerCase()) ||
      list.find((n) => n.toLowerCase() === rawName.toLowerCase() || n.toLowerCase().endsWith('/' + rawName.toLowerCase()))
    if (!hit) continue
    if (!notes[hit]) notes[hit] = why.slice(0, 60)
  }
  return { summary: summary.slice(0, 90), notes }
}

/** 一次模型调用，把一段话变成文字（带超时和用量）。 */
async function streamText(ctx, system, userText, ms = 40000, maxLen = 1200) {
  const c = ctx || runtimeCtx
  const llm = c && c.get('llm')
  const pick = pickModel(c)
  if (!llm || !pick) throw new Error('模型服务没接上')
  let text = ''
  let usage = null
  let timer = null
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('模型 ' + Math.round(ms / 1000) + ' 秒没回')), ms)
    if (timer.unref) timer.unref()
  })
  try {
    await Promise.race([(async () => {
      for await (const chunk of llm.stream({
        provider: pick.provider,
        model: pick.model,
        system,
        messages: [{ role: 'user', content: [{ type: 'text', text: userText }] }],
      })) {
        if (chunk.type === 'text-delta') text += chunk.text
        else if (chunk.type === 'usage' && chunk.usage) usage = chunk.usage
        else if (chunk.type === 'finish' && chunk.reason && (chunk.reason.kind === 'error' || chunk.reason.kind === 'aborted')) {
          throw new Error('模型那边出错了：' + ((chunk.reason.failure && chunk.reason.failure.message) || chunk.reason.kind))
        }
      }
    })(), timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
  return { text: text.trim().slice(0, maxLen), usage, model: pick.model, provider: pick.provider }
}

/** 让模型把大白话翻成搜索词；失败不抛，交给字面兜底。 */
async function askFindIntent(ctx, query) {
  try {
    const r = await streamText(ctx, FIND_INTENT_SYSTEM, '他要找：' + query, 30000, 400)
    const intent = parseFindIntent(r.text, query)
    return { intent, cost: estimateCost(r.model, r.usage), model: r.model }
  } catch {
    return { intent: parseFindIntent('', query), cost: 0, model: '' }
  }
}

/** 让模型写「总结 + 每条一句」，失败就用本地兜底理由。 */
async function askFindAnswer(ctx, query, items) {
  const list = items.map((it, i) => (i + 1) + '. ' + it.name + '（' + (it.type === 'skill' ? '技能' : '插件') + '）' + (it.desc ? '：' + it.desc.slice(0, 120) : '') + (it.installed ? '［本机已装］' : '')).join('\n')
  const r = await streamText(ctx, FIND_ANSWER_SYSTEM, '他要找：' + query + '\n\n搜到的清单：\n' + list, 40000, 1200)
  const parsed = parseFindAnswer(r.text, items.map((it) => it.name))
  return { summary: parsed.summary, notes: parsed.notes, cost: estimateCost(r.model, r.usage) }
}

/** 去插件商店搜：只留跟 DSH 有关系、名字/说明里带 dsh 的包。 */
async function findOnNpm(keywords, kinds, errors) {
  if ((kinds || []).indexOf('plugin') < 0) return []
  const byName = new Map()
  for (const k of (keywords || []).slice(0, 3)) {
    try {
      const json = await fetchJson('https://registry.npmjs.org/-/v1/search?size=20&text=' + encodeURIComponent('dsh ' + k), 10000)
      for (const o of json.objects || []) {
        const it = normalizeNpmObject(o)
        if (it && !byName.has(it.name)) byName.set(it.name, it)
      }
    } catch (e) {
      errors.push('插件商店：' + ((e && e.message) || String(e)))
    }
  }
  const items = [...byName.values()]
  if (items.length) {
    try { await fillDownloads(items.slice(0, 24), errors) } catch { /* 下载量拿不到不影响找 */ }
  }
  return items
}

/** 去 GitHub 搜：3 次查询封顶（匿名一小时只有 60 次，别一把用光）。 */
async function findOnGithub(keywords, kinds, errors) {
  const byName = new Map()
  const english = (keywords || []).filter((k) => !CHINESE.test(k))
  const list = (english.length ? english : (keywords || [])).slice(0, 3)
  const queries = []
  for (const k of list) {
    if (queries.length >= GITHUB_QUERY_BUDGET) break
    queries.push(k + ' dsh')
  }
  // 放宽：再专门找一轮「技能」（不一定是给 DSH 做的），只花一次查询
  if ((kinds || []).indexOf('skill') >= 0 && list[0] && queries.length < GITHUB_QUERY_BUDGET) {
    queries.push(list[0] + ' skill')
  }
  for (const q of queries) {
    try {
      const json = await fetchJson(
        'https://api.github.com/search/repositories?sort=stars&order=desc&per_page=15&q=' + encodeURIComponent(q),
        12000,
      )
      for (const r of json.items || []) {
        const it = normalizeRepo(r)
        if (it && !byName.has(it.fullName)) byName.set(it.fullName, it)
      }
    } catch (e) {
      const msg = (e && e.message) || String(e)
      if (/40[13]/.test(msg)) {
        errors.push('GitHub 一小时 60 次的匿名查询用完了，等一小时再找；插件商店那一半照常')
        break
      }
      errors.push('GitHub：' + msg)
    }
  }
  return [...byName.values()]
}

/** 本机已经装了的，也一起参与排名：先告诉你「这个你有了」。 */
async function findLocal(keywords) {
  const inst = await listInstalled()
  const out = []
  for (const p of inst.plugins) {
    if (!hitWords({ name: p.name, desc: p.desc }, keywords).length) continue
    out.push({ type: 'plugin', name: p.name, version: p.version, desc: p.desc, installed: true, source: 'local', url: '', updatedAt: p.at })
  }
  for (const s of inst.skills) {
    if (!hitWords({ name: s.name, desc: s.desc }, keywords).length) continue
    out.push({ type: 'skill', name: s.name, desc: s.desc, installed: true, source: 'local', url: '', updatedAt: s.at })
  }
  return out.slice(0, 4)
}

/** 模型没写理由时的兜底：命中词 + 热度 + 新旧，绝不编。 */
export function fallbackWhy(item, keywords) {
  if (item.installed) return '你本机已经有了'
  const hit = (item.keywords && item.keywords[0]) || hitWords(item, keywords)[0] || ''
  const bits = []
  if (hit) bits.push('说明里提到了「' + hit + '」')
  if (item.source === 'npm' && item.downloads) bits.push('这个月 ' + fmtNum(item.downloads) + ' 人下载')
  else if (item.stars) bits.push(item.stars + ' 颗星')
  const at = Number(item.updatedAt) || 0
  if (!at) bits.push('查不到更新时间')
  else if (Date.now() - at > 365 * DAY) bits.push('一年没更新了，别抱太大期望')
  else if (Date.now() - at < 60 * DAY) bits.push('最近两个月更新过')
  return bits.slice(0, 2).join('，') || '名字或说明跟你要的沾边'
}

const findsInflight = new Map()

/** POST /find：一句话 → 搜索词 → 真联网搜 → 排序 → 每题一句人话。 */
export async function findThings(query, ctx, { force } = {}) {
  const q = String(query || '').trim().slice(0, 200)
  if (!q) return { ok: false, message: '先说一句你想找什么（比如：帮我找做小游戏的插件）' }
  const cache = await readJson(FINDS_FILE, {})
  const hit = cache && cache[q]
  if (!force && hit && hit.result && Date.now() - Number(hit.at || 0) < FIND_TTL) {
    return { ...hit.result, cached: true }
  }
  if (findsInflight.has(q)) return findsInflight.get(q)

  const run = (async () => {
    const t0 = Date.now()
    const errors = []
    let cost = 0
    const intentRes = await askFindIntent(ctx, q)
    cost += intentRes.cost || 0
    const intent = intentRes.intent || parseFindIntent('', q)
    // 模型给的中文词在 GitHub 上等于零；补上词表里对应的英文
    for (const [en, zh] of GLOSS) {
      if (q.indexOf(zh) < 0) continue
      if (intent.keywords.some((k) => k.toLowerCase() === en.toLowerCase())) continue
      if (intent.keywords.length >= FIND_KEYWORD_MAX) break
      intent.keywords.push(en)
    }

    const [local, npm, gh] = await Promise.all([
      findLocal(intent.keywords).catch(() => []),
      findOnNpm(intent.keywords, intent.kinds, errors).catch(() => []),
      findOnGithub(intent.keywords, intent.kinds, errors).catch(() => []),
    ])
    const ranked = rankFind(local.concat(npm, gh), intent.keywords, FIND_MAX_ITEMS)
    const items = ranked.map((it) => {
      const plain = plainOf(it.desc)
      return {
        type: it.type === 'skill' ? 'skill' : 'plugin',
        name: String(it.name || ''),
        version: String(it.version || ''),
        desc: String(it.desc || '').slice(0, 240),
        line: it.line || plain.line,
        zh: it.zh || plain.zh,
        emoji: it.emoji || emojiFor(it),
        url: it.url || it.repo || '',
        repo: it.repo || '',
        fullName: it.fullName || '',
        stars: Number(it.stars) || 0,
        downloads: Number(it.downloads) || 0,
        updatedAt: Number(it.updatedAt) || 0,
        installed: !!it.installed,
        source: it.source || 'npm',
        keywords: hitWords(it, intent.keywords).slice(0, 2),
        why: '',
      }
    })

    let summary = ''
    let notes = {}
    if (items.length) {
      try {
        const a = await askFindAnswer(ctx, q, items)
        summary = a.summary
        notes = a.notes
        cost += a.cost || 0
      } catch (e) {
        errors.push('没写出总结（' + ((e && e.message) || String(e)) + '），直接列结果')
      }
    }
    if (!summary) {
      summary = items.length
        ? '找到 ' + items.length + ' 个沾边的，最像的是「' + items[0].name + '」。'
        : '这次没找到现成的。'
    }
    for (const it of items) it.why = notes[it.name] || notes[it.name.toLowerCase()] || fallbackWhy(it, intent.keywords)

    const result = {
      ok: true,
      query: q,
      keywords: intent.keywords,
      kinds: intent.kinds,
      general: intent.general || [],
      summary,
      items,
      cost: cost || null,
      took: Date.now() - t0,
      errors: errors.slice(0, 4),
    }
    try {
      const store = { ...(cache || {}), [q]: { at: Date.now(), result } }
      const keys = Object.keys(store).sort((a, b) => Number(store[b].at || 0) - Number(store[a].at || 0)).slice(0, 20)
      const trimmed = {}
      for (const k of keys) trimmed[k] = store[k]
      await writeJson(FINDS_FILE, trimmed)
    } catch { /* 存不下来不影响这次结果 */ }
    return result
  })()

  findsInflight.set(q, run)
  try {
    return await run
  } finally {
    findsInflight.delete(q)
  }
}

// ---------------------------------------------------------------- 一键装（调桌面自带 CLI）

function cliPath() {
  const exe = process.execPath
  const resources = process.resourcesPath || path.join(path.dirname(exe), 'resources')
  return { exe, cli: path.join(resources, 'app.asar', 'lib', 'desktop-cli.js') }
}

function runCli(args, timeoutMs = 180000) {
  return new Promise((resolve) => {
    const { exe, cli } = cliPath()
    let out = ''
    let done = false
    const finish = (r) => { if (!done) { done = true; resolve(r) } }
    let child
    try {
      child = spawn(exe, [cli, ...args], {
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', CI: 'true' },
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (e) {
      finish({ ok: false, message: '起不来安装进程：' + e.message })
      return
    }
    const timer = setTimeout(() => {
      // Windows 上 child.kill() 只杀外层 exe，pnpm 子进程会留着占住包锁，
      // 下次再装就报「锁被占用」。所以连子进程一起杀。
      try {
        if (process.platform === 'win32' && child.pid) {
          spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
        } else {
          child.kill('SIGKILL')
        }
      } catch {}
      finish({ ok: false, message: '装了 3 分钟还没完，已经掐掉（连子进程一起）。可能卡在下载，过一会儿再试。', output: out.slice(-1200) })
    }, timeoutMs)
    child.stdout.on('data', (d) => { out += d.toString() })
    child.stderr.on('data', (d) => { out += d.toString() })
    child.on('error', (e) => { clearTimeout(timer); finish({ ok: false, message: '安装进程出错：' + e.message }) })
    child.on('close', (code) => {
      clearTimeout(timer)
      const tail = out.trim().split('\n').slice(-14).join('\n')
      if (code === 0) finish({ ok: true, message: '装好了，完全退出 DSH 再打开才生效', output: tail })
      else finish({ ok: false, message: '没装上（退出码 ' + code + '）', output: tail })
    })
  })
}

/** 读一份 SKILL.md 的 frontmatter，判断 DSH 会不会收它。纯函数，测试直接调。 */
export function checkSkillFile(text) {
  const s = String(text || '')
  const m = s.match(/^---\s*\n([\s\S]*?)\n---/)
  if (!m) return { ok: false, why: '没有 frontmatter（开头那段 --- 包起来的说明）' }
  const head = m[1]
  const hasName = /^name\s*:\s*\S/m.test(head)
  const hasDesc = /^description\s*:\s*\S/m.test(head)
  if (!hasName) return { ok: false, why: '缺少 name' }
  if (!hasDesc) return { ok: false, why: '缺少 description' }
  const oldKeys = ['disableModelInvocation', 'modelInvocable', 'userInvocable']
  const bad = oldKeys.filter((k) => new RegExp('^' + k + '\\s*:', 'm').test(head))
  if (bad.length) return { ok: false, why: '用了会让 DSH 整条丢弃的旧写法：' + bad.join('、') }
  return { ok: true }
}

/** 从仓库文件清单里挑出所有 SKILL.md，并算出每个技能所在目录。纯函数。 */
export function findSkillDirs(entries) {
  const out = []
  for (const e of (Array.isArray(entries) ? entries : [])) {
    if (!e || typeof e.path !== 'string') continue
    if (!/(^|\/)skill\.md$/i.test(e.path)) continue
    const dir = e.path.replace(/\/?skill\.md$/i, '')
    out.push({ path: e.path, dir, name: dir ? dir.split('/').pop() : '' })
  }
  return out
}

const SKILLS_ROOT = path.join(os.homedir(), '.agents', 'skills')

/** 把仓库里某个目录整个拉到 ~/.agents/skills/<目录名>，装完自检，不过就删干净。 */
async function installSkillFromRepo(full, pickName) {
  const safe = String(full || '').trim()
  if (!/^[\w.-]+\/[\w.-]+$/.test(safe)) return { ok: false, message: '这条不是 GitHub 仓库，装不了技能' }
  let meta = null
  try {
    meta = await fetchJson('https://api.github.com/repos/' + safe, 12000)
  } catch (e) {
    if (isRateLimit(e)) return { ok: false, message: 'GitHub 今天的免费查询次数用完了，过一小时再试（不是仓库没了）' }
    if (isNetworkDown(e)) return { ok: false, message: '你这边连不上 GitHub，换了个地址也没成功' }
    return { ok: false, message: '仓库打不开（可能改名、删了或没公开）：' + safe }
  }
  const branch = String((meta && meta.default_branch) || 'main')
  let tree = null
  try {
    const t = await fetchJson('https://api.github.com/repos/' + safe + '/git/trees/' + encodeURIComponent(branch) + '?recursive=1', 15000)
    tree = Array.isArray(t && t.tree) ? t.tree : null
  } catch (e) {
    if (isRateLimit(e)) return { ok: false, message: 'GitHub 今天的免费查询次数用完了，过一小时再试（不是仓库没了）' }
  }
  if (!tree) tree = await fetchMirrorTree(safe, branch)
  if (!Array.isArray(tree) || !tree.length) return { ok: false, message: '拿不到这个仓库的文件清单，等会儿再试' }
  const ref = String((meta && meta.default_branch) || branch)
  const dirs = findSkillDirs(tree)
  if (!dirs.length) return { ok: false, message: '这个仓库里没有 SKILL.md，不是技能（技能一定有这个文件）' }
  let pick = dirs[0]
  if (dirs.length > 1) {
    // 多个技能：用户点了哪个装哪个；没点就列出来让他选，别自己猜
    const chosen = dirs.find((d) => d.name && String(pickName || '').split('/').pop() === d.name) ||
      dirs.find((d) => d.dir && String(pickName || '').endsWith(d.name))
    if (!chosen) {
      return {
        ok: false,
        message: '这个仓库里有 ' + dirs.length + ' 个技能，先选一个再装',
        choices: dirs.map((d) => ({ name: d.name || safe.split('/').pop(), dir: d.dir })),
      }
    }
    pick = chosen
  }
  const dirName = String(pick.name || safe.split('/').pop()).replace(/[^\w.-]/g, '')
  if (!dirName) return { ok: false, message: '技能目录名认不出来，不装了' }
  const target = path.join(SKILLS_ROOT, dirName)
  const prefix = pick.dir ? pick.dir + '/' : ''
  const files = tree.filter((e) => e && typeof e.path === 'string' && e.path.startsWith(prefix) && e.type !== 'tree')
    .filter((e) => Number(e.size || 0) <= 512 * 1024)
  if (!files.length) return { ok: false, message: '技能目录里没读到文件，等会儿再试' }
  const wrote = []
  try {
    await fs.mkdir(target, { recursive: true })
    for (const f of files.slice(0, 60)) {
      const rel = f.path.slice(prefix.length)
      if (!rel || rel.includes('..')) continue
      const text = await fetchRepoText(safe, ref, f.path)
      if (text == null) continue
      const dest = path.join(target, rel)
      await fs.mkdir(path.dirname(dest), { recursive: true })
      await fs.writeFile(dest, text, 'utf8')
      wrote.push(rel)
    }
  } catch (e) {
    await fs.rm(target, { recursive: true, force: true }).catch(() => {})
    return { ok: false, message: '写文件时出错了，已经清干净：' + ((e && e.message) || e) }
  }
  // 用户点名要的「装完还得测一下」：重读落盘的 SKILL.md，DSH 不认的就删掉
  const skillPath = path.join(target, 'SKILL.md')
  let raw = ''
  try {
    raw = await fs.readFile(skillPath, 'utf8')
  } catch {
    // 有的仓库大小写不一，找一下同目录下的任意 skill.md
    try {
      const names = await fs.readdir(target)
      const hit = names.find((n) => /^skill\.md$/i.test(n))
      if (!hit) throw new Error('没落到 SKILL.md')
      raw = await fs.readFile(path.join(target, hit), 'utf8')
    } catch {
      await fs.rm(target, { recursive: true, force: true }).catch(() => {})
      return { ok: false, message: '装完没找到 SKILL.md，已经清干净，没往技能目录里留垃圾' }
    }
  }
  const chk = checkSkillFile(raw)
  if (!chk.ok) {
    await fs.rm(target, { recursive: true, force: true }).catch(() => {})
    return { ok: false, message: '这个技能 DSH 不会认（' + chk.why + '），已经删掉了，没留半成品' }
  }
  return {
    ok: true,
    skill: dirName,
    dir: target,
    files: wrote.length,
    message: '装好了：' + dirName + '（' + wrote.length + ' 个文件）· 技能是热加载，现在就能用，不用重启',
  }
}

export async function installItem({ name, version, type, repo, fullName, pick }) {
  if (!name) return { ok: false, message: '缺少包名' }
  const r = await installReal({ name, version, type, repo, fullName, pick })
  // 装完给一张三句话的卡：什么时候能用 / 去哪看 / 怎么一句话确认它真生效。不调模型，不花钱。
  if (r && r.ok) {
    r.verify = type === 'skill'
      ? {
        when: '现在就能用，不用重启',
        where: '「我装的」页签 → 技能那一栏，能看到「' + (r.skill || name) + '」',
        how: '随便发一句「用 ' + (r.skill || name) + ' 帮我…」，能接上就说明生效了',
      }
      : {
        when: '要完全退出 DSH 再打开（关掉小窗口不算）',
        where: '重开后在「我装的」页签 → 插件那一栏，能看到「' + name + '」',
        how: '重开后随便发一句话，看界面多了什么；也可以在对话里点它的页签',
      }
  }
  return r
}

async function installReal({ name, version, type, repo, fullName, pick }) {
  const { cli } = cliPath()
  try {
    await fs.access(cli)
  } catch {
    return { ok: false, message: '这台机器上找不到桌面自带的安装器', manual: 'dsh plugin --profile desktop add ' + name }
  }
  if (type === 'skill') {
    const gh = githubRepo(repo || fullName || '') || githubRepo(name) || (/^[\w.-]+\/[\w.-]+$/.test(String(name)) ? String(name) : '')
    if (!gh) {
      return { ok: false, message: '这条技能没写仓库地址，装不了。把它的 GitHub 地址发我，我来放。' }
    }
    const r = await installSkillFromRepo(gh, pick || name)
    return { ...r, manual: r.ok ? '' : 'git clone --depth 1 https://github.com/' + gh }
  }
  const spec = version ? name + '@' + version : name
  const res = await runCli(['plugin', '--profile', 'desktop', 'add', spec])
  return { ...res, spec }
}

// ---------------------------------------------------------------- HTTP 接口

// ---------------------------------------------------------------- 收藏夹报告（逐条分析 + 跟本机对比）

// 正在跑的那一轮进度（前端每 1.5 秒来问一次，好显示「第几条/共几条」）
let bagJob = null

export function bagJobStatus() {
  if (!bagJob) return { running: false, total: 0, done: 0, current: '' }
  return { ...bagJob }
}

const BAG_SYSTEM = [
  '你是「DSH 插件雷达」的收藏分析员，读者是不懂技术的中文用户。',
  '只根据给你的资料写；资料里没写的就写「资料里没写」，绝对不要编。',
  '只输出一个 JSON 对象，不要代码块、不要多余解释：',
  '{"verdict":"值得装|可以等等|不用装","what":"...","evidence":"...","diff":"..."}',
  'what 说它是干什么的、用户能看见什么，40 个汉字以内；evidence 说有没有真实证据（用的人多不多、更新勤不勤、有没有案例），40 字以内；diff 说跟本机已装的某个东西重不重复，40 字以内。',
  'verdict 三选一：能补上本机没有的能力、又有真实证据 → 值得装；能用，但跟本机重复或证据太弱 → 可以等等；跟本机明显重复、或用不上 → 不用装。',
  'diff 必须点名；本机没有可比的就说「本机没有同类」。',
  '不用英文术语，不写「该插件」「此类工具」这种书面语。',
].join('\n')

/** 存盘坏掉的中文（乱码）不能喂给模型，也不能拿来给用户看。 */
export function isGarbled(text) {
  const s = String(text || '')
  if (!s) return false
  if (/\ufffd/.test(s)) return true
  // 连续问号/方块也算坏
  if (/[?？]{3,}/.test(s)) return true
  return false
}

function normName(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '')
}

/** 粗分词：英文按 4 字母以上、中文按二元组。只用来找「可能重复」，不追求精确。 */
export function tokensOf(text) {
  const s = String(text || '').toLowerCase()
  const out = new Set()
  for (const w of s.match(/[a-z][a-z0-9]{3,}/g) || []) out.add(w)
  for (const run of s.match(/[\u4e00-\u9fff]{2,}/g) || []) {
    for (let i = 0; i + 2 <= run.length; i++) out.add(run.slice(i, i + 2))
  }
  return [...out]
}

/** 跟本机已装的比：名字撞上算强重复，功能词重合算疑似。 */
export function dupCandidates(item, installed) {
  const out = []
  const list = []
  for (const p of (installed && installed.plugins) || []) list.push({ name: p.name, kind: '插件', desc: p.desc || '' })
  for (const s of (installed && installed.skills) || []) list.push({ name: s.name, kind: '技能', desc: s.desc || '' })
  const mine = normName(item && item.name)
  const mineTok = tokensOf((item && item.name) + ' ' + (item && item.desc) + ' ' + (item && item.line))
  for (const it of list) {
    if (out.length >= 4) break
    const k = normName(String(it.name).split('/').pop())
    // 自己跟自己不算重复（收藏里那条可能已经在本机装着了）
    if (k && mine && k === mine) continue
    if (k && mine && (k === mine || (k.length >= 4 && (mine.includes(k) || k.includes(mine))))) {
      out.push({ name: it.name, kind: it.kind, why: '名字几乎一样' })
      continue
    }
    const shared = tokensOf(it.name + ' ' + it.desc).filter((t) => mineTok.includes(t))
    if (shared.length >= 3) out.push({ name: it.name, kind: it.kind, why: '功能词重合：' + shared.slice(0, 3).join('、') })
  }
  return out
}

/** 报告用 README：先走不占 GitHub 次数的镜像，失败再回官方接口。 */
async function readmeForReport(full) {
  if (!full) return ''
  for (const ref of ['main', 'master']) {
    const t = await fetchRepoText(full, ref, 'README.md')
    if (t && t.trim().length > 40) return t.slice(0, 6000)
  }
  return await fetchGithubReadme(full)
}

/** 收藏里那条东西的「资料」：缓存里有的直接用，没有就去 npm 查一次。 */
async function reportMaterial(name, info) {
  const feed = await getFeed().catch(() => null)
  const all = [...((feed && feed.skills) || []), ...((feed && feed.plugins) || [])]
  let item = all.find((x) => x && x.name === name) || null
  if (!item) {
    try {
      const meta = await fetchJson('https://registry.npmjs.org/' + encodeURIComponent(name), 12000)
      if (meta && meta.name) {
        item = {
          type: 'plugin',
          name: meta.name,
          version: String((meta['dist-tags'] && meta['dist-tags'].latest) || ''),
          desc: String(meta.description || ''),
          downloads: 0,
          stars: 0,
          updatedAt: Date.parse(meta.time && meta.time.modified) || 0,
          repo: meta.repository ? String(meta.repository.url || meta.repository) : '',
        }
      }
    } catch { /* 查不到就只按收藏时的信息写 */ }
  }
  const byInfo = { type: info && info.type === 'skill' ? 'skill' : 'plugin', version: String((info && info.version) || '') }
  if (!item) return { item: { name, type: byInfo.type, version: byInfo.version, desc: '', stars: 0, downloads: 0, updatedAt: 0, repo: '' }, readme: '', repo: '' }
  const repo = githubRepo(item.repo) || githubRepo(item.url)
  const readme = await readmeForReport(repo)
  return { item, readme, repo }
}

function ageText(t) {
  const d = Date.now() - Number(t || 0)
  if (!t) return '不知道'
  if (d < 0) return '不知道'
  const day = Math.floor(d / 86400000)
  if (day <= 0) return '今天'
  if (day < 30) return day + ' 天前'
  if (day < 365) return Math.floor(day / 30) + ' 个月前'
  return Math.floor(day / 365) + ' 年前'
}

function parseVerdict(text) {
  const s = String(text || '')
  const i = s.indexOf('{')
  const j = s.lastIndexOf('}')
  let obj = null
  if (i >= 0 && j > i) {
    try { obj = JSON.parse(s.slice(i, j + 1)) } catch { obj = null }
  }
  if (!obj) {
    // 模型没按格式来：把它写的几行直接当三段用，别整条报废
    const lines = s.split('\n').map((x) => x.trim()).filter(Boolean)
    obj = { verdict: '可以等等', what: lines[0] || '', evidence: lines[1] || '', diff: lines[2] || '' }
  }
  const raw = String(obj.verdict || '')
  const verdict = /不用装|不推荐|重复/.test(raw) ? 'no' : /值得装|推荐|可以装/.test(raw) ? 'worth' : /可以等等|观望|再说/.test(raw) ? 'wait' : 'wait'
  return {
    verdict,
    verdictText: verdict === 'worth' ? '值得装' : verdict === 'no' ? '不用装' : '可以等等',
    what: String(obj.what || '').slice(0, 120),
    evidence: String(obj.evidence || '').slice(0, 120),
    diff: String(obj.diff || '').slice(0, 120),
  }
}

async function askBagOne(ctx, pick, item, readme, repo, installed, dup, info) {
  const llm = ctx.get('llm')
  const hot = []
  if (item.stars) hot.push('星数 ' + item.stars)
  if (item.downloads) hot.push('月下载 ' + item.downloads)
  if (item.updatedAt) hot.push('最近更新 ' + ageText(item.updatedAt))
  if (!hot.length) hot.push('没拿到热度数据')
  const localList = [
    ...((installed.plugins || []).filter((p) => !/^@deepseek-ai\//.test(p.name)).slice(0, 40).map((p) => p.name + (p.desc ? '：' + String(p.desc).slice(0, 40) : ''))),
    ...((installed.skills || []).slice(0, 40).map((s) => s.name + '（技能）' + (s.desc ? '：' + String(s.desc).slice(0, 40) : ''))),
  ]
  const user = [
    '名字：' + item.name,
    '类型：' + (item.type === 'skill' ? 'DSH 技能（GitHub 仓库）' : 'DSH 插件（npm 包）'),
    '版本：' + (item.version || '未知'),
    '作者原话：' + (isGarbled(item.desc) ? '（存的时候坏掉了，读不出）' : (item.desc || item.line || '（没写）')),
    '热度：' + hot.join(' · '),
    '仓库：' + (repo || '没有公开仓库'),
    '疑似跟本机重复：' + (dup.length ? dup.map((d) => d.name + '（' + d.why + '）').join('；') : '没有明显重复的'),
    '本机已装（一共 ' + localList.length + ' 项，节选）：',
    localList.length ? localList.join('\n') : '（本机没读到已装的东西）',
    '资料片段：',
    readme ? readme.slice(0, 3000) : '（没拿到 README，只能按作者原话和热度写）',
  ].join('\n')

  let text = ''
  let usage = null
  let timer = null
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('模型 60 秒没回，先停了')), 60000)
    if (timer.unref) timer.unref()
  })
  try {
    await Promise.race([(async () => {
      for await (const chunk of llm.stream({
        provider: pick.provider,
        model: pick.model,
        system: BAG_SYSTEM,
        messages: [{ role: 'user', content: [{ type: 'text', text: user }] }],
      })) {
        if (chunk.type === 'text-delta') text += chunk.text
        else if (chunk.type === 'usage' && chunk.usage) usage = chunk.usage
        else if (chunk.type === 'finish' && chunk.reason && (chunk.reason.kind === 'error' || chunk.reason.kind === 'aborted')) {
          throw new Error('模型那边出错了：' + ((chunk.reason.failure && chunk.reason.failure.message) || chunk.reason.kind))
        }
      }
    })(), timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
  const v = parseVerdict(text)
  return {
    at: Date.now(),
    name: item.name,
    type: item.type,
    version: item.version || '',
    verdict: v.verdict,
    verdictText: v.verdictText,
    what: v.what,
    evidence: v.evidence,
    diff: v.diff,
    dup: dup.map((d) => d.name),
    readme: !!readme,
    model: pick.model,
    usage: usage || null,
    cost: estimateCost(pick.model, usage),
  }
}

/** 报告有没有过期：12 小时内同一条不重复花钱。 */
const REPORT_TTL = 12 * 3600 * 1000

export function reportStale(report, now = Date.now()) {
  if (!report || !report.at) return true
  return now - Number(report.at) > REPORT_TTL
}

/**
 * 一键给收藏夹出报告：逐条查资料 → 跟本机已装的比 → 模型写三句 → 落 state.reports。
 * 只补缺的（或过期的），force=true 才全部重做。
 */
export async function bagReport(ctx, { force } = {}) {
  if (bagJob && bagJob.running) return { ok: false, message: '上一轮还在跑，等它出完' }
  const state = await getState()
  const wanted = (state.wanted || []).slice(0, 40)
  if (!wanted.length) return { ok: false, message: '收藏夹是空的：先去「雷达」里点几条「想要」' }
  const prev = (state.reports && typeof state.reports === 'object') ? state.reports : {}
  const reports = { ...prev }
  const todo = wanted.filter((n) => force || reportStale(reports[n]))
  if (!todo.length) return { ok: true, reports, cached: true, total: wanted.length, done: 0 }

  const llm = ctx && ctx.get('llm')
  const pick = pickModel(ctx)
  if (!llm || !pick) return { ok: false, message: '模型服务没接上，暂时出不了报告（插件照常能用）' }

  bagJob = { running: true, total: todo.length, done: 0, current: todo[0] || '', startedAt: Date.now() }
  const installed = await listInstalled().catch(() => ({ plugins: [], skills: [] }))
  const wantedInfo = state.wantedInfo || {}
  const errors = []
  const queue = todo.slice()
  let cost = 0

  async function worker() {
    for (;;) {
      const name = queue.shift()
      if (!name) return
      bagJob.current = name
      try {
        const info = wantedInfo[name] || {}
        const { item, readme, repo } = await reportMaterial(name, info)
        if (isGarbled(item.line)) item.line = ''
        if (isGarbled(item.desc)) item.desc = ''
        if (!item.desc && !isGarbled(info.line)) item.line = String(info.line || '')
        const dup = dupCandidates(item, installed)
        const rep = await askBagOne(ctx, pick, item, readme, repo, installed, dup, info)
        if (typeof rep.cost === 'number') cost += rep.cost
        reports[name] = rep
        await patchState({ reports: { [name]: rep } })
      } catch (e) {
        errors.push(name + '：' + ((e && e.message) || String(e)))
      } finally {
        bagJob.done += 1
      }
    }
  }
  try {
    await Promise.all([worker(), worker(), worker()])
  } finally {
    bagJob.running = false
    bagJob.current = ''
  }
  return { ok: true, reports, total: wanted.length, done: todo.length - errors.length, errors, cost, model: pick.model }
}

const ROUTE = '/plugin-radar/api'

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(body))
}

/**
 * 桌面 shell 的面板发请求不带 Origin，所以「没有 Origin = 脚本」是错的判据。
 * 实测判据：渲染进程一定有完整 Mozilla UA + accept-language；curl 两样都没有。
 */
export function sameOrigin(request, writing = false) {
  const origin = String(request.headers.origin ?? '').trim()
  const site = String(request.headers['sec-fetch-site'] ?? '').toLowerCase()
  if (origin && /^(file|app|dsh|dsh-app):/i.test(origin)) return true
  if (origin === '') {
    const agent = String(request.headers['user-agent'] ?? '')
    const language = String(request.headers['accept-language'] ?? '')
    if (/^Mozilla\/5\.0/.test(agent) && language !== '') return true
    return !writing
  }
  if (site === 'cross-site' || site === 'same-site') return false
  if (origin === 'null') return false
  try {
    return new URL(origin).host.toLowerCase() === String(request.headers.host ?? '').trim().toLowerCase()
  } catch {
    return false
  }
}

function readBody(request, limit = 65536) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    request.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) { reject(new Error('body too large')); request.destroy(); return }
      chunks.push(chunk)
    })
    request.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8')
      try { resolve(text ? JSON.parse(text) : {}) } catch { reject(new Error('bad json')) }
    })
    request.on('error', reject)
  })
}

export async function handleRequest(req, res, ctx) {
  const url = new URL(req.url || '/', 'http://localhost')
  const sub = url.pathname.slice(ROUTE.length) || '/'
  const writing = req.method !== 'GET'
  if (!sameOrigin(req, writing)) return json(res, 403, { error: 'forbidden' })

  try {
    if (sub === '/feed' && req.method === 'GET') {
      const force = url.searchParams.get('force') === '1'
      const feed = await getFeed({ force })
      // 已有的 AI 短评一起带回，卡片打开就有中文，不用再点一次
      return json(res, 200, { ...feed, notes: await getNotes() })
    }
    if (sub === '/explain' && req.method === 'POST') {
      const body = (await readBody(req)) || {}
      return json(res, 200, await explainItem(body, ctx || runtimeCtx, { force: body.force === true }))
    }
    if (sub === '/tags' && req.method === 'POST') {
      const body = (await readBody(req)) || {}
      return json(res, 200, await askTags(ctx || runtimeCtx, body.text))
    }
    if (sub === '/find' && req.method === 'POST') {
      const body = (await readBody(req)) || {}
      return json(res, 200, await findThings(body.q, ctx || runtimeCtx, { force: body.force === true }))
    }
    if (sub === '/installed' && req.method === 'GET') {
      return json(res, 200, await listInstalled())
    }
    if (sub === '/bag-report' && req.method === 'POST') {
      const body = (await readBody(req)) || {}
      return json(res, 200, await bagReport(ctx || runtimeCtx, { force: body.force === true }))
    }
    if (sub === '/bag-progress' && req.method === 'GET') {
      return json(res, 200, { ok: true, ...bagJobStatus() })
    }
    if (sub === '/state' && req.method === 'GET') {
      return json(res, 200, await getState())
    }
    if (sub === '/state' && req.method === 'POST') {
      return json(res, 200, await patchState(await readBody(req)))
    }
    if (sub === '/install' && req.method === 'POST') {
      const body = await readBody(req)
      const r = await installItem(body || {})
      return json(res, 200, r)
    }
    if (sub === '/case-chat' && req.method === 'GET') {
      const u = String(url.searchParams.get('url') || '').trim()
      if (!u) return json(res, 400, { ok: false, error: '缺少 url' })
      return json(res, 200, { ok: true, messages: await getCaseChat(u) })
    }
    if (sub === '/case-repo' && req.method === 'GET') {
      const u = String(url.searchParams.get('url') || '').trim()
      const u2 = String(url.searchParams.get('url2') || '').trim()
      const repoFull = githubRepo(u2) || githubRepo(u)
      if (!repoFull) return json(res, 200, { ok: false, reason: 'no-repo', error: repoFailText('no-repo') })
      const r = await repoSnapshot(repoFull)
      if (!r.ok) return json(res, 200, { ok: false, reason: r.reason, error: repoFailText(r.reason, r.reset) })
      return json(res, 200, {
        ok: true,
        repo: repoFull,
        ref: r.snap.ref,
        files: r.snap.files.length,
        bytes: r.snap.bytes,
        total: r.snap.total,
        cached: !!r.cached,
        names: r.snap.files.map((f) => f.path),
      })
    }
    if (sub === '/case-chat' && req.method === 'POST') {
      const body = (await readBody(req)) || {}
      const r = await chatCase(body, ctx || runtimeCtx)
      return json(res, r.status, r.body)
    }
    // 删聊天记录：{ urls: [...] } 删这几条；{ all: true } 清空。两个都给 = 按 urls 删。
    if (sub === '/case-chat' && req.method === 'DELETE') {
      const body = (await readBody(req)) || {}
      if (body.all === true) return json(res, 200, await clearCaseChats())
      const urls = Array.isArray(body.urls) ? body.urls : body.url ? [body.url] : []
      if (!urls.length) return json(res, 400, { ok: false, error: '没说要删哪条（urls 是空的），一条都没删' })
      return json(res, 200, await deleteCaseChats(urls))
    }
    if (sub === '/cases' && req.method === 'GET') {
      const data = await readJson(CASES_FILE, { items: [] })
      const items = Array.isArray(data.items) ? data.items : []
      return json(res, 200, { items, updatedAt: data.updatedAt || null, file: CASES_FILE })
    }
    if (sub === '/spend' && req.method === 'GET') {
      return json(res, 200, await getSpend())
    }
    if (sub === '/case-gist' && req.method === 'GET') {
      const body = {
        url: String(url.searchParams.get('url') || '').trim(),
        url2: String(url.searchParams.get('url2') || '').trim(),
        name: String(url.searchParams.get('name') || '').trim(),
      }
      const r = await caseGist(body, ctx || runtimeCtx)
      return json(res, 200, r)
    }
    if (sub === '/chats' && req.method === 'GET') {
      return json(res, 200, { ok: true, items: await listCaseChats() })
    }
    if (sub === '/health' && req.method === 'GET') {
      const cached = await readJson(CACHE_FILE, null)
      const { exe, cli } = cliPath()
      let cliOk = false
      try { await fs.access(cli); cliOk = true } catch {}
      const notes = await getNotes()
      return json(res, 200, {
        ok: true,
        dir: DIR,
        cacheFile: CACHE_FILE,
        cacheAge: cached ? Date.now() - (cached.fetchedAt || 0) : -1,
        counts: cached ? { plugins: cached.plugins.length, skills: cached.skills.length } : null,
        notes: Object.keys(notes).length,
        errors: (cached && cached.errors) || [],
        cli: { path: cli, found: cliOk, exe },
      })
    }
    return json(res, 404, { error: 'not found', sub })
  } catch (e) {
    return json(res, 500, { error: e && e.message ? e.message : String(e) })
  }
}

export function apply(ctx) {
  ctx?.logger?.debug?.('[plugin-radar] host half ready')
  runtimeCtx = ctx || null
  // webServer 只在桌面/网页面有，TUI 上没有；动态注入，缺席就安静退出。
  ctx.inject(['webServer'], (webCtx) => {
    if (!webCtx?.webServer) return
    webCtx.effect(() => webCtx.webServer.register({ kind: 'prefix', path: ROUTE, handler: (req, res) => handleRequest(req, res, ctx) }))
  })
}
