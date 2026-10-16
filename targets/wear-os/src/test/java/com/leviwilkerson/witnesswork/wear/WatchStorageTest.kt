package com.leviwilkerson.witnesswork.wear

import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Before
import org.junit.Test
import java.time.ZoneId
import java.time.ZonedDateTime
import java.util.Locale

/** Keys the phone parses stay ASCII whatever language the watch is in. */
class WatchStorageTest {
  private lateinit var original: Locale

  @Before
  fun setUp() {
    original = Locale.getDefault()
  }

  @After
  fun tearDown() {
    Locale.setDefault(original)
  }

  private val date = ZonedDateTime.of(2026, 10, 6, 9, 0, 0, 0, ZoneId.of("Asia/Riyadh"))

  @Test
  fun `month and day keys use ASCII digits on an Arabic watch`() {
    Locale.setDefault(Locale.forLanguageTag("ar-u-nu-arab"))
    // The watch's own formatting would write Arabic-Indic digits here.
    assertEquals("٢٠٢٦", "%04d".format(2026))
    assertEquals("2026-10", monthKey(date))
    assertEquals("2026-10-06", dayKey(date))
  }

  @Test
  fun `month and day keys use ASCII digits on Arabic and Persian watches`() {
    for (tag in listOf("ar", "ar-EG", "fa")) {
      Locale.setDefault(Locale.forLanguageTag(tag))
      assertEquals(tag, "2026-10", monthKey(date))
      assertEquals(tag, "2026-10-06", dayKey(date))
    }
  }

  @Test
  fun `digits keep one formatter per number locale`() {
    val arabic = AppLanguage(rtl = true, numberLocale = "ar-u-nu-arab")
    assertSame(arabic.digitsLocale, AppLanguage(rtl = true, numberLocale = "ar-u-nu-arab").digitsLocale)
    assertEquals("٥٠", arabic.number(50))
    assertEquals("١٢٫٥", arabic.decimal(12.5))
  }
}
