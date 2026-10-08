package com.leviwilkerson.witnesswork.wear.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.Color
import androidx.wear.compose.material3.ColorScheme
import androidx.wear.compose.material3.MaterialTheme
import com.leviwilkerson.witnesswork.wear.now
import kotlinx.coroutines.delay
import java.time.ZonedDateTime

/** The app's accent, as the Apple Watch app's (`$accent` in `targets/watch/expo-target.config.js`). */
val Accent = Color(0xFF4BD27C)

/** watchOS's secondary label color on black. */
val Secondary = Color(0xFF9A9A9F)

/** A list row's background (a watchOS platter). */
val Platter = Color(0xFF222224)

private val colors =
  ColorScheme(
    primary = Accent,
    primaryDim = Accent,
    primaryContainer = Accent,
    onPrimary = Color.Black,
    onPrimaryContainer = Color.Black,
    secondary = Accent,
    secondaryContainer = Platter,
    onSecondaryContainer = Color.White,
    surfaceContainerLow = Color(0xFF161618),
    surfaceContainer = Platter,
    surfaceContainerHigh = Color(0xFF2C2C2F),
    onSurface = Color.White,
    onSurfaceVariant = Secondary,
    background = Color.Black,
    onBackground = Color.White,
  )

@Composable
fun WitnessWorkTheme(content: @Composable () -> Unit) {
  MaterialTheme(colorScheme = colors, content = content)
}

/** Wrist down: the screen may be seen by the person you're talking with. */
val LocalHidesNames = compositionLocalOf { false }

/** The time, moving on every minute (or `periodMs`), like watchOS's `TimelineView`. */
@Composable
fun rememberClock(periodMs: Long = 60_000): ZonedDateTime {
  var time by remember { mutableStateOf(now()) }
  LaunchedEffect(periodMs) {
    while (true) {
      val current = now()
      time = current
      val intoPeriod = current.toInstant().toEpochMilli() % periodMs
      delay(periodMs - intoPeriod)
    }
  }
  return time
}
