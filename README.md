# Easy Mocking for AWS SDK v3

A simple way to create mocks for the AWS SDK v3 library.

* [Mocking commands](#mocking-commands)
* [Call Tracing](#call-tracing)
* [State for Handlers](#state-for-handlers)
* [Resetting](#resetting)
* [Destroying](#destroying)
* [Typical Test Scenario](#typical-test-scenario)
* [License](LICENSE.md)
* [Copyright Notice](NOTICE.md)


## Mocking commands

Mocking commands for an AWS client is quite easy. For example:

```typescript
import { AWSMock } from '@juit/lib-aws-mock'
import {
  AssumeRoleCommand,
  GetCallerIdentityCommand,
  STS,
} from '@aws-sdk/client-sts'

const mock = new AWSMock(STS)
  .on(GetCallerIdentityCommand, (input, state) => {
    // here `input` will be the parameter passed to `getCallerIdentity(...)`
    // and `state` will be whatever was passed to `mock.setState(...)`
    return { Account: 'the account' }
  })
  .on(AssumeRoleCommand, (input, state) => {
    // ... mocked implementation lives here...
  })

const sts = new STS({})
const identity = await sts.getCallerIdentity({})
// here `identity` will be `{ Account: 'the account' }`
// as returned by our handler configured in the mock
```


## Call Tracing

Instances of `AWSMock` provide a `getCalls()` function returning
all calls invoked on the mock. Calls will contain the following:

* `command`: The _string_ name of the command invoked
* `input`: The input given to the call
* `success`: A _boolean_ indicating whether the call succeeded or not

```typescript
const identity = await sts.getCallerIdentity({})

const calls = mock.calls()
// here `calls` will be:
// {
//   command: 'GetCallerIdentityCommand',
//   input: '',
//   success: true,
// }
```


## State for Handlers

Instances of `AWSMock` provide a `setState(...)` function which can be used
to pass extra data to handlers:

```typescript
const mock = new AWSMock<string>(STS)
  .on(GetCallerIdentityCommand, (input, state) => {
    // state will have a `string` type
    return { Account: state || 'the account' }
  })

const sts = new STS({})

const identity1 = await sts.getCallerIdentity({})
// here identity1 will be `{ Account: 'the account' }`

mock.setState('another account') // set the stae
const identity2 = await sts.getCallerIdentity({})
// here identity2 will be `{ Account: 'another account' }`
```


## Resetting

Reseting [calls](#call-tracing) and [state](#state-for-handlers) is as easy as
calling the `reset()` function on the mock instance.


## Destroying

Destroying the mock instance and un-hooking it from the client can be done
calling the `destroy()` function on the mock instance.


## Typical Test Scenario

A typical test scenario can look somehow like this:

```typescript
describe('My Suite', () => {
  let mock: AWSMock

  beforeAll(() => {
    mock = new AWSMock(STS)
      .on(GetCallerIdentityCommand, (input, state) => {
        // ... mocked implementation lives here...
      })
      .on(AssumeRoleCommand, (input, state) => {
        // ... mocked implementation lives here...
      })
  })

  afterAll(() => mock.destroy())
  afterEach(() => mock.reset())

  it('should run this spec', async () => {
    // ... here's your spec...
  })
})
```
