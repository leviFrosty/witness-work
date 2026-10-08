package com.leviwilkerson.witnesswork.wear

/**
 * Why an action couldn't finish, as `ServiceActionError` in `ServiceIntents.swift`: shown in the
 * app, the tile's and the timer notification's confirmations. Only the cases Wear OS can hit.
 */
enum class ServiceActionError(
  /** Translation key. */
  val key: String,
) {
  NOT_SET_UP("watchSetUp"),
  HOURS_LOGGING_OFF("watchHoursLoggingOff"),
  TIMER_EMPTY("siriTimerEmpty"),
  TIMER_TOO_LONG("siriTimerTooLong"),
  PHONE_UNREACHABLE("watchPhoneUnreachable"),
  TIMER_CHANGED("watchTimerChanged"),
  FAILED("requestFailedTryAgain"),
}

class ServiceActionException(val error: ServiceActionError) : Exception(error.key)
