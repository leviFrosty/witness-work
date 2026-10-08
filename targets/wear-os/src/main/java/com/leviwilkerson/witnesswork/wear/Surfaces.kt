package com.leviwilkerson.witnesswork.wear

import android.content.ComponentName
import android.content.Context
import androidx.wear.tiles.TileService
import androidx.wear.watchface.complications.datasource.ComplicationDataSourceUpdateRequester
import com.leviwilkerson.witnesswork.wear.complications.ProgressComplicationService
import com.leviwilkerson.witnesswork.wear.complications.ProgressRangeComplicationService
import com.leviwilkerson.witnesswork.wear.complications.ProgressSymbolComplicationService
import com.leviwilkerson.witnesswork.wear.complications.UpNextComplicationService
import com.leviwilkerson.witnesswork.wear.tile.ProgressTileService

/**
 * The complications and the tile: refreshed when what they show changes, as the watch app
 * reloads WidgetKit timelines, and tracked so the phone can count them for analytics.
 */
object Surfaces {
  /** The same kinds as the Apple Watch's widgets, so analytics count both alike. */
  const val PROGRESS = "WitnessWorkProgress"
  const val PROGRESS_RANGE = "WitnessWorkProgressRange"
  const val PROGRESS_SYMBOL = "WitnessWorkProgressSymbol"
  const val UP_NEXT = "WitnessWorkUpNext"
  const val TILE = "WitnessWorkTile"

  private const val PREFERENCES = "surfaces"

  fun update(context: Context) {
    for (service in
      listOf(
        ProgressComplicationService::class.java,
        ProgressRangeComplicationService::class.java,
        ProgressSymbolComplicationService::class.java,
        UpNextComplicationService::class.java,
      )) {
      ComplicationDataSourceUpdateRequester.create(context, ComponentName(context, service)).requestUpdateAll()
    }
    TileService.getUpdater(context).requestUpdate(ProgressTileService::class.java)
  }

  /** Records that the `kind` with this instance id was added to (or removed from) a face or the tiles. */
  fun setActive(context: Context, kind: String, instanceId: Int, active: Boolean) {
    val preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
    val instances = preferences.getStringSet("active", emptySet()).orEmpty().toMutableSet()
    val key = "$kind:$instanceId"
    if (active) instances += key else instances -= key
    preferences.edit().putStringSet("active", instances).apply()
  }

  /** Kinds of the complications and tile in use, for the phone's analytics. */
  fun activeKinds(context: Context): List<String> =
    context
      .getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
      .getStringSet("active", emptySet())
      .orEmpty()
      .map { it.substringBefore(':') }
      .toSortedSet()
      .toList()
}
