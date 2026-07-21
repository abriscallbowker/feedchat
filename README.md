# Feedchat

Framework-agnostic feedback widget as a Web Component. Users submit feedback in a sticky panel; your app receives a typed `feedchat:submit` browser event. No database, API, accounts, or hosted infrastructure.

## Install

```bash
npm install feedchat
# or
pnpm add feedchat
```

## Usage

```html
<script type="module">
  import 'feedchat'

  const widget = document.querySelector('feedchat-widget')
  widget.addEventListener('feedchat:submit', (event) => {
    const { message, sentiment, images, context, meta } = event.detail
    // Send to your API, analytics, email webhook, etc.
    console.log({ message, sentiment, images, context, meta })
  })
</script>

<feedchat-widget user-id="u_123" app-version="1.4.0" data-plan="pro"></feedchat-widget>
```

Works in any framework that can render custom elements (React, Vue, Svelte, plain HTML).

## Event payload

```ts
type FeedchatSentiment = 'sad' | 'neutral' | 'happy'

interface FeedchatSubmitDetail {
  message: string
  sentiment: FeedchatSentiment
  images: File[]
  context: {
    url: string
    title: string
    userAgent: string
    timestamp: string
    viewport: { width: number; height: number }
  }
  meta?: Record<string, string>
}
```

- **message** — trimmed text from the composer
- **sentiment** — required; no default until the user picks sad / neutral / happy
- **images** — `File` objects from the attach control (not base64)
- **context** — page URL, title, user agent, ISO timestamp, viewport
- **meta** — `user-id`, `app-version`, and any `data-*` attributes on the element

Submit stays disabled until a sentiment is chosen and there is a non-empty message or at least one image.

## Theming

Override CSS variables on the element:

```css
feedchat-widget {
  --feedchat-accent: #0c6e6b;
  --feedchat-surface: #f7fafb;
  --feedchat-panel: #ffffff;
  --feedchat-border: #d5e0e3;
  --feedchat-text: #1a2b2e;
  --feedchat-muted: #5c7277;
  --feedchat-font: 'Segoe UI', 'Helvetica Neue', ui-sans-serif, system-ui, sans-serif;
}
```

## Local demo

```bash
pnpm install
pnpm dev
```

## License

MIT
