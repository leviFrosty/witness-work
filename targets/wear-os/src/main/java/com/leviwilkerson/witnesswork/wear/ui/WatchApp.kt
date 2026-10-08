package com.leviwilkerson.witnesswork.wear.ui

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.wear.compose.material3.AlertDialog
import androidx.wear.compose.material3.AlertDialogDefaults
import androidx.wear.compose.material3.AppScaffold
import androidx.wear.compose.material3.ScreenScaffold
import androidx.wear.compose.material3.Text
import androidx.wear.compose.navigation.SwipeDismissableNavHost
import androidx.wear.compose.navigation.composable
import androidx.wear.compose.navigation.rememberSwipeDismissableNavController
import com.leviwilkerson.witnesswork.wear.L10n
import com.leviwilkerson.witnesswork.wear.MainActivity
import com.leviwilkerson.witnesswork.wear.TimerOngoingActivity
import com.leviwilkerson.witnesswork.wear.WatchModel
import kotlinx.coroutines.flow.StateFlow

/** The app's screens and its alert, as `RootView` in `WitnessWorkWatchApp.swift`. */
@Composable
fun WatchApp(launches: StateFlow<MainActivity.Launch?>, onLaunchHandled: () -> Unit) {
  val context by WatchModel.context.collectAsStateWithLifecycle()
  val alertKey by WatchModel.alertKey.collectAsStateWithLifecycle()
  val launch by launches.collectAsStateWithLifecycle()
  val snapshot = context?.snapshot
  val navController = rememberSwipeDismissableNavController()

  AppScaffold {
    SwipeDismissableNavHost(navController = navController, startDestination = HOME) {
      composable(HOME) {
        if (snapshot != null) {
          HomeScreen(
            snapshot = snapshot,
            onAddTime = { hours, minutes, fromTimer -> navController.navigate("addTime/$hours/$minutes/$fromTimer") },
            onUpNext = { navController.navigate("upNext/$it") },
          )
        } else {
          SetupScreen()
        }
      }
      composable("addTime/{hours}/{minutes}/{fromTimer}") { entry ->
        val arguments = entry.arguments
        if (snapshot != null) {
          AddTimeScreen(
            snapshot = snapshot,
            hours = arguments?.getString("hours")?.toIntOrNull() ?: 0,
            minutes = arguments?.getString("minutes")?.toIntOrNull() ?: 0,
            fromTimer = arguments?.getString("fromTimer") == "true",
            onDone = { navController.popBackStack() },
          )
        }
      }
      composable("upNext/{id}") { entry -> UpNextScreen(entry.arguments?.getString("id").orEmpty()) }
    }

    // From a complication, the tile or a notification.
    LaunchedEffect(launch, snapshot != null) {
      val request = launch ?: return@LaunchedEffect
      if (snapshot == null) return@LaunchedEffect
      navController.popBackStack(HOME, inclusive = false)
      when (request.route) {
        MainActivity.Route.ADD_TIME -> if (snapshot.showsTimeEntry) navController.navigate("addTime/0/0/false")
        MainActivity.Route.UP_NEXT -> request.upNextId?.let { navController.navigate("upNext/$it") }
        MainActivity.Route.HOME -> Unit
      }
      onLaunchHandled()
    }

    AlertDialog(
      visible = alertKey != null,
      onDismissRequest = { WatchModel.alertKey.value = null },
      // The whole message, however long; the dialog scrolls.
      title = { Text(L10n.t(alertKey.orEmpty(), snapshot), maxLines = Int.MAX_VALUE) },
      edgeButton = {
        AlertDialogDefaults.EdgeButton(onClick = { WatchModel.alertKey.value = null }) { Text(L10n.t("ok", snapshot)) }
      },
    )
  }
}

private const val HOME = "home"

@Composable
private fun SetupScreen() {
  ScreenScaffold {
    Box(Modifier.fillMaxSize().padding(20.dp), contentAlignment = Alignment.Center) {
      Text(L10n.t("watchSetUp", null), textAlign = TextAlign.Center)
    }
  }
}

/**
 * Asks once to post notifications, so a running timer can show as an Ongoing Activity. Call
 * when the user starts the timer.
 */
@Composable
fun rememberNotificationPermission(): () -> Unit {
  val context = LocalContext.current
  val launcher =
    rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
      if (granted) TimerOngoingActivity.update(context, WatchModel.timer, WatchModel.snapshot)
    }
  return {
    if (
      ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) !=
        PackageManager.PERMISSION_GRANTED
    ) {
      launcher.launch(Manifest.permission.POST_NOTIFICATIONS)
    }
  }
}
