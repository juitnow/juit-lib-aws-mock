import { randomUUID } from 'node:crypto'

import type { Client, Command, MetadataBearer } from '@aws-sdk/types'

/** A type identifying _any_ AWS {@link Client} */
type AnyClient = Client<any, any, any>

/** A type identifying _any_ AWS {@link Command} */
type AnyCommand = Command<any, any, any, any, any>

/** Infer the _input type_ of an AWS {@link Command} */
type CommandInput<T> =
  T extends Command<any, infer Input, any, any, any> ? Input : never

/** Infer the _output type_ of an AWS {@link Command} */
type CommandOutput<T> =
  T extends Command<any, any, any, infer Output, any> ?
    Omit<Output, '$metadata'> & Partial<MetadataBearer> :
    never

/** A type identifying a _constructor_ for an instance */
type Constructor<T> = new (...args: any) => T

/** An interface defining a _call record_ in a {@link AWSMock} */
export interface AWSMockCall {
  command: string,
  input: any,
  success: boolean,
}

/** A _handler_ for intercepting commands in {@link AWSMock} */
export type AWSMockHandler<Input, Output, State = any> =
  (input: Input, state: State | undefined) => Output | Promise<Output>

/** The {@link AWSMock} class allows easy mocking of AWS clients */
export class AWSMock<State = any> {
  /** All configured command handlers */
  private _handlers = new Map<Constructor<AnyCommand>, AWSMockHandler<any, any>>()
  /** The _original_ (unmocked) `send(...)` method from the client prototype */
  private _send: AnyClient['send']
  /** Current record of all calls handled by this instance */
  private _calls: AWSMockCall[] = []
  /** Current state to be passed to handlers */
  private _state: State | undefined = undefined

  /** Create a new {@link AWSMock} instance mocking the specified {@link Client} */
  constructor(client: Constructor<AnyClient>)
  // Overload to hide private parameter
  constructor(private _client: Constructor<AnyClient>) {
    // Remember the original `send` method
    this._send = _client.prototype.send

    // Figure out the name of the client
    const clientName = _client.name || /* coverage ignore next */ '[Unknown Client]'

    // Inject our `send` method in the client's prototype
    _client.prototype.send = (_command: AnyCommand, ..._args: any[]): Promise<any> => {
      const commandProto = Object.getPrototypeOf(_command)
      const commandConstuctor = commandProto.constructor
      const commandName = commandConstuctor?.name || /* coverage ignore next */ '[Unknown Command]'

      // Figure out if we have a callback
      const lastArgument = _args.pop()
      const cb: ((err: any, data?: any) => void) | undefined =
        typeof lastArgument === 'function' ? lastArgument : undefined

      // Clone input for every call
      const input = JSON.parse(JSON.stringify(_command.input))

      // Always work with promises, decoupling from event loop
      const promise = new Promise((resolve, reject) => setImmediate(async () => {
        // Get the handler for the method and verify it
        const handler = this._handlers.get(commandConstuctor)
        if (! handler) {
          const error = new Error(`No mock for "${clientName}.${commandName}"`)
          return reject(error)
        }

        // Call the mocked handler
        try {
          // Call the handler and get the result
          const output: MetadataBearer = await handler(input, this._state)

          // If no result (null loose check) then simply return a 404
          if (! output) {
            const error = new Error(`Mock for "${clientName}.${commandName}" returned no result`)
            return reject(error)
          }

          // Clone the output as we did for the input
          const result = JSON.parse(JSON.stringify(output))

          // If we don't have some metadata, inject some fake stuff
          if (! result.$metadata) result.$metadata = { httpStatusCode: 200 }
          if (! result.$metadata.requestId) result.$metadata.requestId = randomUUID()

          // All done!
          resolve(result)
        } catch (error) {
          reject(error)
        }
      })).then((result) => {
        // On success, record the call and return the result
        this._calls.push({ command: commandName, input: input, success: true })
        return result
      }, (error) => {
        // On failure, record the call and throw the error
        this._calls.push({ command: commandName, input: input, success: false })
        throw error
      })

      // Invoke our callback (if any) and always return the promise
      if (cb) promise.then((result) => cb(null, result), (error) => cb(error))
      return promise
    }
  }

  /** Associate a _state_ with this instance, to be passed to handlers */
  setState(state: State | undefined): void {
    this._state = state
  }

  /** Return the list of calls executed by this instance */
  getCalls(): readonly AWSMockCall[] {
    return this._calls
  }

  /**
   * Reset this instance by zeroing the {@link AWSMock.calls calls} and wiping
   * the {@link AWSMock.state state}.
   *
   * @returns The list of calls executed by this instance before reset.
   */
  reset(): AWSMockCall[] {
    const calls = this._calls
    delete this._state
    this._calls = []
    return calls
  }

  /** Destroy this instance, restoring the mocked methods */
  destroy(): void {
    this._client.prototype.send = this._send
  }

  /** Setup a _handler_ for a specific {@link Command} */
  on<AWSCommand extends AnyCommand>(
      command: new (...args: any) => AWSCommand,
      handler: AWSMockHandler<CommandInput<AWSCommand>, CommandOutput<AWSCommand>, State>,
  ): this {
    this._handlers.set(command, handler)
    return this
  }
}
