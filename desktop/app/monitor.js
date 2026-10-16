(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SubmundoMonitor = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const defaults = Object.freeze({ sound: false, status: 'all', usage: 'all', search: '', sort: 'deadline' });
  const ready = new Set(['available', 'released', 'event']);
  function settings(patch = {}, base = defaults) {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch) || Object.keys(patch).some(key => !Object.hasOwn(defaults, key))) throw new Error('Preferências de acompanhamento inválidas.');
    const result = { ...base, ...patch };
    if (typeof result.sound !== 'boolean' || !['all', 'available', 'waiting', 'checkout', 'urgent', 'unknown'].includes(result.status) || !['all', 'unused', 'used'].includes(result.usage) || !['profile', 'deadline'].includes(result.sort) || typeof result.search !== 'string' || result.search.length > 80) throw new Error('Preferências de acompanhamento inválidas.');
    return result;
  }
  const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  function matchesProfile(profile, prefs) {
    return normalize(profile.label).includes(normalize(prefs.search)) && (prefs.usage === 'all' || (prefs.usage === 'used') === Boolean(profile.lastFilledAt));
  }
  function matchesTab(tab, prefs) {
    return prefs.status === 'all' || prefs.status === 'available' && ready.has(tab.queue) || prefs.status === 'waiting' && tab.queue === 'waiting' || prefs.status === 'checkout' && tab.queue === 'checkout' || prefs.status === 'urgent' && tab.timer?.seconds > 0 && tab.timer.seconds <= 120 || prefs.status === 'unknown' && !ready.has(tab.queue) && !['waiting', 'checkout'].includes(tab.queue);
  }
  function priority(tabs) {
    const running = tabs.filter(tab => Number.isInteger(tab.timer?.seconds) && tab.timer.seconds > 0).map(tab => tab.timer.seconds);
    if (running.length) return [0, Math.min(...running)];
    return tabs.some(tab => tab.timer?.seconds === 0) ? [1, 0] : [2, 0];
  }
  function compare(a, b) { return a[0] - b[0] || a[1] - b[1]; }
  function tabs(state, prefs) {
    const positions = new Map(state.profiles.map((profile, index) => [profile.id, index]));
    return state.tabs.filter(tab => { const profile = state.profiles.find(profile => profile.id === tab.profileId); return profile && matchesProfile(profile, prefs) && matchesTab(tab, prefs); }).sort((a, b) => (prefs.sort === 'deadline' ? compare(priority([a]), priority([b])) : 0) || positions.get(a.profileId) - positions.get(b.profileId) || state.tabs.indexOf(a) - state.tabs.indexOf(b));
  }
  function profiles(state, prefs) {
    const visible = tabs(state, prefs);
    return state.profiles.filter(profile => matchesProfile(profile, prefs) && (prefs.status === 'all' || visible.some(tab => tab.profileId === profile.id))).sort((a, b) => (prefs.sort === 'deadline' ? compare(priority(visible.filter(tab => tab.profileId === a.id)), priority(visible.filter(tab => tab.profileId === b.id))) : 0) || state.profiles.indexOf(a) - state.profiles.indexOf(b));
  }
  function location(tab) {
    try { const url = new URL(tab.url); return `${url.origin}${url.pathname.replace(/\/+$/, '')}`; } catch { return String(tab.id); }
  }
  function cartKey(tab) {
    try {
      const url = new URL(tab.url), order = url.pathname.match(/^\/orders(?:\/([^/]+))?(?:\/|$)/);
      if (order) return `${tab.profileId}:${url.origin}/orders/${order[1] || ''}`;
    } catch { /* Unknown URLs retain their per-window identity. */ }
    return `${tab.profileId}:${tab.id}:${location(tab)}`;
  }
  class AlertTracker {
    constructor(now = Date.now) { this.now = now; this.previous = new Map(); this.released = new Set(); this.warned = new Set(); this.recent = []; this.next = 0; }
    update(state) {
      const emitted = [], live = new Set(state.tabs.map(tab => tab.id));
      for (const id of this.previous.keys()) if (!live.has(id)) this.previous.delete(id);
      const add = (kind, tab) => {
        const profile = state.profiles.find(profile => profile.id === tab.profileId);
        const windowNumber = state.tabs.filter(item => item.profileId === tab.profileId).findIndex(item => item.id === tab.id) + 1;
        emitted.push({ id: ++this.next, kind, tabId: tab.id, profileId: tab.profileId, profile: profile?.label || 'Perfil', windowNumber, at: this.now(), seconds: tab.timer?.seconds ?? null });
      };
      for (const tab of state.tabs) {
        const previous = this.previous.get(tab.id) || { waiting: false };
        if (tab.queue === 'waiting') previous.waiting = true;
        else if (ready.has(tab.queue) && previous.waiting) {
          const key = `${tab.profileId}:${tab.id}:${location(tab)}`;
          if (!this.released.has(key)) { this.released.add(key); add('ready', tab); }
          previous.waiting = false;
        }
        if (Number.isInteger(tab.timer?.seconds) && tab.timer.seconds > 0 && tab.timer.seconds <= 120) {
          const key = cartKey(tab);
          if (!this.warned.has(key)) { this.warned.add(key); add('urgent', tab); }
        }
        this.previous.set(tab.id, previous);
      }
      if (emitted.length) this.recent = [...emitted.reverse(), ...this.recent].slice(0, 20);
      return emitted;
    }
    clear() { this.recent = []; }
  }
  return { defaults, settings, tabs, profiles, AlertTracker };
});
