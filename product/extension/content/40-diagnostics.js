(function installDiagnostics(global) {
  "use strict";

  const LV = global.LongView;

  class DiagnosticsOverlay {
    constructor(visible = false) {
      this.visible = visible;
      this.host = document.createElement("div");
      this.host.id = "longview-diagnostics-host";
      this.host.style.cssText = "all:initial;position:fixed;z-index:2147483647;right:12px;bottom:12px;pointer-events:none";
      const shadow = this.host.attachShadow({ mode: "closed" });
      shadow.innerHTML = `
        <style>
          :host { all: initial; }
          .panel {
            width: 250px; box-sizing: border-box; padding: 12px 14px;
            border: 1px solid rgba(255,255,255,.18); border-radius: 12px;
            background: rgba(12,16,24,.88); color: #eef4ff;
            box-shadow: 0 12px 40px rgba(0,0,0,.35);
            font: 12px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
            backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
          }
          .title { display:flex; justify-content:space-between; font-weight:700; margin-bottom:8px; }
          .active { color:#7af0b2; } .inactive { color:#ffb4a8; }
          .grid { display:grid; grid-template-columns:1fr auto; gap:3px 10px; }
          .muted { color:#91a0b9; }
          .states { display:grid;grid-template-columns:repeat(4,1fr);gap:5px;margin:9px 0; }
          .state { padding:5px 3px;border-radius:6px;background:rgba(255,255,255,.07);text-align:center; }
          .value { display:block;font-size:15px;font-weight:700;color:white; }
        </style>
        <div class="panel">
          <div class="title"><span>LongView</span><span id="status"></span></div>
          <div class="states">
            <div class="state">HOT<span class="value" id="hot">0</span></div>
            <div class="state">WARM<span class="value" id="warm">0</span></div>
            <div class="state">COLD<span class="value" id="cold">0</span></div>
            <div class="state">PIN<span class="value" id="pinned">0</span></div>
          </div>
          <div class="grid">
            <span class="muted">Adapter</span><span id="adapter">—</span>
            <span class="muted">Segments</span><span id="segments">0</span>
            <span class="muted">Velocity</span><span id="velocity">0 px/s</span>
            <span class="muted">Page</span><span id="screens">0 screens</span>
            <span class="muted">Long tasks</span><span id="tasks">0</span>
            <span class="muted">Transitions</span><span id="transitions">0</span>
            <span class="muted">Reason</span><span id="reason">—</span>
          </div>
        </div>`;
      this.elements = Object.fromEntries(
        ["status", "hot", "warm", "cold", "pinned", "adapter", "segments", "velocity", "screens", "tasks", "transitions", "reason"]
          .map((id) => [id, shadow.getElementById(id)])
      );
      this.setVisible(visible);
      document.documentElement.appendChild(this.host);
    }

    setVisible(visible) {
      this.visible = Boolean(visible);
      this.host.style.display = this.visible ? "block" : "none";
    }

    render(stats) {
      if (!stats) return;
      this.elements.status.textContent = stats.active ? "ACTIVE" : "IDLE";
      this.elements.status.className = stats.active ? "active" : "inactive";
      this.elements.hot.textContent = stats.hot ?? 0;
      this.elements.warm.textContent = stats.warm ?? 0;
      this.elements.cold.textContent = stats.cold ?? 0;
      this.elements.pinned.textContent = stats.pinned ?? 0;
      this.elements.adapter.textContent = stats.adapter || "—";
      this.elements.segments.textContent = stats.segments ?? 0;
      this.elements.velocity.textContent = `${stats.velocity ?? 0} px/s`;
      this.elements.screens.textContent = `${stats.pageScreens ?? 0} screens`;
      this.elements.tasks.textContent = `${stats.longTasks ?? 0} / ${Math.round(stats.longTaskTime ?? 0)}ms`;
      this.elements.transitions.textContent = stats.transitions ?? 0;
      this.elements.reason.textContent = stats.lastReason || "—";
    }

    destroy() {
      this.host.remove();
    }
  }

  LV.DiagnosticsOverlay = DiagnosticsOverlay;
})(globalThis);
