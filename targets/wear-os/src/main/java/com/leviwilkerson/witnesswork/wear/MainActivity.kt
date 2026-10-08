package com.leviwilkerson.witnesswork.wear

import android.content.Context
import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.mutableStateOf
import androidx.wear.ambient.AmbientLifecycleObserver
import com.leviwilkerson.witnesswork.wear.ui.LocalHidesNames
import com.leviwilkerson.witnesswork.wear.ui.WatchApp
import com.leviwilkerson.witnesswork.wear.ui.WitnessWorkTheme
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch

/**
 * The watch app. Stays on screen dimmed (ambient) while the wrist is down, as watchOS apps do,
 * and then hides Contacts' names: the screen may be seen by the person you're talking with.
 */
class MainActivity : ComponentActivity() {
  enum class Route {
    HOME,
    ADD_TIME,
    UP_NEXT,
  }

  /** Where an intent asks the app to go: from a complication, the tile or a notification. */
  data class Launch(val route: Route, val upNextId: String?)

  companion object {
    const val EXTRA_ROUTE = "route"
    const val EXTRA_UP_NEXT_ID = "upNextId"

    /** Opens an Up Next item, from its complication; the app's home without one. */
    fun upNextIntent(context: Context, id: String?): Intent =
      Intent(context, MainActivity::class.java)
        .putExtra(EXTRA_ROUTE, if (id == null) Route.HOME.name else Route.UP_NEXT.name)
        .putExtra(EXTRA_UP_NEXT_ID, id)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
  }

  private val launches = MutableStateFlow<Launch?>(null)
  private val isAmbient = mutableStateOf(false)

  private val ambientObserver =
    AmbientLifecycleObserver(
      this,
      object : AmbientLifecycleObserver.AmbientLifecycleCallback {
        override fun onEnterAmbient(ambientDetails: AmbientLifecycleObserver.AmbientDetails) {
          isAmbient.value = true
        }

        override fun onExitAmbient() {
          isAmbient.value = false
        }
      },
    )

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    WatchModel.init(this)
    lifecycle.addObserver(ambientObserver)
    handle(intent)
    setContent {
      WitnessWorkTheme {
        CompositionLocalProvider(LocalHidesNames provides isAmbient.value) {
          WatchApp(launches = launches, onLaunchHandled = { launches.value = null })
        }
      }
    }
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    handle(intent)
  }

  override fun onResume() {
    super.onResume()
    // Restores the running timer's Ongoing Activity, e.g. after the watch restarted, and
    // refreshes the complications and tile, e.g. after the app was updated.
    TimerOngoingActivity.update(this, WatchModel.timer, WatchModel.snapshot)
    Surfaces.update(this)
    PhoneSession.startListening()
    WatchModel.scope.launch { WatchModel.refresh() }
  }

  override fun onPause() {
    PhoneSession.stopListening()
    super.onPause()
  }

  private fun handle(intent: Intent?) {
    val route = intent?.getStringExtra(EXTRA_ROUTE)?.let { name -> Route.entries.firstOrNull { it.name == name } }
    if (route != null && route != Route.HOME) {
      launches.value = Launch(route, intent.getStringExtra(EXTRA_UP_NEXT_ID))
    }
  }
}
