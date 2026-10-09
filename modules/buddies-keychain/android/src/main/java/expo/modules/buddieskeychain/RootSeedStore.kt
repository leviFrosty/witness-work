package expo.modules.buddieskeychain

import android.content.Context
import android.os.SystemClock
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import com.google.android.gms.auth.blockstore.Blockstore
import com.google.android.gms.auth.blockstore.BlockstoreClient
import com.google.android.gms.auth.blockstore.BlockstoreStatusCodes
import com.google.android.gms.auth.blockstore.DeleteBytesRequest
import com.google.android.gms.auth.blockstore.RetrieveBytesRequest
import com.google.android.gms.auth.blockstore.StoreBytesData
import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.GoogleApiAvailability
import com.google.android.gms.common.api.ApiException
import com.google.android.gms.common.api.CommonStatusCodes
import com.google.android.gms.tasks.Task
import com.google.android.gms.tasks.Tasks
import java.io.File
import java.security.KeyStore
import java.security.SecureRandom
import java.util.concurrent.ExecutionException
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import javax.crypto.AEADBadTagException
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * The Buddies root seed on Android, the counterpart of the iOS synchronizable
 * Keychain item (see ADR 0020).
 *
 * - **On this device** the seed is sealed with AES-256-GCM under a
 *   non-exportable Android Keystore key and kept in `noBackupFilesDir`, which
 *   Auto Backup never copies (a copy would be useless anyway: Keystore keys
 *   never leave the device).
 * - **Across reinstalls and new phones** it rides in Block Store, Google Play
 *   services' store for small secrets. Cloud backup is requested only while
 *   Block Store can encrypt it end to end (Android 9+ with a screen lock);
 *   otherwise the copy stays on this device, where it still survives a
 *   reinstall while Google backup is on. Raw key material never reaches a
 *   backup that isn't end-to-end encrypted.
 *
 * Unlike iCloud Keychain, Block Store doesn't sync between two devices in use;
 * it restores at setup and on reinstall only.
 */
internal class RootSeedStore(context: Context) {
  private val context = context.applicationContext
  private val random = SecureRandom()

  /** Guards the local copy and `cached`. */
  private val lock = Any()

  /**
   * Serializes Block Store writes so a backup in flight can't outlive a
   * delete. Always taken before `lock`, never inside it.
   */
  private val blockStoreLock = Any()
  private val backupExecutor =
    Executors.newSingleThreadExecutor { runnable ->
      Thread(runnable, "BuddiesRootSeedBackup").apply { isDaemon = true }
    }
  private var cached: ByteArray? = null
  private var backupChecked = false

  /**
   * When checking Block Store for a backup last failed, and why. Every Buddies
   * call needs the seed, so without this each would wait out Block Store again;
   * instead they fail fast until `RETRIEVE_BACKOFF_MS` has passed.
   */
  private var retrieveFailedAt = 0L
  private var retrieveFailure: RootSeedException? = null

  private val sealedFile get() = File(context.noBackupFilesDir, SEALED_FILE)
  private val backupMarker get() = File(context.noBackupFilesDir, BACKUP_MARKER_FILE)

  /**
   * The seed, restored from Block Store when this install has none yet. Null
   * means there is none anywhere; a backup that can't be checked right now
   * throws instead, so a restorable identity is never mistaken for none.
   */
  fun peek(): ByteArray? {
    val seed = synchronized(lock) { loadLocked() } ?: return null
    scheduleBackupCheck()
    return seed.copyOf()
  }

  /** The seed, creating one (32 random bytes) when there is none anywhere. */
  fun getOrCreate(): ByteArray {
    val seed =
      synchronized(lock) {
        loadLocked()
          ?: ByteArray(SEED_BYTES).also {
            random.nextBytes(it)
            writeSealed(it)
            cached = it
          }
      }
    scheduleBackupCheck()
    return seed.copyOf()
  }

