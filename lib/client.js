/**
 * dsh-plugin-radar —— 浏览器半段（对话顶部的一个页签）。
 *
 * 外观只有一种：工具风（紧凑、安静，跟 DSH 本体一个调子）。
 * 数据来自宿主半段 /plugin-radar/api/feed；英文条目可以点「让 AI 研究」，
 * 由宿主读 README 后写三句中文短评（按名字@版本存本地，一条只算一次）。
 * 宿主没起来或联网失败时，自动退成「样例」并明说。
 *
 * 包格式照 dsh-context-stopline / dsh-memory-evolve：
 *   window.__ModuleLoader__.load({ id, factory })，exports.apply(ctx) 里注册页签。
 */
window.__ModuleLoader__.load({
  id: "dsh-radar-workbench",
  factory: function (require) {
    var module = { exports: {} };
    var exports = module.exports;

    var React = null;
    try {
      React = require("react");
    } catch (e) {
      console.warn("[plugin-radar] react 不在模块表里：", e && e.message);
    }
    var h = React ? React.createElement : null;

    var API = "/plugin-radar/api";

    var TAGS_PRESET = ["桌宠外观", "效率工具", "小游戏", "翻译", "图片处理", "做表格", "写小说", "视频剪辑"];

    function noteKey(it) {
      return String(it.name || "") + "@" + String(it.version || "latest");
    }

    // ---------------------------------------------------------------- 样式

    var CSS = `
.pr{--pr-font:var(--dsw-font-family,system-ui,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif);--pr-mono:ui-monospace,"Cascadia Mono",Consolas,"SF Mono",monospace;
  --pr-text:var(--dsw-alias-label-primary,#1b1b1f);--pr-text2:var(--dsw-alias-label-secondary,#5b5f66);--pr-dim:var(--dsw-alias-label-tertiary,#8b8d98);
  --pr-line:var(--dsw-alias-border-subtle,rgba(128,128,128,.26));--pr-surface:var(--dsw-alias-bg-secondary,rgba(128,128,128,.05));
  --pr-brand:var(--dsw-alias-brand-primary,#4d6bfe);--pr-danger:var(--dsw-alias-state-danger-primary,#e5484d);--pr-ok:#2f9e6a;
  --pr-radius:10px;--pr-pad:12px;--pr-gap:12px;--pr-min:250px;--pr-lh:1.55;--pr-title:13px;--pr-body:12px;--pr-shadow:none;--pr-bg:transparent;
  --pr-display:var(--pr-font);
  display:flex;flex-direction:column;height:100%;min-height:0;box-sizing:border-box;padding:18px 20px 28px;gap:12px;overflow-y:auto;
  color:var(--pr-text);font-family:var(--pr-font);font-size:13px;line-height:var(--pr-lh);background:var(--pr-bg)}
.pr *{box-sizing:border-box}
.pr-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.pr-title{font-family:var(--pr-display);font-size:16px;font-weight:680;letter-spacing:.2px;display:flex;align-items:center;gap:8px}
.pr-sub{font-size:11.5px;color:var(--pr-dim)}
.pr-grow{flex:1 1 auto}
.pr-btn{appearance:none;border:1px solid var(--pr-line);background:transparent;color:var(--pr-text2);border-radius:8px;padding:4px 11px;font:inherit;font-size:12px;cursor:pointer;line-height:1.6;white-space:nowrap}
.pr-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.12));color:var(--pr-text)}
.pr-btn:disabled{opacity:.45;cursor:not-allowed}
.pr-btn-primary{border-color:transparent;background:var(--pr-brand);color:#fff}
.pr-btn-primary:hover:not(:disabled){background:var(--pr-brand);color:#fff;filter:brightness(1.07)}
.pr-btn-ghost{border-color:transparent;padding-left:6px;padding-right:6px}
.pr-band{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:11.5px;color:var(--pr-text2);border:1px dashed var(--pr-line);border-radius:9px;padding:6px 10px}
.pr-band[data-kind="warn"]{border-color:color-mix(in srgb,var(--pr-danger) 45%,transparent);color:var(--pr-text2)}
.pr-band b{color:var(--pr-text)}
.pr-cost{margin-left:6px;font-size:10.5px;font-weight:400;color:var(--pr-dim);font-family:var(--pr-mono)}
.pr-badge{font-size:10.5px;padding:1px 7px;border-radius:999px;border:1px solid var(--pr-line);color:var(--pr-ok)}
.pr-tabs{display:flex;gap:2px;border-bottom:1px solid var(--pr-line);padding-bottom:0}
.pr-tab{appearance:none;border:none;background:transparent;color:var(--pr-dim);font:inherit;font-size:12.5px;padding:6px 12px;cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px}
.pr-tab:hover{color:var(--pr-text)}
.pr-tab[data-on="1"]{color:var(--pr-text);font-weight:650;border-bottom-color:var(--pr-brand)}
.pr-chips{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.pr-chip{display:inline-flex;align-items:center;gap:5px;border:1px solid var(--pr-line);border-radius:999px;padding:2px 10px;font-size:11.5px;color:var(--pr-text2);background:transparent;cursor:pointer;font-family:inherit}
.pr-chip[data-on="1"]{border-color:color-mix(in srgb,var(--pr-brand) 55%,transparent);color:var(--pr-brand);background:color-mix(in srgb,var(--pr-brand) 10%,transparent)}
.pr-chip-x{appearance:none;border:none;background:transparent;color:var(--pr-dim);cursor:pointer;padding:0;font-size:12px;line-height:1}
.pr-chip-x:hover{color:var(--pr-danger)}
.pr-sec{display:flex;align-items:baseline;gap:10px;margin:10px 0 8px}
.pr-sec-t{font-family:var(--pr-display);font-size:12.5px;font-weight:680;color:var(--pr-text)}
.pr-sec-n{font-size:11px;color:var(--pr-dim)}
.pr-sec-line{flex:1;height:1px;background:var(--pr-line)}
.pr-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(var(--pr-min),1fr));gap:var(--pr-gap)}
.pr-card{display:flex;flex-direction:column;gap:8px;min-width:0;border:1px solid var(--pr-line);border-radius:var(--pr-radius);padding:var(--pr-pad);background:var(--pr-surface);box-shadow:var(--pr-shadow);position:relative}
.pr-card[data-type="skill"]{--pr-accent:var(--pr-brand)}
.pr-card-hd{display:flex;align-items:center;gap:8px;min-width:0}
.pr-emoji{font-size:16px;line-height:1;flex:0 0 auto}
.pr-card-id{min-width:0;flex:1}
.pr-name{font-size:var(--pr-title);font-weight:660;overflow-wrap:anywhere;line-height:1.35}
.pr-kicker{font-size:10.5px;color:var(--pr-dim);letter-spacing:.3px;margin-top:1px}
.pr-advice{font-size:10.5px;padding:1px 8px;border-radius:999px;white-space:nowrap;flex:0 0 auto;border:1px solid transparent}
.pr-advice[data-lv="ok"]{color:var(--pr-ok);background:color-mix(in srgb,#2f9e6a 12%,transparent);border-color:color-mix(in srgb,#2f9e6a 35%,transparent)}
.pr-advice[data-lv="careful"]{color:#b8860b;background:color-mix(in srgb,#d9a300 14%,transparent);border-color:color-mix(in srgb,#d9a300 38%,transparent)}
.pr-advice[data-lv="no"]{color:var(--pr-danger);background:color-mix(in srgb,var(--pr-danger) 10%,transparent);border-color:color-mix(in srgb,var(--pr-danger) 32%,transparent)}
.pr-advice[data-lv="on"]{color:var(--pr-dim);background:transparent;border-color:var(--pr-line)}
.pr-line{font-size:var(--pr-body);color:var(--pr-text2);margin:0;min-height:1.5em}
.pr-stats{display:flex;gap:14px;flex-wrap:wrap;align-items:flex-end}
.pr-stat{display:flex;flex-direction:column;line-height:1.25}
.pr-stat b{font-family:var(--pr-mono);font-size:12.5px;font-weight:640;color:var(--pr-text)}
.pr-stat i{font-style:normal;font-size:10px;color:var(--pr-dim)}
.pr-more{border-top:1px dashed var(--pr-line);padding-top:7px;display:flex;flex-direction:column;gap:4px;font-size:11.5px;color:var(--pr-text2)}
.pr-more .k{color:var(--pr-dim)}
.pr-en{font-size:11px;color:var(--pr-dim);line-height:1.45;overflow-wrap:anywhere}
.pr-acts{display:flex;gap:6px;flex-wrap:wrap;margin-top:auto;padding-top:4px}
.pr-empty{font-size:12px;color:var(--pr-dim);padding:22px 4px;text-align:center}
.pr-input{height:30px;padding:0 10px;border:1px solid var(--pr-line);border-radius:8px;background:transparent;color:var(--pr-text);font:inherit;font-size:12px;outline:none;min-width:180px}
.pr-input:focus{border-color:var(--pr-brand)}
.pr-toast{position:sticky;bottom:0;align-self:center;font-size:12px;border-radius:999px;padding:6px 15px;background:var(--dsw-alias-bg-elevated,#2a2a30);color:var(--dsw-alias-label-primary,#fff);border:1px solid var(--pr-line);box-shadow:0 6px 18px rgba(0,0,0,.22);z-index:5}
.pr-item{display:flex;align-items:center;gap:10px;border:1px solid var(--pr-line);border-radius:var(--pr-radius);padding:10px 12px;background:var(--pr-surface)}
.pr-item-body{flex:1;min-width:0}
.pr-hint{font-size:11.5px;color:var(--pr-dim);line-height:1.6}
.pr-col2{display:grid;grid-template-columns:1fr 1fr;gap:22px;align-items:start}
@media (max-width:900px){.pr-col2{grid-template-columns:1fr}}

/* ---- 关键词、AI 短评 ---- */
.pr-kw{display:flex;flex-wrap:wrap;align-items:center;gap:5px;font-size:11px;color:var(--pr-dim)}
.pr-kw-l{color:var(--pr-dim)}
.pr-kw span.pr-kw-t{border:1px solid var(--pr-line);border-radius:999px;padding:0 7px;color:var(--pr-text2)}
.pr-note{border-left:2px solid color-mix(in srgb,var(--pr-brand) 55%,transparent);padding:2px 0 2px 9px;display:flex;flex-direction:column;gap:2px;font-size:11.5px;color:var(--pr-text2);line-height:1.5}
.pr-note-t{font-size:10.5px;color:var(--pr-dim);letter-spacing:.3px}
/* 正在研究的卡片：先占住位置，让用户看见「这一条正在读」 */
.pr-note-pending{border-left-style:dashed;border-left-color:color-mix(in srgb,var(--pr-brand) 40%,transparent);color:var(--pr-dim);animation:pr-pulse 1.4s ease-in-out infinite}
.pr-note-pending .pr-note-t{color:color-mix(in srgb,var(--pr-brand) 80%,var(--pr-dim))}
@keyframes pr-pulse{0%,100%{opacity:.55}50%{opacity:1}}
.pr-batch{color:var(--pr-brand);font-weight:600}
/* ---- 收藏夹：每条下面挂三句结论 ---- */
.pr-item-col{flex-direction:column;align-items:stretch;gap:6px}
.pr-item-main{display:flex;align-items:center;gap:10px;min-width:0}
.pr-item-main .pr-item-body{flex:1;min-width:0}
.pr-rep{border-left:2px solid var(--pr-dim);padding:3px 0 3px 9px;display:flex;flex-direction:column;gap:2px;font-size:11.5px;line-height:1.55;color:var(--pr-text2)}
.pr-rep-worth{border-left-color:#2f9e6a}
.pr-rep-no{border-left-color:#b26a00}
.pr-rep-wait{border-left-color:var(--pr-dim)}
.pr-rep-head{display:flex;align-items:baseline;gap:7px;flex-wrap:wrap}
.pr-rep-verdict{font-size:11px;font-weight:700;letter-spacing:.3px}
.pr-rep-worth .pr-rep-verdict{color:#2f9e6a}
.pr-rep-no .pr-rep-verdict{color:#b26a00}
.pr-rep-wait .pr-rep-verdict{color:var(--pr-dim)}
.pr-rep-what{color:var(--pr-text)}
.pr-rep-line{color:var(--pr-text2)}
.pr-rep-dup{color:var(--pr-dim);font-size:11px}
.pr-rep-pending{border-left-style:dashed;color:var(--pr-dim);animation:pr-pulse 1.4s ease-in-out infinite}
.pr-rep-pending .pr-rep-verdict{color:var(--pr-brand)}
.pr-rep-progress{color:var(--pr-brand)}
/* ---- 案例页：上面 4 张大卡（成品），下面按日期分组的周刊目录（想法 / 故事） ---- */
.pr-cases{display:flex;flex-direction:column;gap:10px}
.pr-cases-bar{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.pr-bar-sep{width:1px;height:16px;background:var(--pr-line);margin:0 3px}
.pr-chip[data-kind="成品"],.pr-dir-row[data-kind="成品"],.pr-big[data-kind="成品"]{--pr-dot:#2f9e6a}
.pr-chip[data-kind="想法"],.pr-dir-row[data-kind="想法"],.pr-big[data-kind="想法"]{--pr-dot:#d9a300}
.pr-chip[data-kind="故事"],.pr-dir-row[data-kind="故事"],.pr-big[data-kind="故事"]{--pr-dot:#4d6bfe}
.pr-kdot{width:7px;height:7px;border-radius:999px;background:var(--pr-dot,var(--pr-dim));flex:0 0 auto}
.pr-btn[data-on="1"]{border-color:color-mix(in srgb,var(--pr-brand) 55%,transparent);color:var(--pr-brand)}
.pr-more-panel{display:flex;align-items:center;gap:8px;flex-wrap:wrap;border:1px dashed var(--pr-line);border-radius:9px;padding:7px 10px}
.pr-bigs{display:grid;grid-template-columns:repeat(auto-fill,minmax(225px,1fr));gap:12px}
.pr-big{display:flex;flex-direction:column;gap:7px;min-width:0;border:1px solid var(--pr-line);border-top:3px solid var(--pr-dot,var(--pr-line));border-radius:var(--pr-radius);padding:12px 13px 11px;background:var(--pr-surface);cursor:pointer;transition:border-color .15s,transform .15s}
.pr-big:hover{border-color:color-mix(in srgb,var(--pr-dot,var(--pr-brand)) 55%,var(--pr-line));transform:translateY(-1px)}
.pr-big-name{font-size:13.5px;font-weight:660;line-height:1.4;overflow-wrap:anywhere}
.pr-big-what{font-size:11.5px;color:var(--pr-text2);line-height:1.55;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.pr-big-meta{margin-top:auto;display:flex;align-items:center;gap:8px;justify-content:space-between;font-size:10.5px;color:var(--pr-dim)}
.pr-big-go{color:var(--pr-dot,var(--pr-brand));white-space:nowrap}
.pr-dir{display:flex;flex-direction:column}
.pr-dir-group{display:flex;flex-direction:column}
.pr-dir-day{display:flex;align-items:center;gap:8px;font-size:10.5px;color:var(--pr-dim);letter-spacing:.3px;margin:12px 0 2px}
.pr-dir-group:first-child .pr-dir-day{margin-top:2px}
.pr-dir-line{flex:1;height:1px;background:var(--pr-line)}
.pr-dir-row[data-read="1"],.pr-big[data-read="1"]{opacity:.5}
.pr-dir-row[data-read="1"]:hover,.pr-big[data-read="1"]:hover{opacity:.85}
.pr-mychats{border:1px solid var(--pr-line);border-radius:var(--pr-radius);padding:9px 11px;display:flex;flex-direction:column;gap:7px;background:var(--pr-surface)}
.pr-mychats-t{display:flex;align-items:baseline;gap:8px;font-size:12px;font-weight:650;color:var(--pr-text2)}
.pr-mychats-list{display:flex;gap:8px;overflow-x:auto;padding-bottom:2px}
.pr-mychat{flex:0 0 208px;min-width:0;border:1px solid var(--pr-line);border-radius:8px;padding:7px 9px;cursor:pointer;display:flex;flex-direction:column;gap:3px}
.pr-mychat:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.1))}
.pr-mychat-t{font-size:12px;font-weight:620;color:var(--pr-text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pr-mychat-s{font-size:11px;color:var(--pr-dim);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;line-height:1.45}
.pr-mychat-m{font-size:10.5px;color:var(--pr-dim);font-family:var(--pr-mono)}
.pr-spend{display:flex;flex-direction:column;gap:6px;border:1px dashed var(--pr-line);border-radius:9px;padding:8px 11px}
.pr-spend-week{display:flex;align-items:flex-end;gap:6px;height:44px}
.pr-spend-bar{flex:1 1 0;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:3px;height:100%;font-size:9.5px;color:var(--pr-dim);font-family:var(--pr-mono)}
.pr-spend-bar i{display:block;width:100%;background:var(--pr-brand);border-radius:2px;min-height:2px;opacity:.85}
.pr-spend-day{display:flex;justify-content:space-between;font-size:11px;color:var(--pr-dim);font-family:var(--pr-mono)}
.pr-verify{border:1px solid var(--pr-line);border-left:3px solid var(--pr-ok);border-radius:8px;padding:7px 10px;margin-top:6px;display:flex;flex-direction:column;gap:3px;font-size:11.5px;color:var(--pr-text2)}
.pr-verify b{color:var(--pr-text)}
.pr-dir-row:hover{background:color-mix(in srgb,var(--pr-text) 5%,transparent)}
.pr-dir-body{flex:1;min-width:0}
.pr-dir-t{font-size:12.5px;font-weight:600;line-height:1.4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pr-dir-s{font-size:11px;color:var(--pr-dim);line-height:1.45;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pr-dir-x{font-size:11px;color:var(--pr-dim);white-space:nowrap;opacity:0;transition:opacity .15s}
.pr-dir-row:hover .pr-dir-x{opacity:1}
.pr-empty-case{display:flex;flex-direction:column;align-items:center;gap:10px;padding:34px 4px}
/* ---- 案例就地聊天：右侧窄面板（窄屏变底部抽屉） ---- */
.pr-chat-btn{font-size:10.5px;line-height:1.4;color:var(--pr-dim);background:transparent;border:1px solid var(--pr-line);border-radius:999px;padding:1px 8px;cursor:pointer;white-space:nowrap;font-family:inherit}
.pr-pager{display:flex;align-items:center;gap:10px;padding:10px 2px 2px;flex-wrap:wrap}
.pr-pager .pr-btn{min-width:72px}
.pr-pager-n{font-size:11.5px;color:var(--pr-dim)}
.pr-case-get[data-on="1"]{color:var(--pr-accent,#7aa2f7);border-color:currentColor;opacity:.75;cursor:default}
/* ---- 「聊过的」整页：竖向一条一行 ---- */
.pr-chats-bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.pr-chats-list{display:flex;flex-direction:column;border:1px solid var(--pr-line);border-radius:var(--pr-radius);overflow:hidden}
.pr-chats-row{display:flex;align-items:center;gap:10px;padding:8px 11px;border-bottom:1px solid var(--pr-line);cursor:default}
.pr-chats-row:last-child{border-bottom:0}
.pr-chats-row:hover{background:color-mix(in srgb,var(--pr-text) 5%,transparent)}
.pr-chats-row[data-on="1"]{background:color-mix(in srgb,var(--pr-brand) 8%,transparent)}
.pr-chats-ck{flex:0 0 auto;width:14px;height:14px;margin:0;cursor:pointer;accent-color:var(--pr-brand)}
.pr-chats-body{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;cursor:pointer}
.pr-chats-t{font-size:12.5px;font-weight:620;color:var(--pr-text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pr-chats-s{font-size:11px;color:var(--pr-dim);line-height:1.45;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pr-chats-m{font-size:10.5px;color:var(--pr-dim);font-family:var(--pr-mono)}
.pr-chats-del{flex:0 0 auto;font-size:11px;color:var(--pr-dim);background:transparent;border:1px solid var(--pr-line);border-radius:999px;padding:1px 9px;cursor:pointer;font-family:inherit}
.pr-chats-del:hover{color:var(--pr-danger);border-color:color-mix(in srgb,var(--pr-danger) 55%,transparent)}
.pr-btn-danger{border-color:color-mix(in srgb,var(--pr-danger) 55%,transparent);color:var(--pr-danger)}
.pr-btn-danger:hover:not(:disabled){background:color-mix(in srgb,var(--pr-danger) 12%,transparent);color:var(--pr-danger)}
/* ---- 删除确认弹窗 ---- */
.pr-confirm-mask{position:fixed;inset:0;z-index:80;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.34)}
.pr-confirm{width:min(380px,calc(100vw - 48px));border:1px solid var(--pr-line);border-radius:12px;background:var(--pr-surface);box-shadow:0 18px 48px rgba(0,0,0,.22);padding:14px 16px;display:flex;flex-direction:column;gap:10px}
.pr-confirm-t{font-size:13.5px;font-weight:660;color:var(--pr-text)}
.pr-confirm-b{font-size:12px;color:var(--pr-text2);line-height:1.6}
.pr-confirm-err{font-size:11.5px;color:var(--pr-danger)}
.pr-confirm-act{display:flex;justify-content:flex-end;gap:8px}
.pr-pick{border:1px solid var(--pr-line);border-radius:10px;padding:10px 12px;display:flex;flex-direction:column;gap:8px}
.pr-pick-t{font-size:12px;color:var(--pr-text)}
.pr-pick-row{display:flex;flex-wrap:wrap;gap:6px}
.pr-chat-btn:hover{color:var(--pr-brand);border-color:color-mix(in srgb,var(--pr-brand) 55%,transparent)}
.pr-big-foot{display:flex;justify-content:flex-end;margin-top:2px}
.pr-dir-row .pr-chat-btn{margin-left:auto}
.pr-chat{position:fixed;right:18px;top:64px;bottom:76px;width:360px;z-index:60;display:flex;flex-direction:column;min-height:0;border:1px solid var(--pr-line);border-radius:12px;background:color-mix(in srgb,var(--pr-surface) 92%,transparent);box-shadow:0 18px 48px rgba(0,0,0,.18);backdrop-filter:blur(8px);overflow:hidden}
.pr-chat-head{display:flex;align-items:center;gap:8px;padding:9px 11px;border-bottom:1px solid var(--pr-line);flex:0 0 auto}
.pr-chat-t{flex:1;min-width:0;font-size:12.5px;font-weight:650;line-height:1.4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pr-chat-x{width:22px;height:22px;flex:0 0 auto;border:1px solid var(--pr-line);border-radius:6px;background:transparent;color:var(--pr-dim);font-size:14px;line-height:1;cursor:pointer;font-family:inherit}
.pr-chat-x:hover{color:var(--pr-text);border-color:var(--pr-dim)}
.pr-chat-msgs{flex:1 1 auto;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:8px;padding:11px}
.pr-chat-guide{font-size:11.5px;line-height:1.65;color:var(--pr-dim);border:1px dashed var(--pr-line);border-radius:9px;padding:9px 10px}
.pr-chat-msg{max-width:88%;font-size:12px;line-height:1.6;border-radius:10px;padding:7px 10px;white-space:pre-wrap;overflow-wrap:anywhere}
.pr-chat-msg[data-role="user"]{align-self:flex-end;background:color-mix(in srgb,var(--pr-brand) 88%,transparent);color:#fff;border-bottom-right-radius:3px}
.pr-chat-msg[data-role="assistant"]{align-self:flex-start;background:color-mix(in srgb,var(--pr-text) 7%,transparent);color:var(--pr-text);border-bottom-left-radius:3px}
.pr-chat-thinking{color:var(--pr-dim);animation:pr-pulse 1.4s ease-in-out infinite}
.pr-chat-err{align-self:stretch;font-size:11.5px;line-height:1.5;color:#c0392b}
.pr-chat-foot{flex:0 0 auto;display:flex;align-items:flex-end;gap:7px;padding:9px 10px;border-top:1px solid var(--pr-line)}
.pr-chat-repo{flex:0 0 auto;display:flex;align-items:center;gap:8px;padding:7px 10px;border-top:1px solid var(--pr-line);font-size:11.5px;line-height:1.4;color:#6b7280}
.pr-chat-repo.on{color:#2f9e6a}
.pr-chat-repo.bad{color:#b26a00}
.pr-chat-repo-b{margin-left:auto;flex:0 0 auto;border:1px solid var(--pr-line);background:#fff;border-radius:6px;padding:3px 8px;font-size:11.5px;line-height:1.2;cursor:pointer;color:inherit}
.pr-chat-repo-b:disabled{opacity:.55;cursor:default}
.pr-chat-input{flex:1;min-width:0;resize:none;min-height:34px;max-height:96px;border:1px solid var(--pr-line);border-radius:8px;background:var(--pr-surface);color:var(--pr-text);font-family:inherit;font-size:12px;line-height:1.5;padding:6px 8px;outline:none}
.pr-chat-input:focus{border-color:color-mix(in srgb,var(--pr-brand) 55%,transparent)}
@media (max-width:760px){.pr-chat{left:0;right:0;bottom:0;top:auto;width:auto;height:60%;border-radius:12px 12px 0 0;border-left:0;border-right:0;border-bottom:0}}
.pr-themes,.pr-theme{display:none}
.pr-find{display:flex;flex-direction:column;gap:8px;padding:12px;border:1px solid var(--pr-line);border-radius:10px;background:var(--pr-surface)}
.pr-find-in{display:flex;gap:8px;align-items:center}
.pr-find-q{flex:1;min-width:0}
.pr-find-state{display:flex;flex-direction:column;gap:8px}
.pr-find-sum{border-left:3px solid var(--pr-brand);padding:2px 0 2px 10px;display:flex;flex-direction:column;gap:6px}
.pr-find-sum-t{font-size:13.5px;line-height:1.5;font-weight:600}
.pr-find-list{display:flex;flex-direction:column;gap:6px}
.pr-find-row{align-items:flex-start}
.pr-find-name{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:12.5px;font-weight:650}
.pr-find-why{font-size:12px;line-height:1.5;color:var(--pr-text);margin-top:2px}
.pr-link{color:inherit;text-decoration:none;border-bottom:1px dashed color-mix(in srgb,var(--pr-text) 35%,transparent)}
.pr-link:hover{border-bottom-color:var(--pr-brand)}
.pr-skel{opacity:.72}
.pr-skel .pr-name{animation:pr-pulse 1.4s ease-in-out infinite}
.pr-find-empty{display:flex;flex-direction:column;gap:6px}

`;

    // ---------------------------------------------------------------- 工具函数

    function fmtNum(n) {
      if (!n && n !== 0) return "—";
      if (n >= 10000) return (n / 10000).toFixed(n >= 100000 ? 0 : 1) + "万";
      if (n >= 1000) return (n / 1000).toFixed(1) + "k";
      return String(n);
    }

    function ageOf(ts) {
      if (!ts) return "—";
      var d = Math.floor((Date.now() - ts) / 86400000);
      if (d <= 0) return "今天";
      if (d === 1) return "昨天";
      if (d < 30) return d + "天前";
      if (d < 365) return Math.round(d / 30) + "个月前";
      return Math.round(d / 365) + "年前";
    }

    function ago(ts) {
      if (!ts) return "还没成功过";
      var m = Math.floor((Date.now() - ts) / 60000);
      if (m < 1) return "刚刚";
      if (m < 60) return m + " 分钟前";
      var hh = Math.floor(m / 60);
      if (hh < 24) return hh + " 小时前";
      return Math.floor(hh / 24) + " 天前";
    }

    function api(path, body, method) {
      var opt = { method: method || (body ? "POST" : "GET"), headers: {} };
      if (body) {
        opt.headers["content-type"] = "application/json";
        opt.body = JSON.stringify(body);
      }
      return fetch(API + path, opt).then(function (r) {
        return r.json().then(function (j) {
          if (!r.ok) throw new Error((j && j.error) || "HTTP " + r.status);
          return j;
        });
      });
    }

    // 宿主没起来时用的样例：形状跟真数据一样，界面不至于空着
    function demoFeed() {
      var now = Date.now();
      var mk = function (o) {
        return Object.assign(
          {
            type: "plugin", version: "0.0.0", downloads: 0, stars: 0, updatedAt: now - 3 * 86400000,
            repo: "", url: "", topics: [], install: "npm", restart: true, installed: false, zh: [], en: "",
            emoji: "🔌", fresh: 0, hot: 0, fun: 0,
            advice: { level: "careful", label: "样例", why: ["这是样例数据，不是真的"] },
          },
          o,
        );
      };
      var skills = [
        mk({ type: "skill", name: "humanizer-zh", emoji: "✍️", line: "把 AI 写出来的生硬文字，改成像人写的", stars: 1200, updatedAt: now - 2 * 86400000, advice: { level: "ok", label: "可以装", why: ["GitHub 上 1.2k 颗星", "2 天前更新过", "技能每轮都占一点开销"] } }),
        mk({ type: "skill", name: "doc-polish", emoji: "📄", line: "把 Word 的标题、行距、页边距一键整理干净", stars: 8400, updatedAt: now - 9 * 86400000, advice: { level: "ok", label: "可以装", why: ["GitHub 上 8.4k 颗星", "9 天前更新过", "技能每轮都占一点开销"] } }),
        mk({ type: "skill", name: "pet-talk", emoji: "🐟", line: "让桌面宠物根据你正在干的事，说不同的话", stars: 1100, updatedAt: now - 20 * 86400000, advice: { level: "careful", label: "先别急", why: ["星数不多（1.1k）", "20 天没更新了"] } }),
      ];
      var plugins = [
        mk({ name: "dsh-quick-notes", emoji: "📝", line: "右边开一块随手记，写完自动存成 md", downloads: 240, updatedAt: now - 5 * 86400000, advice: { level: "careful", label: "先别急", why: ["这个月只有 240 人下载", "5 天前更新过"] } }),
        mk({ name: "dsh-wallpaper-sync", emoji: "🖼️", line: "换壁纸时，桌面和锁屏一起换", downloads: 123000, updatedAt: now - 12 * 86400000, advice: { level: "ok", label: "可以装", why: ["这个月有 12 万人下载", "12 天前更新过"] } }),
        mk({ name: "dsh-desktop-fish", emoji: "🐠", line: "任务栏上方养一缸鱼，鼠标过去会躲", downloads: 8600, updatedAt: now - 40 * 86400000, advice: { level: "ok", label: "可以装", why: ["这个月 8.6k 人下载", "40 天前更新过"] } }),
      ];
      var names = function (l) { return l.map(function (x) { return x.name; }); };
      return {
        demo: true, fetchedAt: 0, errors: [],
        skills: skills, plugins: plugins,
        buckets: {
          fresh: { skills: names(skills), plugins: names(plugins) },
          hot: { skills: names(skills), plugins: names(plugins) },
          fun: { skills: names(skills), plugins: names(plugins) },
        },
      };
    }

    // ---------------------------------------------------------------- 卡片

    function Advice(props) {
      return h("span", { className: "pr-advice", "data-lv": props.advice.level }, props.advice.label);
    }

    function Card(props) {
      var it = props.item;
      var open = props.open;
      var a = it.advice || { level: "careful", label: "看数字", why: [] };
      var isSkill = it.type === "skill";
      var keyStat = isSkill ? it.stars : it.downloads;
      var note = props.note || null;

      var kw = null;
      if (it.zh && it.zh.length) {
        kw = h("div", { className: "pr-kw" },
          h("span", { className: "pr-kw-l" }, "关键词"),
          it.zh.map(function (z) { return h("span", { key: "k" + z, className: "pr-kw-t" }, z); }),
        );
      }

      var noteBox = null;
      if (note && note.text) {
        var cost = null;
        if (note.usage || typeof note.cost === "number") {
          var bits = [];
          if (note.usage) bits.push(fmtNum(note.usage.inputTokens || 0) + " 进 / " + fmtNum(note.usage.outputTokens || 0) + " 出");
          if (typeof note.cost === "number" && note.cost > 0) bits.push("约 ¥" + (note.cost >= 0.01 ? note.cost.toFixed(3) : note.cost.toFixed(4)));
          if (bits.length) cost = h("span", { className: "pr-cost" }, "1 次模型 · " + bits.join(" · "));
        }
        if (!cost) cost = h("span", { className: "pr-cost" }, "旧记录，没记花费；点「重新研究」会记");
        noteBox = h("div", { className: "pr-note" },
          h("div", { className: "pr-note-t" }, "AI 研究", cost),
          String(note.text).split("\n").filter(function (s) { return s.trim(); }).map(function (s, i) {
            return h("div", { key: "n" + i }, s.trim());
          }),
        );
      }

      // 正在研究的这一张：先占一块位置，写清「在干什么、大概多久」，不然用户以为按钮没反应。
      // 已经有旧短评的那张也要显示，否则「重新研究」看起来像没点动。
      var pendingBox = null;
      if (props.researching) {
        pendingBox = h("div", { className: "pr-note pr-note-pending" },
          h("div", { className: "pr-note-t" }, note && note.text ? "AI 研究 · 正在读它的说明 · 这是重新读一遍" : "AI 研究 · 正在读它的说明"),
          h("div", {}, "大概 10～25 秒，写好就出现在这里"),
        );
      }

      var more = null;
      if (open) {
        var lines = [];
        (a.why || []).forEach(function (w, i) {
          lines.push(h("div", { key: "w" + i }, h("span", { className: "k" }, "· "), w));
        });
        if (it.en) lines.push(h("div", { key: "en", className: "pr-en" }, "原文：" + it.en));
        if (it.url) {
          lines.push(
            h("div", { key: "lnk" },
              h("a", { href: it.url, target: "_blank", rel: "noreferrer", style: { color: "inherit" } }, isSkill ? "GitHub 页面 ↗" : "npm 页面 ↗"),
            ),
          );
        }
        more = h("div", { className: "pr-more" }, lines);
      }

      var acts = [
        h("button", { key: "see", className: "pr-btn", onClick: function () { props.onSee(it.name); } }, open ? "收起" : "看看"),
        h("button", { key: "want", className: "pr-btn pr-btn-primary", disabled: it.installed, onClick: function () { props.onWant(it); } }, it.installed ? "已装" : "想要"),
        h("button", { key: "skip", className: "pr-btn pr-btn-ghost", onClick: function () { props.onSkip(it); } }, "不要"),
      ];
      if (!isSkill && !it.installed) {
        acts.push(
          h("button", {
            key: "inst",
            className: "pr-btn",
            disabled: props.busy,
            onClick: function () { props.onInstall(it); },
          }, props.busy ? "装…" : "装上"),
        );
      }

      acts.push(
        h("button", {
          key: "ai",
          className: "pr-btn",
          disabled: props.researching,
          title: note ? "重新让 AI 读一遍说明" : "让 AI 读它的说明，写三句中文",
          onClick: function () { props.onResearch(it); },
        }, props.researching ? "研究…" : note ? "重新研究" : "让 AI 研究"),
      );

      return h("article", { className: "pr-card", "data-type": it.type },
        h("div", { className: "pr-card-hd" },
          h("span", { className: "pr-emoji" }, it.emoji || (isSkill ? "🧩" : "🔌")),
          h("div", { className: "pr-card-id" },
            h("div", { className: "pr-name" }, it.name),
            h("div", { className: "pr-kicker" }, (isSkill ? "技能" : "插件") + (it.version ? " · v" + it.version : "")),
          ),
          h(Advice, { advice: a }),
        ),
        it.zh && it.zh.length && it.english !== false
          ? h("div", {},
            h("p", { className: "pr-line" }, "中文关键词：" + it.zh.join(" · ")),
            h("p", { className: "pr-hint" }, "原文：" + String(it.line || "").slice(0, 110)))
          : h("p", { className: "pr-line" }, it.line),
        kw,
        pendingBox,
        noteBox,
        h("div", { className: "pr-stats" },
          h("span", { className: "pr-stat" }, h("b", {}, fmtNum(keyStat)), h("i", {}, isSkill ? "星标" : "月下载")),
          h("span", { className: "pr-stat" }, h("b", {}, ageOf(it.updatedAt)), h("i", {}, "更新")),
          h("span", { className: "pr-stat" }, h("b", {}, isSkill || it.restart === false ? "不用" : "要"), h("i", {}, isSkill ? "生效" : "重启")),
        ),
        more,
        h("div", { className: "pr-acts" }, acts),
      );
    }

    function Section(props) {
      return h("div", { className: "pr-sec" },
        h("span", { className: "pr-sec-t" }, props.title),
        props.count ? h("span", { className: "pr-sec-n" }, props.count) : null,
        h("span", { className: "pr-sec-line" }),
      );
    }

    function Grid(props) {
      if (!props.items.length) return h("div", { className: "pr-empty" }, props.empty || "这一类暂时没东西");
      return h("div", { className: "pr-grid" },
        props.items.map(function (it) {
          return h(Card, {
            key: it.type + ":" + it.name,
            item: it,
            note: props.noteOf ? props.noteOf(it) : null,
            open: props.open === it.name,
            busy: props.busy === it.name,
            researching: props.researching === it.name,
            onSee: props.onSee,
            onWant: props.onWant,
            onSkip: props.onSkip,
            onInstall: props.onInstall,
            onResearch: props.onResearch,
          });
        }),
      );
    }

    // ---------------------------------------------------------------- 三个页签

    // 这一页真正摆出来的卡片 = 雷达页看到的那几张。
    // 抽成函数是为了让「一起研究」照着同一份清单来，不然会研究到屏外的条目，用户看着卡片毫无变化。
    function pickCards(feed, state, bucket) {
      var hidden = {};
      ((state && state.skipped) || []).forEach(function (n) { hidden[n] = 1; });
      ((state && state.wanted) || []).forEach(function (n) { hidden[n] = 1; });
      var keep = function (x) { return !hidden[x.name] && !x.installed; };
      var skillsAll = (feed && feed.skills) || [];
      var pluginsAll = (feed && feed.plugins) || [];
      var bk = (feed && feed.buckets && feed.buckets[bucket]) || { skills: [], plugins: [] };

      // 你填的关心词 + 点过「想要」的东西的同类词，都只在本机算，不花钱
      var words = ((state && state.tags) || []).map(function (t) { return String(t).toLowerCase().trim(); }).filter(Boolean);
      var wanted = (state && state.wanted) || [];
      var likeWords = {};
      skillsAll.concat(pluginsAll).forEach(function (it) {
        if (wanted.indexOf(it.name) < 0) return;
        (it.zh || []).forEach(function (z) { likeWords[String(z).toLowerCase()] = 1; });
      });
      var likeCount = Object.keys(likeWords).length;
      var score = function (it) {
        var hay = [it.name, it.line, (it.zh || []).join(" "), it.en || ""].join(" ").toLowerCase();
        var s = 0;
        words.forEach(function (w) { if (hay.indexOf(w) >= 0) s += 4; });
        (it.zh || []).forEach(function (z) { if (likeWords[String(z).toLowerCase()]) s += 1; });
        return s;
      };
      var rank = function (arr) {
        if (!words.length && !likeCount) return arr;
        return arr.slice().sort(function (a, b) { return score(b) - score(a); });
      };
      // 这一档排前面的优先，不够就按同一口味从整份清单往下补，再统一剔掉不要/想要/已装
      var pick = function (list, keys, n) {
        var map = {};
        list.forEach(function (x) { map[x.name] = x; });
        var out = [];
        var seen = {};
        keys.forEach(function (k) {
          var it = map[k];
          if (it && !seen[it.name]) { seen[it.name] = 1; out.push(it); }
        });
        list.forEach(function (x) {
          if (!seen[x.name]) { seen[x.name] = 1; out.push(x); }
        });
        return rank(out.filter(keep)).slice(0, n);
      };
      var hitCount = words.filter(function (w) {
        return skillsAll.concat(pluginsAll).some(function (it) {
          return [it.name, it.line, (it.zh || []).join(" "), it.en || ""].join(" ").toLowerCase().indexOf(w) >= 0;
        });
      }).length;
      return {
        skills: pick(skillsAll, bk.skills || [], 6),
        plugins: pick(pluginsAll, bk.plugins || [], 6),
        words: words, likeCount: likeCount, hitCount: hitCount,
      };
    }

    // 「一起研究」的研究清单：技能和插件交替取。
    // 如果只是顺序取前 6 条，永远都是技能（技能名单排在前面），插件那一栏永远轮不到。
    function researchPool(feed, state, bucket, hasNote, max) {
      var n = max || 6;
      var picked = pickCards(feed, state, bucket);
      var all = [];
      for (var k = 0; k < n; k++) {
        if (picked.skills[k]) all.push(picked.skills[k]);
        if (picked.plugins[k]) all.push(picked.plugins[k]);
      }
      return all.filter(function (x) { return !hasNote(x); }).slice(0, n);
    }

    function RadarTab(v) {
      var feed = v.feed;
      var picked = pickCards(feed, v.state, v.bucket);
      var skills = picked.skills;
      var plugins = picked.plugins;
      var words = picked.words;
      var likeCount = picked.likeCount;
      var hitCount = picked.hitCount;

      var hint;
      if (!words.length) hint = "没填关心也没关系，先按全网数据看";
      else if (!hitCount) hint = "「" + words.join("·") + "」暂时没命中，去「我关心的」点「AI 帮我翻成关键词」";
      else hint = "按你关心的「" + words.join("·") + "」排的" + (likeCount ? " · 也参考了你想要的" : "");

      return h("div", null,
        h("div", { className: "pr-chips", style: { marginBottom: "2px" } },
          [["fresh", "最新的"], ["hot", "最多人用的"], ["fun", "好玩的"]].map(function (b) {
            return h("button", {
              key: b[0], className: "pr-chip", "data-on": v.bucket === b[0] ? "1" : "0",
              onClick: function () { v.onBucket(b[0]); },
            }, b[1]);
          }),
          h("span", { className: "pr-hint" }, hint),
          h("button", { className: "pr-btn pr-btn-ghost", onClick: function () { v.onGoFind(); } }, "找不到想要的？去「帮我找」→"),
        ),
        h(Section, { title: "技能", count: "你平时翻不到的那一类" }),
        h(Grid, { items: skills, open: v.open, busy: v.busy, noteOf: v.noteOf, researching: v.researching, onSee: v.onSee, onWant: v.onWant, onSkip: v.onSkip, onInstall: v.onInstall, onResearch: v.onResearch, empty: "这一类暂时没抓到技能，点右上「刷新」再试" }),
        h(Section, { title: "插件", count: "插件市场里也能翻到" }),
        h(Grid, { items: plugins, open: v.open, busy: v.busy, noteOf: v.noteOf, researching: v.researching, onSee: v.onSee, onWant: v.onWant, onSkip: v.onSkip, onInstall: v.onInstall, onResearch: v.onResearch, empty: "这一类暂时没抓到插件，点右上「刷新」再试" }),
      );
    }

    // 「我的口味」：原来「我关心的」那套东西，现在只当排序偏好用，收在「帮我找」页底部。
    function TasteBox(v) {
      var tags = v.state.tags;
      var presets = TAGS_PRESET.filter(function (t) { return tags.indexOf(t) < 0; });
      return h("div", { style: { display: "flex", flexDirection: "column", gap: "8px" } },
        h("div", { className: "pr-hint" }, "这些词只影响「雷达」页的先后顺序，不会产生新结果；搜出来的词想留下，点上面的「记成我的口味」。"),
        h("div", { className: "pr-chips" },
          tags.length
            ? tags.map(function (t) {
              return h("span", { key: t, className: "pr-chip" }, t,
                h("button", { className: "pr-chip-x", title: "不用这类", onClick: function () { v.onRemoveTag(t); } }, "×"));
            })
            : h("span", { className: "pr-hint" }, "还没加任何一类"),
        ),
        h("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap" } },
          h("input", {
            className: "pr-input", style: { flex: "1 1 240px" }, placeholder: "比如：桌宠外观、定时提醒、表格整理", value: v.draft,
            onChange: function (e) { v.onDraft(e.target.value); },
            onKeyDown: function (e) { if (e.key === "Enter") v.onAskTags(v.draft); },
          }),
          h("button", { className: "pr-btn", disabled: v.tagBusy, onClick: function () { v.onAskTags(v.draft); } },
            v.tagBusy ? "翻…" : "AI 帮我翻成关键词"),
          h("button", { className: "pr-btn", onClick: function () { v.onAddTag(v.draft); } }, "原样加上"),
        ),
        presets.length ? h("div", { className: "pr-chips" }, presets.map(function (t) {
          return h("button", { key: t, className: "pr-chip", onClick: function () { v.onAddTag(t); } }, "＋ " + t);
        })) : null,
      );
    }

    // 「帮我找」：一句话 → 真联网找 → 结果卡片。这里不是聊天，它只干「找」这一件事。
    function FindTab(v) {
      var res = v.res;
      var busy = v.busy;
      var items = (res && res.items) || [];
      var keywords = (res && res.keywords) || [];

      var box = h("div", { className: "pr-find" },
        h("div", { className: "pr-find-in" },
          h("input", {
            className: "pr-input pr-find-q", placeholder: "用大白话说：帮我找做小游戏的插件或技能",
            value: v.q,
            onChange: function (e) { v.onQ(e.target.value); },
            onKeyDown: function (e) { if (e.key === "Enter") v.onFind(v.q); },
          }),
          h("button", { className: "pr-btn pr-btn-primary", disabled: busy, onClick: function () { v.onFind(v.q); } },
            busy ? "找…" : "帮我找"),
        ),
        h("div", { className: "pr-hint" }, "它先把这句话翻成搜索词，再去插件商店和 GitHub 上真找一遍；一次一两分钱，等 10～20 秒。"),
      );

      var stateBody = null;
      if (busy) {
        stateBody = h("div", { className: "pr-find-state" },
          h("div", { className: "pr-hint" }, "正在找：先翻成搜索词，再去外面翻…"),
          h("div", { className: "pr-item pr-skel" },
            h("span", { className: "pr-emoji" }, "🔎"),
            h("div", { className: "pr-item-body" },
              h("div", { className: "pr-name" }, "正在翻你的话"),
              h("div", { className: "pr-hint" }, "把「做小游戏」翻成能搜的英文和中文词"))),
          h("div", { className: "pr-item pr-skel" },
            h("span", { className: "pr-emoji" }, "🛰"),
            h("div", { className: "pr-item-body" },
              h("div", { className: "pr-name" }, "正在搜插件商店和 GitHub"),
              h("div", { className: "pr-hint" }, "这一步最慢，别关页面"))),
        );
      } else if (v.err) {
        stateBody = h("div", { className: "pr-find-state" },
          h("div", { className: "pr-band", "data-kind": "warn" }, h("b", {}, "没找成："), v.err),
          h("button", { className: "pr-btn", onClick: function () { v.onFind(v.q); } }, "再试一次"),
          h("div", { className: "pr-hint" }, "模型或网络抽风时会这样；也可以换个说法，或者去「雷达」页按关键词翻。"),
        );
      } else if (res) {
        var head = h("div", { className: "pr-find-sum" },
          h("div", { className: "pr-find-sum-t" }, res.summary || ""),
          h("div", { className: "pr-chips" },
            h("span", { className: "pr-hint" }, "按这些词找的"),
            keywords.map(function (k) { return h("span", { key: "kw" + k, className: "pr-chip" }, k); }),
            h("button", { className: "pr-btn pr-btn-ghost", onClick: function () { v.onRemember(keywords); } }, "记成我的口味"),
          ),
          (typeof res.cost === "number" && res.cost > 0)
            ? h("div", { className: "pr-hint" }, "这次花了约 ¥" + res.cost.toFixed(3) + (res.cached ? "（10 分钟内再问同一句不花钱）" : ""))
            : null,
          (res.errors && res.errors.length) ? h("div", { className: "pr-hint" }, "有一路没拿到：" + res.errors.join("；")) : null,
        );

        var rows = items.map(function (it) {
          var isSkill = it.type === "skill";
          var meta = [];
          if (isSkill) { if (it.stars) meta.push(it.stars + " 颗星"); }
          else if (it.downloads) meta.push("这个月 " + fmtNum(it.downloads) + " 人下载");
          if (it.updatedAt) meta.push(ago(it.updatedAt) + "更新");
          var name = it.url
            ? h("a", { className: "pr-name pr-link", href: it.url, target: "_blank", rel: "noreferrer" }, it.name)
            : h("div", { className: "pr-name" }, it.name);
          return h("div", { key: it.type + ":" + it.name, className: "pr-item pr-find-row" },
            h("span", { className: "pr-emoji" }, it.emoji || (isSkill ? "🧩" : "🔌")),
            h("div", { className: "pr-item-body" },
              h("div", { className: "pr-find-name" }, name,
                h("span", { className: "pr-badge" }, isSkill ? "技能" : "插件"),
                it.installed ? h("span", { className: "pr-badge pr-badge-on" }, "已装") : null),
              h("div", { className: "pr-find-why" }, it.why || ""),
              meta.length ? h("div", { className: "pr-hint" }, meta.join(" · ")) : null,
            ),
            it.installed
              ? h("span", { className: "pr-hint" }, "本机已经有了")
              : (isSkill
                ? h("span", { className: "pr-hint" }, "技能要我来放")
                : h("button", {
                  className: "pr-btn pr-btn-primary", disabled: v.installBusy === it.name,
                  onClick: function () { v.onInstall(it); },
                }, v.installBusy === it.name ? "装…" : "装它")),
          );
        });

        var empty = null;
        if (!items.length) {
          empty = h("div", { className: "pr-find-empty" },
            h("div", { className: "pr-empty" }, "这次一个现成的都没找到。"),
            h("div", { className: "pr-hint" }, "三个能马上试的办法："),
            h("div", { className: "pr-hint" }, "① 换个说法再找一次，比如把「小游戏」换成「游戏引擎」「游戏框架」。"),
            h("div", { className: "pr-hint" }, "② 去「雷达」页按关键词翻一遍，那里是全网抓来的全量名单。"),
            h("div", { className: "pr-hint" }, "③ 真要自己做，通用工具也行：Phaser、PixiJS 这种浏览器游戏库，不用装插件。"),
            ((res.general || []).length)
              ? h("div", { className: "pr-hint" }, "另外这几个通用东西可能帮上忙：" + res.general.join("、"))
              : null,
          );
        }

        stateBody = h("div", { className: "pr-find-state" },
          head,
          items.length ? h("div", { className: "pr-find-list" }, rows) : empty,
          ((res.general || []).length && items.length)
            ? h("div", { className: "pr-hint" }, "另外这几个通用东西也能帮上忙（不是插件，不用装）：" + res.general.join("、"))
            : null,
        );
      } else {
        stateBody = h("div", { className: "pr-find-state" },
          h("div", { className: "pr-empty" }, "想找什么，直接用大白话说一句。"),
          h("div", { className: "pr-hint" }, "它只干「找」这一件事：帮你翻插件商店和 GitHub，给你几张能直接装的卡；不能替你装完改配置，也不能替你跑起来。"),
        );
      }

      return h("div", { style: { maxWidth: "820px", display: "flex", flexDirection: "column", gap: "12px" } },
        box,
        stateBody,
        h("div", { style: { display: "flex", flexDirection: "column", gap: "8px" } },
          h("button", { className: "pr-btn pr-btn-ghost", onClick: function () { v.onMore(!v.more); } },
            v.more ? "收起「我的口味」" : "我的口味（只影响雷达页排序）"),
          v.more ? TasteBox(v) : null,
        ),
      );
    }

    function BagTab(v) {
      var wanted = v.state.wanted;
      var all = (v.feed.skills || []).concat(v.feed.plugins || []);
      var map = {};
      all.forEach(function (x) { map[x.name] = x; });
      var info = v.state.wantedInfo || {};
      var reports = v.state.reports || {};
      var items = wanted.map(function (n) {
        return map[n] || info[n] || { name: n, type: "plugin", line: "榜单里暂时没有它（可能已下架），可以直接按名字装" };
      });
      var skipped = v.state.skipped || [];
      var skipRows = skipped.map(function (n) {
        return h("div", { key: "s:" + n, className: "pr-item" },
          h("span", { className: "pr-emoji" }, "🚫"),
          h("div", { className: "pr-item-body" },
            h("div", { className: "pr-name" }, n),
            h("div", { className: "pr-hint" }, "点过「不要」，雷达里不会再出现"),
          ),
          h("button", { className: "pr-btn", onClick: function () { v.onUnskip(n); } }, "放回雷达"),
        );
      });

      // 报告：每条下面的三句结论。有就显示，正在出的显示骨架，失败可重试。
      var repBusy = v.report && v.report.running;
      function reportBox(name) {
        var rep = reports[name];
        if (rep && rep.verdict) {
          var cls = rep.verdict === "worth" ? "pr-rep-worth" : rep.verdict === "no" ? "pr-rep-no" : "pr-rep-wait";
          return h("div", { className: "pr-rep " + cls },
            h("div", { className: "pr-rep-head" },
              h("span", { className: "pr-rep-verdict" }, rep.verdictText || "可以等等"),
              rep.what ? h("span", { className: "pr-rep-what" }, rep.what) : null),
            rep.evidence ? h("div", { className: "pr-rep-line" }, "真实证据：" + rep.evidence) : null,
            rep.diff ? h("div", { className: "pr-rep-line" }, "跟本机比：" + rep.diff) : null,
            rep.dup && rep.dup.length ? h("div", { className: "pr-rep-dup" }, "可能重复：" + rep.dup.join("、")) : null);
        }
        if (repBusy && v.report.current === name) {
          return h("div", { className: "pr-rep pr-rep-pending" },
            h("div", { className: "pr-rep-head" }, h("span", { className: "pr-rep-verdict" }, "正在分析…")),
            h("div", { className: "pr-rep-line" }, "在查它的资料、再跟本机已装的比一遍，一条十几秒"));
        }
        if (v.reportErr) {
          return h("div", { className: "pr-rep pr-rep-pending" },
            h("div", { className: "pr-rep-line" }, v.reportErr),
            h("button", { className: "pr-btn", style: { alignSelf: "flex-start", marginTop: "4px" }, onClick: function () { v.onBagReport(false); } }, "重试"));
        }
        return null;
      }

      // 顶部：生成报告按钮 + 进度
      var repNote = null;
      if (repBusy) {
        repNote = h("span", { className: "pr-hint pr-rep-progress" },
          "正在出报告 " + (v.report.done || 0) + "/" + (v.report.total || items.length) +
          (v.report.current ? "：" + v.report.current : "…") + "，别关这个页");
      } else if (Object.keys(reports).length) {
        var worth = wanted.filter(function (n) { return reports[n] && reports[n].verdict === "worth"; }).length;
        repNote = h("span", { className: "pr-hint" }, "已出 " + Object.keys(reports).length + " 条结论 · 其中 " + worth + " 条值得装 · 结果存在本地，刷新不会丢");
      }
      var repBar = h("div", { className: "pr-chips", style: { flexWrap: "wrap" } },
        h("button", {
          className: "pr-btn pr-btn-primary",
          disabled: repBusy || !items.length,
          title: "逐条查资料，再跟本机已装的比一遍，结论直接写在每条下面",
          onClick: function () { v.onBagReport(false); },
        }, repBusy ? "生成中 " + (v.report.done || 0) + "/" + (v.report.total || items.length) : "生成报告"),
        items.length && !repBusy
          ? h("button", { className: "pr-btn pr-btn-ghost", onClick: function () { v.onBagReport(true); } }, "重新出全部")
          : null,
        h("span", { className: "pr-grow" }),
        repNote);

      // 一个仓库里多个技能：列出来点一个装，不自己猜
      var pickBox = v.skillPick && v.skillPick.choices && v.skillPick.choices.length
        ? h("div", { className: "pr-pick" },
          h("div", { className: "pr-pick-t" }, "这个仓库里有 " + v.skillPick.choices.length + " 个技能，装哪个？"),
          h("div", { className: "pr-pick-row" }, v.skillPick.choices.map(function (c) {
            return h("button", {
              key: "pk:" + c.name, className: "pr-btn",
              onClick: function () { v.onInstall(v.skillPick.main, c.dir || c.name); v.onPickDone(); },
            }, c.name);
          })),
          h("button", { className: "pr-btn pr-btn-ghost", onClick: function () { v.onPickDone(); } }, "先不装"))
        : null;

      if (!items.length && !skipped.length) return h("div", { className: "pr-empty" }, "收藏夹是空的。在「雷达」里点「想要」，会进这里等着装。");
      return h("div", { style: { display: "flex", flexDirection: "column", gap: "8px", maxWidth: "760px" } },
        h("div", { className: "pr-hint" }, "这里是你收藏了、还没装的。装上以后会自动移出；想看已经装了什么，去「我装的」。"),
        repBar,
        v.lastInstall && v.lastInstall.verify
          ? h("div", { className: "pr-verify" },
            h("div", {}, h("b", {}, "装好了：" + (v.lastInstall.name || "") + " — ")),
            h("div", {}, "① 什么时候能用：" + v.lastInstall.verify.when),
            h("div", {}, "② 去哪看：" + v.lastInstall.verify.where),
            h("div", {}, "③ 怎么确认真生效：" + v.lastInstall.verify.how))
          : null,
        pickBox,
        items.map(function (it) {
          var done = !!it.installed;
          return h("div", { key: it.name, className: "pr-item pr-item-col" },
            h("div", { className: "pr-item-main" },
              h("span", { className: "pr-emoji" }, it.emoji || "🔌"),
              h("div", { className: "pr-item-body" },
                h("div", { className: "pr-name" }, it.name),
                h("div", { className: "pr-hint" }, (it.type === "skill" ? "技能" : "插件") + " · " + it.line),
              ),
              done ? h("span", { className: "pr-badge" }, "已装") : null,
              h("button", { className: "pr-btn pr-btn-primary", disabled: done || v.busy === it.name, onClick: function () { v.onInstall(it); } },
                done ? "装上了" : v.busy === it.name ? (it.type === "skill" ? "装…" : "装…") : (it.type === "skill" ? "装上（当轮能用）" : "装上")),
              h("button", { className: "pr-btn pr-btn-ghost", onClick: function () { v.onSkip(it); } }, "移出"),
            ),
            reportBox(it.name),
          );
        }),
        skipped.length
          ? h(Section, { title: "你说过不要的", count: skipped.length + " 条 · 不会再出现在雷达里" })
          : null,
        skipped.length ? h("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } }, skipRows) : null,
      );
    }

    function InstalledTab(v) {
      var d = v.installed;
      var plugins = (d && d.plugins) || [];
      var skills = (d && d.skills) || [];
      var head = h("div", { className: "pr-chips", style: { flexWrap: "wrap" } },
        h("span", { className: "pr-hint" }, d
          ? "本机现在装着 " + plugins.length + " 个插件 · " + skills.length + " 个技能"
          : (v.installedLoad === "loading" ? "正在读本机装了什么…" : "还没读到")),
        h("span", { className: "pr-grow" }),
        h("button", { className: "pr-btn", disabled: v.installedLoad === "loading", onClick: function () { v.onInstalledRefresh(); } },
          v.installedLoad === "loading" ? "读…" : "重新读"),
      );
      var row = function (it, kind) {
        return h("div", { key: kind + ":" + it.name, className: "pr-item" },
          h("span", { className: "pr-emoji" }, kind === "skill" ? "🧩" : "🔌"),
          h("div", { className: "pr-item-body" },
            h("div", { className: "pr-name" }, it.name + (it.version ? "  v" + it.version : "")),
            h("div", { className: "pr-hint" }, it.desc || (kind === "skill" ? "技能说明没写全" : "没写说明")),
          ),
          h("span", { className: "pr-hint" }, kind === "skill" ? "当轮就能用" : "要完全退出再开"),
        );
      };
      return h("div", { style: { display: "flex", flexDirection: "column", gap: "12px", maxWidth: "820px" } },
        head,
        h(Section, { title: "插件", count: "装完要完全退出 DSH 再打开才生效" }),
        plugins.length
          ? h("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } }, plugins.map(function (x) { return row(x, "plugin"); }))
          : h("div", { className: "pr-empty" }, "一个插件都没读到"),
        h(Section, { title: "技能", count: "放在 ~/.agents/skills，当轮就能用" }),
        skills.length
          ? h("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } }, skills.map(function (x) { return row(x, "skill"); }))
          : h("div", { className: "pr-empty" }, "没读到技能（插件自带的技能不在磁盘上，这里看不到）"),
      );
    }

    // ---------------------------------------------------------------- 根

    function RadarView() {
      if (!React || !h) return null;

      var tabState = React.useState("radar");
      var tab = tabState[0], setTab = tabState[1];
      var bucketState = React.useState("fresh");
      var bucket = bucketState[0], setBucket = bucketState[1];
      var feedState = React.useState(null);
      var feed = feedState[0], setFeed = feedState[1];
      var stState = React.useState({ tags: [], wanted: [], skipped: [] });
      var st = stState[0], setSt = stState[1];
      var loadState = React.useState("idle");
      var load = loadState[0], setLoad = loadState[1];
      var errState = React.useState("");
      var err = errState[0], setErr = errState[1];
      var openState = React.useState("");
      var open = openState[0], setOpen = openState[1];
      var busyState = React.useState("");
      var busy = busyState[0], setBusy = busyState[1];
      var draftState = React.useState("");
      var draft = draftState[0], setDraft = draftState[1];
      var toastState = React.useState("");
      var toast = toastState[0], setToast = toastState[1];
      var notesState = React.useState({});
      var notes = notesState[0], setNotes = notesState[1];
      var rsState = React.useState("");
      var researching = rsState[0], setResearching = rsState[1];
      var tagBusyState = React.useState(false);
      var tagBusy = tagBusyState[0], setTagBusy = tagBusyState[1];
      var instState = React.useState(null);
      var installed = instState[0], setInstalled = instState[1];
      var instLoadState = React.useState("");
      var installedLoad = instLoadState[0], setInstalledLoad = instLoadState[1];
      var casesState = React.useState(null);
      var cases = casesState[0], setCases = casesState[1];
      var caseKindState = React.useState("all");
      var caseKind = caseKindState[0], setCaseKind = caseKindState[1];
      var caseRangeState = React.useState("30");
      var caseRange = caseRangeState[0], setCaseRange = caseRangeState[1];
      var caseSrcState = React.useState("dsh");
      var caseSrc = caseSrcState[0], setCaseSrc = caseSrcState[1];
      var caseQState = React.useState("");
      var caseQ = caseQState[0], setCaseQ = caseQState[1];
      // 批量研究的进度：{ i, total, name }。加在最后，别打乱前面 hook 的槽位顺序（测试按顺序取值）
      var batchState = React.useState(null);
      var batch = batchState[0], setBatch = batchState[1];
      // 「更多」里放来源开关（也看同类工具），默认收起。加在最后，别打乱前面 hook 的槽位顺序
      var moreState = React.useState(false);
      var caseMore = moreState[0], setCaseMore = moreState[1];
      // 案例就地聊天：{ url, name, url2, what, why, source, kind, date, messages, sending, error }。加在最后，别打乱前面 hook 的槽位顺序
      var chatState = React.useState(null);
      var chat = chatState[0], setChat = chatState[1];
      var chatDraftState = React.useState("");
      var chatDraft = chatDraftState[0], setChatDraft = chatDraftState[1];
      // 「帮我找」的五个状态。加在最后，别打乱前面 hook 的槽位顺序（测试按顺序取值）
      var findQState = React.useState("");
      var findQ = findQState[0], setFindQ = findQState[1];
      var findBusyState = React.useState(false);
      var findBusy = findBusyState[0], setFindBusy = findBusyState[1];
      var findResState = React.useState(null);
      var findRes = findResState[0], setFindRes = findResState[1];
      var findErrState = React.useState("");
      var findErr = findErrState[0], setFindErr = findErrState[1];
      var findMoreState = React.useState(false);
      var findMore = findMoreState[0], setFindMore = findMoreState[1];
      // 收藏夹报告：{ running, total, done, current } + 出错文字。加在最后，别打乱前面 hook 的槽位顺序
      var reportState = React.useState(null);
      var report = reportState[0], setReport = reportState[1];
      var reportErrState = React.useState("");
      var reportErr = reportErrState[0], setReportErr = reportErrState[1];
      // 案例页翻页：默认第 1 页（最新的在最前面）。加在最后，别打乱前面 hook 的槽位顺序
      var casePageState = React.useState(1);
      var casePage = casePageState[0], setCasePage = casePageState[1];
      // 一个仓库里有多个技能时，列出让他选。加在最后，别打乱前面 hook 的槽位顺序
      var skillPickState = React.useState(null);
      var skillPick = skillPickState[0], setSkillPick = skillPickState[1];
      // 「我聊过的」「累计花费」「只看没看过」「刚装完的验证卡」。加在最后，别打乱前面 hook 的槽位顺序
      var chatsState = React.useState(null);
      var chats = chatsState[0], setChats = chatsState[1];
      var spendState = React.useState(null);
      var spend = spendState[0], setSpend = spendState[1];
      var spendOpenState = React.useState(false);
      var spendOpen = spendOpenState[0], setSpendOpen = spendOpenState[1];
      var unreadOnlyState = React.useState(false);
      var unreadOnly = unreadOnlyState[0], setUnreadOnly = unreadOnlyState[1];
      var lastInstallState = React.useState(null);
      var lastInstall = lastInstallState[0], setLastInstall = lastInstallState[1];
      // 「聊过的」整页：翻页 / 搜索 / 勾选 / 确认弹窗。加在最后，别打乱前面 hook 的槽位顺序
      var chatsPageState = React.useState(1);
      var chatsPage = chatsPageState[0], setChatsPage = chatsPageState[1];
      var chatsQState = React.useState("");
      var chatsQ = chatsQState[0], setChatsQ = chatsQState[1];
      var chatsSelState = React.useState({});
      var chatsSel = chatsSelState[0], setChatsSel = chatsSelState[1];
      var confirmState = React.useState(null);
      var confirmDlg = confirmState[0], setConfirmDlg = confirmState[1];
      var timer = React.useRef(null);
      var researchTimer = React.useRef(null);
      var findTimer = React.useRef(null);
      var alive = React.useRef(true);

      React.useEffect(function () {
        alive.current = true;
        api("/cases").then(function (r) {
          if (alive.current) setCases(r && Array.isArray(r.items) ? r : { items: [] });
        }).catch(function () { if (alive.current) setCases({ items: [], error: 1 }); });
        api("/chats").then(function (r) {
          if (alive.current) setChats(r && Array.isArray(r.items) ? r.items : []);
        }).catch(function () { if (alive.current) setChats([]); });
        api("/spend").then(function (r) {
          if (alive.current) setSpend(r && r.ok ? r : null);
        }).catch(function () { if (alive.current) setSpend(null); });
        return function () { alive.current = false; if (timer.current) clearTimeout(timer.current); };
      }, []);
      function loadSpend() {
        api("/spend").then(function (r) { if (alive.current && r && r.ok) setSpend(r); }).catch(function () {});
      }

      function say(msg) {
        if (!alive.current) return;
        setToast(msg);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(function () { if (alive.current) setToast(""); }, 3200);
      }

      // ---- 「聊过的」整页：列表 / 勾选 / 删除 ----
      function loadChats() {
        api("/chats").then(function (r) {
          if (alive.current) setChats(r && Array.isArray(r.items) ? r.items : []);
        }).catch(function () { if (alive.current) setChats([]); });
      }
      var selCount = 0;
      Object.keys(chatsSel || {}).forEach(function (k) { if (chatsSel[k]) selCount++; });
      function toggleSel(url) {
        setChatsSel(function (prev) {
          var nx = Object.assign({}, prev || {});
          if (nx[url]) delete nx[url]; else nx[url] = true;
          return nx;
        });
      }
      // 弹确认框：{ title, body, danger, run }。run 返回 Promise，成功后自动关框并刷新列表
      function askConfirm(opt) {
        setConfirmDlg(Object.assign({ busy: false }, opt));
      }
      function runConfirm() {
        if (!confirmDlg || confirmDlg.busy) return;
        var job = confirmDlg.run;
        setConfirmDlg(Object.assign({}, confirmDlg, { busy: true }));
        Promise.resolve().then(job).then(function (msg) {
          if (!alive.current) return;
          setConfirmDlg(null);
          setChatsSel({});
          loadChats();
          if (msg) say(msg);
        }).catch(function (e) {
          if (!alive.current) return;
          setConfirmDlg(Object.assign({}, confirmDlg, { busy: false, error: (e && e.message) || "没删成，再点一次" }));
        });
      }
      function delChats(urls, all) {
        var list = (urls || []).filter(Boolean);
        if (all !== true && !list.length) return say("没勾选，一条都没删");
        askConfirm({
          title: all === true ? "清空全部聊天记录？" : list.length > 1 ? "删掉这 " + list.length + " 条聊天？" : "删掉这条聊天？",
          body: all === true
            ? "所有案例的聊天内容都会清掉，删了恢复不了。案例本身还在「案例」页。"
            : "聊天内容会清掉，删了恢复不了。案例本身还在「案例」页。",
          danger: true,
          label: all === true ? "全删掉" : "删掉",
          run: function () {
            return api("/case-chat", all === true ? { all: true } : { urls: list }, "DELETE")
              .then(function (r) {
                if (!r || !r.ok) throw new Error((r && r.error) || "没删成");
                return "删掉了 " + (r.removed || 0) + " 条" + (r.left ? "，还剩 " + r.left + " 条" : "，清空了");
              });
          },
        });
      }

      function loadAll(force, justInstalled) {
        setLoad("loading");
        var p = force ? api("/feed?force=1") : api("/feed");
        return Promise.all([api("/state").catch(function () { return null; }), p])
          .then(function (res) {
            if (!alive.current) return;
            var s = res[0];
            // reports/readCases 必须一起读回来：只读四个字段的话，切页签重挂载后已出的报告会显示成空
            if (s) setSt({
              tags: s.tags || [],
              wanted: s.wanted || [],
              wantedInfo: s.wantedInfo || {},
              skipped: s.skipped || [],
              reports: s.reports || {},
              readCases: s.readCases || {},
            });
            var f = res[1];
            // 刚装完的那条先把「已装」标上，不用等下一轮刷新
            if (f && justInstalled) {
              (f.skills || []).concat(f.plugins || []).forEach(function (x) { if (x.name === justInstalled) x.installed = true; });
            }
            setFeed(f);
            setNotes((f && f.notes) || {});
            setErr("");
            setLoad("done");
            if (force) say("刷新完了：" + ((res[1].skills || []).length + (res[1].plugins || []).length) + " 条");
          })
          .catch(function (e) {
            if (!alive.current) return;
            setFeed(demoFeed());
            setErr(e && e.message ? e.message : String(e));
            setLoad("demo");
            if (force) say("刷新失败，先看样例");
          });
      }

      React.useEffect(function () { loadAll(false); }, []);

      function loadInstalled() {
        setInstalledLoad("loading");
        api("/installed")
          .then(function (r) { if (!alive.current) return; setInstalled(r); setInstalledLoad("done"); })
          .catch(function () { if (!alive.current) return; setInstalledLoad("error"); });
      }

      React.useEffect(function () { loadInstalled(); }, []);

      function saveState(patch) {
        setSt(Object.assign({}, st, patch));
        api("/state", patch).catch(function () { /* 存不上不影响用 */ });
      }

      // 看过 = 点开原文或聊过；只认这两种，不按滚动/悬浮算，否则划一遍全变暗
      function markRead(u) {
        if (!u) return;
        var cur = st.readCases || {};
        if (cur[u]) return;
        var next = Object.assign({}, cur);
        next[u] = Date.now();
        saveState({ readCases: next });
      }

      // ---------------------------------------------------------------- 收藏夹一键出报告
      var bagTimer = React.useRef(null);
      function stopBagTimer() {
        if (bagTimer.current) { clearInterval(bagTimer.current); bagTimer.current = null; }
      }
      React.useEffect(function () { return function () { stopBagTimer(); }; }, []);

      function onBagReport(force) {
        if (report && report.running) return say("还在出报告，等它跑完");
        var total = (st.wanted || []).length;
        if (!total) return say("收藏夹是空的，先去「雷达」里点几条「想要」");
        setReportErr("");
        setReport({ running: true, total: total, done: 0, current: "" });
        say("开始出报告，共 " + total + " 条，几十秒；别关这个页");
        stopBagTimer();
        // POST 要等全部跑完才返回，所以同时问一次进度，让按钮上的数字动起来
        bagTimer.current = setInterval(function () {
          api("/bag-progress").then(function (p) {
            if (!alive.current || !p || !p.running) return;
            setReport({ running: true, total: p.total || total, done: p.done || 0, current: p.current || "" });
          }).catch(function () { /* 进度问不到不影响结果 */ });
        }, 1500);
        api("/bag-report", { force: !!force })
          .then(function (r) {
            stopBagTimer();
            if (!alive.current) return;
            if (!r || r.ok === false) {
              setReport(null);
              setReportErr((r && r.message) || "报告没出来，再点一次");
              return;
            }
            setSt(Object.assign({}, st, { reports: r.reports || {} }));
            setReport(null);
            var bad = (r.errors || []).length;
            say(bad
              ? "报告好了，有 " + bad + " 条没成功：" + String(r.errors[0]).slice(0, 40)
              : "报告好了：" + (r.done || 0) + " 条结论已写在各条下面" + (r.cost > 0 ? " · 这次约 ¥" + r.cost.toFixed(3) : ""));
          })
          .catch(function (e) {
            stopBagTimer();
            if (!alive.current) return;
            setReport(null);
            setReportErr((e && e.message) || "报告没出来，再点一次");
          });
      }

      function noteOf(it) { return notes[noteKey(it)] || null; }

      function onResearch(it) {
        if (!feed || feed.demo) return say("这是样例数据，研究不了");
        // 以前这里是一声不响地 return：只要有一条卡住（模型没回），后面所有点击都像没反应
        if (researching) return say("还在研究「" + researching + "」，等它出来或 65 秒后再点");
        setResearching(it.name);
        if (researchTimer.current) clearTimeout(researchTimer.current);
        researchTimer.current = setTimeout(function () {
          if (!alive.current) return;
          setResearching("");
          say("这条 65 秒还没回，先放过它（可能是网络或模型卡了），再点一次试试");
        }, 65000);
        api("/explain", {
          name: it.name, version: it.version, type: it.type,
          desc: it.desc || "", repo: it.repo || "", fullName: it.fullName || "",
          // 点了就必须真的重跑：以前写成 !noteOf(it)，有旧短评的卡（「最多人用」「好玩」里几乎全有）
          // 会拿缓存原样返回，屏幕上一点变化都没有，看起来就是「点了没反应」
          force: true,
        })
          .then(function (r) {
            if (!alive.current) return;
            if (researchTimer.current) clearTimeout(researchTimer.current);
            setResearching("");
            if (r && r.ok && r.note) {
              var next = Object.assign({}, notes);
              next[r.note.key || noteKey(it)] = r.note;
              setNotes(next);
              say("研究好了：" + it.name);
            } else {
              say((r && r.message) || "没研究出来，再点一次试试");
            }
          })
          .catch(function (e) {
            if (!alive.current) return;
            if (researchTimer.current) clearTimeout(researchTimer.current);
            setResearching("");
            say("研究失败：" + ((e && e.message) || e));
          });
      }
      function onWant(it) {
        if (st.wanted.indexOf(it.name) >= 0) return say("已经在「收藏夹」里了");
        var info = Object.assign({}, st.wantedInfo || {});
        info[it.name] = { name: it.name, type: it.type, version: it.version || "", line: it.line || "" };
        saveState({ wanted: st.wanted.concat([it.name]), wantedInfo: info });
        say("收下了：" + it.name + "，雷达里不再显示");
      }
      function onSkip(it) {
        var wanted = st.wanted.filter(function (n) { return n !== it.name; });
        var skipped = st.skipped.indexOf(it.name) >= 0 ? st.skipped : st.skipped.concat([it.name]);
        saveState({ skipped: skipped, wanted: wanted });
        say("不要了：" + it.name + "，以后刷新也不会再出现");
      }
      function onUnskip(name) {
        var left = st.skipped.filter(function (n) { return n !== name; });
        saveState({ skipped: left });
        say("放回雷达了：" + name);
      }
      function onInstall(it, pick) {
        if (!feed || feed.demo) return say("这是样例数据，装不了");
        setBusy(it.name);
        var body = { name: it.name, version: it.version, type: it.type, repo: it.repo || it.url || "" };
        if (pick) body.pick = pick;
        api("/install", body)
          .then(function (r) {
            if (!alive.current) return;
            setBusy("");
            if (r.ok) {
              say(r.message || (it.type === "skill" ? "装好了，当轮就能用，不用重启" : "装好了，完全退出 DSH 再打开才生效"));
              if (r.verify) setLastInstall({ name: r.skill || it.name, verify: r.verify });
              var left = st.wanted.filter(function (n) { return n !== it.name; });
              if (left.length !== st.wanted.length) saveState({ wanted: left });
              loadAll(false, it.name);
              loadInstalled();
            } else if (r.choices && r.choices.length) {
              // 一个仓库里有多个技能：说清有几个，告诉他下一步怎么做，不自己猜着装
              setSkillPick({ name: it.name, main: it, choices: r.choices });
              say("这个仓库里有 " + r.choices.length + " 个技能，点一个装");
            }
            else say((r.message || "没装上") + (r.manual ? " · 命令：" + r.manual : ""));
          })
          .catch(function (e) {
            if (!alive.current) return;
            setBusy("");
            say("装失败：" + (e && e.message ? e.message : e));
          });
      }
      function onAddTag(v) {
        var t = String(v || "").trim();
        if (!t) return;
        if (st.tags.indexOf(t) < 0) saveState({ tags: st.tags.concat([t]) });
        setDraft("");
        say("加上了：" + t);
      }
      function onRemoveTag(t) { saveState({ tags: st.tags.filter(function (x) { return x !== t; }) }); }

      function onAskTags(text) {
        var t = String(text || "").trim();
        if (!t) return say("先写一句你想用它做什么");
        if (tagBusy) return;
        setTagBusy(true);
        api("/tags", { text: t })
          .then(function (r) {
            if (!alive.current) return;
            setTagBusy(false);
            if (!r || !r.ok) return say("没翻出来：" + ((r && r.message) || "再试一次"));
            var add = (r.tags || []).filter(function (x) { return st.tags.indexOf(x) < 0; });
            if (add.length) saveState({ tags: st.tags.concat(add) });
            var money = typeof r.cost === "number" && r.cost > 0 ? "（这次约 ¥" + r.cost.toFixed(3) + "）" : "";
            say(add.length ? "我理解成：" + add.join(" · ") + money + "，不想要就点 × 删掉" : "翻出来的词你都有了" + money);
          })
          .catch(function (e) {
            if (!alive.current) return;
            setTagBusy(false);
            say("翻失败：" + ((e && e.message) || e));
          });
      }

      // 「帮我找」：把一句话交给宿主，它真去插件商店和 GitHub 搜。
      function onFind(text) {
        var q = String(text || "").trim();
        if (!q) return say("先说一句你想找什么");
        if (findBusy) return;
        setFindBusy(true);
        setFindErr("");
        setFindRes(null);
        if (findTimer.current) clearTimeout(findTimer.current);
        findTimer.current = setTimeout(function () {
          if (!alive.current) return;
          setFindBusy(false);
          setFindErr("90 秒还没回来，先停了（可能是网络或模型卡住）。再点一次试试。");
        }, 90000);
        api("/find", { q: q })
          .then(function (r) {
            if (!alive.current) return;
            if (findTimer.current) clearTimeout(findTimer.current);
            setFindBusy(false);
            if (!r || !r.ok) { setFindErr((r && r.message) || "没找成，再试一次"); return; }
            setFindRes(r);
            if (!r.items || !r.items.length) say("这次没找到现成的，看看下面的替代办法");
            else say("找到 " + r.items.length + " 个");
          })
          .catch(function (e) {
            if (!alive.current) return;
            if (findTimer.current) clearTimeout(findTimer.current);
            setFindBusy(false);
            setFindErr((e && e.message) || String(e));
          });
      }

      // 搜出来的词顺手记成口味：以后雷达页的排序也按它来，不用再填一遍。
      function onRemember(words) {
        var add = (words || []).filter(function (x) { return st.tags.indexOf(x) < 0; }).slice(0, 4);
        if (!add.length) return say("这些词已经在你的口味里了");
        saveState({ tags: st.tags.concat(add) });
        say("记下了：" + add.join(" · ") + "，雷达页会按这个排");
      }

      // 案例的类型只有三种；老数据没有 kind 就按 tag 兜底，跟 case-radar.mjs 的规则保持一致
      function kindOfCase(it) {
        var k = String((it && it.kind) || "").trim();
        if (k === "成品" || k === "想法" || k === "故事") return k;
        var tag = String((it && it.tag) || "");
        if (tag.indexOf("玩法") >= 0 || tag.indexOf("脑洞") >= 0) return "想法";
        if (tag.indexOf("踩坑") >= 0) return "故事";
        return "成品";
      }

      // 案例的日期：解析成毫秒，差 0 表示没有/认不出
      function dateOfCase(it) {
        var t = Date.parse(String((it && it.date) || ""));
        return t ? t : 0;
      }

      function shortDate(d) {
        var t = Date.parse(String(d || ""));
        if (!t) return "日期未知";
        var x = new Date(t);
        return (x.getMonth() + 1) + " 月 " + x.getDate() + " 日";
      }

      // 周刊目录的小标题：今天 / 昨天 / 具体日期 + 周几
      function dayLabel(it) {
        var t = dateOfCase(it);
        if (!t) return "日期未知";
        var d = new Date(t);
        var now = new Date();
        // 案例日期是 ISO 日期串（按 UTC 解析），这里也统一用 UTC 日历，避免凌晨时区差一天
        var d0 = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
        var d1 = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
        var diff = Math.round((d0 - d1) / 864e5);
        var md = (d.getUTCMonth() + 1) + " 月 " + d.getUTCDate() + " 日";
        if (diff === 0) return "今天 · " + md;
        if (diff === 1) return "昨天 · " + md;
        return md + " · 周" + "日一二三四五六".charAt(d.getUTCDay());
      }

      function casesBody() {
        var data = cases || { items: [] };
        var now = Date.now();
        var days = caseRange === "all" ? 0 : Number(caseRange);
        var q = caseQ.trim().toLowerCase();
        var list = (data.items || []).filter(function (it) {
          if (caseKind !== "all" && kindOfCase(it) !== caseKind) return false;
          if (caseSrc === "dsh" && /workbuddy/i.test(String(it.source || ""))) return false;
          if (days) {
            var t = dateOfCase(it);
            // 没日期的不能算进「近 N 天」——否则这个筛选等于没筛
            if (!t || now - t > days * 864e5) return false;
          }
          if (q) {
            var hay = [it.name, it.what, it.why, it.tag, it.source].join(" ").toLowerCase();
            if (hay.indexOf(q) < 0) return false;
          }
          return true;
        }).sort(function (a, b) { return dateOfCase(b) - dateOfCase(a); });

        // 时间筛选开着时，有多少条因为没日期被挡在外面（要明说，不能悄悄吞掉）
        var hiddenByDate = 0;
        if (days) {
          (data.items || []).forEach(function (it) {
            if (caseKind !== "all" && kindOfCase(it) !== caseKind) return;
            if (caseSrc === "dsh" && /workbuddy/i.test(String(it.source || ""))) return;
            if (!dateOfCase(it)) hiddenByDate++;
          });
        }

        function openCase(u) {
          try { window.open(u, "_blank"); } catch (e) { /* 弹不出就算了 */ }
          markRead(u);
        }

        // 「聊聊这个」：就地开右侧面板，必须挡住冒泡，否则会顺带打开原文
        function chatBtn(it) {
          return h("button", {
            className: "pr-chat-btn", title: "就地聊这条案例",
            onClick: function (e) { if (e && e.stopPropagation) e.stopPropagation(); openChat(it); },
          }, "聊聊这个")
        }

        // 案例里能装的东西：只认 GitHub / npm 这种真能装回来的来源，别猜。
        // 能装 → 插件或技能（进收藏夹）；装不了（纯演示页/文章）→ 成品，只给「我也做一个」。
        function installUrl(it) {
          var s = [it.url, it.url2].filter(Boolean).join(" ");
          var m = String(s).match(/github\.com\/([^/\s]+)\/([^/#?\s]+)/i);
          if (m) return { kind: "github", repo: m[1] + "/" + m[2].replace(/\.git$/, "") };
          var n = String(s).match(/npmjs\.com\/package\/(@[^/\s]+\/[^/\s?#]+|[^/\s?#]+)/i);
          if (n) return { kind: "npm", name: decodeURIComponent(n[1]) };
          return null;
        }
        // 有仓库/包名的一律按「技能或插件」看待；技能还是插件看社区有没有 SKILL.md，
        // 这里不联网猜：能拉到来源就进收藏夹，装的时候宿主会按类型自己判断。
        function caseType(it) {
          var src = installUrl(it);
          if (!src) return "成品";
          if (/skill|技能/i.test([it.name, it.tag, it.what].join(" "))) return "skill";
          return "plugin";
        }
        function wantBtn(it) {
          var src = installUrl(it);
          if (!src) return null; // 成品：不给「要这个」，装不了的东西别塞进收藏夹
          var name = src.kind === "github" ? src.repo : src.name;
          var type = caseType(it);
          var inBag = (st.wanted || []).indexOf(name) >= 0;
          return h("button", {
            className: "pr-chat-btn pr-case-get", "data-on": inBag ? "1" : undefined,
            title: "放进收藏夹，之后能一键装",
            onClick: function (e) {
              if (e && e.stopPropagation) e.stopPropagation();
              if (inBag) return say("已经在「收藏夹」里了");
              var info = Object.assign({}, st.wantedInfo || {});
              info[name] = { name: name, type: type, version: "", line: String(it.what || it.name || "").slice(0, 120) };
              saveState({ wanted: (st.wanted || []).concat([name]), wantedInfo: info });
              say("收下了：" + name + "，去「收藏夹」就能装");
            },
          }, inBag ? "已在收藏夹" : "要这个");
        }
        // 成品才有：把这条案例原样交给 DSH，开个新会话照着做一个。
        function copyBtn(it) {
          if (installUrl(it)) return null;
          return h("button", {
            className: "pr-chat-btn", title: "带上这条案例，让 DSH 帮你做一个类似的",
            onClick: function (e) {
              if (e && e.stopPropagation) e.stopPropagation();
              var brief = "照这个做一个：\n" + it.name + "\n" + (it.what || "") +
                (it.url ? "\n参考原文：" + it.url : "") + "\n（我自己也要一个能用的版本，先说清怎么做再动手）";
              try {
                if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(brief);
              } catch (err) { /* 复制不了就只给面板，不弹窗打扰 */ }
              say("做法说明已复制：粘贴到新会话里发给 DSH，它就照这个做");
              openChat(it);
            },
          }, "我也做一个");
        }
        function caseActs(it) { return [wantBtn(it), copyBtn(it), chatBtn(it)]; }

        // 类型 + 时间合成一排；类型只用颜色点，不再挂重复的小标签
        function kchip(label, cur, set, val) {
          return h("button", {
            className: "pr-chip",
            "data-kind": val === "all" ? undefined : val,
            "data-on": cur === val ? "1" : "0",
            onClick: function () { set(val); },
          }, val === "all" ? null : h("span", { className: "pr-kdot" }), label);
        }

        var bar = h("div", { className: "pr-cases-bar" },
          kchip("全部", caseKind, setCaseKind, "all"),
          kchip("成品", caseKind, setCaseKind, "成品"),
          kchip("想法", caseKind, setCaseKind, "想法"),
          kchip("故事", caseKind, setCaseKind, "故事"),
          h("span", { className: "pr-bar-sep" }),
          kchip("近 7 天", caseRange, setCaseRange, "7"),
          kchip("近 30 天", caseRange, setCaseRange, "30"),
          kchip("全部时间", caseRange, setCaseRange, "all"),
          h("span", { className: "pr-grow" }),
          h("span", { className: "pr-hint" }, "看过 " + readCount + " / 共 " + list.length),
          h("button", {
            className: "pr-chip", "data-on": unreadOnly ? "1" : "0",
            title: "只看没点开过的（点开原文或聊过才算看过）",
            onClick: function () { setUnreadOnly(!unreadOnly); },
          }, "只看没看过"),
          h("button", {
            className: "pr-btn",
            "data-on": caseMore ? "1" : "0",
            onClick: function () { setCaseMore(!caseMore); },
          }, caseMore ? "收起" : "更多"),
          h("input", {
            className: "pr-input",
            value: caseQ,
            placeholder: "搜关键词：视频 / 短剧 / 办公 …",
            onChange: function (e) { setCaseQ(e.target.value); },
          }));

        var morePanel = caseMore ? h("div", { className: "pr-more-panel" },
          h("button", {
            className: "pr-chip",
            "data-on": caseSrc === "all" ? "1" : "0",
            onClick: function () { setCaseSrc(caseSrc === "all" ? "dsh" : "all"); },
          }, "也看同类工具"),
          h("span", { className: "pr-hint" }, "打开后会多出 WorkBuddy 这类同类产品里用 DSH 的案例；默认只看 DSH 自己的。")) : null;

        // 翻页：每页 20 条（已在上面按日期倒序，最新的在最前面）。只切渲染，不动数据。
        var readCases = st.readCases || {};
        var readCount = list.filter(function (it) { return readCases[it.url]; }).length;
        // 「只看没看过」：只在开关打开时过滤，默认关；收藏/日期/搜索照旧
        var shown = unreadOnly ? list.filter(function (it) { return !readCases[it.url]; }) : list;

        var PAGE = 20;
        var pageCount = Math.max(1, Math.ceil(shown.length / PAGE));
        // 筛选一变、条数变少时页码可能越界，这里夹一下，不去 setState（渲染中改状态会打架）
        var page = Math.min(Math.max(1, Number(casePage) || 1), pageCount);
        var pageItems = shown.slice((page - 1) * PAGE, page * PAGE);
        var pager = shown.length > PAGE ? h("div", { className: "pr-pager" },
          h("button", {
            className: "pr-btn", disabled: page <= 1,
            onClick: function (e) { if (e && e.stopPropagation) e.stopPropagation(); setCasePage(page - 1); },
          }, "上一页"),
          h("span", { className: "pr-pager-n" }, "第 " + page + " / 共 " + pageCount + " 页（" + list.length + " 条，最新在前）"),
          h("button", {
            className: "pr-btn", disabled: page >= pageCount,
            onClick: function (e) { if (e && e.stopPropagation) e.stopPropagation(); setCasePage(page + 1); },
          }, "下一页")) : null;

        // 成品：最多 4 张大卡横排，顶部一条类型色条
        var bigs = [], dirItems = [];
        pageItems.forEach(function (it) {
          if (kindOfCase(it) === "成品" && bigs.length < 4) bigs.push(it);
          else dirItems.push(it);
        });

        var bigCards = bigs.map(function (it, i) {
          return h("article", {
            key: "b" + i, className: "pr-big", "data-kind": "成品", "data-read": readCases[it.url] ? "1" : "0",
            title: "打开原文",
            onClick: function () { openCase(it.url); },
          },
            h("div", { className: "pr-big-name" }, it.name),
            it.what ? h("div", { className: "pr-big-what" }, it.what) : null,
            h("div", { className: "pr-big-meta" },
              h("span", {}, [shortDate(it.date), it.source].filter(Boolean).join(" · ")),
              h("span", { className: "pr-big-go" }, "打开原文 →")),
            h("div", { className: "pr-big-foot" }, caseActs(it)));
        });

        // 想法 + 故事（以及第 5 个往后的成品）：周刊目录，按日期分组
        var groups = [], byKey = {};
        dirItems.forEach(function (it) {
          var k = dateOfCase(it) ? String(it.date).slice(0, 10) : "";
          if (!byKey[k]) { byKey[k] = { key: k, label: dayLabel(it), items: [] }; groups.push(byKey[k]); }
          byKey[k].items.push(it);
        });

        var dirBlocks = groups.map(function (g, gi) {
          return h("div", { key: "g" + gi, className: "pr-dir-group" },
            h("div", { className: "pr-dir-day" },
              h("span", {}, g.label),
              h("span", { className: "pr-dir-line" })),
            g.items.map(function (it, ri) {
              var meta = [String(it.what || "").replace(/。$/, ""), it.tag, it.source].filter(Boolean).join(" · ");
              return h("div", {
                key: "d" + gi + "-" + ri, className: "pr-dir-row", "data-kind": kindOfCase(it),
                "data-read": readCases[it.url] ? "1" : "0",
                title: "打开原文", onClick: function () { openCase(it.url); },
              },
                h("span", { className: "pr-kdot" }),
                h("div", { className: "pr-dir-body" },
                  h("div", { className: "pr-dir-t" }, it.name),
                  meta ? h("div", { className: "pr-dir-s" }, meta) : null),
                caseActs(it),
                h("span", { className: "pr-dir-x" }, "打开原文"));
            }));
        });

        var chats_, chatBlock = null;
        chats_ = (chats || []).map(function (c) {
          var hit = null;
          for (var i = 0; i < (data.items || []).length; i++) {
            if (data.items[i] && data.items[i].url === c.url) { hit = data.items[i]; break; }
          }
          return { c: c, it: hit };
        });
        if (chats_.length) {
          chatBlock = h("div", { className: "pr-mychats" },
            h("div", { className: "pr-mychats-t" },
              "我聊过的（" + chats_.length + "）",
              h("span", { className: "pr-hint" }, "点一条接着聊")),
            h("div", { className: "pr-mychats-list" }, chats_.map(function (row, i) {
              var c = row.c;
              var it = row.it || { url: c.url, name: c.url };
              return h("div", {
                key: "mc" + i, className: "pr-mychat", title: "接着聊这条",
                onClick: function () { openChat(it); },
              },
                h("div", { className: "pr-mychat-t" }, it.name || c.url),
                h("div", { className: "pr-mychat-s" }, c.last),
                h("div", { className: "pr-mychat-m" }, ago(c.at) + " · " + c.count + " 句"));
            })));
        }
        var empty = h("div", { className: "pr-empty pr-empty-case" },
          h("div", {}, data.error ? "案例还没读到：先确认 插件周报 出过刊，再点右上「刷新」。" : "这个条件下一条都没有。"),
          data.error ? null : h("button", {
            className: "pr-btn pr-btn-primary",
            onClick: function () { setCaseKind("all"); setCaseRange("all"); setCaseSrc("all"); setCaseQ(""); },
          }, "放宽条件"));

        return h("div", { className: "pr-cases" },
          h("div", { className: "pr-hint" }, "别人拿 DSH 做了什么 · 每周一自动更新；能装的插件请回「雷达」"),
          chatBlock,
          bar,
          morePanel,
          bigs.length ? h("div", { className: "pr-sec" },
            h("span", { className: "pr-sec-t" }, "做出来的东西"),
            h("span", { className: "pr-sec-n" }, bigs.length + " 件"),
            h("span", { className: "pr-sec-line" })) : null,
          bigs.length ? h("div", { className: "pr-bigs" }, bigCards) : null,
          dirItems.length ? h("div", { className: "pr-sec" },
            h("span", { className: "pr-sec-t" }, "周刊目录"),
            h("span", { className: "pr-sec-n" }, dirItems.length + " 条"),
            h("span", { className: "pr-sec-line" })) : null,
          dirBlocks.length ? h("div", { className: "pr-dir" }, dirBlocks) : null,
          shown.length ? null : empty,
          hiddenByDate ? h("div", { className: "pr-hint" }, "另有 " + hiddenByDate + " 条没标发布日期，只在「全部时间」里显示。") : null,
          pager,
          h("div", { className: "pr-hint" }, "共 " + shown.length + " 条" + (pager ? "，这一页 " + pageItems.length + " 条" : "")));
      }

      // ---- 「聊过的」整页：竖向列表，一页 12 条 ----
      function chatsNameOf(c) {
        var items = (cases && cases.items) || [];
        for (var i = 0; i < items.length; i++) {
          if (items[i] && items[i].url === c.url) return items[i];
        }
        return null;
      }

      function ChatsTab() {
        var all = chats || [];
        var q = String(chatsQ || "").trim().toLowerCase();
        var rows = all.map(function (c) {
          var it = chatsNameOf(c);
          return { c: c, it: it, name: (it && it.name) || c.url, last: c.last || "" };
        });
        if (q) {
          rows = rows.filter(function (r) {
            return (r.name + " " + r.last + " " + r.c.url).toLowerCase().indexOf(q) >= 0;
          });
        }
        var PAGE = 12;
        var pageCount = Math.max(1, Math.ceil(rows.length / PAGE));
        var page = Math.min(Math.max(1, Number(chatsPage) || 1), pageCount);
        var pageRows = rows.slice((page - 1) * PAGE, page * PAGE);
        var selUrls = Object.keys(chatsSel || {}).filter(function (k) { return chatsSel[k]; });
        var pageAllSel = pageRows.length > 0 && pageRows.every(function (r) { return chatsSel && chatsSel[r.c.url]; });

        var bar = h("div", { className: "pr-chats-bar" },
          h("input", {
            className: "pr-input", style: { maxWidth: "240px" },
            placeholder: "搜名字或聊天内容", value: chatsQ,
            onChange: function (e) { setChatsQ(e.target.value); setChatsPage(1); },
          }),
          h("span", { className: "pr-hint" }, all.length ? "共 " + all.length + " 条聊过，最新的在最前" : ""),
          h("span", { className: "pr-grow" }),
          pageRows.length ? h("button", {
            className: "pr-btn pr-btn-ghost",
            onClick: function () {
              setChatsSel(function (prev) {
                var nx = Object.assign({}, prev || {});
                pageRows.forEach(function (r) {
                  if (pageAllSel) delete nx[r.c.url]; else nx[r.c.url] = true;
                });
                return nx;
              });
            },
          }, pageAllSel ? "取消这页" : "勾选这页") : null,
          selUrls.length ? h("button", {
            className: "pr-btn pr-btn-danger",
            onClick: function () { delChats(selUrls, false); },
          }, "删掉勾选的 " + selUrls.length + " 条") : null,
          all.length ? h("button", {
            className: "pr-btn pr-btn-danger",
            title: "把全部聊天记录清空",
            onClick: function () { delChats([], true); },
          }, "全部清空") : null);

        var listEl = pageRows.length
          ? h("div", { className: "pr-chats-list" }, pageRows.map(function (r, i) {
            var c = r.c;
            var on = !!(chatsSel && chatsSel[c.url]);
            return h("div", { key: "ch" + i, className: "pr-chats-row", "data-on": on ? "1" : "0" },
              h("input", {
                type: "checkbox", className: "pr-chats-ck", checked: on,
                onClick: function (e) { if (e && e.stopPropagation) e.stopPropagation(); toggleSel(c.url); },
              }),
              h("div", { className: "pr-chats-body", title: "点开接着聊", onClick: function () {
                openChat(r.it || { url: c.url, name: r.name });
              } },
                h("div", { className: "pr-chats-t" }, r.name),
                h("div", { className: "pr-chats-s" }, r.last || "（还没说过话）"),
                h("div", { className: "pr-chats-m" }, ago(c.at) + " · " + c.count + " 句")),
              h("button", {
                className: "pr-chats-del", title: "删掉这条",
                onClick: function (e) { if (e && e.stopPropagation) e.stopPropagation(); delChats([c.url], false); },
              }, "删"));
          }))
          : h("div", { className: "pr-empty pr-empty-case" },
            all.length
              ? "没有匹配的，换个词试试。"
              : "还没聊过任何案例。去「案例」页点一条的「聊这条」，聊完这里就会出现。",
            all.length ? h("button", {
              className: "pr-btn pr-btn-primary", onClick: function () { setChatsQ(""); setChatsPage(1); },
            }, "清掉搜索") : h("button", {
              className: "pr-btn pr-btn-primary", onClick: function () { setTab("cases"); },
            }, "去案例页看看"));

        var pager = rows.length > PAGE ? h("div", { className: "pr-pager" },
          h("button", { className: "pr-btn", disabled: page <= 1, onClick: function () { setChatsPage(page - 1); } }, "上一页"),
          h("span", { className: "pr-pager-n" }, "第 " + page + " / 共 " + pageCount + " 页（" + rows.length + " 条）"),
          h("button", { className: "pr-btn", disabled: page >= pageCount, onClick: function () { setChatsPage(page + 1); } }, "下一页")) : null;

        return h("div", { className: "pr-cases pr-chats" },
          h("div", { className: "pr-hint" }, "你跟 AI 聊过的案例都在这 · 点一条接着聊，勾前面方框可以一次删掉好几条"),
          bar, listEl, pager);
      }

      // ---- 删除确认弹窗：说清楚删什么、删几条 ----
      function confirmModal() {
        if (!confirmDlg) return null;
        return h("div", { className: "pr-confirm-mask", onClick: function () { if (!confirmDlg.busy) setConfirmDlg(null); } },
          h("div", { className: "pr-confirm", onClick: function (e) { if (e && e.stopPropagation) e.stopPropagation(); } },
            h("div", { className: "pr-confirm-t" }, confirmDlg.title || "确定吗？"),
            h("div", { className: "pr-confirm-b" }, confirmDlg.body || ""),
            confirmDlg.error ? h("div", { className: "pr-confirm-err" }, confirmDlg.error) : null,
            h("div", { className: "pr-confirm-act" },
              h("button", { className: "pr-btn", disabled: confirmDlg.busy, onClick: function () { setConfirmDlg(null); } }, "算了"),
              h("button", {
                className: "pr-btn " + (confirmDlg.danger ? "pr-btn-danger" : "pr-btn-primary"),
                disabled: confirmDlg.busy, onClick: runConfirm,
              }, confirmDlg.busy ? "删着…" : (confirmDlg.label || "确定")))));
      }

      function onResearchPage() {
        if (!feed || feed.demo) return say("这是样例数据，研究不了");
        if (researching || batch) return;
        // 只研究「这一页真的摆出来的卡片」：以前从整份清单里取，会研究到屏外的条目，
        // 用户点完看不到任何一张卡变化，等于白花钱。技能/插件交替取，两栏都轮得到。
        var pool = researchPool(feed, st, bucket, noteOf, 6);
        if (!pool.length) return say("这一页的卡片都研究过了，换一档或点「刷新」看看新的");
        var i = 0, done = 0, fail = 0, cost = 0;
        var acc = Object.assign({}, notes);
        setBatch({ i: 0, total: pool.length, name: "" });
        var step = function () {
          if (!alive.current) return;
          if (i >= pool.length) {
            setBatch(null);
            setResearching("");
            say("研究完 " + done + " 条" + (fail ? "，有 " + fail + " 条没读出来" : "") +
              (cost > 0 ? "，这次约 ¥" + (cost >= 0.01 ? cost.toFixed(3) : cost.toFixed(4)) : ""));
            return;
          }
          var it = pool[i++];
          // 每一条都标在卡片上 + 标题栏写进度，用户能看见正在读哪一张
          setBatch({ i: i, total: pool.length, name: it.name });
          setResearching(it.name);
          api("/explain", { name: it.name, version: it.version, type: it.type, desc: it.desc || "", repo: it.repo || "", fullName: it.fullName || "", force: false })
            .then(function (r) {
              if (!alive.current) return;
              if (r && r.ok && r.note) {
                done++;
                if (typeof r.cost === "number") cost += r.cost;
                acc[r.note.key || noteKey(it)] = r.note;
                setNotes(Object.assign({}, acc));
              } else fail++;
              step();
            })
            .catch(function () { if (alive.current) { fail++; step(); } });
        };
        step();
      }

      // ---- 案例就地聊天：右侧窄面板，第一条只给界面提示，不自动调模型 ----
      function openChat(it) {
        markRead(it && it.url);
        var info = {
          url: String(it.url || ""), url2: String(it.url2 || ""), name: String(it.name || ""),
          what: String(it.what || ""), why: String(it.why || ""), source: String(it.source || ""),
          kind: String(it.kind || ""), date: String(it.date || ""),
          messages: [], sending: false, error: "", loading: true, repo: null,
        };
        setChat(info);
        setChatDraft("");
        if (!info.url) {
          setChat(Object.assign({}, info, { loading: false, error: "这条案例没写链接，聊不了" }));
          return;
        }
        api("/case-chat?url=" + encodeURIComponent(info.url)).then(function (r) {
          if (!alive.current) return;
          setChat(function (prev) {
            if (!prev || prev.url !== info.url) return prev;
            return Object.assign({}, prev, { messages: (r && r.messages) || [], loading: false });
          });
        }).catch(function (e) {
          if (!alive.current) return;
          setChat(function (prev) {
            if (!prev || prev.url !== info.url) return prev;
            return Object.assign({}, prev, { loading: false, error: (e && e.message) || "历史没读出来，不影响接着问" });
          });
        });
      }

      function closeChat() {
        setChat(null);
        setChatDraft("");
      }

      function sendChat() {
        var text = String(chatDraft || "").trim();
        if (!chat || !text || chat.sending) return;
        var base = chat;
        var msgs = (base.messages || []).concat([{ role: "user", text: text, at: Date.now() }]);
        setChat(Object.assign({}, base, { messages: msgs, sending: true, error: "" }));
        setChatDraft("");
        api("/case-chat", {
          url: base.url, url2: base.url2, name: base.name, what: base.what, why: base.why,
          source: base.source, kind: base.kind, date: base.date,
          withRepo: !!(base.repo && base.repo.state === "ready"),
          messages: msgs.filter(function (m) { return !m.notice; }).slice(-8).map(function (m) { return { role: m.role, text: m.text }; }),
        }).then(function (r) {
          if (!alive.current) return;
          if (!r || !r.ok) throw new Error((r && r.error) || "没聊成，再点一次");
          setChat(function (prev) {
            if (!prev || prev.url !== base.url) return prev;
            return Object.assign({}, prev, {
              messages: (prev.messages || []).concat([{ role: "assistant", text: r.reply, at: Date.now() }]),
              sending: false, error: "",
            });
          });
        }).catch(function (e) {
          if (!alive.current) return;
          setChat(function (prev) {
            if (!prev || prev.url !== base.url) return prev;
            return Object.assign({}, prev, { sending: false, error: (e && e.message) || "没聊成，再点一次" });
          });
        });
      }

      function chatKey(e) {
        if (!e || e.key !== "Enter" || e.shiftKey) return;
        if (e.preventDefault) e.preventDefault();
        sendChat();
      }

      // 「读代码并给我讲讲」：宿主拉代码 → 自动让模型讲一段（按版本缓存，同一版本不重复花钱）
      function loadRepo() {
        if (!chat || !chat.url) return;
        var u = chat.url;
        var u2 = chat.url2 || "";
        var nm = chat.name || "";
        setChat(function (prev) {
          return prev && prev.url === u ? Object.assign({}, prev, { repo: { state: "loading" }, gist: { state: "loading" } }) : prev;
        });
        var q = "/case-gist?url=" + encodeURIComponent(u) + "&url2=" + encodeURIComponent(u2) + "&name=" + encodeURIComponent(nm);
        api(q).then(function (r) {
          if (!alive.current) return;
          if (!(r && r.ok)) {
            setChat(function (prev) {
              if (!prev || prev.url !== u) return prev;
              return Object.assign({}, prev, { repo: { state: "none", error: (r && r.error) || "没拉到代码" }, gist: null });
            });
            return;
          }
          setChat(function (prev) {
            if (!prev || prev.url !== u) return prev;
            var repo = { state: "ready", files: r.repo.files, bytes: r.repo.bytes, total: r.repo.total, ref: r.repo.ref };
            var msgs = (prev.messages || []).slice();
            var had = msgs.some(function (m) { return m.gist; });
            if (!had && r.gist && r.gist.text) {
              msgs.push({ role: "assistant", gist: true, at: Date.now(), text: r.gist.text });
            }
            if (!had && r.gist && !r.cached) loadSpend();
            return Object.assign({}, prev, {
              repo: repo, messages: msgs, error: "",
              gist: r.gist ? { state: "done", cached: !!r.cached } : { state: "none" },
            });
          });
        }).catch(function (e) {
          if (!alive.current) return;
          setChat(function (prev) {
            return prev && prev.url === u
              ? Object.assign({}, prev, { repo: { state: "none", error: (e && e.message) || "拉代码失败，再点一次" }, gist: null })
              : prev;
          });
        });
      }

      function repoRow() {
        if (!chat) return null;
        var r = chat.repo;
        var cls = "pr-chat-repo" + (r && r.state === "ready" ? " on" : r && r.state === "none" ? " bad" : "");
        var g = chat.gist;
        var label = !r ? "现在只看了说明，没看代码"
          : r.state === "loading" ? (g && g.state === "loading" ? "正在读代码、正在想怎么说…" : "正在读它的代码…")
            : r.state === "ready" ? "已读过它的代码：" + r.files + " 个文件 · " + Math.max(1, Math.round((r.bytes || 0) / 1024)) + " KB"
              + (g && g.cached ? " · 这段讲过，这次没再花钱" : "")
              : (r.error || "没拉到代码");
        var btn = !r || r.state === "none"
          ? h("button", { className: "pr-chat-repo-b", onClick: loadRepo }, r ? "再试一次" : "读代码并给我讲讲")
          : r.state === "ready"
            ? h("button", { className: "pr-chat-repo-b", onClick: function () { setChat(Object.assign({}, chat, { repo: null, gist: null })); } }, "清掉")
            : h("button", { className: "pr-chat-repo-b", disabled: true }, "稍等…");
        return h("div", { className: cls, "data-repo": (r && r.state) || "off" }, h("span", {}, label), btn);
      }

      function chatPanel() {
        if (!chat) return null;
        var msgs = chat.messages || [];
        var rows = msgs.map(function (m, i) {
          return h("div", { key: "m" + i, className: "pr-chat-msg", "data-role": m.role }, m.text);
        });
        if (chat.sending) rows.push(h("div", { key: "thinking", className: "pr-chat-msg pr-chat-thinking", "data-role": "assistant" }, "正在想…"));
        return h("aside", { key: "chat", className: "pr-chat" },
          h("div", { className: "pr-chat-head" },
            h("div", { className: "pr-chat-t", title: chat.name }, chat.name || "这条案例"),
            h("button", { className: "pr-chat-x", title: "关掉", onClick: closeChat }, "×")),
          h("div", { className: "pr-chat-msgs" },
            msgs.length ? null : h("div", { className: "pr-chat-guide" },
              "我们在聊这条案例：" + (chat.name || "这条") + "。你可以问：这跟我有关系吗？值不值得抄？怎么落地？"),
            rows,
            chat.error ? h("div", { className: "pr-chat-err" }, chat.error) : null),
          repoRow(),
          h("div", { className: "pr-chat-foot" },
            h("textarea", {
              className: "pr-chat-input", rows: 2, value: chatDraft,
              placeholder: "问一句…回车发送，Shift+回车换行",
              onChange: function (e) { setChatDraft(e.target.value); },
              onKeyDown: chatKey,
            }),
            h("button", { className: "pr-btn pr-btn-primary", disabled: !!chat.sending, onClick: sendChat },
              chat.sending ? "发送中…" : "发送")));
      }

      var body;
      var common = {
        feed: feed || { skills: [], plugins: [], buckets: {} },
        state: st, bucket: bucket, open: open, busy: busy, draft: draft,
        researching: researching, noteOf: noteOf,
        tagBusy: tagBusy, installed: installed, installedLoad: installedLoad,
        onSee: function (n) { setOpen(open === n ? "" : n); },
        onWant: onWant, onSkip: onSkip, onUnskip: onUnskip, onInstall: onInstall, onResearch: onResearch,
        onBucket: setBucket, onDraft: setDraft, onAddTag: onAddTag, onRemoveTag: onRemoveTag,
        onAskTags: onAskTags, onInstalledRefresh: loadInstalled,
        q: findQ, onQ: setFindQ, busy: findBusy, res: findRes, err: findErr, more: findMore, onMore: setFindMore,
        onFind: onFind, onRemember: onRemember, installBusy: busy, onInstall: onInstall,
        onGoFind: function () { setTab("interest"); },
        report: report, reportErr: reportErr, onBagReport: onBagReport,
        skillPick: skillPick, onPickDone: function () { setSkillPick(null); }, lastInstall: lastInstall,
      };
      if (tab === "cases") body = casesBody();
      else if (tab === "chats") body = ChatsTab();
      else if (tab === "interest") body = FindTab(common);
      else if (tab === "bag") body = BagTab(common);
      else if (tab === "installed") body = InstalledTab(common);
      else body = RadarTab(common);

      var errs = (feed && feed.errors) || [];
      var band = null;
      if (load === "loading" && !feed) {
        band = h("div", { className: "pr-band" }, h("b", {}, "正在抓第一手数据…"), " 大概 10 秒，抓完会存本地，下次打开就是秒开。");
      } else if (load === "demo") {
        band = h("div", { className: "pr-band", "data-kind": "warn" },
          h("b", {}, "现在是样例，不是真数据。"), " 本地服务没连上（" + err + "）。点右上「刷新」再试一次；还不行就是宿主半段没加载，得完全退出 DSH 重开。");
      } else if (feed && feed.demo) {
        band = h("div", { className: "pr-band", "data-kind": "warn" }, h("b", {}, "样例数据"), " 下面这些不是真的，只为了让你看长相。");
      } else if (errs.length) {
        band = h("div", { className: "pr-band" }, h("b", {}, "有源没连上："), errs.slice(0, 2).join("；"));
      }

      var counts = feed ? (feed.skills || []).length + "+" + (feed.plugins || []).length : "–";
      var subtitle = feed
        ? (feed.demo ? "样例" : "共 " + counts + " 条 · 上次更新 " + ago(feed.fetchedAt))
        : "还没抓过";

      var noteList = Object.keys(notes || {}).map(function (k) { return notes[k]; }).filter(Boolean);
      var noteCost = noteList.reduce(function (s, n) { return s + (n && typeof n.cost === "number" ? n.cost : 0); }, 0);
      // 雷达自己花过的钱：研究 / 报告 / 找 / 聊天 四项汇总（不读别的插件，只算自己的账）
      var spendLine = "";
      if (spend && spend.total) {
        var t = spend.total;
        var money = function (v) { return v > 0 ? v.toFixed(2) : "0.00"; };
        spendLine = "雷达累计 ¥" + money(t.all || 0) +
          " · 研究 " + money(t.research) + " / 报告 " + money(t.report) +
          " / 找 " + money(t.find) + " / 聊天 " + money(t.chat);
      } else if (noteList.length) {
        spendLine = "AI 研究 " + noteList.length + " 条" + (noteCost > 0 ? " · 约 ¥" + noteCost.toFixed(2) : "");
      }
      var researchLine = spendLine;
      var spendPanel = null;
      if (spendOpen && spend) {
        var wk = (spend.week || []).slice();
        var peak = wk.reduce(function (m, d) { return Math.max(m, Number(d.sum) || 0); }, 0);
        spendPanel = h("div", { className: "pr-spend" },
          h("div", { className: "pr-hint" },
            "研究 " + ((spend.counts && spend.counts.research) || 0) + " 条 · 报告 " +
            ((spend.counts && spend.counts.report) || 0) + " 条 · 找 " +
            ((spend.counts && spend.counts.find) || 0) + " 次；聊天和读代码都按次记在下面"),
          h("div", { className: "pr-spend-week" }, wk.map(function (d, i) {
            var v = Number(d.sum) || 0;
            var pct = peak > 0 ? Math.max(3, Math.round((v / peak) * 100)) : 0;
            return h("div", { key: "w" + i, className: "pr-spend-bar", title: d.day + " · ¥" + v.toFixed(3) },
              h("span", {}, v > 0 ? v.toFixed(2) : ""),
              h("i", { style: { height: pct + "%" } }),
              h("span", {}, d.day));
          })),
          (spend.detail || []).slice(0, 7).map(function (d, i) {
            return h("div", { key: "d" + i, className: "pr-spend-day" },
              h("span", {}, d.day), h("span", {}, "¥" + (Number(d.sum) || 0).toFixed(3)));
          }),
          h("div", { className: "pr-hint" }, "只有雷达自己发起的模型调用才算在这里；按天记录，最多留 120 天。"));
      }

      return h("div", { className: "pr" },
        h("style", { key: "css" }, CSS),
        h("div", { key: "head", className: "pr-head" },
          h("span", { className: "pr-title" }, "🔭 插件雷达"),
          h("span", { className: "pr-sub" }, subtitle),
          batch
            ? h("span", { key: "bt", className: "pr-sub pr-batch" },
              "研究中 " + batch.i + "/" + batch.total + (batch.name ? "：" + batch.name : "…"))
            : null,
          researchLine
            ? h("button", {
              key: "rc", className: "pr-btn pr-btn-ghost pr-sub", title: "点开看按天明细",
              onClick: function () { setSpendOpen(!spendOpen); if (!spendOpen) loadSpend(); },
            }, researchLine + (spend ? (spendOpen ? " ▴" : " ▾") : ""))
            : null,
          h("span", { className: "pr-grow" }),
          h("button", { className: "pr-btn", disabled: load === "loading", onClick: function () { loadAll(true); } },
            load === "loading" ? "刷新中…" : "刷新"),
        ),
        spendPanel,
        band,
        h("div", { key: "tabs", className: "pr-tabs" },
          h("button", {
            key: "batch", className: "pr-btn",
            disabled: !!researching || !!batch || load === "loading" || !feed || !!feed.demo,
            title: "把这一页摆出来的卡片逐条让 AI 读一遍，已经研究过的跳过",
            onClick: function () { onResearchPage(); },
          }, batch ? "研究中 " + batch.i + "/" + batch.total : "研究本页 6 条"),
          [["radar", "雷达"], ["cases", "案例" + (cases && cases.items && cases.items.length ? "（" + cases.items.length + "）" : "")], ["chats", "聊过的" + (chats && chats.length ? "（" + chats.length + "）" : "")], ["interest", "帮我找"], ["bag", "收藏夹" + (st.wanted.length ? "（" + st.wanted.length + "）" : "")], ["installed", "我装的" + (installed && installed.plugins ? "（" + (installed.plugins.length + installed.skills.length) + "）" : "")]].map(function (t) {
            return h("button", { key: t[0], className: "pr-tab", "data-on": tab === t[0] ? "1" : "0", onClick: function () { setTab(t[0]); } }, t[1]);
          }),
        ),
        h("div", { key: "body", style: { flex: "1 1 auto", minHeight: "0" } }, body),
        chatPanel(),
        confirmModal(),
        toast ? h("div", { key: "toast", className: "pr-toast" }, toast) : null,
      );
    }

    function apply(ctx) {
      ctx.slots.inject("conversation.view", function () {
        return ctx.slots.register(
          { name: "conversation.view", id: "radar-hub", order: 15, label: function () { return "插件雷达"; } },
          RadarView,
        );
      });
    }

    exports.apply = apply;
    exports.inject = ["slots"];
    exports.__pickCards = pickCards; // 只为测试：验证「一起研究」照着页面上那 6 张卡来
    exports.__researchPool = researchPool; // 只为测试：技能/插件要交替进研究清单
    return module.exports;
  },
});
