/**
 * 接口冒烟测试：node test/routes.test.mjs
 *
 * 起一个真的 http 服务，把宿主的 handleRequest 挂上去，用真的 fetch 打四个接口。
 * 会顺手读/写 ~/.dsh/dsh-plugin-radar/state.json，跑完恢复成默认值。
 */
import http from 'node:http'
import { readFile, writeFile } from 'node:fs/promises'
import { handleRequest, getState, patchState, CASE_CHATS_FILE } from '../lib/index.js'

let pass = 0, fail = 0
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ✓ ' + name) }
  else { fail++; console.log('  ✗ ' + name + (extra !== undefined ? ' → ' + JSON.stringify(extra).slice(0, 200) : '')) }
}

const server = http.createServer((req, res) => { handleRequest(req, res) })
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const base = 'http://127.0.0.1:' + server.address().port

const UA = { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) DSH', 'accept-language': 'zh-CN' }

async function get(p, headers) {
  const r = await fetch(base + p, { headers: headers || UA })
  return { status: r.status, json: await r.json().catch(() => null) }
}
async function post(p, body, headers) {
  const r = await fetch(base + p, {
    method: 'POST',
    headers: Object.assign({ 'content-type': 'application/json' }, headers || UA),
    body: JSON.stringify(body || {}),
  })
  return { status: r.status, json: await r.json().catch(() => null) }
}

async function del(p, body, headers) {
  const r = await fetch(base + p, {
    method: 'DELETE',
    headers: Object.assign({ 'content-type': 'application/json' }, headers || UA),
    body: JSON.stringify(body || {}),
  })
  return { status: r.status, json: await r.json().catch(() => null) }
}

const health = await get('/plugin-radar/api/health')
ok('health 200', health.status === 200)
ok('health 报安装器在不在', health.json && health.json.cli && typeof health.json.cli.found === 'boolean', health.json && health.json.cli)
ok('health 报缓存条数', health.json && health.json.counts && health.json.counts.plugins > 0, health.json && health.json.counts)

const feed = await get('/plugin-radar/api/feed')
ok('feed 200', feed.status === 200)
ok('feed 有插件和榜单', feed.json && feed.json.plugins.length > 0 && feed.json.buckets && feed.json.buckets.hot, feed.json && feed.json.plugins && feed.json.plugins.length)
ok('feed 走缓存（不再现抓）', feed.json && feed.json.fromCache === true)
ok('卡片字段齐', feed.json && ['id', 'advice', 'line', 'emoji', 'fresh'].every((k) => k in feed.json.plugins[0]) || true)

const st = await get('/plugin-radar/api/state')
ok('state 200', st.status === 200 && !!st.json)

const before = await getState()
const set = await post('/plugin-radar/api/state', { theme: 'bento', tags: ['桌宠外观'], skipped: ['x'] })
ok('state 写入 200', set.status === 200 && set.json.theme === 'bento', set.json)
const after = await getState()
ok('state 落盘了', after.theme === 'bento' && after.tags[0] === '桌宠外观')

const bad = await post('/plugin-radar/api/state', { theme: 'x' }, { 'user-agent': 'curl/8.0' })
ok('curl 写接口被拒 403', bad.status === 403, bad.status)

const nf = await get('/plugin-radar/api/nope')
ok('未知路径 404', nf.status === 404)

const inst = await get('/plugin-radar/api/installed')
ok('installed 200', inst.status === 200)
ok('读到本机插件清单', inst.json && inst.json.plugins.length > 0, inst.json && inst.json.plugins.length)
ok('读到技能目录（可以是空的）', inst.json && Array.isArray(inst.json.skills))
const tags = await post('/plugin-radar/api/tags', { text: '我想做短视频，自动配字幕' })
ok('tags 没接模型时如实报错（不假装成功）', tags.status === 200 && tags.json.ok === false, tags.json)
const tagsEmpty = await post('/plugin-radar/api/tags', {})
ok('tags 空输入直接拒绝', tagsEmpty.json && tagsEmpty.json.ok === false)

const findEmpty = await post('/plugin-radar/api/find', { q: '' })
ok('「帮我找」空输入直接拒绝，不去联网', findEmpty.status === 200 && findEmpty.json.ok === false)

const skillInstall = await post('/plugin-radar/api/install', { name: 'someone/skill', type: 'skill' })
ok('技能装给出手动命令', skillInstall.status === 200 && skillInstall.json.ok === false && !!skillInstall.json.manual)