  /**
   * Deletes the seed here and from Block Store (and with it the cloud backup).
   * Throws, keeping everything, when a backup that exists can't be deleted, so
   * the caller can retry instead of leaving an identity that comes back on
   * reinstall.
   */
  fun delete() {
    synchronized(blockStoreLock) {
      synchronized(lock) {
        try {
          blockStore()?.let { client ->
            await(
              client.deleteBytes(
                DeleteBytesRequest.Builder().setKeys(listOf(BLOCK_STORE_KEY)).build()
              )
            )
          }
        } catch (error: Exception) {
          // Only a backup this install wrote or restored has to go.
          if (!isUnsupported(error) && backupMarker.exists()) {
            throw RootSeedException("Could not delete the backed-up root seed", error)
          }
        }
        sealedFile.delete()
        backupMarker.delete()
        keyStore().deleteEntry(KEY_ALIAS)
        cached = null
        backupChecked = false
        retrieveFailure = null
      }
    }
  }

  /**
   * Where the seed is backed up, for diagnostics: `cloud` (end-to-end
   * encrypted), `device` (Block Store on this device only), `restored` (came
   * from Block Store; re-stored at the next launch), `pending`, or
   * `unavailable` (no Google Play services).
   */
  fun backupState(): String {
    val available =
      try {
        blockStore() != null
      } catch (_: Exception) {
        true
      }
    if (!available) return "unavailable"
    return readMarker() ?: "pending"
  }

  private fun loadLocked(): ByteArray? {
    cached?.let { return it }
    readSealed()?.let {
      cached = it
      return it
    }
    // First use on this install, or a reinstall or new phone: look for a backup.
    retrieveFailure?.let { failure ->
      if (SystemClock.elapsedRealtime() - retrieveFailedAt < RETRIEVE_BACKOFF_MS) throw failure
    }
    val restored =
      try {
        retrieveBackup()
      } catch (error: RootSeedException) {
        retrieveFailedAt = SystemClock.elapsedRealtime()
        retrieveFailure = error
        throw error
      }
    retrieveFailure = null
    if (restored == null) return null
    writeSealed(restored)
    writeMarker(MARKER_RESTORED)
    cached = restored
    return restored
  }

  // --- Block Store -----------------------------------------------------------

  /** Null when Google Play services (and with it Block Store) is missing. */
  private fun blockStore(): BlockstoreClient? =
    when (GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(context)) {
      ConnectionResult.SUCCESS -> Blockstore.getClient(context)
      // Back shortly; not the same as having no backup.
      ConnectionResult.SERVICE_UPDATING ->
        throw RootSeedException("Google Play services is updating")
      else -> null
    }

  private fun retrieveBackup(): ByteArray? {
    val response =
      try {
        val client = blockStore() ?: return null
        await(
          client.retrieveBytes(
            RetrieveBytesRequest.Builder().setKeys(listOf(BLOCK_STORE_KEY)).build()
          )
        )
      } catch (error: Exception) {
        if (isUnsupported(error)) return null
        throw RootSeedException("Could not check the backup for a root seed", error)
      }
    val bytes = response.blockstoreDataMap[BLOCK_STORE_KEY]?.bytes ?: return null
    if (bytes.size != 1 + SEED_BYTES || bytes[0] != FORMAT_VERSION) {
      // Never replaced: it may be a newer build's format.
      throw RootSeedException("The backed-up root seed is unreadable")
    }
    return bytes.copyOfRange(1, bytes.size)
  }

  /** Once per process, off the JS thread: failures retry at the next launch. */
  private fun scheduleBackupCheck() {
    synchronized(lock) {
      if (backupChecked) return
      backupChecked = true
    }
    backupExecutor.execute {
      try {
        syncBackup()
      } catch (_: Exception) {
        // Best effort; the seed is safe on this device either way.
      }
    }
  }

  /**
   * Stores the seed in Block Store, with cloud backup exactly when it can be
   * end-to-end encrypted. Turning a screen lock on or off changes which.
   */
  private fun syncBackup() {
    synchronized(blockStoreLock) {
      val seed = synchronized(lock) { cached?.copyOf() } ?: return
      val client = blockStore() ?: return
      val cloud = await(client.isEndToEndEncryptionAvailable())
      val wanted = if (cloud) MARKER_CLOUD else MARKER_DEVICE
      if (readMarker() == wanted) return
      await(
        client.storeBytes(
          StoreBytesData.Builder()
            .setKey(BLOCK_STORE_KEY)
            .setBytes(byteArrayOf(FORMAT_VERSION) + seed)
            .setShouldBackupToCloud(cloud)
            .build()
        )
      )
      synchronized(lock) {
        if (cached?.contentEquals(seed) == true) writeMarker(wanted)
      }
    }
  }

