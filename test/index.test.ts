import { STS, STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts'

import { AWSMock } from '../src/index'


describe('AWS Mock', () => {
  let mock: AWSMock | undefined = undefined

  afterEach(() => {
    if (mock) mock.destroy()
    mock = undefined
  })

  it('should mock a simple service call and destroy', async () => {
    mock = new AWSMock(STSClient)
        .on(GetCallerIdentityCommand, () => ({ Account: 'the account 1' }))

    const stsClient = new STSClient({ region: 'no-region-1' })
    expect(await stsClient.send(new GetCallerIdentityCommand({}))).toEqual({
      $metadata: { httpStatusCode: 200, requestId: expect.toBeA('string') },
      Account: 'the account 1',
    })

    mock.destroy()

    await expect(stsClient.send(new GetCallerIdentityCommand({})))
        .toBeRejected()
  })

  it('should only mock the specified client', async () => {
    mock = new AWSMock(STS) // not `STSClient` (its super class)
        .on(GetCallerIdentityCommand, () => ({ Account: 'the account 2' }))

    const sts = new STS({ region: 'no-region-1' })
    expect(await sts.getCallerIdentity({})).toEqual({
      $metadata: { httpStatusCode: 200, requestId: expect.toBeA('string') },
      Account: 'the account 2',
    })

    const stsClient = new STSClient({ region: 'no-region-1' })
    await expect(stsClient.send(new GetCallerIdentityCommand({})))
        .toBeRejected()
  })

  it('should fail when a command is not mocked', async () => {
    mock = new AWSMock(STS)
        .on(GetCallerIdentityCommand, () => ({ Account: 'the account 3' }))

    const sts = new STS({ region: 'no-region-1' })
    await expect(sts.assumeRole({
      RoleArn: 'role arn',
      RoleSessionName: 'role session',
    })).toBeRejectedWithError(Error, 'No mock for "STS.AssumeRoleCommand"')
  })

  it('should fail when a mocked command returns no result', async () => {
    mock = new AWSMock(STS)
        .on(GetCallerIdentityCommand, () => null as any)

    const sts = new STS({ region: 'no-region-1' })
    await expect(sts.getCallerIdentity({}))
        .toBeRejectedWithError(Error, 'Mock for "STS.GetCallerIdentityCommand" returned no result')
  })

  it('should fail when a mocked command throws an error', async () => {
    mock = new AWSMock(STS).on(GetCallerIdentityCommand, () => {
      throw new TypeError('Hello, world!')
    })

    const sts = new STS({ region: 'no-region-1' })
    await expect(sts.getCallerIdentity({}))
        .toBeRejectedWithError(TypeError, 'Hello, world!')
  })

  it('should work with callbacks', () => {
    mock = new AWSMock(STS)
        .on(GetCallerIdentityCommand, () => ({ Account: 'the account 4' }))

    const sts = new STS({ region: 'no-region-1' })

    return new Promise<void>((resolve, reject) => {
      sts.getCallerIdentity({}, (error, result) => {
        try {
          expect(error).toBeNull()
          expect(result).toEqual({
            $metadata: { httpStatusCode: 200, requestId: expect.toBeA('string') },
            Account: 'the account 4',
          })
          resolve()
        } catch (error) {
          reject(error)
        }
      })
    })
  })

  it('should work with failing callbacks', () => {
    mock = new AWSMock(STS).on(GetCallerIdentityCommand, () => {
      throw new TypeError('Hello, world!')
    })

    const sts = new STS({ region: 'no-region-1' })

    return new Promise<void>((resolve, reject) => {
      sts.getCallerIdentity({}, (error, result) => {
        try {
          expect(result).toBeUndefined()
          expect(error).toBeInstanceOf(TypeError)
          expect(error.message).toStrictlyEqual('Hello, world!')
          resolve()
        } catch (error) {
          reject(error)
        }
      })
    })
  })

  it('should pass the current state to handlers', async () => {
    mock = new AWSMock(STS)
        .on(GetCallerIdentityCommand, (input, state) => ({ input, state } as any))

    const sts = new STS({ region: 'no-region-1' })

    expect(await sts.getCallerIdentity({ number: 1 })).toEqual({
      $metadata: { httpStatusCode: 200, requestId: expect.toBeA('string') },
      input: { number: 1 },
      state: undefined,
    } as any)

    mock.setState('hello, world!')

    expect(await sts.getCallerIdentity({ number: 2 })).toEqual({
      $metadata: { httpStatusCode: 200, requestId: expect.toBeA('string') },
      input: { number: 2 },
      state: 'hello, world!',
    } as any)

    mock.reset() // resets state, too!

    expect(await sts.getCallerIdentity({ number: 1 })).toEqual({
      $metadata: { httpStatusCode: 200, requestId: expect.toBeA('string') },
      input: { number: 1 },
      state: undefined,
    } as any)
  })

  it('should keep track of all invoked calls', async () => {
    let number = 0
    mock = new AWSMock(STS).on(GetCallerIdentityCommand, () => {
      number ++ // increase our counter
      if (number % 2) return { Account: `number ${number}` }
      throw new Error(`Number ${number} is even`)
    })

    const sts = new STS({ region: 'no-region-1' })

    expect(mock.getCalls()).toEqual([])

    expect(await sts.getCallerIdentity({ inputNumber: 0 })).toEqual({
      $metadata: { httpStatusCode: 200, requestId: expect.toBeA('string') },
      Account: 'number 1',
    })

    expect(mock.getCalls()).toEqual([ {
      command: 'GetCallerIdentityCommand',
      input: { inputNumber: 0 },
      success: true,
    } ])

    await expect(sts.getCallerIdentity({ inputNumber: 1 }))
        .toBeRejectedWithError(Error, 'Number 2 is even')

    expect(mock.getCalls()).toEqual([ {
      command: 'GetCallerIdentityCommand',
      input: { inputNumber: 0 },
      success: true,
    }, {
      command: 'GetCallerIdentityCommand',
      input: { inputNumber: 1 },
      success: false,
    } ])

    expect(mock.reset()).toEqual([ {
      command: 'GetCallerIdentityCommand',
      input: { inputNumber: 0 },
      success: true,
    }, {
      command: 'GetCallerIdentityCommand',
      input: { inputNumber: 1 },
      success: false,
    } ])

    expect(mock.getCalls()).toEqual([])
  })
})
