/**
 * User-defined custom contact field. The id is the immutable identity that
 * contact records reference in their `customFields` map; the label is mutable
 * and surfaces in the UI. Definitions live next to contacts in `contactsStore`
 * because the two are tightly coupled — a def's id is meaningless without the
 * contact data that references it.
 */
export type CustomFieldDefinition = {
  /** UUID. Stable across renames, reorders, sync merges. */
  id: string
  /** User-facing field name. Mutable; safe to edit without affecting data. */
  label: string
  /**
   * Sort order within the active list. Explicit (rather than array index) so
   * sync merges have something to compare and reorder operations don't depend
   * on array identity.
   */
  order: number
  /** Epoch ms — set on creation, never changes. */
  createdAt: number
  /**
   * Epoch ms of the last mutation. Drives last-writer-wins merging across
   * devices (rename on A vs rename on B picks the newer one).
   */
  updatedAt: number
  /**
   * Soft-delete flag. Archived defs are hidden from the contact form and
   * details screen, but their values are preserved on contacts so the user can
   * restore the field without data loss. Surfaced only in the management
   * screen.
   */
  archived?: boolean
  /**
   * Field input type. Reserved for future UI variants (number keyboard, date
   * picker, URL validation). Today the renderer treats everything as `'text'`;
   * this is on the schema so adding a new type later is a pure UI change.
   */
  type?: 'text' | 'number' | 'date' | 'url'
}
