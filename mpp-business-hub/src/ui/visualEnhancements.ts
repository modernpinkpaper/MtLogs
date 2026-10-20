function addProjectProgress() {
  document.querySelectorAll<HTMLElement>('.prow').forEach((row) => {
    if (row.querySelector('.project-progress')) return;
    const match = (row.textContent ?? '').match(/(\d+)\s+of\s+(\d+)\s+steps?\s+done/i);
    if (!match) return;
    const done = Number(match[1]);
    const total = Number(match[2]);
    if (!Number.isFinite(done) || !Number.isFinite(total) || total <= 0) return;
    const percent = Math.max(0, Math.min(100, Math.round(done / total * 100)));
    const wrap = document.createElement('div');
    wrap.className = 'project-progress';
    wrap.setAttribute('aria-label', `${done} of ${total} steps complete, ${percent}%`);
    wrap.innerHTML = `<div class="project-progress-track"><span class="project-progress-fill" style="width:${percent}%"></span></div><div class="project-progress-label"><span>Project progress</span><span>${percent}%</span></div>`;
    row.appendChild(wrap);
  });
}

function setPageSurface() {
  const hash = location.hash;
  document.body.dataset.mppRole = 'owner';
  document.body.classList.add('mpp-owner');
  document.body.classList.remove('mpp-staff', 'mpp-staff-mobile');
  document.body.dataset.mppPage = /^#\/projects\/[^/]+\/steps\//.test(hash) ? 'step'
    : /^#\/projects\/[^/]+/.test(hash) ? 'project'
      : /^#\/projects/.test(hash) ? 'projects'
        : /^#\/owner\/team/.test(hash) ? 'team'
          : /^#\/print\/my-stats/.test(hash) ? 'print-stats'
            : /^#\/home/.test(hash) ? 'home' : 'other';
}

function enforceProjectHierarchy() {
  if (!/^#\/projects\/[^/]+$/.test(location.hash)) return;
  document.querySelectorAll<HTMLElement>('[role="tab"]').forEach((tab) => {
    const label = (tab.textContent ?? '').trim().toLowerCase();
    if (label === 'history' || label === 'all files') {
      tab.hidden = true;
      tab.setAttribute('aria-hidden', 'true');
      tab.setAttribute('tabindex', '-1');
    }
  });
}

function addOverviewProgress() {
  if (!/^#\/projects\/[^/]+$/.test(location.hash)) return;
  const hero = document.querySelector<HTMLElement>('main.content header.card');
  const source = document.querySelector<HTMLElement>('main.content [role="progressbar"]');
  if (!hero || !source || hero.querySelector('.overview-project-progress')) return;
  const done = Number(source.getAttribute('aria-valuenow') ?? 0);
  const total = Number(source.getAttribute('aria-valuemax') ?? 0);
  if (!total) return;
  const percent = Math.round(done / total * 100);
  const progress = document.createElement('div');
  progress.className = 'overview-project-progress';
  progress.setAttribute('aria-label', `${done} of ${total} steps completed, ${percent}%`);
  progress.innerHTML = `<div class="track"><span class="fill" style="width:${percent}%"></span></div><div class="meta"><span>${done} of ${total} steps completed</span><strong>${percent}%</strong></div>`;
  hero.appendChild(progress);
}

function markStepsAndAddMobileSwitcher() {
  document.querySelectorAll<HTMLElement>('.step').forEach((step) => {
    const text = step.textContent ?? '';
    step.classList.toggle('is-done', /\bDone\b|\bCompleted\b/i.test(text));
    step.classList.toggle('is-blocked', /\bBlocked\b/i.test(text));
  });
  document.querySelectorAll<HTMLElement>('.split').forEach((split) => {
    const plan = split.querySelector<HTMLElement>(':scope > .plan');
    if (!plan || split.querySelector(':scope > .mobile-step-toggle')) return;
    const count = plan.querySelectorAll('.step').length;
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'mobile-step-toggle';
    toggle.textContent = `Project Steps${count ? ` (${count})` : ''}`;
    toggle.setAttribute('aria-expanded', 'false');
    plan.classList.add('mobile-collapsed');
    toggle.addEventListener('click', () => {
      const open = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!open));
      plan.classList.toggle('mobile-collapsed', open);
    });
    split.insertBefore(toggle, plan);
  });
}

function enhance() {
  setPageSurface();
  addProjectProgress();
  enforceProjectHierarchy();
  addOverviewProgress();
  markStepsAndAddMobileSwitcher();
}

export function installVisualEnhancements() {
  const start = () => {
    enhance();
    const root = document.getElementById('root') ?? document.body;
    new MutationObserver(enhance).observe(root, { childList: true, subtree: true });
    addEventListener('hashchange', enhance);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
}
