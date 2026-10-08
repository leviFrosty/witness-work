package com.leviwilkerson.witnesswork.wear.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.wear.compose.foundation.lazy.TransformingLazyColumn
import androidx.wear.compose.foundation.lazy.rememberTransformingLazyColumnState
import androidx.wear.compose.material3.ButtonDefaults
import androidx.wear.compose.material3.CompactButton
import androidx.wear.compose.material3.Dialog
import androidx.wear.compose.material3.EdgeButton
import androidx.wear.compose.material3.EdgeButtonSize
import androidx.wear.compose.material3.ListHeader
import androidx.wear.compose.material3.MaterialTheme
import androidx.wear.compose.material3.PickerGroup
import androidx.wear.compose.material3.RadioButton
import androidx.wear.compose.material3.ScreenScaffold
import androidx.wear.compose.material3.Text
import androidx.wear.compose.material3.rememberPickerState
import com.leviwilkerson.witnesswork.watchprotocol.WatchOrigin
import com.leviwilkerson.witnesswork.watchprotocol.WatchSnapshot
import com.leviwilkerson.witnesswork.wear.L10n
import com.leviwilkerson.witnesswork.wear.WatchModel
import kotlinx.coroutines.launch

/**
 * Adds time for today, a port of `AddTimeView.swift`. From the timer, it saves the timer's
 * time and resets the timer on the phone.
 */
@Composable
fun AddTimeScreen(snapshot: WatchSnapshot, hours: Int, minutes: Int, fromTimer: Boolean, onDone: () -> Unit) {
  val scope = rememberCoroutineScope()
  val haptics = LocalHapticFeedback.current
  val hoursState = rememberPickerState(initialNumberOfOptions = 24, initiallySelectedIndex = hours.coerceIn(0, 23))
  val minutesState = rememberPickerState(initialNumberOfOptions = 60, initiallySelectedIndex = minutes.coerceIn(0, 59))
  var selectedPicker by remember { mutableIntStateOf(0) }
  var categoryId by remember { mutableStateOf<String?>(null) }
  var choosingType by remember { mutableStateOf(false) }
  var isSaving by remember { mutableStateOf(false) }
  val chosenHours = hoursState.selectedOptionIndex
  val chosenMinutes = minutesState.selectedOptionIndex

  fun save() {
    isSaving = true
    scope.launch {
      try {
        if (fromTimer) {
          WatchModel.saveTimer(chosenHours, chosenMinutes, categoryId)
        } else {
          WatchModel.addEntry(chosenHours, chosenMinutes, categoryId, WatchOrigin.APP)
        }
        haptics.performHapticFeedback(HapticFeedbackType.Confirm)
        onDone()
      } catch (error: Exception) {
        WatchModel.show(error)
      }
      isSaving = false
    }
  }

  ScreenScaffold {
    Box(Modifier.fillMaxSize()) {
      Column(
        Modifier.fillMaxWidth().padding(top = 26.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(0.dp),
      ) {
        Text(L10n.t("addTime", snapshot), style = MaterialTheme.typography.labelLarge, color = Accent)
        // The wheels' labels always show, not only on focus.
        Row(horizontalArrangement = Arrangement.spacedBy(PICKER_SPACING)) {
          for (label in listOf("hours", "minutes")) {
            Text(
              L10n.t(label, snapshot),
              style = MaterialTheme.typography.labelSmall,
              color = Secondary,
              textAlign = TextAlign.Center,
              maxLines = 1,
              overflow = TextOverflow.Ellipsis,
              modifier = Modifier.width(PICKER_WIDTH),
            )
          }
        }
        PickerGroup(
          selectedPickerState = if (selectedPicker == 0) hoursState else minutesState,
          modifier = Modifier.height(66.dp),
          autoCenter = false,
        ) {
          for ((index, state) in listOf(hoursState, minutesState).withIndex()) {
            PickerGroupItem(
              pickerState = state,
              selected = selectedPicker == index,
              onSelected = { selectedPicker = index },
              modifier = Modifier.width(PICKER_WIDTH),
              contentDescription = {
                "${state.selectedOptionIndex} ${L10n.t(if (index == 0) "hours" else "minutes", snapshot)}"
              },
            ) { option, _ ->
              Text("$option", style = MaterialTheme.typography.titleLarge)
            }
          }
        }
        if (snapshot.categories.isNotEmpty()) {
          val typeName = snapshot.categories.firstOrNull { it.id == categoryId }?.name ?: L10n.t("standard", snapshot)
          CompactButton(
            onClick = { choosingType = true },
            colors = ButtonDefaults.filledTonalButtonColors(),
            label = {
              Text("${L10n.t("type", snapshot)}: $typeName", maxLines = 1, overflow = TextOverflow.Ellipsis)
            },
          )
        }
      }
      EdgeButton(
        onClick = ::save,
        enabled = (chosenHours != 0 || chosenMinutes != 0) && !isSaving,
        buttonSize = EdgeButtonSize.ExtraSmall,
        modifier = Modifier.align(Alignment.BottomCenter),
      ) {
        Text(L10n.t("save", snapshot))
      }
    }
  }

  TypeDialog(
    visible = choosingType,
    snapshot = snapshot,
    selected = categoryId,
    onSelect = {
      categoryId = it
      choosingType = false
    },
    onDismiss = { choosingType = false },
  )
}

private val PICKER_WIDTH = 64.dp
private val PICKER_SPACING = 8.dp

/** Standard or one of the user's Types, like the Apple Watch's Type picker. */
@Composable
private fun TypeDialog(
  visible: Boolean,
  snapshot: WatchSnapshot,
  selected: String?,
  onSelect: (String?) -> Unit,
  onDismiss: () -> Unit,
) {
  Dialog(visible = visible, onDismissRequest = onDismiss) {
    val listState = rememberTransformingLazyColumnState()
    ScreenScaffold(scrollState = listState) { contentPadding ->
      TransformingLazyColumn(state = listState, contentPadding = contentPadding) {
        item { ListHeader { Text(L10n.t("type", snapshot)) } }
        val options = listOf<Pair<String?, String>>(null to L10n.t("standard", snapshot)) +
          snapshot.categories.map { it.id to it.name }
        for ((id, name) in options) {
          item {
            RadioButton(
              selected = selected == id,
              onSelect = { onSelect(id) },
              modifier = Modifier.fillMaxWidth(),
              label = { Text(name, maxLines = 2, overflow = TextOverflow.Ellipsis) },
            )
          }
        }
      }
    }
  }
}
