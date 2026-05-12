export type RecommendationShape = 'concentrated' | 'distributed' | 'recurring'

export type AssistantAction = 'accepted' | 'dismissed'

export type AssistantEvent = {
  shape: RecommendationShape
  action: AssistantAction
  at: number
}
