export class OutOfBoundsError extends Error {
  readonly offset: number
  readonly length: number
  readonly size: number

  constructor(offset: number, length: number, size: number) {
    super(
      `Read of ${length} byte(s) at offset ${offset} exceeds buffer size ${size}`,
    )
    this.name = 'OutOfBoundsError'
    this.offset = offset
    this.length = length
    this.size = size
  }
}
