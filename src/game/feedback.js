/* ============================================================
   feedback.js — player suggestions & bug reports

   Players file suggestions from inside the game. Where a dev server
   is running the report is POSTed straight to it; on GitHub Pages
   there is no backend, so reports queue locally and the player can
   copy them or open a pre-filled GitHub issue.

   The owner reviews the queue in the Inbox and marks each one
   approved / rejected — approved items are what gets built next.
   ============================================================ */
import { uid } from '../core/util.js';
import { VERSION } from '../core/version.js';

const KEY = 'eride.feedback.v1';
export { VERSION };

export const KINDS = [
  { id: 'bug', label: 'Bug', icon: '🐞', hint: 'Something is broken or behaves wrongly' },
  { id: 'idea', label: 'Idea', icon: '💡', hint: 'A new feature, part, vehicle or place' },
  { id: 'balance', label: 'Balance', icon: '⚖️', hint: 'Something is too strong, too weak or too expensive' },
  { id: 'polish', label: 'Polish', icon: '✨', hint: 'Looks, sound, feel, UI' },
];

export const STATUS = {
  new: { label: 'New', color: '#16c2ff' },
  approved: { label: 'Approved', color: '#39e6a4' },
  rejected: { label: 'Rejected', color: '#5c6883' },
  shipped: { label: 'Shipped', color: '#a06bff' },
};

function blank() {
  return { v: 1, items: [], sent: 0, lastId: 0, owner: false };
}

class Feedback {
  constructor() {
    this.data = blank();
    this.load();
    this.serverAvailable = null;   // null = unknown, then true/false
  }

  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (d && d.items) this.data = Object.assign(blank(), d);
      }
    } catch (e) { /* first run */ }
  }

  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) {}
  }

  get items() { return this.data.items; }
  get isOwner() { return !!this.data.owner; }
  setOwner(v) { this.data.owner = !!v; this.save(); }

  counts() {
    const c = { new: 0, approved: 0, rejected: 0, shipped: 0 };
    for (const i of this.data.items) c[i.status] = (c[i.status] || 0) + 1;
    return c;
  }

  /** file a new suggestion */
  add({ kind, title, detail, from, context }) {
    title = String(title || '').trim().slice(0, 90);
    detail = String(detail || '').trim().slice(0, 1200);
    if (!title) return { ok: false, msg: 'Give it a title.' };
    const item = {
      id: uid(7),
      n: ++this.data.lastId,
      kind: KINDS.some((k) => k.id === kind) ? kind : 'idea',
      title, detail,
      from: String(from || 'anonymous').slice(0, 20),
      at: Date.now(),
      version: VERSION,
      status: 'new',
      votes: 1,
      context: context || null,
      sent: false,
    };
    this.data.items.unshift(item);
    if (this.data.items.length > 300) this.data.items.length = 300;
    this.save();
    this.push(item);
    return { ok: true, item };
  }

  setStatus(id, status) {
    const it = this.data.items.find((x) => x.id === id);
    if (!it) return false;
    it.status = status;
    it.reviewedAt = Date.now();
    this.save();
    this.push(it);
    return true;
  }

  vote(id) {
    const it = this.data.items.find((x) => x.id === id);
    if (!it || it.voted) return false;
    it.votes++; it.voted = true;
    this.save();
    return true;
  }

  remove(id) {
    this.data.items = this.data.items.filter((x) => x.id !== id);
    this.save();
  }

  /** try to deliver a report to a dev server; harmless if there isn't one */
  async push(item) {
    if (this.serverAvailable === false) return;
    try {
      const res = await fetch('/__feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item),
      });
      this.serverAvailable = res.ok;
      if (res.ok) { item.sent = true; this.data.sent++; this.save(); }
    } catch (e) {
      this.serverAvailable = false;
    }
  }

  /** resend anything that never made it */
  async flush() {
    let n = 0;
    for (const it of this.data.items) {
      if (!it.sent) { await this.push(it); if (it.sent) n++; }
    }
    return n;
  }

  /** everything the dev needs, as markdown */
  exportMarkdown(filter = null) {
    const items = filter ? this.data.items.filter(filter) : this.data.items;
    if (!items.length) return '_(nothing to report)_';
    const byKind = {};
    for (const i of items) (byKind[i.kind] ||= []).push(i);
    let out = `# E-Ride — player suggestions\n\n${items.length} item(s), game version ${VERSION}\n`;
    for (const k of KINDS) {
      const list = byKind[k.id];
      if (!list || !list.length) continue;
      out += `\n## ${k.icon} ${k.label}\n\n`;
      for (const i of list) {
        out += `### #${i.n} — ${i.title}\n`;
        out += `- status: **${i.status}** · votes: ${i.votes} · from: ${i.from} · ${new Date(i.at).toLocaleString()}\n`;
        if (i.detail) out += `\n${i.detail}\n`;
        if (i.context) {
          out += `\n<sub>at ${i.context.district || 'unknown'} (${i.context.x}, ${i.context.z}) on a ${i.context.vehicle}`;
          if (i.context.fps) out += ` · ${i.context.fps} fps`;
          out += `</sub>\n`;
        }
        out += '\n';
      }
    }
    return out;
  }

  exportJson(filter = null) {
    const items = filter ? this.data.items.filter(filter) : this.data.items;
    return JSON.stringify({ version: VERSION, exported: Date.now(), items }, null, 2);
  }

  /** a pre-filled GitHub issue link, for players on the hosted build */
  issueUrl(item, repo) {
    if (!repo) return null;
    const k = KINDS.find((x) => x.id === item.kind);
    const body = [
      item.detail || '',
      '',
      '---',
      `game version: ${item.version}`,
      item.context ? `where: ${item.context.district || '?'} (${item.context.x}, ${item.context.z})` : '',
      item.context ? `riding: ${item.context.vehicle}` : '',
    ].filter(Boolean).join('\n');
    return `https://github.com/${repo}/issues/new?` +
      `title=${encodeURIComponent(`[${k.label}] ${item.title}`)}` +
      `&body=${encodeURIComponent(body)}` +
      `&labels=${encodeURIComponent(item.kind)}`;
  }
}

export const feedback = new Feedback();
