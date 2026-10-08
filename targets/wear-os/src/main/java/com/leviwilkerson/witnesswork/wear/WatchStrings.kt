package com.leviwilkerson.witnesswork.wear

import android.content.Context
import android.content.res.Resources
import com.leviwilkerson.witnesswork.watchprotocol.WatchSnapshot

/**
 * Display strings for the watch, as `WatchStrings.swift` does them. The phone app sends its
 * translations in the language chosen in the app; before the first snapshot, and for text the
 * system shows (the complication and tile pickers, notifications), the bundled resources
 * generated from the same translations (`src/locales`, by `scripts/sync-widget-shared.mjs`)
 * are used instead.
 */
object L10n {
  @Volatile private var resources: Resources? = null

  fun init(context: Context) {
    resources = context.applicationContext.resources
  }

  fun t(key: String, snapshot: WatchSnapshot?): String {
    snapshot?.strings?.get(key)?.takeIf { it.isNotEmpty() }?.let { return it }
    val id = BundledStrings.ids[key] ?: return key
    return resources?.getString(id) ?: key
  }

  /** For one-line spots; some app strings contain line breaks. */
  fun line(key: String, snapshot: WatchSnapshot?): String = t(key, snapshot).replace("\n", " ")
}
