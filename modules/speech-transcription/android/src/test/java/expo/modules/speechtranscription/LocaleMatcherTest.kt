package expo.modules.speechtranscription

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class LocaleMatcherTest {
  private fun languages(
    installed: List<String> = emptyList(),
    pending: List<String> = emptyList(),
    supported: List<String> = emptyList(),
  ) = OnDeviceLanguages(installed, pending, supported)

  @Test
  fun `tries the requested languages, then the device's, once each`() {
    assertEquals(
      listOf("es-ES", "en-US", "fr-FR"),
      LocaleMatcher.candidates(listOf("es_ES", " ", "en-US"), listOf("EN-us", "fr-FR", "es-ES")),
    )
  }

  @Test
  fun `the first candidate with an on-device model wins`() {
    val result = LocaleMatcher.match(
      listOf("pt-BR", "en-US"),
      languages(installed = listOf("en-US"), supported = listOf("de-DE")),
    )
    assertEquals(ResolvedLanguage("en-US", ModelState.INSTALLED), result)
  }

  @Test
  fun `the user's region beats an installed model for another region`() {
    val result = LocaleMatcher.match(
      listOf("es-ES"),
      languages(installed = listOf("es-US"), supported = listOf("es-US", "es-ES")),
    )
    assertEquals(ResolvedLanguage("es-ES", ModelState.DOWNLOADABLE), result)
  }

  @Test
  fun `an installed model beats a download at the same closeness`() {
    val result = LocaleMatcher.match(
      listOf("en-US"),
      languages(installed = listOf("en-US"), pending = listOf("en-US"), supported = listOf("en-US")),
    )
    assertEquals(ModelState.INSTALLED, result?.model)
    val pending = LocaleMatcher.match(listOf("fr-FR"), languages(pending = listOf("fr-FR"), supported = listOf("fr-FR")))
    assertEquals(ResolvedLanguage("fr-FR", ModelState.PENDING), pending)
  }

  @Test
  fun `a language-only candidate takes any region of that language`() {
    val result = LocaleMatcher.match(listOf("de"), languages(supported = listOf("en-US", "de-DE")))
    assertEquals(ResolvedLanguage("de-DE", ModelState.DOWNLOADABLE), result)
  }

  @Test
  fun `Chinese matches Google's Mandarin tags by script, never across scripts`() {
    val offered = languages(installed = listOf("cmn-Hant-TW"), supported = listOf("cmn-Hans-CN", "yue-Hant-HK"))
    assertEquals("cmn-Hans-CN", LocaleMatcher.match(listOf("zh-CN"), offered)?.locale)
    assertEquals("cmn-Hant-TW", LocaleMatcher.match(listOf("zh-Hant-TW"), offered)?.locale)
    assertNull(LocaleMatcher.match(listOf("zh-CN"), languages(installed = listOf("cmn-Hant-TW"))))
  }

  @Test
  fun `no on-device model for any candidate is unavailable`() {
    assertNull(LocaleMatcher.match(listOf("rw-RW", "sw-KE"), languages(installed = listOf("en-US"))))
    assertNull(LocaleMatcher.match(emptyList(), languages(installed = listOf("en-US"))))
  }

  @Test
  fun `Android 12 serves only the device's default language`() {
    assertEquals("en-US", LocaleMatcher.matchDefault(listOf("es-ES", "en-GB"), "en-US"))
    assertNull(LocaleMatcher.matchDefault(listOf("es-ES"), "en-US"))
  }

  @Test
  fun `same compares tags, not spelling`() {
    assertTrue(LocaleMatcher.same("en_us", "en-US"))
    assertTrue(LocaleMatcher.same("cmn-Hans-CN", "zh-CN"))
    assertFalse(LocaleMatcher.same("en-GB", "en-US"))
  }
}
