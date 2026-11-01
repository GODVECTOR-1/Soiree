import 'server-only'

/** An error that is safe to show: stable `code`, HTTP status and a plain message of 140 characters or fewer. */
export class AppError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
    readonly retryAfterSec?: number,
  ) {
    super(message.slice(0, 140))
    this.name = 'AppError'
  }
}

export const errors = {
  validation: (message = 'Some details are missing or not valid.') => new AppError('VALIDATION_FAILED', 400, message),
  token: () => new AppError('EDIT_TOKEN_INVALID', 401, 'This link cannot edit the plan. Open your edit link to make changes.'),
  demo: () => new AppError('DEMO_READ_ONLY', 403, 'Sample plans are read only. Start your own plan to make changes.'),
  notFound: () => new AppError('PLAN_NOT_FOUND', 404, 'We could not find that plan. It may have expired.'),
  itemNotFound: (what: string) => new AppError('ITEM_NOT_FOUND', 404, `That ${what} is not in this plan.`),
  conflict: () => new AppError('PLAN_CHANGED', 409, 'The plan changed. Reload and try again.'),
  tooLarge: () => new AppError('BODY_TOO_LARGE', 413, 'That request is too large.'),
  unsupported: (message: string) => new AppError('UNSUPPORTED', 422, message),
  rateLimited: (retryAfterSec?: number) =>
    new AppError('RATE_LIMITED', 429, 'Too many requests. Please wait a little and try again.', retryAfterSec),
  quota: (what: string) => new AppError('PLAN_QUOTA_REACHED', 429, `This plan has used all of its ${what}.`),
  ai: () => new AppError('AI_UNAVAILABLE', 502, 'The planning assistant is unavailable right now. Please try again soon.'),
}