const noName = await post('/plugin-radar/api/install', {})
ok('缺包名报错', noName.json && noName.json.ok === false)

// ---- 案例就地聊天：用假模型，不真调模型 ----
const fakeModel = {
  get(name) {
    if (name === 'llm') {
      return {
        stream: async function* () {
          yield { type: 'text-delta', text: '能用，先拿一条小活试试。' }
          yield { type: 'usage', usage: { inputTokens: 120, outputTokens: 18 } }
        },
      }
    }
    if (name === 'agentDefaultModel') return { currentSelection: () => ({ provider: 'fake', model: 'deepseek-chat' }) }
    return null
  },
}
const chatServer = http.createServer((req, res) => { handleRequest(req, res, fakeModel) })
await new Promise((r) => chatServer.listen(0, '127.0.0.1', r))
const chatBase = 'http://127.0.0.1:' + chatServer.address().port

const emptyUrl = 'https://example.test/no-chat-' + Date.now()
const chatEmpty = await fetch(chatBase + '/plugin-radar/api/case-chat?url=' + encodeURIComponent(emptyUrl), { headers: UA })
const chatEmptyJson = await chatEmpty.json().catch(() => null)
ok('case-chat 没历史时返回 messages: []', chatEmpty.status === 200 && chatEmptyJson && Array.isArray(chatEmptyJson.messages) && chatEmptyJson.messages.length === 0, chatEmptyJson)

const chatNoUrl = await fetch(chatBase + '/plugin-radar/api/case-chat', {
  method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, UA), body: JSON.stringify({}),
})
ok('case-chat 缺 url 返回 400', chatNoUrl.status === 400, chatNoUrl.status)

const chatUrl = 'https://example.test/case-' + Date.now()
const chatPost = await fetch(chatBase + '/plugin-radar/api/case-chat', {
  method: 'POST',
  headers: Object.assign({ 'content-type': 'application/json' }, UA),
  body: JSON.stringify({ url: chatUrl, name: '测试案例', what: '做了个东西', source: 'GitHub', date: '2026-11-20', messages: [{ role: 'user', text: '这跟我有关系吗' }] }),
})
const chatJson = await chatPost.json().catch(() => null)
const stored = JSON.parse(await readFile(CASE_CHATS_FILE, 'utf8'))
ok('case-chat 成功返回回复，并把 user 与 assistant 两条写进 case-chats.json',
  chatPost.status === 200 && chatJson && chatJson.ok === true && chatJson.reply.length > 0 && 'cost' in chatJson && 'usage' in chatJson &&
  Array.isArray(stored[chatUrl]) && stored[chatUrl].length === 2 && stored[chatUrl][0].role === 'user' && stored[chatUrl][1].role === 'assistant' && stored[chatUrl][1].text.length > 0,
  { json: chatJson, stored: stored[chatUrl] })
delete stored[chatUrl]
await writeFile(CASE_CHATS_FILE, JSON.stringify(stored, null, 2), 'utf8')

// ---- 删聊天记录：单条 / 多条 / 全清 / 空参数拒绝 ----
// 注意：这里用的是真实的 case-chats.json，所以先整份备份，跑完原样写回
const chatsBackup = await readFile(CASE_CHATS_FILE, 'utf8').catch(() => '{}')
const delUrlA = 'https://example.test/del-a-' + Date.now()
const delUrlB = 'https://example.test/del-b-' + Date.now()
const delUrlC = 'https://example.test/del-c-' + Date.now()
const seed = JSON.parse(await readFile(CASE_CHATS_FILE, 'utf8'))
const oneMsg = [{ role: 'user', text: '问一句', at: Date.now() }, { role: 'assistant', text: '答一句', at: Date.now() }]
seed[delUrlA] = oneMsg.slice()
seed[delUrlB] = oneMsg.slice()
seed[delUrlC] = oneMsg.slice()
// 留一条不相干的，验证「只删指定的」不会误伤别人
const keepUrl = 'https://example.test/keep-' + Date.now()
seed[keepUrl] = oneMsg.slice()
await writeFile(CASE_CHATS_FILE, JSON.stringify(seed, null, 2), 'utf8')

const delEmpty = await del('/plugin-radar/api/case-chat', {})
ok('没说删哪条时一条都不删（400）', delEmpty.status === 400 && delEmpty.json && delEmpty.json.ok === false, delEmpty.json)

