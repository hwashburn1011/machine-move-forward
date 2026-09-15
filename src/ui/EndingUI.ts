import './ending.css';

export interface EndingView {
  phase: 'committed' | 'arrival' | 'credits' | null;
  remainingM: number;
  caption: string;
  paused: boolean;
  recognition?: readonly string[];
}

export interface EndingUICallbacks {
  skip: () => void;
  keepWalking: () => void;
}

/** Presentation-only ending overlay. Timing and campaign state remain with Game. */
export class EndingUI {
  private readonly root: HTMLDivElement;
  private readonly distance: HTMLElement;
  private readonly caption: HTMLElement;
  private readonly skipButton: HTMLButtonElement;
  private readonly keepWalkingButton: HTMLButtonElement;
  private readonly recognition: HTMLDivElement;
  private recognitionKey = '';
  private renderedKey = '';
  private phase: EndingView['phase'] = null;
  private paused = false;

  constructor(
    parent: HTMLElement,
    private readonly callbacks: EndingUICallbacks,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'ending-overlay';
    this.root.hidden = true;
    this.root.innerHTML = `<div class="ending-letterbox" aria-hidden="true"></div><section class="ending-card" role="dialog" aria-label="Machine Move Forward ending"><p class="ending-distance"></p><p class="ending-caption"></p><button type="button" data-ending-skip>Skip arrival</button><div class="ending-credits"><h1>Machine Move Forward</h1><p>S-07 carried the names, seeds and a bearing toward an unanswered voice.</p><p>Original game &amp; art / HWashburn<br>Development with Codex<br>Three.js · Rapier · Blender</p><button type="button" data-ending-keep>Keep Walking</button></div></section>`;
    parent.appendChild(this.root);
    this.distance = this.root.querySelector('.ending-distance') as HTMLElement;
    this.caption = this.root.querySelector('.ending-caption') as HTMLElement;
    this.skipButton = this.root.querySelector('[data-ending-skip]') as HTMLButtonElement;
    this.keepWalkingButton = this.root.querySelector('[data-ending-keep]') as HTMLButtonElement;
    this.recognition = document.createElement('div');
    this.recognition.className = 'ending-recognition';
    this.keepWalkingButton.before(this.recognition);
    this.skipButton.addEventListener('click', () => {
      if (!this.paused && this.phase !== null) this.callbacks.skip();
    });
    this.keepWalkingButton.addEventListener('click', () => {
      if (!this.paused && this.phase === 'credits') this.callbacks.keepWalking();
    });
  }

  setView(view: EndingView): void {
    const key = JSON.stringify(view);
    if (key === this.renderedKey) return;
    this.renderedKey = key;
    this.phase = view.phase;
    this.paused = view.paused;
    const visible = view.phase !== null && !view.paused;
    this.root.hidden = !visible;
    this.root.dataset.phase = view.phase ?? '';
    this.root.classList.toggle('is-paused', view.paused);
    this.distance.textContent =
      view.phase === 'committed' ? `${Math.max(0, Math.round(view.remainingM))} m to Meridian` : '';
    this.caption.textContent = view.caption;
    const recognitionKey = JSON.stringify(view.recognition ?? []);
    if (recognitionKey !== this.recognitionKey) {
      this.recognitionKey = recognitionKey;
      this.recognition.replaceChildren(
        ...(view.recognition ?? []).map((line) => {
          const paragraph = document.createElement('p');
          paragraph.textContent = line;
          return paragraph;
        }),
      );
    }
    this.skipButton.hidden = !visible;
    this.skipButton.disabled = !visible;
    this.keepWalkingButton.hidden = !visible || view.phase !== 'credits';
    this.skipButton.textContent = view.phase === 'credits' ? 'Skip credits' : 'Skip arrival';
    this.root.classList.toggle('is-arrival', view.phase === 'arrival');
    this.root.classList.toggle('is-credits', view.phase === 'credits');
  }

  dispose(): void {
    this.skipButton.replaceWith(this.skipButton.cloneNode(true));
    this.keepWalkingButton.replaceWith(this.keepWalkingButton.cloneNode(true));
    this.root.remove();
  }
}
