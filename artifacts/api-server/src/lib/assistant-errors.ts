export type FailureCategory =
  | 'provider_http' | 'provider_timeout' | 'provider_network'
  | 'provider_shape' | 'invalid_model_json' | 'invalid_model_plan'
  | 'dataset_load' | 'answer_generation' | 'request_validation';

export class AssistantFailure extends Error {
  constructor(public category: FailureCategory, public providerStatus?: number) {
    super(category);
    this.name = 'AssistantFailure';
  }
}

export function safeAssistantFailure(error: unknown, fallback: FailureCategory) {
  const failure = error instanceof AssistantFailure ? error : new AssistantFailure(fallback);
  const errorText = failure.category === 'provider_timeout'
    ? 'The assistant took too long to respond. Your selections are retained; please retry.'
    : failure.category === 'invalid_model_json' || failure.category === 'invalid_model_plan' || failure.category === 'provider_shape'
      ? 'I could not reliably interpret that question. Your selections are retained; please retry or rephrase.'
      : 'The assistant could not complete this request. Your selections are retained; please retry.';
  return {
    category: failure.category,
    providerStatus: failure.providerStatus,
    status: failure.category === 'request_validation' ? 400 : 502,
    errorText,
  };
}
