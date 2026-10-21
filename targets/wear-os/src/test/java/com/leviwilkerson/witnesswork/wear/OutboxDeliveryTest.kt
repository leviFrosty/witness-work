package com.leviwilkerson.witnesswork.wear

import com.leviwilkerson.witnesswork.watchprotocol.WatchReply
import com.leviwilkerson.witnesswork.watchprotocol.WatchReply.Reason
import com.leviwilkerson.witnesswork.watchprotocol.WatchReply.Status
import org.junit.Assert.assertEquals
import org.junit.Test

class OutboxDeliveryTest {
  private fun delivery(status: Status, reason: Reason? = null) = OutboxDelivery.of(WatchReply(status, reason, context = null))

  @Test
  fun `an accepted entry waits for the phone app`() {
    assertEquals(OutboxDelivery.Accepted, delivery(Status.ACCEPTED))
  }

  @Test
  fun `a phone that can't store it yet gets it again later`() {
    assertEquals(OutboxDelivery.Retry, delivery(Status.REJECTED, Reason.UNAVAILABLE))
  }

  @Test
  fun `a refused entry is reported, not confirmed`() {
    // These used to be dropped from the outbox while Add Time played its success haptic.
    assertEquals(
      OutboxDelivery.Refused(ServiceActionError.PHONE_APP_OUTDATED),
      delivery(Status.REJECTED, Reason.UNSUPPORTED_VERSION),
    )
    assertEquals(OutboxDelivery.Refused(ServiceActionError.FAILED), delivery(Status.REJECTED, Reason.INVALID))
    assertEquals(OutboxDelivery.Refused(ServiceActionError.FAILED), delivery(Status.REJECTED))
  }
}
