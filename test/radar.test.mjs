/**
 * 自测：node test/radar.test.mjs
 *
 * 分两段：
 *   A. 纯函数（打分/建议/中文化/归一化），不联网，必须全绿。
 *   B. 真联网抓一轮（npm + GitHub），顺便把缓存预热好 —— 首次打开页签就秒开。
 *      B 段失败只提示，不判红：可能是网断了或 GitHub 限额。
 */
import {
  glossOf, plainOf, advise, isPlayful, relevanceOf, noteKey, normalizeNpmObject, normalizeRepo, buildCache, getFeed, sameOrigin,
  parseTags, isInstalled, estimateCost, listInstalled, pickRepoFiles, repoContextText,
  scrapePhrase, heuristicKeywords, parseFindIntent, rankFind, parseFindAnswer, fallbackWhy, findScore,
  isGarbled, dupCandidates, tokensOf, reportStale, bagJobStatus,
} from '../lib/index.js'

let pass = 0
let fail = 0
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name) } else { fail++; console.log('  ✗ ' + name + (extra ? ' → ' + JSON.stringify(extra) : '')) }
}

console.log('A2. 帮我找：翻词、排序、理由')
ok('剥壳：「帮我找一下关于做小游戏的插件」→ 小游戏', scrapePhrase('帮我找一下关于做小游戏的插件') === '小游戏', scrapePhrase('帮我找一下关于做小游戏的插件'))
const heur = heuristicKeywords('帮我找一下关于做小游戏的插件')
ok('没有模型时也能凑出搜索词（含英文 game）', heur.indexOf('小游戏') >= 0 && heur.indexOf('game') >= 0, heur)
const fint1 = parseFindIntent('```json\n{"keywords":["小游戏","game","html5 game"],"kinds":["plugin","skill"],"general":["Phaser"]}\n```', '做小游戏')
ok('模型吐的 JSON 能解析（带代码块也行）', fint1.keywords.length === 3 && fint1.kinds.length === 2 && fint1.general[0] === 'Phaser', fint1)
const fint2 = parseFindIntent('我看不懂这句话', '帮我找做小游戏的插件')
ok('模型没吐 JSON 就退回字面关键词', fint2.keywords.indexOf('小游戏') >= 0 && fint2.kinds.length === 2, fint2)
ok('kinds 只认 plugin/skill，中文直接丢掉', parseFindIntent('{"keywords":["game"],"kinds":["插件"]}', '').kinds.length === 2)

const fkw = ['game', '小游戏']
const fmk = (name, desc, extra) => Object.assign({ type: 'plugin', name, desc, stars: 0, downloads: 0, updatedAt: Date.now() }, extra || {})
const franked = rankFind([
  fmk('dsh-note', '笔记工具'),
  fmk('dsh-game-kit', '做小游戏用的模板', { downloads: 2000 }),
  fmk('dsh-note', '重复的同名条目', { downloads: 99999 }),
  fmk('dsh-installed', 'game 相关但已装', { installed: true }),
], fkw)
ok('名字命中的排最前', franked[0].name === 'dsh-game-kit', franked.map((x) => x.name))
ok('同名只留一条', franked.filter((x) => x.name === 'dsh-note').length === 1)
ok('已装的会往前排', franked.findIndex((x) => x.name === 'dsh-installed') < franked.findIndex((x) => x.name === 'dsh-note'))
ok('跟要的完全无关的排最后', franked[franked.length - 1].name === 'dsh-note', franked.map((x) => x.name))
ok('最多只给 8 条', rankFind(Array.from({ length: 20 }, (_, i) => fmk('x' + i, 'game')), fkw).length === 8)
ok('已装的分数比没装的高', findScore({ name: 'a', installed: true }, ['game']) > findScore({ name: 'a' }, ['game']))

const fans = parseFindAnswer('总结：找到一个最像的。\ndsh-game-kit | 能直接做小游戏\n瞎编的 | 不该出现', ['dsh-game-kit'])
ok('总结能单独拎出来', fans.summary === '找到一个最像的。', fans.summary)
ok('理由按名字对上，编出来的行丢掉', fans.notes['dsh-game-kit'] === '能直接做小游戏' && !fans.notes['瞎编的'], fans.notes)
ok('名字大小写不敏感', parseFindAnswer('总结：x\nDSH-Game-Kit | 一样能用', ['dsh-game-kit']).notes['dsh-game-kit'] === '一样能用')
const fwhy = fallbackWhy({ type: 'plugin', name: 'a', keywords: ['game'], downloads: 2100, source: 'npm', updatedAt: Date.now() }, fkw)
ok('兜底理由不编，只说命中的词和数字', fwhy.indexOf('game') >= 0 && fwhy.indexOf('2100') >= 0, fwhy)

