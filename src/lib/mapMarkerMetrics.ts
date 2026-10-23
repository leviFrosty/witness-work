// Pins and their cards are separate markers: a pin never changes size, so it
// always sits exactly on its coordinate, and a card can come and go or move
// above or below without disturbing it. Fixed sizes (labels don't scale with
// Dynamic Type) let Apple Maps, which only offsets from a view's center, put
// each card just clear of its pin. Card layout reads the same numbers, so what
// it keeps clear is what the markers draw.

/** A card with a line over its title. */
export const MARKER_CARD_HEIGHT = 38
/** A card with only a title. */
export const MARKER_CARD_SINGLE_HEIGHT = 24
/** Space between a card's pointer and its pin. */
export const MARKER_GAP = 7
/** The pointer pokes this far out of the card toward the pin. */
export const MARKER_POINTER = 5
export const MARKER_CARD_MAX_WIDTH = 132

/** A Contact pin's colored disc. */
export const CONTACT_PIN_DISC = 28
/** The selection ring's width around the disc. */
export const CONTACT_PIN_RING = 3
/** The disc and its ring: what a Contact pin's card and other cards clear. */
export const CONTACT_PIN_FOOTPRINT = CONTACT_PIN_DISC + 2 * CONTACT_PIN_RING
/**
 * A Contact pin marker's fixed frame: a full touch target, with room for the
 * ring and the corner badge. Apple Maps keeps a marker view's first size.
 */
export const CONTACT_PIN_FRAME = 44
