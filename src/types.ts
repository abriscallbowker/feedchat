export type FeedchatSentiment = 'sad' | 'neutral' | 'happy'

export interface FeedchatContext {
  url: string
  title: string
  userAgent: string
  timestamp: string
  viewport: { width: number; height: number }
}

export interface FeedchatSubmitDetail {
  message: string
  sentiment: FeedchatSentiment | null
  images: File[]
  context: FeedchatContext
  meta?: Record<string, string>
}

export type FeedchatSubmitEvent = CustomEvent<FeedchatSubmitDetail>