  private fun isUnsupported(error: Exception): Boolean {
    val status = (error as? ApiException)?.statusCode ?: return false
    return status == CommonStatusCodes.API_NOT_CONNECTED ||
      status == BlockstoreStatusCodes.FEATURE_NOT_SUPPORTED
  }

  private fun <T> await(task: Task<T>): T =
    try {
      Tasks.await(task, TIMEOUT_SECONDS, TimeUnit.SECONDS)
    } catch (error: ExecutionException) {
      throw (error.cause as? Exception) ?: error
    }

  private fun readMarker(): String? =
    backupMarker.takeIf { it.exists() }?.readText()?.trim()?.ifEmpty { null }

  private fun writeMarker(value: String) = writeAtomically(backupMarker, value.toByteArray())

  // --- Local copy (Android Keystore) -------------------------------------------

  private fun keyStore(): KeyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }

  private fun key(create: Boolean): SecretKey? {
    (keyStore().getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
    if (!create) return null
    // Usable after the first unlock, like the iOS item, so a push can sync on
    // a locked phone.
    val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
    generator.init(
      KeyGenParameterSpec.Builder(
        KEY_ALIAS,
        KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
      )
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setKeySize(256)
        .build()
    )
    return generator.generateKey()
  }

  private fun writeSealed(seed: ByteArray) {
    val cipher = Cipher.getInstance(TRANSFORMATION)
    cipher.init(Cipher.ENCRYPT_MODE, key(create = true))
    cipher.updateAAD(AAD)
    val sealed = cipher.doFinal(seed)
    writeAtomically(sealedFile, byteArrayOf(FORMAT_VERSION) + cipher.iv + sealed)
  }

  /**
   * Null when there is no local copy, or one this device can never open again
   * (its Keystore key is gone or doesn't match). Other Keystore errors throw:
   * they may pass, and a new seed would replace the backed-up one.
   */
  private fun readSealed(): ByteArray? {
    val file = sealedFile
    if (!file.exists()) return null
    val bytes = file.readBytes()
    if (bytes.size != 1 + IV_BYTES + SEED_BYTES + TAG_BYTES || bytes[0] != FORMAT_VERSION) {
      return null
    }
    val key = key(create = false) ?: return null
    return try {
      val cipher = Cipher.getInstance(TRANSFORMATION)
      cipher.init(
        Cipher.DECRYPT_MODE,
        key,
        GCMParameterSpec(TAG_BYTES * 8, bytes, 1, IV_BYTES)
      )
      cipher.updateAAD(AAD)
      cipher.doFinal(bytes, 1 + IV_BYTES, bytes.size - 1 - IV_BYTES)
    } catch (_: AEADBadTagException) {
      null
    }
  }

  /** Write, then rename over the old file, so a crash never leaves half a file. */
  private fun writeAtomically(target: File, bytes: ByteArray) {
    val temporary = File(target.parentFile, "${target.name}.tmp")
    temporary.writeBytes(bytes)
    if (!temporary.renameTo(target)) {
      temporary.delete()
      throw RootSeedException("Could not write ${target.name}")
    }
  }

  private companion object {
    const val SEED_BYTES = 32
    const val IV_BYTES = 12
    const val TAG_BYTES = 16
    const val FORMAT_VERSION: Byte = 1
    const val TIMEOUT_SECONDS = 10L
    const val RETRIEVE_BACKOFF_MS = 60_000L
    const val ANDROID_KEYSTORE = "AndroidKeyStore"
    const val TRANSFORMATION = "AES/GCM/NoPadding"
    const val KEY_ALIAS = "com.leviwilkerson.witnesswork.buddies.root-seed"
    const val BLOCK_STORE_KEY = "com.leviwilkerson.witnesswork.buddies.root-seed"
    const val SEALED_FILE = "buddies-root-seed"
    const val BACKUP_MARKER_FILE = "buddies-root-seed.backup"
    const val MARKER_CLOUD = "cloud"
    const val MARKER_DEVICE = "device"
    const val MARKER_RESTORED = "restored"
    val AAD = "ww-buddies/v1/root-seed".toByteArray()
  }
}

internal class RootSeedException(message: String, cause: Throwable? = null) :
  Exception(message, cause)
