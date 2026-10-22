package expo.modules.speechtranscription

import android.speech.SpeechRecognizer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SpeechErrorsTest {
  private fun code(error: Int, cancelled: Boolean = false) = SpeechErrors.codeFor(error, cancelled)

  @Test
  fun `maps recognizer errors to the JS contract's codes`() {
    assertEquals("ERR_SPEECH_PERMISSION_DENIED", code(SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS))
    assertEquals("ERR_SPEECH_MODEL_UNAVAILABLE", code(SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED))
    assertEquals("ERR_SPEECH_MODEL_UNAVAILABLE", code(SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE))
    assertEquals("ERR_SPEECH_AUDIO_UNAVAILABLE", code(SpeechRecognizer.ERROR_AUDIO))
    assertEquals("ERR_SPEECH_BUSY", code(SpeechRecognizer.ERROR_RECOGNIZER_BUSY))
  }

  @Test
  fun `network and every other error fail without a fallback`() {
    for (error in listOf(
      SpeechRecognizer.ERROR_NETWORK,
      SpeechRecognizer.ERROR_NETWORK_TIMEOUT,
      SpeechRecognizer.ERROR_SERVER,
      SpeechRecognizer.ERROR_SERVER_DISCONNECTED,
      SpeechRecognizer.ERROR_TOO_MANY_REQUESTS,
      SpeechRecognizer.ERROR_CLIENT,
      SpeechRecognizer.ERROR_NO_MATCH,
      999,
    )) {
      assertEquals("error $error", "ERR_SPEECH_FAILED", code(error))
    }
  }

  @Test
  fun `any error after cancel is a cancellation`() {
    assertEquals("ERR_SPEECH_CANCELLED", code(SpeechRecognizer.ERROR_CLIENT, cancelled = true))
    assertEquals("ERR_SPEECH_CANCELLED", code(SpeechRecognizer.ERROR_AUDIO, cancelled = true))
  }

  @Test
  fun `exceptions carry the mapped code`() {
    assertEquals("ERR_SPEECH_BUSY", SpeechErrors.forError(SpeechRecognizer.ERROR_RECOGNIZER_BUSY, false).code)
    assertEquals("ERR_SPEECH_FAILED", SpeechErrors.forError(SpeechRecognizer.ERROR_SERVER, false).code)
    assertEquals("ERR_SPEECH_UNSUPPORTED", SpeechErrors.unsupported().code)
  }

  @Test
  fun `a service still unbinding is retried with a fresh recognizer`() {
    assertTrue(SpeechErrors.isServiceRace(SpeechRecognizer.ERROR_CLIENT))
    assertTrue(SpeechErrors.isServiceRace(SpeechRecognizer.ERROR_SERVER_DISCONNECTED))
    assertFalse(SpeechErrors.isServiceRace(SpeechRecognizer.ERROR_RECOGNIZER_BUSY))
    assertFalse(SpeechErrors.isServiceRace(SpeechRecognizer.ERROR_NETWORK))
  }

  @Test
  fun `only pauses restart listening`() {
    assertTrue(SpeechErrors.isSilence(SpeechRecognizer.ERROR_NO_MATCH))
    assertTrue(SpeechErrors.isSilence(SpeechRecognizer.ERROR_SPEECH_TIMEOUT))
    assertFalse(SpeechErrors.isSilence(SpeechRecognizer.ERROR_AUDIO))
    assertFalse(SpeechErrors.isSilence(SpeechRecognizer.ERROR_NETWORK))
  }
}
