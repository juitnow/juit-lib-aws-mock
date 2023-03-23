import { theAnswer } from '../src/index'

describe('Don\'t panic', () => {
  it('should provide the answer to life, the universe, and everything', () => {
    expect(theAnswer).toBe(42)
  })
})
