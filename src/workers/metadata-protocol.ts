import type { MetadataResult } from '../metadata/types'

/** Messages between the main thread and the lazy-loaded metadata worker. */

export type MetadataRequest =
  | { type: 'read'; id: number; file: File }
  /** Drops the result of request `id`; the worker may still be busy. */
  | { type: 'cancel'; id: number }

export type MetadataStage = 'loading' | 'reading'

export type MetadataResponse =
  | { type: 'progress'; id: number; stage: MetadataStage }
  | { type: 'result'; id: number; result: MetadataResult }
  | { type: 'error'; id: number; message: string }
