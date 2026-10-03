/** Format a number as upper-case hex with `0x` prefix, e.g. `hex(42, 4)` -> `0x002A`. */
export function hex(value: number, width = 2): string {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`
}

export const hex8 = (value: number): string => hex(value, 2)
export const hex16 = (value: number): string => hex(value, 4)
export const hex32 = (value: number): string => hex(value, 8)
