import type { ParseResult } from '../core/model'

/*
 * Hand-rolled discriminated unions instead of Comlink: the protocol is two
 * messages deep, cancelling is done by terminating the worker, and it avoids
 * a dependency and proxy typing for a one-shot request/response.
 */

export type StructureRequest = { type: 'parse'; id: number; file: File }

export type StructureResponse =
  | { type: 'result'; id: number; result: ParseResult }
  | { type: 'error'; id: number; message: string }
