package expo.modules.speechtranscription

import android.content.Context
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.net.Uri

/**
 * Plays the short start and end cues as sonification, which follows the ringer
 * mode like iOS's silent switch. Requests no audio focus: taking it would end
 * the recording through `AudioFocus`.
 */
internal object CuePlayer {
  fun play(context: Context, uri: String) {
    val player = MediaPlayer()
    runCatching {
      player.setAudioAttributes(
        AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION)
          .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
          .build(),
      )
      player.setDataSource(context, Uri.parse(uri))
      player.setOnPreparedListener { it.start() }
      player.setOnCompletionListener { it.release() }
      player.setOnErrorListener { failed, _, _ ->
        failed.release()
        true
      }
      player.prepareAsync()
    }.onFailure { player.release() }
  }
}
