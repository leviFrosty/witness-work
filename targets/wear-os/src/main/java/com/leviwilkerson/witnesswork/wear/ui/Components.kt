package com.leviwilkerson.witnesswork.wear.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.paint
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.painter.ColorPainter
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.wear.compose.material3.Icon
import androidx.wear.compose.material3.MaterialTheme
import androidx.wear.compose.material3.SurfaceTransformation
import androidx.wear.compose.material3.Text
import java.util.Locale

/**
 * A list row's background, like a watchOS list platter. In a `TransformingLazyColumn`, pass
 * the item's `transformation` so the row morphs at the screen's edges as Wear's buttons do.
 */
@Composable
fun PlatterRow(
  modifier: Modifier = Modifier,
  transformation: SurfaceTransformation? = null,
  content: @Composable BoxScope.() -> Unit,
) {
  val shape = RoundedCornerShape(24.dp)
  val background = remember(transformation) { transformation?.createContainerPainter(ColorPainter(Platter), shape) }
  val container =
    if (transformation != null && background != null) {
      Modifier.graphicsLayer { with(transformation) { applyContainerTransformation() } }.paint(background)
    } else {
      Modifier.clip(shape).background(Platter)
    }
  Box(
    modifier
      .fillMaxWidth()
      .then(container)
      .graphicsLayer { transformation?.run { applyContentTransformation() } }
      .padding(horizontal = 14.dp, vertical = 10.dp),
    content = content,
  )
}

/** A section's small uppercase label (watchOS `caption2`, `.textCase(.uppercase)`). */
@Composable
fun SectionLabel(text: String) {
  Text(
    text.uppercase(Locale.getDefault()),
    style = MaterialTheme.typography.labelSmall,
    color = Secondary,
    maxLines = 1,
    overflow = TextOverflow.Ellipsis,
  )
}

/** Small secondary text (watchOS `footnote`). */
@Composable
fun Footnote(text: String, color: Color = Secondary, maxLines: Int = Int.MAX_VALUE) {
  Text(
    text,
    style = MaterialTheme.typography.bodySmall,
    color = color,
    maxLines = maxLines,
    overflow = TextOverflow.Ellipsis,
  )
}

/** An icon and text, like a SwiftUI `Label`. */
@Composable
fun IconLabel(
  icon: Int,
  text: String,
  color: Color,
  modifier: Modifier = Modifier,
  bold: Boolean = false,
  maxLines: Int = Int.MAX_VALUE,
) {
  androidx.compose.foundation.layout.Row(
    modifier,
    verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
    horizontalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(4.dp),
  ) {
    Icon(painterResource(icon), contentDescription = null, tint = color, modifier = Modifier.size(14.dp))
    Text(
      text,
      style = MaterialTheme.typography.bodySmall,
      color = color,
      fontWeight = if (bold) FontWeight.SemiBold else null,
      maxLines = maxLines,
      overflow = TextOverflow.Ellipsis,
    )
  }
}

/**
 * Progress toward the monthly goal, with a mark where the user's Plans put them by today: fill
 * left of the mark means behind, past it ahead. Never turns red; it's seen all day, and behind
 * is no reason for alarm. A port of `PaceBar.swift`.
 */
@Composable
fun PaceBar(fraction: Double, paceFraction: Double?, modifier: Modifier = Modifier) {
  val barHeight = 6.dp
  Canvas(modifier.fillMaxWidth().height(barHeight + 4.dp).clearAndSetSemantics {}) {
    val height = barHeight.toPx()
    val top = (size.height - height) / 2
    val width = size.width
    val markWidth = 2.dp.toPx()
    val gap = 2.dp.toPx()
    val markX = paceFraction?.let { (width * it.toFloat() - markWidth / 2).coerceIn(0f, width - markWidth) }
    val radius = CornerRadius(height / 2)

    fun bar() {
      drawRoundRect(Color.White.copy(alpha = 0.25f), Offset(0f, top), Size(width, height), radius)
      if (fraction > 0) {
        val fill = maxOf(width * fraction.toFloat(), height)
        drawRoundRect(Accent, Offset(0f, top), Size(fill, height), radius)
      }
    }

    if (markX == null) {
      bar()
    } else {
      // The bar is cut away beside the mark to keep it visible.
      clipRect(right = maxOf(markX - gap, 0f)) { bar() }
      clipRect(left = markX + markWidth + gap) { bar() }
      drawRoundRect(Color.White, Offset(markX, 0f), Size(markWidth, size.height), CornerRadius(markWidth / 2))
    }
  }
}

/** watchOS's timer text: `5:03` under an hour, `1:05:00` from then. */
fun formatElapsed(elapsedMs: Double): String {
  val seconds = (elapsedMs / 1000).toLong()
  val hours = seconds / 3600
  val minutes = (seconds / 60) % 60
  val rest = seconds % 60
  return if (hours > 0) "%d:%02d:%02d".format(hours, minutes, rest) else "%d:%02d".format(minutes, rest)
}
