'use strict';

(function () {
  const html = `
<aside class="sidebar" id="sidebar">
  <div class="sidebar-header">
    <a href="index.html" class="logo">
      <span class="logo-bracket">[</span>
      <span class="logo-text">NET</span>
      <span class="logo-accent">TOOLS</span>
      <span class="logo-bracket">]</span>
    </a>
    <p class="logo-sub">// browser-local utilities</p>
  </div>

  <nav class="tool-nav">
    <div class="nav-section-label">// network</div>
    <a href="subnet.html" class="nav-item" data-tool="subnet">
      <span class="nav-icon">⬡</span>
      <span class="nav-label">Subnet Calculator</span>
    </a>

    <div class="nav-section-label">// utilities</div>
    <div class="nav-item disabled" title="Coming soon">
      <span class="nav-icon">⬡</span>
      <span class="nav-label">Compose Converter</span>
      <span class="nav-badge">2 weeks</span>
    </div>

    <div class="nav-section-label">// command builders</div>
    <a href="tcpdump.html" class="nav-item" data-tool="tcpdump">
      <span class="nav-icon">⬡</span>
      <span class="nav-label">tcpdump</span>
    </a>
    <a href="fw-monitor.html" class="nav-item" data-tool="fw-monitor">
      <span class="nav-icon">⬡</span>
      <span class="nav-label">fw monitor</span>
    </a>
    <div class="nav-item disabled" title="Coming soon">
      <span class="nav-icon">⬡</span>
      <span class="nav-label">cppcap</span>
      <span class="nav-badge">2 weeks</span>
    </div>
    <div class="nav-item disabled" title="Coming soon">
      <span class="nav-icon">⬡</span>
      <span class="nav-label">fw ctl zdebug</span>
      <span class="nav-badge">2 weeks</span>
    </div>
  </nav>

  <div class="sidebar-footer">
    <span class="footer-dot online"></span>
    <span>all processing: local</span>
  </div>
</aside>`;

  const mount = document.getElementById('sidebar-mount');
  if (mount) mount.outerHTML = html;

  // Mark the active nav item based on the current page filename
  const page = window.location.pathname.split('/').pop() || 'index.html';
  const toolMap = { 'subnet.html': 'subnet', 'tcpdump.html': 'tcpdump', 'fw-monitor.html': 'fw-monitor' };
  const activeTool = toolMap[page];
  if (activeTool) {
    const link = document.querySelector(`.nav-item[data-tool="${activeTool}"]`);
    if (link) link.classList.add('active');
  }

  // Mobile sidebar toggle
  const sidebar = document.getElementById('sidebar');
  const toggle  = document.getElementById('sidebarToggle');
  if (sidebar && toggle) {
    toggle.addEventListener('click', e => {
      e.stopPropagation();
      sidebar.classList.toggle('open');
    });
    document.addEventListener('click', e => {
      if (sidebar.classList.contains('open') &&
          !sidebar.contains(e.target) &&
          !toggle.contains(e.target)) {
        sidebar.classList.remove('open');
      }
    });
  }
})();
