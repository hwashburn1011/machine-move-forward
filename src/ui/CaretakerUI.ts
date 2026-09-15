import './caretaker.css';
import type { CaretakerMode } from '@/companion/CaretakerDirector';

export type CaretakerView =
  | {
      panel: 'companion';
      title: string;
      fact: string;
      mode: CaretakerMode;
      status: string;
      canChangeMode?: boolean;
    }
  | {
      panel: 'recruitment';
      title: string;
      description: string;
      cost: number;
      canRecruit: boolean;
      refusal?: string;
    };
export interface CaretakerUICallbacks {
  close(): void;
  setMode(mode: CaretakerMode): void;
  recruit(): void;
}

export class CaretakerUI {
  private readonly root: HTMLElement;
  private readonly content: HTMLElement;
  private viewKey = '';
  constructor(
    parent: HTMLElement,
    private readonly callbacks: CaretakerUICallbacks,
  ) {
    this.root = document.createElement('section');
    this.root.className = 'caretaker';
    this.root.dataset.panel = 'caretaker';
    this.root.hidden = true;
    this.content = document.createElement('div');
    this.content.className = 'caretaker-content';
    this.root.append(this.content);
    parent.append(this.root);
  }
  get isOpen(): boolean {
    return !this.root.hidden;
  }
  open(view: CaretakerView): void {
    this.root.hidden = false;
    this.setView(view);
  }
  setView(view: CaretakerView): void {
    const key = JSON.stringify(view);
    if (key === this.viewKey) return;
    this.viewKey = key;
    const focus =
      document.activeElement instanceof HTMLElement && this.root.contains(document.activeElement)
        ? document.activeElement.dataset.mode
        : null;
    this.content.replaceChildren();
    const heading = document.createElement('h2');
    heading.textContent = view.panel === 'companion' ? 'Aboard the Nomad' : 'Caretaker recruitment';
    this.content.append(heading);
    const title = document.createElement('h3');
    title.textContent = view.title;
    this.content.append(title);
    if (view.panel === 'companion') this.renderCompanion(view);
    else this.renderRecruitment(view);
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = 'Close';
    close.addEventListener('click', () => {
      this.close();
      this.callbacks.close();
    });
    this.content.append(close);
    if (focus)
      this.content.querySelector<HTMLElement>(`[data-mode="${CSS.escape(focus)}"]`)?.focus();
  }
  close(): void {
    this.root.hidden = true;
    this.viewKey = '';
  }
  dispose(): void {
    this.root.remove();
  }
  private renderCompanion(view: Extract<CaretakerView, { panel: 'companion' }>): void {
    const fact = document.createElement('p');
    fact.textContent = view.fact;
    this.content.append(fact);
    const help = document.createElement('p');
    help.textContent =
      'Companion follows you between decks using the internal stairs. Steward stores completed output and waters reachable gardens. Keep the stairs and station approaches clear; moving the dock sends L-12 to its new home.';
    this.content.append(help);
    const status = document.createElement('p');
    status.textContent = view.status;
    this.content.append(status);
    for (const mode of ['companion', 'steward'] as const) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.mode = mode;
      button.textContent = mode === 'companion' ? 'Companion' : 'Steward';
      button.disabled = view.mode === mode || view.canChangeMode === false;
      button.addEventListener('click', () => this.callbacks.setMode(mode));
      this.content.append(button);
    }
  }
  private renderRecruitment(view: Extract<CaretakerView, { panel: 'recruitment' }>): void {
    const description = document.createElement('p');
    description.textContent = view.description;
    this.content.append(description);
    const cost = document.createElement('p');
    cost.textContent = `Recruitment cost: ${view.cost} components`;
    this.content.append(cost);
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Repair and recover caretaker';
    button.disabled = !view.canRecruit;
    button.title = view.refusal ?? '';
    button.addEventListener('click', () => {
      if (view.canRecruit) this.callbacks.recruit();
    });
    this.content.append(button);
    if (view.refusal) {
      const refusal = document.createElement('p');
      refusal.textContent = view.refusal;
      this.content.append(refusal);
    }
  }
}
