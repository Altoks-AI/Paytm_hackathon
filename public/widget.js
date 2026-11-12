(function () {
  "use strict";
  var script = document.currentScript || document.querySelector('script[src*="widget.js"][data-key]');
  if (!script || window.__aiChatWidgetLoaded) return;
  window.__aiChatWidgetLoaded = true;
  var KEY = script.getAttribute("data-key");
  if (!KEY) return;
  var API = new URL(script.src, location.href).origin;
  var SKEY = "aiw_session_" + KEY;

  function sessionId() {
    var id = null;
    try { id = localStorage.getItem(SKEY); } catch { /* storage blocked */ }
    if (!id) {
      id = (window.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2)).replace(/[^A-Za-z0-9_-]/g, "");
      try { localStorage.setItem(SKEY, id); } catch { /* storage blocked */ }
    }
    return id;
  }
  var SID = sessionId();

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function inline(s) {
    return s
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<strong>$2</strong>")
      .replace(/(^|\W)_([^_\n]+)_(?=\W|$)/g, "$1<em>$2</em>")
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
      .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>');
  }
  // Escape first, then apply a tiny safe markdown subset.
  function md(text) {
    var lines = esc(text).split("\n"), out = "", list = null;
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i], m = l.match(/^\s*(?:[-*•]|(\d+)[.)])\s+(.*)$/);
      if (m) {
        var t = m[1] ? "ol" : "ul";
        if (list !== t) { if (list) out += "</" + list + ">"; out += "<" + t + ">"; list = t; }
        out += "<li>" + inline(m[2]) + "</li>";
        continue;
      }
      if (list) { out += "</" + list + ">"; list = null; }
      var h = l.match(/^#{1,6}\s+(.*)$/);
      out += h ? "<p><strong>" + inline(h[1]) + "</strong></p>" : l.trim() ? "<p>" + inline(l) + "</p>" : "";
    }
    if (list) out += "</" + list + ">";
    return out;
  }

  function api(path, opts) {
    return fetch(API + path, opts).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) { d.__status = r.status; return d; });
    });
  }

  api("/api/widget/config?key=" + encodeURIComponent(KEY)).then(function (cfg) {
    if (!cfg || !cfg.enabled) return;
    mount(cfg);
  }).catch(function () {});

  function mount(cfg) {
    var color = /^#[0-9a-fA-F]{3,8}$/.test(cfg.color || "") ? cfg.color : "#0f5b48";
    var host = document.createElement("div");
    host.style.cssText = "position:fixed;z-index:2147483000;bottom:0;right:0;";
    document.body.appendChild(host);
    var root = host.attachShadow({ mode: "open" });
    root.innerHTML =
      "<style>" +
      ":host{all:initial}*{box-sizing:border-box;font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}" +
      ".bubble{position:fixed;right:20px;bottom:20px;width:56px;height:56px;border-radius:50%;border:0;cursor:pointer;background:" + color + ";color:#fff;box-shadow:0 6px 24px rgba(0,0,0,.18);display:flex;align-items:center;justify-content:center;transition:transform .15s}" +
      ".bubble:hover{transform:scale(1.06)}" +
      ".panel{position:fixed;right:20px;bottom:88px;width:370px;max-width:calc(100vw - 32px);height:560px;max-height:calc(100vh - 110px);background:#fff;border:1px solid #e4e4e7;border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,.18);display:none;flex-direction:column;overflow:hidden}" +
      ".panel.open{display:flex}" +
      ".head{background:" + color + ";color:#fff;padding:14px 16px;display:flex;align-items:center;justify-content:space-between}" +
      ".head b{font-size:15px}.head small{display:block;opacity:.85;font-size:12px;margin-top:2px}" +
      ".x{background:transparent;border:0;color:#fff;font-size:22px;cursor:pointer;line-height:1}" +
      ".msgs{flex:1;overflow-y:auto;padding:14px;background:#fafafa;display:flex;flex-direction:column;gap:8px}" +
      ".m{max-width:85%;padding:9px 12px;border-radius:14px;font-size:14px;line-height:1.45;color:#18181b;word-wrap:break-word;overflow-wrap:anywhere}" +
      ".m p{margin:0 0 6px}.m p:last-child{margin:0}.m ul,.m ol{margin:4px 0;padding-left:18px}.m code{background:rgba(0,0,0,.06);padding:1px 4px;border-radius:4px;font-size:13px}.m a{color:inherit;text-decoration:underline}" +
      ".bot{background:#fff;border:1px solid #e4e4e7;align-self:flex-start;border-bottom-left-radius:4px}" +
      ".human{background:#ecfdf5;border:1px solid #a7f3d0;align-self:flex-start;border-bottom-left-radius:4px}" +
      ".user{background:" + color + ";color:#fff;align-self:flex-end;border-bottom-right-radius:4px}" +
      ".note{align-self:center;font-size:12px;color:#71717a;text-align:center;padding:2px 8px}" +
      ".typing{align-self:flex-start;color:#a1a1aa;font-size:20px;letter-spacing:2px;padding:0 6px}" +
      "form{display:flex;gap:8px;padding:10px;border-top:1px solid #e4e4e7;background:#fff}" +
      "textarea{flex:1;resize:none;border:1px solid #d4d4d8;border-radius:10px;padding:9px 11px;font-size:14px;height:40px;max-height:110px;outline:none;color:#18181b}" +
      "textarea:focus{border-color:" + color + "}" +
      ".send{border:0;border-radius:10px;background:" + color + ";color:#fff;padding:0 14px;cursor:pointer;font-size:14px;font-weight:600}" +
      ".send:disabled{opacity:.5;cursor:default}" +
      "</style>" +
      '<div class="panel" part="panel"><div class="head"><div><b></b><small>Typically replies instantly</small></div><button class="x" aria-label="Close">&times;</button></div>' +
      '<div class="msgs" role="log" aria-live="polite"></div>' +
      '<form><textarea maxlength="2000" placeholder="Type a message…" rows="1"></textarea><button class="send" type="submit">Send</button></form></div>' +
      '<button class="bubble" aria-label="Open chat"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></button>';

    var panel = root.querySelector(".panel"), msgs = root.querySelector(".msgs"), form = root.querySelector("form");
    var input = root.querySelector("textarea"), send = root.querySelector(".send");
    root.querySelector(".head b").textContent = cfg.agentName || "Assistant";

    var seen = {}, cursor = null, handoff = false, loaded = false, pollTimer = null, busy = false;

    function add(role, content, id) {
      if (id) { if (seen[id]) return; seen[id] = 1; }
      var d = document.createElement("div");
      if (role === "note") { d.className = "note"; d.textContent = content; }
      else { d.className = "m " + (role === "user" ? "user" : role === "human" ? "human" : "bot"); d.innerHTML = md(content); }
      msgs.appendChild(d);
      msgs.scrollTop = msgs.scrollHeight;
    }

    function load() {
      if (loaded) return;
      loaded = true;
      api("/api/widget/messages?key=" + encodeURIComponent(KEY) + "&sessionId=" + encodeURIComponent(SID)).then(function (d) {
        cursor = d.now || new Date().toISOString();
        if (cfg.greeting) add("bot", cfg.greeting);
        (d.messages || []).forEach(function (m) { add(m.role, m.content, m.id); if (m.role === "human") cursor = m.createdAt > cursor ? m.createdAt : cursor; });
        if (d.status === "handoff") handoff = true;
      }).catch(function () { if (cfg.greeting) add("bot", cfg.greeting); });
    }

    function poll() {
      if (!cursor || !panel.classList.contains("open")) return;
      api("/api/widget/messages?key=" + encodeURIComponent(KEY) + "&sessionId=" + encodeURIComponent(SID) + "&after=" + encodeURIComponent(cursor)).then(function (d) {
        (d.messages || []).forEach(function (m) { add("human", m.content, m.id); if (m.createdAt > cursor) cursor = m.createdAt; });
        if (d.status) handoff = d.status === "handoff";
      }).catch(function () {});
    }

    function toggle(open) {
      panel.classList.toggle("open", open);
      if (open) {
        load();
        input.focus();
        if (!pollTimer) pollTimer = setInterval(poll, 5000);
      } else if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    }

    root.querySelector(".bubble").addEventListener("click", function () { toggle(!panel.classList.contains("open")); });
    root.querySelector(".x").addEventListener("click", function () { toggle(false); });
    input.addEventListener("input", function () { input.style.height = "40px"; input.style.height = Math.min(input.scrollHeight, 110) + "px"; });
    input.addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (form.requestSubmit) form.requestSubmit(); else form.dispatchEvent(new Event("submit", { cancelable: true })); } });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var text = input.value.trim().slice(0, 2000);
      if (!text || busy) return;
      busy = true; send.disabled = true;
      input.value = ""; input.style.height = "40px";
      add("user", text);
      var typing = document.createElement("div");
      typing.className = "typing"; typing.textContent = "•••";
      if (!handoff) { msgs.appendChild(typing); msgs.scrollTop = msgs.scrollHeight; }
      api("/api/widget/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: KEY, sessionId: SID, message: text }) })
        .then(function (d) {
          if (d.__status >= 400) { add("note", d.error || "Something went wrong. Please try again."); return; }
          if (d.reply) add("bot", d.reply);
          if (d.handoff && !handoff) add("note", "A team member will join this chat shortly.");
          handoff = !!d.handoff;
        })
        .catch(function () { add("note", "Connection problem. Please try again."); })
        .then(function () { if (typing.parentNode) typing.parentNode.removeChild(typing); busy = false; send.disabled = false; input.focus(); });
    });
  }
})();
