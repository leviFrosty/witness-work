package expo.modules.devicesecrets

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.security.KeyStore
import javax.crypto.AEADBadTagException
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Small secrets that belong to this device: today the account session's refresh
 * token (ADR 0027). Same interface as the iOS module, so the JS side is shared.
 */
class DeviceSecretsModule : Module() {
  private val store by lazy {
    DeviceSecretStore(appContext.reactContext ?: throw Exceptions.ReactContextLost())
  }

  override fun definition() = ModuleDefinition {
    Name("DeviceSecrets")

    // JS checks this so OTA updates never call into a binary without the module.
    Constant("deviceSecretsVersion") {
      1
    }

    AsyncFunction("read") Coroutine { name: String ->
      withContext(Dispatchers.IO) { store.read(name) }
    }

    AsyncFunction("write") Coroutine { name: String, value: String ->
      withContext(Dispatchers.IO) { store.write(name, value) }
    }

    AsyncFunction("remove") Coroutine { name: String ->
      withContext(Dispatchers.IO) { store.remove(name) }
    }
  }
}

/**
 * Each secret is sealed with AES-256-GCM under one non-exportable Android
 * Keystore key and kept in `noBackupFilesDir`, which Auto Backup never copies:
 * it stays on this device, and a copy would be useless anyway, since Keystore
 * keys never leave it. No Block Store, unlike the account key.
 */
internal class DeviceSecretStore(context: Context) {
  private val context = context.applicationContext
  private val lock = Any()

  private val directory get() = File(context.noBackupFilesDir, DIRECTORY)

  /** Null when there's none, or one this device can no longer open. */
  fun read(name: String): String? =
    synchronized(lock) {
      val file = fileFor(name)
      if (!file.exists()) return null
      val bytes = file.readBytes()
      if (bytes.size < 1 + IV_BYTES + TAG_BYTES || bytes[0] != FORMAT_VERSION) return null
      val key = key(create = false) ?: return null
      try {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(TAG_BYTES * 8, bytes, 1, IV_BYTES))
        cipher.updateAAD(aad(name))
        String(cipher.doFinal(bytes, 1 + IV_BYTES, bytes.size - 1 - IV_BYTES), Charsets.UTF_8)
      } catch (_: AEADBadTagException) {
        null
      }
    }

  fun write(name: String, value: String) {
    synchronized(lock) {
      val cipher = Cipher.getInstance(TRANSFORMATION)
      cipher.init(Cipher.ENCRYPT_MODE, key(create = true))
      cipher.updateAAD(aad(name))
      val sealed = cipher.doFinal(value.toByteArray(Charsets.UTF_8))
      directory.mkdirs()
      val target = fileFor(name)
      val temporary = File(target.parentFile, "${target.name}.tmp")
      temporary.writeBytes(byteArrayOf(FORMAT_VERSION) + cipher.iv + sealed)
      // Write, then rename over the old file, so a crash never leaves half a file.
      if (!temporary.renameTo(target)) {
        temporary.delete()
        throw DeviceSecretException("Could not store device secret")
      }
    }
  }

  fun remove(name: String) {
    synchronized(lock) { fileFor(name).delete() }
  }

  private fun fileFor(name: String): File {
    if (!NAME.matches(name)) throw DeviceSecretException("Invalid device secret name")
    return File(directory, name)
  }

  private fun aad(name: String) = "ww-device-secrets/v1\n$name".toByteArray(Charsets.UTF_8)

  private fun key(create: Boolean): SecretKey? {
    val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
    (keyStore.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
    if (!create) return null
    // Usable after the first unlock, like the iOS item.
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

  private companion object {
    const val IV_BYTES = 12
    const val TAG_BYTES = 16
    const val FORMAT_VERSION: Byte = 1
    const val ANDROID_KEYSTORE = "AndroidKeyStore"
    const val TRANSFORMATION = "AES/GCM/NoPadding"
    const val KEY_ALIAS = "com.leviwilkerson.witnesswork.device-secrets"
    const val DIRECTORY = "device-secrets"
    val NAME = Regex("^[a-z0-9.-]{1,64}$")
  }
}

internal class DeviceSecretException(message: String) : Exception(message)