console.log('C. 案例源码挑文件')
const fakeTree = [
  { type: 'blob', path: 'package.json', size: 900 },
  { type: 'blob', path: 'cordis.patch.yml', size: 300 },
  { type: 'blob', path: 'README.md', size: 1200 },
  { type: 'blob', path: 'lib/index.js', size: 4000 },
  { type: 'blob', path: 'lib/deep/thing.js', size: 2000 },
  { type: 'blob', path: 'node_modules/x/index.js', size: 500 },
  { type: 'blob', path: 'packages/a/package.json', size: 700 },
  { type: 'blob', path: 'packages/b/package.json', size: 700 },
  { type: 'blob', path: 'packages/c/package.json', size: 700 },
  { type: 'blob', path: 'test/foo.test.js', size: 300 },
  { type: 'blob', path: 'docs/big.md', size: 800 },
  { type: 'blob', path: 'dist/app.js', size: 900 },
  { type: 'blob', path: 'vitest.web.config.ts', size: 300 },
]
const pickedPaths = pickRepoFiles(fakeTree).map((f) => f.path)
ok('根 package.json 排第一', pickedPaths[0] === 'package.json', pickedPaths)
ok('cordis 配置紧跟着', pickedPaths[1] === 'cordis.patch.yml', pickedPaths)
ok('README 排在源码前', pickedPaths.indexOf('README.md') < pickedPaths.indexOf('lib/index.js'), pickedPaths)
ok('跳过 node_modules / dist / test', !pickedPaths.some((p) => /node_modules|^dist\/|^test\//.test(p)), pickedPaths)
ok('同名小文件最多留两份（monorepo 不吃光名额）', pickedPaths.filter((p) => p.endsWith('package.json')).length <= 2, pickedPaths)
ok('构建配置文件不进去', !pickedPaths.some((p) => /\.config\./.test(p)), pickedPaths)
const fakeCtx = repoContextText({ files: [{ path: 'index.js', text: 'console.log(1)' }], bytes: 2048 })
ok('源码上下文带文件名和「读到的」提示', fakeCtx.indexOf('index.js') >= 0 && fakeCtx.indexOf('实际读到的源码') >= 0, fakeCtx.slice(0, 40))
ok('没有文件时给空串', repoContextText({ files: [] }) === '')

console.log('A. 纯函数')
ok('英文描述给出中文线索', glossOf('A desktop pet that reacts to your coding').indexOf('桌宠') >= 0)
ok('中文描述原样返回', plainOf('把 Word 排版整理干净').line === '把 Word 排版整理干净')
ok('空描述兜底', plainOf('').line.indexOf('没写说明') >= 0)
ok('好玩识别（wallpaper）', isPlayful({ name: 'x', desc: 'set your wallpaper', topics: [] }) === true)
ok('不好玩识别', isPlayful({ name: 'dsh-cost-meter', desc: 'token usage', topics: [] }) === false)
ok('英文描述露原文首句', plainOf('A desktop pet that reacts to your coding. More text.').line.indexOf('A desktop pet') === 0)
ok('英文描述仍给中文关键词', plainOf('A desktop pet for your screen').zh.indexOf('桌宠') >= 0)
ok('英文不再出现「先看下面的数字」', plainOf('A desktop pet').line.indexOf('先看下面的数字') < 0)
ok('笔记按名字@版本存', noteKey({ name: 'dsh-x', version: '1.0.0' }) === 'dsh-x@1.0.0')
ok('通用大合集判为不相关', relevanceOf({ name: 'anthropic-skills', desc: 'a collection of agent skills', stars: 190000 }) < 0)
ok('DSH 名字判为相关', relevanceOf({ name: 'dsh-better-sidebar', desc: 'sidebar', stars: 900 }) > 0)
ok('技能不用重启', normalizeRepo({ name: 's', full_name: 'a/s', stargazers_count: 1 }).restart === false)
ok('技能建议写「不用重启」', advise({ type: 'skill', name: 'dsh-s', stars: 5000, updatedAt: Date.now() }, []).why.join('|').indexOf('不用重启') >= 0)

const base = { type: 'plugin', name: 'dsh-demo', desc: 'demo', downloads: 120000, stars: 0, updatedAt: Date.now() - 5 * 86400000 }
ok('人多且新 → 可以装', advise(base, []).level === 'ok')
ok('没人用 → 先别急', advise({ ...base, downloads: 12 }, []).level === 'careful')
ok('一年没更新 → 不建议', advise({ ...base, updatedAt: Date.now() - 400 * 86400000 }, []).level === 'no')
ok('已装 → 已装', advise({ ...base, installed: true }, []).level === 'on')
ok('抢位置 → 别装', advise({ ...base, entryId: 'cost-meter' }, ['cost-meter']).level === 'no')
ok('建议最多三条理由', advise(base, []).why.length <= 3)
ok('技能按星算', advise({ type: 'skill', name: 's', stars: 5000, updatedAt: Date.now() - 3 * 86400000 }, []).level === 'ok')

const npmItem = normalizeNpmObject({
  package: { name: 'dsh-anything', version: '1.2.3', description: 'a thing', date: '2026-11-18T00:00:00Z', keywords: ['dsh'], links: { repository: 'https://github.com/a/b' } },
})
ok('npm 归一化', npmItem && npmItem.version === '1.2.3' && npmItem.downloads === 0, npmItem)
ok('非 dsh 包被过滤', normalizeNpmObject({ package: { name: 'left-pad', keywords: [] } }) === null)
const repo = normalizeRepo({ name: 'taste-skill', full_name: 'x/taste-skill', stargazers_count: 112, pushed_at: '2026-11-01T00:00:00Z', topics: ['claude-skills'], html_url: 'https://github.com/x/taste-skill' })
ok('GitHub 归一化', repo && repo.stars === 112 && repo.type === 'skill', repo)

const cache = buildCache({
  plugins: [base], skills: [repo], errors: [],
  installed: { installed: new Set(['dsh-demo']), ids: new Set(['cost-meter']) }, fetchedAt: Date.now(),
})
ok('缓存含三类榜单', !!cache.buckets.fresh && !!cache.buckets.hot && !!cache.buckets.fun)
ok('已装标记进缓存', cache.plugins[0].installed === true)
ok('卡片有人话字段', typeof cache.plugins[0].line === 'string' && cache.plugins[0].advice)

const many = buildCache({
  plugins: [],
  skills: [
    { type: 'skill', name: 'anthropic-skills', desc: 'agent skills collection', stars: 190000, topics: ['agent-skills'], updatedAt: Date.now(), publishedAt: Date.now() },
    { type: 'skill', name: 'dsh-skill-helper', desc: 'helps DSH', stars: 40, topics: ['dsh-skill'], updatedAt: Date.now(), publishedAt: Date.now() },
  ],
  installed: { installed: new Set(), ids: new Set() }, fetchedAt: Date.now(),
})
ok('技能榜单把 DSH 相关排到前面', many.buckets.hot.skills[0] === 'dsh-skill-helper', many.buckets.hot.skills)

console.log('A2. 关键词 / 已装 / 计费')
ok('大白话清洗成关键词', parseTags('关键词：视频剪辑，自动字幕。').join('|') === '视频剪辑|自动字幕', parseTags('关键词：视频剪辑，自动字幕。'))
ok('关键词最多 5 个', parseTags('视频,剪辑,字幕,配音,配乐,封面').length === 5)
ok('空/废话不算关键词', parseTags('我想要一些东西').length === 0, parseTags('我想要一些东西'))
ok('已装判定：技能看目录名', isInstalled({ type: 'skill', name: 'anthropics/pdf' }, { installed: new Set(), ids: new Set(), skills: new Set(['pdf']) }) === true)
ok('已装判定：插件看包名', isInstalled({ type: 'plugin', name: 'dsh-windows-mcp' }, { installed: new Set(['dsh-windows-mcp']), ids: new Set() }) === true)
ok('没装的不算已装', isInstalled({ type: 'plugin', name: 'dsh-nope' }, { installed: new Set(['dsh-x']), ids: new Set() }) === false)
ok('已知模型折算成钱', Math.abs(estimateCost('deepseek-chat', { inputTokens: 1000000, outputTokens: 0 }) - 2) < 1e-6)
ok('不认识的模型不编价格', estimateCost('gpt-4o', { inputTokens: 100 }) === null)
ok('没有用量就不报钱', estimateCost('deepseek-chat', null) === null)

const installedList = await listInstalled()
ok('读到本机插件清单（含 windows-mcp）', Array.isArray(installedList.plugins) && installedList.plugins.length > 0, installedList.plugins.length)
ok('技能目录读得到（至少一个）', Array.isArray(installedList.skills) && installedList.skills.length > 0, installedList.skills.length)

// 同源判定：渲染进程放行、curl 拒之门外
const mkReq = (h) => ({ headers: h })
ok('无 Origin + 浏览器 UA → 放行', sameOrigin(mkReq({ 'user-agent': 'Mozilla/5.0 (Windows NT 10.0)', 'accept-language': 'zh-CN' }), true))
ok('无 Origin + curl → 写操作拒绝', sameOrigin(mkReq({ 'user-agent': 'curl/8.0' }), true) === false)
ok('外站 Origin → 拒绝', sameOrigin(mkReq({ origin: 'https://evil.example', host: '127.0.0.1:43120' }), true) === false)
ok('同源 Origin → 放行', sameOrigin(mkReq({ origin: 'http://127.0.0.1:43120', host: '127.0.0.1:43120' }), false))

console.log('\nB. 真联网抓一轮（会写 ~/.dsh/dsh-plugin-radar/cache.json）')
const t0 = Date.now()
try {
  const feed = await getFeed({ force: true })
  const secs = ((Date.now() - t0) / 1000).toFixed(1)
  console.log('  用了 ' + secs + ' 秒：插件 ' + feed.plugins.length + ' 条，技能 ' + feed.skills.length + ' 条')
  ok('抓到插件', feed.plugins.length > 5, feed.plugins.length)
  ok('技能源返回（>=0 即可，GitHub 可能限额）', feed.skills.length >= 0)
  const top = feed.plugins.slice().sort((a, b) => b.downloads - a.downloads).slice(0, 5)
  console.log('  下载量前五：')
  top.forEach((x) => console.log('    ' + x.name + ' · ' + x.downloads + ' · ' + x.advice.label + ' · ' + x.line))
  if (feed.errors && feed.errors.length) console.log('  ⚠ 源报错：' + feed.errors.join(' | '))
  ok('有下载量（不是全 0）', feed.plugins.some((x) => x.downloads > 0))
} catch (e) {
  console.log('  ⚠ 联网段跳过：' + (e && e.message ? e.message : e))
}

// ---- 收藏夹报告：纯函数 ----
ok('存盘坏掉的中文能认出来（乱码不喂给模型）', isGarbled('������ for DeepSeek') === true && isGarbled('正常中文说明') === false && isGarbled('') === false)
ok('没坏的中英混排不算乱码', isGarbled('Lazy senior dev mode for DeepSeek Harness') === false)
const dup1 = dupCandidates({ name: 'dsh-ponytail', desc: 'lazy senior dev mode minimal code' },
  { plugins: [], skills: [{ name: 'ponytail', desc: 'makes your agent think like the laziest senior dev' }] })
ok('名字几乎一样能认出重复', dup1.length > 0 && dup1[0].name === 'ponytail', dup1)
ok('自己跟自己不算重复', dupCandidates({ name: 'ponytail', desc: 'lazy senior dev mode' }, { plugins: [], skills: [{ name: 'ponytail', desc: 'lazy senior dev mode' }] }).length === 0)
const dup2 = dupCandidates({ name: 'zzz-nothing', desc: 'quantum knitting' },
  { plugins: [{ name: 'dsh-memory', desc: '记忆管理' }], skills: [] })
ok('八竿子打不着的不硬说重复', dup2.length === 0, dup2)
ok('粗分词能切中文二元组和英文词', tokensOf('视频剪辑 video editor').includes('视频') && tokensOf('video editor').includes('video'))
ok('报告 12 小时内不重复花钱', reportStale({ at: Date.now() - 1000 }) === false && reportStale({ at: Date.now() - 13 * 3600 * 1000 }) === true && reportStale(null) === true)
ok('没跑的时候进度是静止的', bagJobStatus().running === false)

console.log('\n结果：' + pass + ' 通过 / ' + fail + ' 失败')
process.exit(fail ? 1 : 0)
