import ExpoModulesCore

/**
 * Plays short preloaded sounds with low latency, for the reward stack's hits
 * and ticks (`src/lib/audio.ts`). See `SoundEffectsPlayer`.
 */
public class SoundEffectsModule: Module {
  private let player = SoundEffectsPlayer()

  public func definition() -> ModuleDefinition {
    Name("SoundEffects")

    // Bumped when the JS-facing interface changes, so OTA bundles can check it.
    Constant("soundEffectsVersion") {
      1
    }

    // Decodes the local file at `uri` into memory as `key`.
    AsyncFunction("load") { (key: String, uri: String) -> Bool in
      self.player.load(key, uri: uri)
    }

    Function("play") { (key: String, rate: Double, volume: Double) in
      self.player.play(key, rate: rate, volume: volume)
    }

    Function("unloadAll") {
      self.player.unloadAll()
    }

    OnDestroy {
      self.player.unloadAll()
    }
  }
}
