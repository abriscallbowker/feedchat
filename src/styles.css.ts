import { css } from 'lit'

export const styles = css`
  :host {
    --feedchat-accent: #0c6e6b;
    --feedchat-accent-hover: #0a5c5a;
    --feedchat-surface: #f7fafb;
    --feedchat-panel: #ffffff;
    --feedchat-border: #d5e0e3;
    --feedchat-text: #1a2b2e;
    --feedchat-muted: #5c7277;
    --feedchat-danger: #b42318;
    --feedchat-shadow: 0 12px 40px rgba(26, 43, 46, 0.16);
    --feedchat-radius: 14px;
    --feedchat-font: 'Segoe UI', 'Helvetica Neue', ui-sans-serif, system-ui,
      sans-serif;
    --feedchat-launcher-bg: #000;
    --feedchat-launcher-bg-hover: #111;
    --feedchat-launcher-color: #fff;
    --feedchat-launcher-radius: 999px;

    position: fixed;
    z-index: 2147483000;
    inset: auto 20px 20px auto;
    font-family: var(--feedchat-font);
    color: var(--feedchat-text);
    line-height: 1.45;
    -webkit-font-smoothing: antialiased;
  }

  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .root {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
  }

  .panel {
    width: min(360px, calc(100vw - 40px));
    background:
      linear-gradient(165deg, #eef6f6 0%, transparent 42%),
      var(--feedchat-panel);
    border: 1px solid var(--feedchat-border);
    border-radius: var(--feedchat-radius);
    box-shadow: var(--feedchat-shadow);
    overflow: hidden;
    transform-origin: bottom right;
    animation: feedchat-open 180ms cubic-bezier(0.22, 1, 0.36, 1);
  }

  @keyframes feedchat-open {
    from {
      opacity: 0;
      transform: scale(0.96);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 14px 16px 10px;
  }

  .header h2 {
    margin: 0;
    font-size: 15px;
    font-weight: 650;
    letter-spacing: -0.01em;
  }

  .close {
    appearance: none;
    border: 0;
    background: transparent;
    color: var(--feedchat-muted);
    width: 28px;
    height: 28px;
    border-radius: 8px;
    cursor: pointer;
    display: grid;
    place-items: center;
    font-size: 24px;
    line-height: 1;
  }

  .close:hover {
    color: var(--feedchat-text);
  }

  .body {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 0 16px 16px;
  }

  .sentiment {
    display: flex;
    gap: 8px;
  }

  .sentiment-btn {
    appearance: none;
    flex: 1;
    height: 44px;
    border: 1px solid var(--feedchat-border);
    background: var(--feedchat-surface);
    border-radius: 10px;
    cursor: pointer;
    display: grid;
    place-items: center;
    color: var(--feedchat-muted);
    transition:
      transform 120ms ease,
      border-color 120ms ease,
      background-color 120ms ease,
      color 120ms ease;
  }

  .sentiment-btn:hover {
    border-color: #b7cbd0;
    color: var(--feedchat-text);
  }

  .sentiment-btn:active {
    transform: scale(0.96);
  }

  .sentiment-btn[aria-pressed='true'] {
    border-color: var(--feedchat-accent);
    background: color-mix(in srgb, var(--feedchat-accent) 12%, white);
    color: var(--feedchat-accent);
  }

  .sentiment-btn svg {
    width: 24px;
    height: 24px;
  }

  .composer {
    display: flex;
    flex-direction: column;
    gap: 8px;
    border: 1px solid var(--feedchat-border);
    border-radius: 12px;
    background: #fff;
    padding: 10px;
  }

  textarea {
    width: 100%;
    min-height: 88px;
    resize: vertical;
    border: 0;
    outline: none;
    font: inherit;
    font-size: 14px;
    color: var(--feedchat-text);
    background: transparent;
    padding: 2px;
  }

  textarea::placeholder {
    color: #8a9ea3;
  }

  .thumbs {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .thumb {
    position: relative;
    width: 56px;
    height: 56px;
    border-radius: 8px;
    overflow: hidden;
    border: 1px solid var(--feedchat-border);
    background: var(--feedchat-surface);
  }

  .thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .thumb-remove {
    appearance: none;
    position: absolute;
    top: 2px;
    right: 2px;
    width: 20px;
    height: 20px;
    border: 0;
    border-radius: 999px;
    background: rgba(26, 43, 46, 0.72);
    color: #fff;
    cursor: pointer;
    font-size: 12px;
    line-height: 1;
    display: grid;
    place-items: center;
  }

  .composer-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .attach {
    appearance: none;
    border: 0;
    background: transparent;
    color: var(--feedchat-muted);
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 8px;
    border-radius: 8px;
  }

  .attach:hover:not(:disabled) {
    background: var(--feedchat-surface);
    color: var(--feedchat-text);
  }

  .attach:disabled {
    opacity: 0.6;
    cursor: wait;
  }

  .attach-icon {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
  }

  .submit {
    appearance: none;
    border: 0;
    background: var(--feedchat-accent);
    color: #fff;
    font: inherit;
    font-size: 13px;
    font-weight: 650;
    padding: 8px 14px;
    border-radius: 999px;
    cursor: pointer;
    transition:
      background-color 120ms ease,
      transform 120ms ease,
      opacity 120ms ease;
  }

  .submit:hover:not(:disabled) {
    background: var(--feedchat-accent-hover);
  }

  .submit:active:not(:disabled) {
    transform: scale(0.97);
  }

  .submit:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .launcher {
    appearance: none;
    border: 0;
    background: var(--feedchat-launcher-bg);
    color: var(--feedchat-launcher-color);
    font: inherit;
    font-size: 14px;
    font-weight: 650;
    letter-spacing: -0.01em;
    padding: 12px 18px;
    border-radius: var(--feedchat-launcher-radius);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    transition:
      background-color 120ms ease,
      transform 120ms ease;
  }

  .launcher-icon {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
  }

  .launcher:hover {
    background: var(--feedchat-launcher-bg-hover);
    transform: scale(1.02);
  }

  .launcher:active {
    transform: scale(0.97);
  }

  @media (prefers-reduced-motion: reduce) {
    .panel,
    .sentiment-btn,
    .submit,
    .launcher {
      animation: none;
      transition: none;
    }
  }
`
