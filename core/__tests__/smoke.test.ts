import { describe, expect, it } from 'vitest'
import { newId } from '@/core/id'

describe('smoke: vitest harness + @ alias', () => {
  it('resolves the @/* alias and runs a pure core module', () => {
    const id = newId()
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
})
