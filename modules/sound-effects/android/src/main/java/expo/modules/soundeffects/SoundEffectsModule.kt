package expo.modules.soundeffects

import android.media.AudioAttributes
import android.media.SoundPool
import android.net.Uri
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Plays short preloaded sounds with low latency, for the reward stack's hits
 * and ticks (`src/lib/audio.ts`). `SoundPool` decodes each sound into memory
 * once, so a play starts at once; expo-audio's ExoPlayer reads from the file
 * instead. A faster rate raises the pitch with it, like a tape. Sounds play on
 * the media stream, as expo-audio's did, and take no audio focus, so the
 * User's music keeps playing under them.
 */
class SoundEffectsModule : Module() {
  private val lock = Any()
  private var pool: SoundPool? = null
  private val sounds = mutableMapOf<String, Int>()
  private val loaded = mutableSetOf<Int>()
  private val waiting = mutableMapOf<Int, MutableList<Promise>>()

  override fun definition() = ModuleDefinition {
    Name("SoundEffects")

    // Bumped when the JS-facing interface changes, so OTA bundles can check it.
    Constant("soundEffectsVersion") {
      1
    }

    // Decodes the local file at `uri` into memory as `key`.
    AsyncFunction("load") { key: String, uri: String, promise: Promise ->
      load(key, uri, promise)
    }

    Function("play") { key: String, rate: Double, volume: Double ->
      play(key, rate, volume)
    }

    Function("unloadAll") {
      unloadAll()
    }

    OnDestroy {
      unloadAll()
    }
  }

  private fun load(key: String, uri: String, promise: Promise) {
    val parsed = Uri.parse(uri)
    val path = parsed.path
    if (parsed.scheme != "file" || path == null) return promise.resolve(false)
    synchronized(lock) {
      val existing = sounds[key]
      when {
        existing == null -> {
          val id = pool().load(path, 1)
          if (id == 0) return promise.resolve(false)
          sounds[key] = id
          waiting.getOrPut(id) { mutableListOf() }.add(promise)
        }
        existing in loaded -> promise.resolve(true)
        else -> waiting.getOrPut(existing) { mutableListOf() }.add(promise)
      }
    }
  }

  private fun play(key: String, rate: Double, volume: Double) {
    synchronized(lock) {
      val id = sounds[key]?.takeIf { it in loaded } ?: return
      val level = volume.coerceIn(0.0, 1.0).toFloat()
      pool?.play(id, level, level, 1, 0, rate.coerceIn(0.5, 2.0).toFloat())
    }
  }

  private fun unloadAll() {
    val pending = synchronized(lock) {
      pool?.release()
      pool = null
      sounds.clear()
      loaded.clear()
      waiting.values.flatten().also { waiting.clear() }
    }
    pending.forEach { it.resolve(false) }
  }

  private fun pool(): SoundPool =
    pool ?: SoundPool.Builder()
      .setMaxStreams(MAX_STREAMS)
      .setAudioAttributes(
        AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_GAME)
          .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
          .build(),
      )
      .build()
      .also { created ->
        created.setOnLoadCompleteListener { from, id, status -> onLoaded(from, id, status == 0) }
        pool = created
      }

  private fun onLoaded(from: SoundPool, id: Int, ok: Boolean) {
    val promises = synchronized(lock) {
      // Loaded into a pool since let go.
      if (from !== pool) return
      if (ok) {
        loaded.add(id)
      } else {
        sounds.entries.removeAll { it.value == id }
      }
      waiting.remove(id).orEmpty()
    }
    promises.forEach { it.resolve(ok) }
  }

  private companion object {
    /** Quick hits and ticks overlap instead of cutting each other off. */
    const val MAX_STREAMS = 8
  }
}
