package com.leviwilkerson.witnesswork.wear

import androidx.compose.ui.unit.LayoutDirection
import com.leviwilkerson.witnesswork.watchprotocol.WatchSnapshot
import java.text.DecimalFormat
import java.text.DecimalFormatSymbols
import java.util.Locale
import java.util.Optional
import java.util.concurrent.ConcurrentHashMap

/**
 * The app's Language, for what the watch lays out and writes itself, as `AppLanguage.swift`
 * does on the Apple Watch. Text arrives translated from the phone's JavaScript, but the watch
 * would lay it out and write numbers in its own language, which can differ from the one chosen
 * in the app (ADR 0026). Both are `null` from a phone app older than this; the watch's own
 * choice stands then.
 */
data class AppLanguage(
  /** The app lays out right to left: an RTL Language, or the dev Force Right to Left switch. */
  val rtl: Boolean?,
  /** BCP 47 tag the app writes numbers in, e.g. `en-us`, or `ar-u-nu-arab` for Arabic-Indic digits. */
  val numberLocale: String?,
) {
  val layoutDirection: LayoutDirection?
    get() = rtl?.let { if (it) LayoutDirection.Rtl else LayoutDirection.Ltr }

  /** The Language's digits, or `null` for Latin ones. Built once per `numberLocale`. */
  private val digitsFormat: DigitsFormat?
    get() = if (numberLocale.isNullOrEmpty()) null else DigitsFormat.of(numberLocale)

  /**
   * `numberLocale` when its digits aren't Latin (`٠`–`٩`). Languages with Latin digits get
   * `null`, and keep numbers as the phone writes them (`12.5`, whatever their decimal separator).
   */
  val digitsLocale: Locale?
    get() = digitsFormat?.locale

  /** A count, e.g. a goal of `50` hours. */
  fun number(value: Int): String = digitsFormat?.whole(value) ?: value.toString()

  /** One decimal place, none for a whole number: `5`, `12.5`. */
  fun decimal(value: Double): String {
    val digits = digitsFormat
      ?: return if (value == Math.rint(value)) "${value.toLong()}" else String.format(Locale.ROOT, "%.1f", value)
    return digits.tenths(value)
  }

  /** `5:03` under an hour, `1:05:00` from then, as watchOS's timer text. */
  fun elapsed(elapsedMs: Double): String {
    val seconds = (elapsedMs / 1000).toLong()
    val hours = seconds / 3600
    val minutes = (seconds / 60) % 60
    val rest = seconds % 60
    val locale = digitsLocale ?: Locale.ROOT
    return if (hours > 0) {
      String.format(locale, "%d:%02d:%02d", hours, minutes, rest)
    } else {
      String.format(locale, "%d:%02d", minutes, rest)
    }
  }

  /** Rewrites a number the phone already wrote (`12.5`, `1:05`) in the Language's digits. */
  fun digits(text: String): String {
    val digits = digitsFormat ?: return text
    fun isDigit(index: Int) = text.getOrNull(index)?.let { it in '0'..'9' } == true
    return buildString {
      text.forEachIndexed { index, char ->
        when {
          isDigit(index) -> append(digits.zeroDigit + (char - '0'))
          char == '.' && isDigit(index - 1) && isDigit(index + 1) -> append(digits.decimalSeparator)
          else -> append(char)
        }
      }
    }
  }

  /**
   * A `numberLocale` with non-Latin digits and its formatters. Tiles, complications and the app
   * format on every render, so each tag is resolved once and kept.
   */
  private class DigitsFormat(val locale: Locale, symbols: DecimalFormatSymbols) {
    val zeroDigit = symbols.zeroDigit
    val decimalSeparator = symbols.decimalSeparator
    private val wholeFormat = formatter(symbols, 0)
    private val tenthsFormat = formatter(symbols, 1)

    // DecimalFormat isn't thread-safe; tiles and complications render off the main thread.
    fun whole(value: Int): String = synchronized(wholeFormat) { wholeFormat.format(value) }

    fun tenths(value: Double): String = synchronized(tenthsFormat) { tenthsFormat.format(value) }

    companion object {
      /** By `numberLocale`; empty for a tag with Latin digits. */
      private val cache = ConcurrentHashMap<String, Optional<DigitsFormat>>()

      fun of(numberLocale: String): DigitsFormat? =
        cache.getOrPut(numberLocale) {
          val locale = Locale.forLanguageTag(numberLocale)
          val symbols = DecimalFormatSymbols.getInstance(locale)
          Optional.ofNullable(if (symbols.zeroDigit != '0') DigitsFormat(locale, symbols) else null)
        }.orElse(null)

      private fun formatter(symbols: DecimalFormatSymbols, fractionDigits: Int) =
        DecimalFormat("0", symbols).apply {
          isGroupingUsed = false
          minimumFractionDigits = 0
          maximumFractionDigits = fractionDigits
        }
    }
  }

  companion object {
    /** The watch's own language, before the phone has said. */
    val SYSTEM = AppLanguage(rtl = null, numberLocale = null)
  }
}

/** Direction and digits in the app's Language. */
val WatchSnapshot?.appLanguage: AppLanguage
  get() = if (this == null) AppLanguage.SYSTEM else AppLanguage(rtl, numberLocale)