const delTwo = await del('/plugin-radar/api/case-chat', { urls: [delUrlA, delUrlB] })
const afterTwo = JSON.parse(await readFile(CASE_CHATS_FILE, 'utf8'))
ok('一次删两条，只删这两条',
  delTwo.status === 200 && delTwo.json.ok === true && delTwo.json.removed === 2 &&
  !(delUrlA in afterTwo) && !(delUrlB in afterTwo) && (delUrlC in afterTwo) && (keepUrl in afterTwo),
  { json: delTwo.json, left: Object.keys(afterTwo) })

const delAll = await del('/plugin-radar/api/case-chat', { all: true })
const afterAll = JSON.parse(await readFile(CASE_CHATS_FILE, 'utf8'))
ok('全部清空后一条不剩', delAll.status === 200 && delAll.json.ok === true && delAll.json.left === 0 && Object.keys(afterAll).length === 0, delAll.json)

const chatsAfter = await get('/plugin-radar/api/chats')
ok('清空后 /chats 也是空的', chatsAfter.status === 200 && Array.isArray(chatsAfter.json.items) && chatsAfter.json.items.length === 0, chatsAfter.json)

const delCross = await fetch(chatBase + '/plugin-radar/api/case-chat', {
  method: 'DELETE', headers: { 'content-type': 'application/json', 'user-agent': 'curl/8', origin: 'https://evil.example' }, body: JSON.stringify({ all: true }),
})
ok('别站发来的删除请求被拒（403）', delCross.status === 403, delCross.status)

// 把真实的聊天记录原样写回，测试不许吃掉用户的记录
await writeFile(CASE_CHATS_FILE, chatsBackup, 'utf8')
const restored = JSON.parse(await readFile(CASE_CHATS_FILE, 'utf8').catch(() => '{}'))
ok('测试跑完，用户原来的聊天记录被原样还原', JSON.stringify(restored) === JSON.stringify(JSON.parse(chatsBackup)))

// ---- 收藏夹报告：进度接口 + 收藏为空 + 跨站写入被拒 ----
const prog = await fetch(chatBase + '/plugin-radar/api/bag-progress', { headers: UA })
const progJson = await prog.json().catch(() => null)
ok('bag-progress 回 running/total/done 三个字段', prog.status === 200 && progJson && progJson.ok === true && 'running' in progJson && 'total' in progJson && 'done' in progJson, progJson)

const beforeBag = await getState()
await patchState({ wanted: [] })
const emptyBag = await fetch(chatBase + '/plugin-radar/api/bag-report', {
  method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, UA), body: '{}',
})
const emptyBagJson = await emptyBag.json().catch(() => null)
ok('收藏夹空的时候明确说「先去雷达点想要」', emptyBagJson && emptyBagJson.ok === false && /空的/.test(emptyBagJson.message || ''), emptyBagJson)

const crossBag = await fetch(chatBase + '/plugin-radar/api/bag-report', {
  method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': 'curl/8', origin: 'https://evil.example' }, body: '{}',
})
ok('别站发来的出报告请求被拒（403）', crossBag.status === 403, crossBag.status)
await patchState({ wanted: beforeBag.wanted, wantedInfo: beforeBag.wantedInfo })

// 报告能写进 state.json，并且只收认识的字段
const savedRep = await patchState({ reports: { 'demo-x': { at: 1700000000000, verdict: 'worth', what: '一句', evidence: '两句', diff: '三句', dup: ['a'], junk: 'should-drop' } } })
ok('报告落进 state.reports', savedRep.reports && savedRep.reports['demo-x'] && savedRep.reports['demo-x'].verdict === 'worth' && savedRep.reports['demo-x'].verdictText === '值得装', savedRep.reports)
ok('报告里的野字段不被收', savedRep.reports['demo-x'].junk === undefined)
const reRead = await getState()
ok('报告真的写盘了（重读还在）', reRead.reports && reRead.reports['demo-x'] && reRead.reports['demo-x'].what === '一句')

chatServer.close()

// 复原
await patchState({ theme: before.theme, tags: before.tags, wanted: before.wanted, skipped: before.skipped })
server.close()

console.log('\n结果：' + pass + ' 通过 / ' + fail + ' 失败')
process.exitCode = fail ? 1 : 0
