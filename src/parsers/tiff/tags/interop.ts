import type { TagDef } from './types'

/** Interoperability IFD tags. */
export const INTEROP_TAGS: TagDef[] = [
  [1, 'InteroperabilityIndex'],
  [2, 'InteroperabilityVersion'],
  [4096, 'RelatedImageFileFormat'],
  [4097, 'RelatedImageWidth'],
  [4098, 'RelatedImageLength'],
]
