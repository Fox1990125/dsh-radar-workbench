// 「一小时 30 条」把用户自己点研究锁死过的回归测试：node test/limit.test.mjs
import { recentFreshCount } from '../lib/index.js'

let pass = 0, fail = 0
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ✓ ' + name) }
  else { fail++; console.log('  ✗ ' + name + (extra !== undefined ? ' → ' + JSON.stringify(extra) : '')) }
}

const now = Date.now()
const make = (n, fn) => {
  const out = {}
  for (let i = 0; i < n; i++) out['x' + i] = fn(i)
  return out
}

// 用户点了 40 次「重新研究」：笔记的 at 是刚更新的，但 firstAt 是一小时前 → 不该占额度
const reread = make(40, () => ({ at: now - 60_000, firstAt: now - 7200_000 }))
ok('重读老笔记不占额度（以前就是这里把自己锁死的）', recentFreshCount(reread, now) === 0, recentFreshCount(reread, now))

const fresh = make(60, () => ({ at: now - 60_000, firstAt: now - 60_000 }))
ok('真新研究了 60 条才算满', recentFreshCount(fresh, now) === 60)

const mixed = Object.assign({}, reread, fresh)
ok('老的 + 新的混着算，只数新的', recentFreshCount(mixed, now) === 60)

const legacy = make(10, () => ({ at: now - 60_000 }))
ok('旧笔记没有 firstAt 时退回用 at（兼容老数据）', recentFreshCount(legacy, now) === 10)

console.log('\n结果：' + pass + ' 通过 / ' + fail + ' 失败')
process.exit(fail ? 1 : 0)
