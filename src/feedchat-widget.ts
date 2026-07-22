import { LitElement, html, nothing } from 'lit'
import { customElement, property, query, state } from 'lit/decorators.js'
import { pickAreaScreenshot } from './screenshot-picker.js'
import { styles } from './styles.css.js'
import type { FeedchatSentiment, FeedchatSubmitDetail } from './types.js'

@customElement('feedchat-widget')
export class FeedchatWidget extends LitElement {
  static override styles = styles

  /** Optional customer metadata keys mirrored into submit.meta */
  @property({ attribute: 'user-id' })
  userId?: string

  @property({ attribute: 'app-version' })
  appVersion?: string

  /** Text shown on the floating launcher button */
  @property({ attribute: 'label' })
  label = 'Feedback'

  @state()
  private open = false

  @state()
  private sentiment: FeedchatSentiment | null = null

  @state()
  private message = ''

  @state()
  private images: File[] = []

  @state()
  private previewUrls: string[] = []

  @state()
  private capturingScreenshot = false

  @query('textarea')
  private textareaEl?: HTMLTextAreaElement

  private onDocKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && this.open) {
      event.stopPropagation()
      this.closePanel()
    }
  }

  override connectedCallback(): void {
    super.connectedCallback()
    document.addEventListener('keydown', this.onDocKeyDown)
  }

  override disconnectedCallback(): void {
    document.removeEventListener('keydown', this.onDocKeyDown)
    this.revokePreviews()
    super.disconnectedCallback()
  }

  private get canSubmit(): boolean {
    const hasContent =
      this.message.trim().length > 0 || this.images.length > 0
    return hasContent
  }

  private toggleOpen(): void {
    if (this.open) {
      this.closePanel()
    } else {
      this.open = true
      void this.updateComplete.then(() => {
        this.textareaEl?.focus()
      })
    }
  }

  private closePanel(): void {
    this.open = false
  }

  private resetForm(): void {
    this.sentiment = null
    this.message = ''
    this.revokePreviews()
    this.images = []
    this.previewUrls = []
  }

  private revokePreviews(): void {
    for (const url of this.previewUrls) {
      URL.revokeObjectURL(url)
    }
  }

  private setSentiment(value: FeedchatSentiment): void {
    this.sentiment = this.sentiment === value ? null : value
  }

  private onMessageInput(event: Event): void {
    const target = event.target as HTMLTextAreaElement
    this.message = target.value
  }

  private addImageFile(file: File): void {
    this.images = [...this.images, file]
    this.previewUrls = [...this.previewUrls, URL.createObjectURL(file)]
  }

  private async startScreenshotPicker(): Promise<void> {
    if (this.capturingScreenshot) return

    this.capturingScreenshot = true
    const wasOpen = this.open
    this.open = false
    await this.updateComplete

    try {
      const file = await pickAreaScreenshot([this])
      if (file) {
        this.addImageFile(file)
      }
    } finally {
      this.capturingScreenshot = false
      if (wasOpen) {
        this.open = true
        void this.updateComplete.then(() => {
          this.textareaEl?.focus()
        })
      }
    }
  }

  private removeImage(index: number): void {
    const url = this.previewUrls[index]
    if (url) URL.revokeObjectURL(url)
    this.images = this.images.filter((_, i) => i !== index)
    this.previewUrls = this.previewUrls.filter((_, i) => i !== index)
  }

  private collectMeta(): Record<string, string> | undefined {
    const meta: Record<string, string> = {}

    if (this.userId) meta['user-id'] = this.userId
    if (this.appVersion) meta['app-version'] = this.appVersion

    for (const attr of this.attributes) {
      if (attr.name.startsWith('data-') && attr.value) {
        meta[attr.name.slice(5)] = attr.value
      }
    }

    return Object.keys(meta).length ? meta : undefined
  }

  private submit(): void {
    if (!this.canSubmit) return

    const detail: FeedchatSubmitDetail = {
      message: this.message.trim(),
      sentiment: this.sentiment,
      images: [...this.images],
      context: {
        url: globalThis.location?.href ?? '',
        title: globalThis.document?.title ?? '',
        userAgent: globalThis.navigator?.userAgent ?? '',
        timestamp: new Date().toISOString(),
        viewport: {
          width: globalThis.innerWidth ?? 0,
          height: globalThis.innerHeight ?? 0,
        },
      },
      meta: this.collectMeta(),
    }

    this.dispatchEvent(
      new CustomEvent<FeedchatSubmitDetail>('feedchat:submit', {
        detail,
        bubbles: true,
        composed: true,
      }),
    )

    this.resetForm()
    this.closePanel()
  }

  private faceIcon(kind: FeedchatSentiment) {
    if (kind === 'sad') {
      return html`
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle
            cx="12"
            cy="12"
            r="9"
            fill="none"
            stroke="currentColor"
            stroke-width="1.75"
          />
          <circle cx="9" cy="10" r="1.1" fill="currentColor" />
          <circle cx="15" cy="10" r="1.1" fill="currentColor" />
          <path
            d="M8.5 16.5c1.2-1.6 2.4-2.2 3.5-2.2s2.3.6 3.5 2.2"
            fill="none"
            stroke="currentColor"
            stroke-width="1.75"
            stroke-linecap="round"
          />
        </svg>
      `
    }

    if (kind === 'neutral') {
      return html`
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle
            cx="12"
            cy="12"
            r="9"
            fill="none"
            stroke="currentColor"
            stroke-width="1.75"
          />
          <circle cx="9" cy="10" r="1.1" fill="currentColor" />
          <circle cx="15" cy="10" r="1.1" fill="currentColor" />
          <path
            d="M9 15.5h6"
            fill="none"
            stroke="currentColor"
            stroke-width="1.75"
            stroke-linecap="round"
          />
        </svg>
      `
    }

    return html`
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle
          cx="12"
          cy="12"
          r="9"
          fill="none"
          stroke="currentColor"
          stroke-width="1.75"
        />
        <circle cx="9" cy="10" r="1.1" fill="currentColor" />
        <circle cx="15" cy="10" r="1.1" fill="currentColor" />
        <path
          d="M8.5 14c1.2 1.6 2.4 2.2 3.5 2.2s2.3-.6 3.5-2.2"
          fill="none"
          stroke="currentColor"
          stroke-width="1.75"
          stroke-linecap="round"
        />
      </svg>
    `
  }

  override render() {
    return html`
      <div class="root">
        ${this.open
          ? html`
              <div
                class="panel"
                role="dialog"
                aria-label="Share feedback"
                aria-modal="false"
              >
                <div class="header">
                  <h2>Share feedback</h2>
                  <button
                    class="close"
                    type="button"
                    aria-label="Close feedback"
                    @click=${this.closePanel}
                  >
                    ×
                  </button>
                </div>
                <div class="body">
                  <div>
                    <div
                      class="sentiment"
                      role="group"
                      aria-label="Reaction"
                    >
                      ${(
                        [
                          ['sad', 'Sad'],
                          ['neutral', 'Neutral'],
                          ['happy', 'Happy'],
                        ] as const
                      ).map(
                        ([value, label]) => html`
                          <button
                            class="sentiment-btn"
                            type="button"
                            aria-label=${label}
                            aria-pressed=${this.sentiment === value
                              ? 'true'
                              : 'false'}
                            @click=${() => this.setSentiment(value)}
                          >
                            ${this.faceIcon(value)}
                          </button>
                        `,
                      )}
                    </div>
                  </div>

                  <div class="composer">
                    <label class="visually-hidden" for="feedchat-message"
                      >Your feedback</label
                    >
                    <textarea
                      id="feedchat-message"
                      placeholder="Tell us what’s on your mind…"
                      .value=${this.message}
                      @input=${this.onMessageInput}
                    ></textarea>

                    ${this.previewUrls.length
                      ? html`
                          <div class="thumbs">
                            ${this.previewUrls.map(
                              (url, index) => html`
                                <div class="thumb">
                                  <img
                                    src=${url}
                                    alt=${`Attachment ${index + 1}`}
                                  />
                                  <button
                                    class="thumb-remove"
                                    type="button"
                                    aria-label=${`Remove image ${index + 1}`}
                                    @click=${() => this.removeImage(index)}
                                  >
                                    ×
                                  </button>
                                </div>
                              `,
                            )}
                          </div>
                        `
                      : nothing}

                    <div class="composer-actions">
                      <button
                        class="attach"
                        type="button"
                        ?disabled=${this.capturingScreenshot}
                        @click=${this.startScreenshotPicker}
                      >
                        <svg
                          class="attach-icon"
                          viewBox="0 0 16 16"
                          aria-hidden="true"
                        >
                          <path
                            d="M4.25 2.75v8.25l2.1-1.65 1.85 3.35 1.35-.75-1.85-3.35h2.9L4.25 2.75z"
                            fill="currentColor"
                          />
                        </svg>
                        ${this.capturingScreenshot
                          ? 'Capturing…'
                          : 'Add screenshot'}
                      </button>
                      <button
                        class="submit"
                        type="button"
                        ?disabled=${!this.canSubmit}
                        @click=${this.submit}
                      >
                        Share
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            `
          : html`
              <button
                class="launcher"
                type="button"
                aria-expanded="false"
                aria-haspopup="dialog"
                @click=${this.toggleOpen}
              >
                <svg
                  class="launcher-icon"
                  viewBox="0 0 16 16"
                  aria-hidden="true"
                >
                  <path
                    d="M3.75 3.25h8.5a1.25 1.25 0 0 1 1.25 1.25v4.75a1.25 1.25 0 0 1-1.25 1.25H8.1L5.75 12.5v-2h-1.75A1.25 1.25 0 0 1 2.75 9.25V4.5a1.25 1.25 0 0 1 1.25-1.25z"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.25"
                    stroke-linejoin="round"
                  />
                </svg>
                ${this.label}
              </button>
            `}
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'feedchat-widget': FeedchatWidget
  }

  interface HTMLElementEventMap {
    'feedchat:submit': import('./types.js').FeedchatSubmitEvent
  }
}
