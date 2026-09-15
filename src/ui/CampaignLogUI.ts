import './campaign-log.css';
import type { CampaignRecord } from '@/story/CampaignRecord';

export interface CampaignArchiveView {
  id: string;
  title: string;
  text: string;
  chapter: string;
}

export interface CampaignContactView {
  id: string;
  label: string;
  remainingM: number;
  bearingDeg: number;
  state?: string;
}

export interface CampaignLogView {
  record: CampaignRecord;
  archive?: readonly CampaignArchiveView[];
  contact?: CampaignContactView | null;
}

export interface CampaignLogCallbacks {
  close: () => void;
}

/** Read-only campaign record. The parent owns all progression and navigation. */
export class CampaignLogUI {
  private readonly root: HTMLDivElement;
  private readonly body: HTMLDivElement;
  private renderedKey = '';

  constructor(
    parent: HTMLElement,
    private readonly callbacks: CampaignLogCallbacks,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'campaign-log';
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', 'Campaign record');
    this.root.innerHTML =
      '<header><div><span class="campaign-log-kicker">IRON NOMAD / CAMPAIGN RECORD</span><h2>Campaign record</h2></div><button type="button" data-campaign-log-close aria-label="Close campaign record">Close</button></header><div class="campaign-log-body"></div>';
    parent.appendChild(this.root);
    this.body = this.root.querySelector('.campaign-log-body') as HTMLDivElement;
    this.root
      .querySelector('[data-campaign-log-close]')
      ?.addEventListener('click', () => this.callbacks.close());
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  open(view: CampaignLogView): void {
    this.root.hidden = false;
    this.update(view);
  }

  update(view: CampaignLogView): void {
    const key = JSON.stringify(view);
    if (key === this.renderedKey) return;
    this.renderedKey = key;
    this.body.replaceChildren();
    this.body.append(this.section('Journey', this.journey(view.record)));
    this.body.append(this.section('Preserved', this.preserved(view.record)));
    this.body.append(this.section('Discoveries', this.discoveries(view)));
    if (view.archive?.length)
      this.body.append(this.section('Read archive', this.archive(view.archive)));
    this.body.append(
      this.section(
        view.record.endingComplete ? 'Keep Walking' : 'Keep Walking · Future',
        this.guidance(view.record),
      ),
    );
  }

  close(): void {
    this.root.hidden = true;
  }

  dispose(): void {
    this.root.remove();
  }

  private section(title: string, content: HTMLElement): HTMLElement {
    const section = document.createElement('section');
    const heading = document.createElement('h3');
    heading.textContent = title;
    section.append(heading, content);
    return section;
  }

  private journey(record: CampaignRecord): HTMLElement {
    const list = document.createElement('div');
    list.className = 'campaign-log-list';
    for (const chapter of record.chapters) {
      const row = document.createElement('p');
      row.dataset.chapterId = chapter.id;
      row.textContent = `${chapter.title} · ${chapter.completed ? 'complete' : 'not yet completed'}`;
      list.append(row);
    }
    return list;
  }

  private preserved(record: CampaignRecord): HTMLElement {
    const list = document.createElement('div');
    list.className = 'campaign-log-list';
    if (!record.preserved.length) {
      list.textContent = 'No records or recovered items recorded yet.';
      return list;
    }
    for (const item of record.preserved) {
      const row = document.createElement('p');
      row.textContent = item;
      list.append(row);
    }
    return list;
  }

  private discoveries(view: CampaignLogView): HTMLElement {
    const list = document.createElement('div');
    list.className = 'campaign-log-list';
    const totals = document.createElement('p');
    totals.textContent = `${view.record.discoveries.visited} visited · ${view.record.discoveries.missed} missed`;
    list.append(totals);
    if (view.contact) {
      const contact = document.createElement('p');
      contact.textContent = `Current contact: ${view.contact.label} · ${Math.max(0, Math.round(view.contact.remainingM))} m · ${view.contact.bearingDeg >= 0 ? '+' : ''}${view.contact.bearingDeg.toFixed(1)}°${view.contact.state ? ` · ${view.contact.state}` : ''}`;
      list.append(contact);
    }
    return list;
  }

  private archive(records: readonly CampaignArchiveView[]): HTMLElement {
    const list = document.createElement('div');
    list.className = 'campaign-log-archive';
    const seen = new Set<string>();
    for (const record of records) {
      if (seen.has(record.id)) continue;
      seen.add(record.id);
      const article = document.createElement('article');
      article.dataset.archiveId = record.id;
      const chapter = document.createElement('span');
      chapter.textContent = record.chapter;
      const title = document.createElement('strong');
      title.textContent = record.title;
      const text = document.createElement('p');
      text.textContent = record.text;
      article.append(chapter, title, text);
      list.append(article);
    }
    return list;
  }

  private guidance(record: CampaignRecord): HTMLElement {
    const list = document.createElement('div');
    list.className = 'campaign-log-list';
    for (const row of record.keepWalking) {
      const item = document.createElement('p');
      item.dataset.guidanceId = row.id;
      item.textContent = `${row.label} · ${row.completeNow ? 'ready' : 'available'}`;
      list.append(item);
    }
    return list;
  }
}
