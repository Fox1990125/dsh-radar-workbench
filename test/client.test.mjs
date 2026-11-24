/**
 * 浏览器半段冒烟测试：node test/client.test.mjs
 *
 * 没有真浏览器，就用一个极小的 React 替身把组件的渲染函数跑一遍：
 * 抓拼写错、未定义变量、工具风渲染、卡片内容对不对。
 * 真正的长相还得人眼看。
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const src = readFileSync(path.join(here, '..', 'lib', 'client.js'), 'utf8')

let pass = 0, fail = 0
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ✓ ' + name) }
  else { fail++; console.log('  ✗ ' + name + (extra !== undefined ? ' → ' + JSON.stringify(extra).slice(0, 300) : '')) }
}

// ---- 极简 React 替身：按调用顺序发 hook 槽位，允许测试预置值 ----
// 槽位顺序：0 tab 1 bucket 2 feed 3 state 4 load 5 err 6 open 7 busy 8 draft 9 toast 10 notes 11 researching
let preset = {}
let hookIndex = 0
const React = {
  createElement(type, props, ...children) {
    const flat = []
    const push = (c) => {
      if (c === null || c === undefined || c === false) return
      if (Array.isArray(c)) return c.forEach(push)
      flat.push(c)
    }
    children.forEach(push)
    return { type, props: Object.assign({}, props || {}, { children: flat }) }
  },
  useState(init) {
    const i = hookIndex++
    const val = Object.prototype.hasOwnProperty.call(preset, i) ? preset[i] : init
    return [val, () => {}]
  },
  useEffect() {},
  useRef(v) { return { current: v } },
}
globalThis.fetch = async () => { throw new Error('测试里不联网') }

let registered = null
globalThis.window = {
  __ModuleLoader__: {
    load({ factory }) {
      const mod = factory((id) => {
        if (id === 'react') return React
        throw new Error('unexpected require: ' + id)
      })
      registered = mod
    },
  },
}
globalThis.console.warn = () => {}

// eslint-disable-next-line no-new-func
new Function(src)()

ok('模块被 loader 接住', !!registered)
ok('导出 apply/inject', typeof registered.apply === 'function' && Array.isArray(registered.inject))

let view = null
registered.apply({
  slots: {
    inject(name, cb) { ok('注册到 conversation.view', name === 'conversation.view'); cb() },
    register(cfg, comp) {
      ok('页签 id = radar-hub', cfg.id === 'radar-hub', cfg)
      view = comp
      return { dispose() {} }
    },
  },
})
ok('拿到组件', typeof view === 'function')

const feed = {
  fetchedAt: Date.now(),
  errors: [],
  notes: { 'p-one@1.2.3': { key: 'p-one@1.2.3', text: '它是做笔记的\n适合随手记\n要重启', at: Date.now() } },
  skills: [
    { type: 'skill', name: 's-one', emoji: '🧩', line: '技能一句话', stars: 3200, updatedAt: Date.now() - 86400000, restart: false, advice: { level: 'ok', label: '可以装', why: ['星多'] } },
  ],
  plugins: [
    { type: 'plugin', name: 'p-one', version: '1.2.3', emoji: '🔌', line: '插件一句话', zh: ['笔记', '待办'], downloads: 130000, updatedAt: Date.now() - 2 * 86400000, restart: true, advice: { level: 'ok', label: '可以装', why: ['人多'] } },
  ],
  buckets: { fresh: { skills: ['s-one'], plugins: ['p-one'] }, hot: { skills: ['s-one'], plugins: ['p-one'] }, fun: { skills: ['s-one'], plugins: ['p-one'] } },
}

function walk(node, fn) {
  if (node === null || node === undefined || node === false) return
  if (typeof node === 'string' || typeof node === 'number') { fn(node); return }
  if (typeof node !== 'object') return
  if (typeof node.type === 'function') { walk(node.type(node.props), fn); return }
  fn(node)
  const kids = node.props && node.props.children
  if (Array.isArray(kids)) kids.forEach((k) => walk(k, fn))
}

function textOf(node) {
  const out = []
  walk(node, (n) => {
    if (typeof n === 'string' || typeof n === 'number') out.push(String(n))
  })
  return out.join(' ')
}

function render(p) {
  hookIndex = 0
  preset = p
  try { return { tree: view() } } catch (e) { return { err: e } }
}

// ---- 工具风主界面 ----
const main = render({ 0: 'radar', 2: feed, 3: { tags: [], wanted: [], skipped: [] }, 4: 'done' })
ok('渲染不报错', !main.err, main.err && main.err.message)
const txt = main.tree ? textOf(main.tree) : ''
ok('没有外观切换按钮了', txt.indexOf('工具风') < 0 && txt.indexOf('杂志风') < 0 && txt.indexOf('终端风') < 0, txt.slice(0, 120))
ok('标题、两张卡都在', txt.indexOf('插件雷达') >= 0 && txt.indexOf('p-one') >= 0 && txt.indexOf('s-one') >= 0)
ok('卡片写了建议', txt.indexOf('可以装') >= 0)
ok('英文条目露关键词', txt.indexOf('关键词') >= 0 && txt.indexOf('笔记') >= 0)
ok('有「让 AI 研究」按钮', txt.indexOf('让 AI 研究') >= 0)
ok('技能卡不再写「要重启」', txt.indexOf('生效') >= 0)

// ---- 已研究过的条目直接显示中文短评 ----
const withNote = render({ 0: 'radar', 2: feed, 3: { tags: [], wanted: [], skipped: [] }, 4: 'done', 10: feed.notes })
const ntxt = withNote.tree ? textOf(withNote.tree) : ''
ok('本地有短评就直接显示', ntxt.indexOf('AI 研究') >= 0 && ntxt.indexOf('它是做笔记的') >= 0)
ok('有短评时按钮变「重新研究」', ntxt.indexOf('重新研究') >= 0)

// ---- 页签：原来的「我关心的」改成「帮我找」----
ok('「帮我找」页签在', textOf(main.tree).indexOf('帮我找') >= 0)
ok('老的「我关心的」名字已撤掉', textOf(main.tree).indexOf('我关心的') < 0)

const bag = render({ 0: 'bag', 2: feed, 3: { tags: [], wanted: ['p-one'], skipped: [] }, 4: 'done' })
ok('「收藏夹」显示条目', !!bag.tree && textOf(bag.tree).indexOf('p-one') >= 0)
ok('页签改名「收藏夹」，老名字撤掉', textOf(main.tree).indexOf('收藏夹') >= 0 && textOf(main.tree).indexOf('想装的') < 0, textOf(main.tree).slice(0, 200))
ok('收藏夹顶部有「生成报告」按钮', textOf(bag.tree).indexOf('生成报告') >= 0, textOf(bag.tree).slice(0, 200))

// ---- 收藏夹报告：结论直接显示在每条下面 ----
const bagRep = render({ 0: 'bag', 2: feed, 3: { tags: [], wanted: ['p-one'], skipped: [], reports: { 'p-one': {
  at: Date.now(), name: 'p-one', verdict: 'worth', verdictText: '值得装',
  what: '能把随手记的东西整理成笔记', evidence: '月下载 13 万，上周还在更新', diff: '本机没有同类的', dup: [],
} } }, 4: 'done' })
const rtxt = textOf(bagRep.tree)
ok('结论显示在收藏条目下面', rtxt.indexOf('值得装') >= 0 && rtxt.indexOf('能把随手记的东西整理成笔记') >= 0, rtxt.slice(0, 300))
ok('结论带真实证据和跟本机对比两行', rtxt.indexOf('真实证据') >= 0 && rtxt.indexOf('跟本机比') >= 0)
const dupRep = render({ 0: 'bag', 2: feed, 3: { tags: [], wanted: ['p-one'], skipped: [], reports: { 'p-one': {
  at: Date.now(), verdict: 'no', verdictText: '不用装', what: 'x', evidence: 'y', diff: 'z', dup: ['s-one'],
} } }, 4: 'done' })
ok('重复的东西点名写出来', textOf(dupRep.tree).indexOf('s-one') >= 0)

const bagBusy = render({ 0: 'bag', 2: feed, 3: { tags: [], wanted: ['p-one'], skipped: [] }, 4: 'done', 29: { running: true, total: 8, done: 3, current: 'p-one' } })
const bagTxt = textOf(bagBusy.tree)
ok('出报告时按钮上写第几条', bagTxt.indexOf('生成中 3/8') >= 0, bagTxt.slice(0, 300))
ok('正在分析的那条显示骨架', bagTxt.indexOf('正在分析') >= 0)

const bagErr = render({ 0: 'bag', 2: feed, 3: { tags: [], wanted: ['p-one'], skipped: [] }, 4: 'done', 30: '模型服务没接上' })
ok('失败给重试，不用 alert', textOf(bagErr.tree).indexOf('模型服务没接上') >= 0 && textOf(bagErr.tree).indexOf('重试') >= 0)

const findIdle = render({ 0: 'interest', 2: feed, 3: { tags: ['桌宠外观'], wanted: [], skipped: [] }, 4: 'done' })
const ftxt = findIdle.tree ? textOf(findIdle.tree) : ''
ok('「帮我找」能渲染，并说明它是干嘛的', ftxt.indexOf('想找什么，直接用大白话说一句') >= 0, ftxt.slice(0, 200))
ok('输入框写着大白话例子', src.indexOf('用大白话说：帮我找做小游戏的插件或技能') >= 0)
ok('事先说清一次多少钱、等多久', ftxt.indexOf('一两分钱') >= 0 && ftxt.indexOf('10～20 秒') >= 0)

const findBusy = render({ 0: 'interest', 2: feed, 3: { tags: [], wanted: [], skipped: [] }, 4: 'done', 25: true })
const fbtxt = findBusy.tree ? textOf(findBusy.tree) : ''
ok('找的时候写清在干什么', fbtxt.indexOf('正在找') >= 0 && fbtxt.indexOf('插件商店') >= 0, fbtxt.slice(0, 200))

const findRes = {
  ok: true, summary: '找到 2 个，最像的是 dsh-game-kit。', keywords: ['小游戏', 'game'],
  items: [
    { type: 'plugin', name: 'dsh-game-kit', version: '1.0.0', line: '做小游戏的模板', emoji: '🎮', why: '能直接生成能玩的小游戏', downloads: 2100, updatedAt: Date.now() - 86400000, installed: false, url: 'https://x/game' },
    { type: 'skill', name: 'game-skill', line: '游戏技能', emoji: '🧩', why: '教你一步步做游戏', stars: 320, updatedAt: Date.now() - 5 * 86400000, installed: false, url: '' },
    { type: 'plugin', name: 'dsh-note', line: '笔记', emoji: '📝', why: '已经装在机器上', downloads: 50, updatedAt: Date.now() - 30 * 86400000, installed: true, url: '' },
  ],
  cost: 0.018, cached: false, errors: [],
}
const findOk = render({ 0: 'interest', 2: feed, 3: { tags: [], wanted: [], skipped: [] }, 4: 'done', 24: '帮我找做小游戏的插件', 26: findRes })
const fotxt = findOk.tree ? textOf(findOk.tree) : ''
ok('结果先给一句总结', fotxt.indexOf('最像的是 dsh-game-kit') >= 0, fotxt.slice(0, 200))
ok('结果卡片有名字、理由、热度', fotxt.indexOf('dsh-game-kit') >= 0 && fotxt.indexOf('能直接生成能玩的小游戏') >= 0 && fotxt.indexOf('2.1k') >= 0)
ok('插件卡有「装它」按钮', fotxt.indexOf('装它') >= 0)
ok('已装的那条直接说本机已经有了', fotxt.indexOf('本机已经有了') >= 0)
ok('技能卡说明要我来放', fotxt.indexOf('技能要我来放') >= 0)
ok('给出按哪些词找的，并能记成口味', fotxt.indexOf('按这些词找的') >= 0 && fotxt.indexOf('记成我的口味') >= 0)
ok('显示这次花了多少', fotxt.indexOf('这次花了约 ¥') >= 0, fotxt.slice(0, 260))

const findEmpty = render({ 0: 'interest', 2: feed, 3: { tags: [], wanted: [], skipped: [] }, 4: 'done', 26: { ok: true, summary: '这次没找到现成的。', keywords: ['小游戏', 'game'], items: [], general: ['Phaser'], cost: 0.012, errors: ['GitHub 一小时 60 次的匿名查询用完了'] } })
const fetxt = findEmpty.tree ? textOf(findEmpty.tree) : ''
ok('一条都没找到时直说，并给替代办法', fetxt.indexOf('一个现成的都没找到') >= 0 && fetxt.indexOf('Phaser') >= 0 && fetxt.indexOf('换个说法') >= 0, fetxt.slice(0, 240))
ok('哪一路没拿到会写出来', fetxt.indexOf('有一路没拿到') >= 0)

const findErr = render({ 0: 'interest', 2: feed, 3: { tags: [], wanted: [], skipped: [] }, 4: 'done', 27: '模型 30 秒没回' })
const fetxt2 = findErr.tree ? textOf(findErr.tree) : ''
ok('失败时显示原因和「再试一次」', fetxt2.indexOf('没找成') >= 0 && fetxt2.indexOf('再试一次') >= 0)

const findTaste = render({ 0: 'interest', 2: feed, 3: { tags: ['桌宠外观'], wanted: [], skipped: [] }, 4: 'done', 28: true })
const fttxt = findTaste.tree ? textOf(findTaste.tree) : ''
ok('口味设置收在「帮我找」底部，仍可翻关键词', fttxt.indexOf('AI 帮我翻成关键词') >= 0 && fttxt.indexOf('桌宠外观') >= 0)
ok('说明口味只影响雷达页排序、不产生结果', fttxt.indexOf('只影响「雷达」页的先后顺序') >= 0)

// ---- 我装的（本机清单）----
const inst = render({
  0: 'installed', 2: feed, 3: { tags: [], wanted: [], skipped: [] }, 4: 'done',
  13: { plugins: [{ name: 'dsh-windows-mcp', version: '0.2.11', desc: '让 AI 控制电脑' }], skills: [{ name: 'pdf', desc: '读写 PDF' }] },
})
const itxt = inst.tree ? textOf(inst.tree) : ''
ok('「我装的」列出插件和技能', itxt.indexOf('dsh-windows-mcp') >= 0 && itxt.indexOf('pdf') >= 0, itxt.slice(0, 200))
ok('插件写明要重启、技能写明当轮生效', itxt.indexOf('要完全退出再开') >= 0 && itxt.indexOf('当轮就能用') >= 0)

// ---- 扣费显示 ----
const costNotes = { 'p-one@1.2.3': { key: 'p-one@1.2.3', text: '它是做笔记的', at: Date.now(), usage: { inputTokens: 1840, outputTokens: 210 }, cost: 0.0054 } }
const costFeed = Object.assign({}, feed, { notes: costNotes })
const withCost = render({ 0: 'radar', 2: costFeed, 3: { tags: [], wanted: [], skipped: [] }, 4: 'done', 10: costNotes })
const ctxt = withCost.tree ? textOf(withCost.tree) : ''
ok('研究完显示这次花了多少', ctxt.indexOf('1 次模型') >= 0 && ctxt.indexOf('约 ¥0.005') >= 0, ctxt.slice(0, 200))
ok('顶部显示累计研究花费', ctxt.indexOf('AI 研究 1 条') >= 0)

// ---- 关心词真的参与排序 ----
const mk = (name, line, zh, downloads) => ({ type: 'plugin', name, version: '1', line, zh, downloads, updatedAt: Date.now(), advice: { level: 'ok', label: '可以装', why: [] } })
const feed2 = {
  fetchedAt: Date.now(), errors: [], notes: {}, skills: [],
  plugins: [mk('p-a', '普通工具', ['笔记'], 900), mk('p-b', '另一个', ['待办'], 800), mk('p-c', '第三个', ['表格'], 700), mk('p-video', '短视频剪辑配字幕', ['视频', '剪辑'], 10)],
  buckets: { fresh: { skills: [], plugins: ['p-a', 'p-b', 'p-c', 'p-video'] }, hot: { skills: [], plugins: ['p-a', 'p-b', 'p-c', 'p-video'] }, fun: { skills: [], plugins: ['p-a', 'p-b', 'p-c', 'p-video'] } },
}
const ranked = render({ 0: 'radar', 2: feed2, 3: { tags: ['视频剪辑'], wanted: [], skipped: [] }, 4: 'done' })
ok('填了关心词，命中的挤进前三', textOf(ranked.tree).indexOf('p-video') >= 0)
const noHit = render({ 0: 'radar', 2: feed2, 3: { tags: ['太空农业'], wanted: [], skipped: [] }, 4: 'done' })
ok('没命中会提示去翻关键词', textOf(noHit.tree).indexOf('没命中') >= 0)

const skipped = render({ 0: 'radar', 2: feed, 3: { tags: [], wanted: [], skipped: ['s-one'] }, 4: 'done' })
ok('「不要」过的会被过滤掉', textOf(skipped.tree).indexOf('s-one') < 0)

const wantGone = render({ 0: 'radar', 2: feed, 3: { tags: [], wanted: ['p-one'], skipped: [] }, 4: 'done' })
ok('点过「想要」的不再出现在雷达卡片里', textOf(wantGone.tree).indexOf('p-one') < 0)

// 过滤之后要从整份清单往下补，不能只剩一两张
const many = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => ({ type: 'plugin', name: 'p' + i, version: '1', line: '第' + i + '个', zh: [], downloads: 100 - i, updatedAt: Date.now(), advice: { level: 'ok', label: '可以装', why: [] } }))
const feed3 = {
  fetchedAt: Date.now(), errors: [], notes: {}, skills: [],
  plugins: many,
  buckets: { fresh: { skills: [], plugins: ['p1', 'p2'] }, hot: { skills: [], plugins: ['p1', 'p2'] }, fun: { skills: [], plugins: ['p1', 'p2'] } },
}
const backfilled = render({ 0: 'radar', 2: feed3, 3: { tags: [], wanted: ['p1'], skipped: ['p2'] }, 4: 'done' })
const btxt = textOf(backfilled.tree)
ok('剔掉不要/想要后会从后面补满 6 张', ['p3', 'p4', 'p5', 'p6', 'p7', 'p8'].every((n) => btxt.indexOf(n) >= 0), btxt.slice(0, 200))
ok('补满时不要的/想要的仍然不出现', btxt.indexOf(' p1 ') < 0 && btxt.indexOf(' p2 ') < 0)

const bagSkip = render({ 0: 'bag', 2: feed, 3: { tags: [], wanted: [], skipped: ['dsh-foo'] }, 4: 'done' })
const sbtxt = textOf(bagSkip.tree)
ok('「不要的」在「想装的」页里能看见', sbtxt.indexOf('dsh-foo') >= 0 && sbtxt.indexOf('你说过不要的') >= 0, sbtxt.slice(0, 200))
ok('「不要的」可以一键放回雷达', sbtxt.indexOf('放回雷达') >= 0)


// ---- 离线兜底 ----
const demo = render({ 0: 'radar', 2: null, 4: 'demo', 5: 'boom' })
ok('连不上时退成样例并提示', textOf(demo.tree).indexOf('样例') >= 0)

// ---- 「案例」页签 ----
const today = new Date().toISOString().slice(0, 10)
const caseItems = [
  { name: 'c-new-build', url: 'https://x/1', what: '做了个记账小工具', date: today, kind: '成品', source: 'GitHub' },
  { name: 'c-idea', url: 'https://x/2', what: '脑洞：让 agent 自写工具', date: today, kind: '想法', source: '公众号' },
  { name: 'c-story', url: 'https://x/3', what: '打包踩坑', date: today, tag: '踩坑记录', source: '腾讯云社区' },
  { name: 'c-wb', url: 'https://x/4', what: 'WorkBuddy 里部署 DSH', date: today, kind: '故事', source: '腾讯云社区 · WorkBuddy' },
]
const cAll = render({ 0: 'cases', 2: feed, 3: { tags: [], wanted: [], skipped: [] }, 15: { items: caseItems }, 17: 'all' })
const cAllTxt = cAll.tree ? textOf(cAll.tree) : ''
ok('「案例」页签能渲染', !cAll.err && cAllTxt.indexOf('c-new-build') >= 0, cAll.err && cAll.err.message)
ok('没写 kind 的按 tag 兜底成故事', cAllTxt.indexOf('故事') >= 0 && cAllTxt.indexOf('踩坑记录') >= 0)
ok('默认「只看 DSH」把 WorkBuddy 挡掉', cAllTxt.indexOf('c-wb') < 0)
const cStory = render({ 0: 'cases', 2: feed, 3: { tags: [], wanted: [], skipped: [] }, 15: { items: caseItems }, 16: '故事', 17: 'all' })
const cStoryTxt = cStory.tree ? textOf(cStory.tree) : ''
ok('类型筛选只留故事，且 tag 兜底的也算进来', cStoryTxt.indexOf('c-story') >= 0 && cStoryTxt.indexOf('c-new-build') < 0, cStoryTxt.slice(0, 160))
const cAllSrc = render({ 0: 'cases', 2: feed, 3: { tags: [], wanted: [], skipped: [] }, 15: { items: caseItems }, 17: 'all', 18: 'all' })
ok('选「也看同类工具」才出现 WorkBuddy 那条', textOf(cAllSrc.tree).indexOf('c-wb') >= 0)

// ---- 案例页视觉重做：成品大卡 + 按日期分组的周刊目录 ----
const findOne = (n, cls) => {
  let hit = null
  walk(n, (x) => { if (!hit && x && typeof x === 'object' && x.props && x.props.className === cls) hit = x })
  return hit
}
const bigsBox = findOne(cAll.tree, 'pr-bigs')
const bigsTxt = bigsBox ? textOf(bigsBox) : ''
ok('成品走大卡区，想法不进大卡', bigsTxt.indexOf('c-new-build') >= 0 && bigsTxt.indexOf('c-idea') < 0, bigsTxt.slice(0, 120))
const dirBox = findOne(cAll.tree, 'pr-dir')
const dirTxt = dirBox ? textOf(dirBox) : ''
ok('想法/故事进周刊目录', dirTxt.indexOf('c-idea') >= 0 && dirTxt.indexOf('c-story') >= 0, dirTxt.slice(0, 120))
ok('目录按日期分组，今天的写成「今天」', dirTxt.indexOf('今天') >= 0)
ok('卡片上不再重复挂类型小标签', cAllTxt.split(' ').filter((x) => x === '成品').length <= 1, cAllTxt.split(' ').filter((x) => x === '成品').length)

const undatedItems = caseItems.concat([{ name: 'c-undated', url: 'https://x/9', what: '没写日期', kind: '故事', source: '博客' }])
const cUndated = render({ 0: 'cases', 2: feed, 3: { tags: [], wanted: [], skipped: [] }, 15: { items: undatedItems }, 17: 'all' })
ok('没日期显示「日期未知」，不编日期', textOf(cUndated.tree).indexOf('日期未知') >= 0)
const cRange7 = render({ 0: 'cases', 2: feed, 3: { tags: [], wanted: [], skipped: [] }, 15: { items: undatedItems }, 17: '7' })
const r7Txt = textOf(cRange7.tree)
ok('「近 7 天」挡掉没日期的，并说明有几条', r7Txt.indexOf('c-undated') < 0 && r7Txt.indexOf('没标发布日期') >= 0, r7Txt.slice(0, 160))

const cEmpty = render({ 0: 'cases', 2: feed, 3: { tags: [], wanted: [], skipped: [] }, 15: { items: [caseItems[1]] }, 16: '成品', 17: 'all' })
const eTxt = textOf(cEmpty.tree)
ok('空结果显示一句话 +「放宽条件」按钮', eTxt.indexOf('这个条件下一条都没有') >= 0 && eTxt.indexOf('放宽条件') >= 0)

ok('「也看同类工具」默认收起在「更多」里', cAllTxt.indexOf('也看同类工具') < 0)
const cMore = render({ 0: 'cases', 2: feed, 3: { tags: [], wanted: [], skipped: [] }, 15: { items: caseItems }, 17: 'all', 21: true })
ok('点开「更多」才看到来源开关', textOf(cMore.tree).indexOf('也看同类工具') >= 0)

// ---- 一起研究：必须照着「页面上那 6 张卡」来，研究屏外的条目用户看不到变化 ----
ok('导出 pickCards 供测试', typeof registered.__pickCards === 'function')

const many2 = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => ({ type: 'plugin', name: 'q' + i, version: '1', line: '第' + i + '个', zh: [], downloads: 100 - i, updatedAt: Date.now(), advice: { level: 'ok', label: '可以装', why: [] } }))
const feed4 = {
  fetchedAt: Date.now(), errors: [], notes: {},
  skills: [],
  plugins: many2,
  buckets: { fresh: { skills: [], plugins: ['q1', 'q2', 'q3', 'q4', 'q5', 'q6'] }, hot: { skills: [], plugins: ['q1'] }, fun: { skills: [], plugins: ['q1'] } },
}
const picked = registered.__pickCards(feed4, { tags: [], wanted: [], skipped: [] }, 'fresh')
ok('挑选出来的就是页面摆的那 6 张', picked.plugins.map((x) => x.name).join(',') === 'q1,q2,q3,q4,q5,q6', picked.plugins.map((x) => x.name))

const pickedSkip = registered.__pickCards(feed4, { tags: [], wanted: ['q1'], skipped: ['q2'] }, 'fresh')
const visNames = pickedSkip.plugins.map((x) => x.name)
ok('想装/不要的剔掉后从后面补满，页面仍是 6 张', visNames.length === 6, visNames)
ok('屏外的 q9 进不来（研究清单只取页面这 6 张）', visNames.indexOf('q9') < 0, visNames)
ok('「想要」「不要」的不会被研究', visNames.indexOf('q1') < 0 && visNames.indexOf('q2') < 0, visNames)

// ---- 一起研究：技能和插件要轮流进清单，不能只研究技能 ----
const feed5 = {
  fetchedAt: Date.now(), errors: [], notes: {}, plugins: [],
  skills: [1, 2, 3, 4, 5, 6].map((i) => ({ type: 'skill', name: 'sk' + i, line: '技能' + i, stars: 100, updatedAt: Date.now(), advice: { level: 'ok', label: '可以装', why: [] } })),
  buckets: { fresh: { skills: ['sk1', 'sk2', 'sk3', 'sk4', 'sk5', 'sk6'], plugins: ['pl1', 'pl2', 'pl3', 'pl4', 'pl5', 'pl6'] }, hot: { skills: [], plugins: [] }, fun: { skills: [], plugins: [] } },
}
feed5.plugins = [1, 2, 3, 4, 5, 6].map((i) => ({ type: 'plugin', name: 'pl' + i, version: '1', line: '插件' + i, downloads: 100, updatedAt: Date.now(), advice: { level: 'ok', label: '可以装', why: [] } }))
const rp = registered.__researchPool(feed5, { tags: [], wanted: [], skipped: [] }, 'fresh', () => false, 6)
ok('研究清单里技能和插件都有（各 3 条）', rp.filter((x) => x.type === 'skill').length === 3 && rp.filter((x) => x.type === 'plugin').length === 3, rp.map((x) => x.name))
ok('研究清单是交替的，不是技能打头堆 6 个', rp[0].type !== rp[1].type && rp[1].type !== rp[2].type, rp.map((x) => x.type))

// ---- 正在研究的卡片要有看得见的反馈 ----
const pending = render({ 0: 'radar', 2: feed, 3: { tags: [], wanted: [], skipped: [] }, 4: 'done', 10: feed.notes, 11: 'p-one' })
const ptxt = pending.tree ? textOf(pending.tree) : ''
ok('研究中的卡片自己写「正在读它的说明」', ptxt.indexOf('正在读它的说明') >= 0 && ptxt.indexOf('10～25 秒') >= 0, ptxt.slice(0, 200))
// 已经有旧短评的卡（「最多人用」「好玩」里几乎全有）：点「重新研究」也必须看得见在动，且必须强制重跑
ok('有旧短评的卡，重新研究时也显示占位', ptxt.indexOf('重新读一遍') >= 0, ptxt.slice(0, 200))
ok('点研究一定是强制重跑，不会拿缓存糊弄', /force:\s*true/.test(src))

const batchUi = render({ 0: 'radar', 2: feed, 3: { tags: [], wanted: [], skipped: [] }, 4: 'done', 20: { i: 2, total: 6, name: 's-one' } })
const btxt2 = batchUi.tree ? textOf(batchUi.tree) : ''
ok('标题栏写清第几条、正在研究谁', btxt2.indexOf('研究中 2/6') >= 0 && btxt2.indexOf('s-one') >= 0, btxt2.slice(0, 200))
ok('按钮名字改成「研究本页」', txt.indexOf('研究本页 6 条') >= 0)

// ---- 样式层面 ----
const css = src.slice(src.indexOf('var CSS'), src.indexOf('// ---------------------------------------------------------------- 工具函数'))
ok('三套其他外观的样式已删干净', ['magazine', 'bento', 'terminal'].every((t) => css.indexOf(t) < 0))
ok('短评/关键词有样式', css.indexOf('.pr-note{') >= 0 && css.indexOf('.pr-kw{') >= 0)
ok('卡片都走变量', css.indexOf('.pr-card{') >= 0 && css.indexOf('var(--pr-surface)') >= 0)

// ---- 案例就地聊天：按钮、面板、引导语、正在想、失败文案 ----
const chatBtns = []
walk(cAll.tree, (n) => { if (n && typeof n === 'object' && n.props && n.props.className === 'pr-chat-btn' && textOf(n) === '聊聊这个') chatBtns.push(n) })
// 卡片上按钮变多了（要这个 / 我也做一个 / 聊聊这个），这里按文字挑出「聊聊这个」
const findChat = (box) => {
  let hit = null
  walk(box, (n) => { if (!hit && n && typeof n === 'object' && n.props && textOf(n) === '聊聊这个') hit = n })
  return hit
}
const bigChatBtn = findChat(bigsBox)
const dirChatBtn = findChat(dirBox)
ok('案例大卡和目录行都有「聊聊这个」', !!bigChatBtn && !!dirChatBtn, chatBtns.length)

let stopped = false
let opened = false
globalThis.window.open = () => { opened = true }
const clickEvt = { stopPropagation() { stopped = true } }
bigChatBtn.props.onClick(clickEvt)
ok('点「聊聊这个」挡住冒泡，不会顺手打开原文', stopped && !opened)

const chatBase = { 0: 'cases', 2: feed, 3: { tags: [], wanted: [], skipped: [] }, 15: { items: caseItems }, 17: 'all' }
const chatOpen = render(Object.assign({}, chatBase, { 22: { url: 'https://x/2', name: 'c-idea', messages: [], sending: false, error: '' } }))
const chatBox = chatOpen.tree ? findOne(chatOpen.tree, 'pr-chat') : null
ok('点开后出现聊天面板容器', !!chatBox)
ok('没历史时显示那句引导语', !!chatBox && textOf(chatBox).indexOf('我们在聊这条案例：c-idea') >= 0 && textOf(chatBox).indexOf('值不值得抄') >= 0)

const chatThinking = render(Object.assign({}, chatBase, { 22: { url: 'https://x/2', name: 'c-idea', messages: [{ role: 'user', text: '这跟我有关系吗', at: 1 }], sending: true, error: '' } }))
ok('发送后先出现「正在想…」', textOf(chatThinking.tree).indexOf('正在想') >= 0)

const chatFail = render(Object.assign({}, chatBase, { 22: { url: 'https://x/2', name: 'c-idea', messages: [], sending: false, error: '模型没在 60 秒内回，再点一次' } }))
ok('失败显示错误文字，不用 alert', textOf(chatFail.tree).indexOf('模型没在 60 秒内回，再点一次') >= 0 && src.indexOf('alert(') < 0)

// ---- 「聊过的」独立整页：竖向列表 + 翻页 + 勾选 + 删除确认 ----
const chatsData = []
for (let i = 1; i <= 14; i++) {
  chatsData.push({ url: 'https://x/c' + i, last: '第 ' + i + ' 条最后一句', at: Date.now() - i * 60000, count: i + 1 })
}
const chatsBase = { 0: 'chats', 2: feed, 3: { tags: [], wanted: [], skipped: [] }, 15: { items: caseItems }, 33: chatsData }
const chatsPage = render(chatsBase)
const chatsTxt = chatsPage.tree ? textOf(chatsPage.tree) : ''
ok('「聊过的」是独立页签', chatsTxt.indexOf('聊过的') >= 0 && chatsTxt.indexOf('点一条接着聊') >= 0 || chatsTxt.indexOf('聊过的') >= 0)
ok('聊过的整页不报错', !chatsPage.err, chatsPage.err && chatsPage.err.message)
ok('一页只放 12 条，有翻页', chatsTxt.indexOf('第 1 / 共 2 页') >= 0, chatsTxt.slice(0, 200))
ok('一页里确实只有 12 条（第 13 条不在第一页）', chatsTxt.indexOf('第 13 条最后一句') < 0 && chatsTxt.indexOf('第 12 条最后一句') >= 0)
ok('每行都有「删」按钮', chatsTxt.split('删').length - 1 >= 12)

const chats2 = render(Object.assign({}, chatsBase, { 38: 2 }))
const chats2Txt = chats2.tree ? textOf(chats2.tree) : ''
ok('翻到第 2 页能看到第 13、14 条', chats2Txt.indexOf('第 2 / 共 2 页') >= 0 && chats2Txt.indexOf('第 13 条最后一句') >= 0 && chats2Txt.indexOf('第 14 条最后一句') >= 0)

const chatsEmpty = render(Object.assign({}, chatsBase, { 33: [] }))
const chatsEmptyTxt = chatsEmpty.tree ? textOf(chatsEmpty.tree) : ''
ok('一条都没有时给出去处的提示，整块不凭空消失', chatsEmptyTxt.indexOf('还没聊过任何案例') >= 0 && chatsEmptyTxt.indexOf('去案例页看看') >= 0)

const chatsSearch = render(Object.assign({}, chatsBase, { 39: '第 13 条' }))
const chatsSearchTxt = chatsSearch.tree ? textOf(chatsSearch.tree) : ''
ok('能按名字/内容搜，搜不到就说换个词', chatsSearchTxt.indexOf('第 13 条最后一句') >= 0 && chatsSearchTxt.indexOf('第 1 条最后一句') < 0)

const chatsNone = render(Object.assign({}, chatsBase, { 39: '没有这个词' }))
ok('搜不到时明确说换个词', textOf(chatsNone.tree).indexOf('没有匹配的') >= 0)

const chatsSel = render(Object.assign({}, chatsBase, { 40: { 'https://x/c1': true, 'https://x/c2': true } }))
const chatsSelTxt = textOf(chatsSel.tree)
ok('勾了两条就出现「删掉勾选的 2 条」', chatsSelTxt.indexOf('删掉勾选的 2 条') >= 0)
ok('有「全部清空」按钮', chatsSelTxt.indexOf('全部清空') >= 0)

// 删除确认弹窗：先说清楚删什么，再让他确认
const dlg = render(Object.assign({}, chatsBase, { 41: { title: '删掉这 2 条聊天？', body: '聊天内容会清掉，删了恢复不了。', danger: true, label: '删掉' } }))
const dlgTxt = dlg.tree ? textOf(dlg.tree) : ''
ok('确认弹窗有标题、后果说明、两个按钮', dlgTxt.indexOf('删掉这 2 条聊天？') >= 0 && dlgTxt.indexOf('删了恢复不了') >= 0 && dlgTxt.indexOf('算了') >= 0 && dlgTxt.indexOf('删掉') >= 0)

const dlgAll = render(Object.assign({}, chatsBase, { 41: { title: '清空全部聊天记录？', body: '所有案例的聊天内容都会清掉', danger: true, label: '全删掉' } }))
ok('全清走的也是同一个确认框', textOf(dlgAll.tree).indexOf('清空全部聊天记录？') >= 0)
ok('删除请求走 DELETE 方法，不是拿 POST 假装', /api\("\/case-chat",[\s\S]{0,120}?"DELETE"\)/.test(src), src.match(/api\("\/case-chat"[\s\S]{0,140}/))

// 切页签会整块重新挂载，state 只读回四个字段的话，已出的报告和已读标记会显示成空
ok('重新加载时把 reports 一起读回来（否则切回来报告就没了）', /reports:\s*s\.reports/.test(src), src.match(/setSt\(\{[\s\S]{0,400}/))
ok('readCases 也一起读回来（否则已读变暗会失效）', /readCases:\s*s\.readCases/.test(src))

console.log('\n结果：' + pass + ' 通过 / ' + fail + ' 失败')
process.exit(fail ? 1 : 0)
