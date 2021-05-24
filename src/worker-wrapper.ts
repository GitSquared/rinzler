import RinzlerEventEmitter from './event-emitter'
import src from '../dist/internals/worker-src.js'

interface InternalWorkerMsg {
	type: string
}

export interface InitCall extends InternalWorkerMsg {
	type: 'init'
	message?: unknown
	transfer?: Transferable[]
}

export interface JobCall extends InternalWorkerMsg {
	type: 'job'
	id: string
	message?: unknown
	transfer?: Transferable[]
}

export interface JobAcceptCall extends InternalWorkerMsg {
	type: 'jobok'
	id: string
}

export interface JobReturnCall<T = undefined> extends InternalWorkerMsg {
	type: 'jobdone'
	id: string
	error: boolean
	message: T
}

/**
	Interface for passing messages and `Transferable` data to Web Worker instances.

	See [`DedicatedWorkerGlobalScope.postMessage()`](https://developer.mozilla.org/en-US/docs/Web/API/Worker/postMessage) for more details.
*/
export type WorkerFunctionTransferArgs = [message?: unknown, transfer?: Transferable[]]

/**
	A function for setting up a Web Worker environment before it starts processing jobs. May be sync or async.
	Worker functions cannot use variables defined outside of their block, because the function code itself is inlined
	and written to the Web Worker source code.

	You should pass any dynamic data that won't change between jobs using `initArgs` in {@link RinzlerEngine.configureAndStart},
	and parse/use them in the init function.

	If you need to store some global state to be used later when processing jobs, you can write a property to `self`, which will be a [`DedicatedWorkerGlobalScope`](https://developer.mozilla.org/en-US/docs/Web/API/DedicatedWorkerGlobalScope).
	But be careful not to overwrite any browser-initialized properties in there!

	@typeParam T Anything passed as `initArgs` in {@link RinzlerEngine.configureAndStart}, with `Transferable` objects inlined.
*/
export type WorkerInitFunction<T = unknown> = (message?: T) => Promise<void> | void

/**
	The function which will process all jobs sent to this engine instance. May be sync or async.
	Worker functions cannot use variables defined outside of their block, because the function code itself is inlined
	and written to the Web Worker source code.

	You can safely throw errors in this function as they will be catched and bubbled up from the engine.

	@typeParam T Anything passed in {@link RinzlerEngine.runJob}, with `Transferable` objects inlined.
*/
export type WorkerFunction<T = unknown> = (message?: T) => Promise<WorkerFunctionTransferArgs> | WorkerFunctionTransferArgs

export default class WebWorker extends RinzlerEventEmitter {
	/* Public props */

	jobs: JobCall[] = []
	active = false

	/* Internal props */

	#workerRef: Worker
	#workingJob: string | null = null
	#initArgs?: WorkerFunctionTransferArgs

	/* Public methods */

	constructor(workFunction: WorkerFunction, initFunction?: WorkerInitFunction, initArgs?: WorkerFunctionTransferArgs) {
		super()
		const populatedSrc = src
			.replace('INIT_FUNCTION', initFunction?.toString() || 'function(){}')
			.replace('WORK_FUNCTION', workFunction.toString())

		const srcBlob = new Blob([populatedSrc], { type: 'application/javascript' })

		this.#workerRef = new Worker(URL.createObjectURL(srcBlob))
		this.#workerRef.addEventListener('message', this._messageHandler.bind(this))
		this.#workerRef.addEventListener('messageerror', this._errMessageHandler.bind(this))
		this.#workerRef.addEventListener('error', this._errorHandler.bind(this))

		this.#initArgs = initArgs
	}

	async start(): Promise<void> {
		const initMsg: InitCall = {
			type: 'init',
			message: this.#initArgs && this.#initArgs[0],
			transfer: this.#initArgs && this.#initArgs[1]
		}
		this.#workerRef.postMessage(initMsg)
		await super.waitFor('ready')
		this.active = true
		super._triggerEvent('idle')
	}

	submitJob(job: JobCall): void {
		if (!this.active) throw new Error('Rinzler WorkerWrapper: not taking new jobs')

		this.jobs.push(job)
		this._processQueue()
	}

	async shutdown(): Promise<void> {
		this.active = false
		if (this.jobs.length > 0) {
			await this.waitFor('idle')
		}
		this.terminate()
	}

	terminate(): void {
		return this.#workerRef.terminate()
	}

	/* Internal methods */

	private async _processQueue(): Promise<void> {
		if (this.#workingJob !== null) return
		const job = this.jobs[0]
		this.#workingJob = job.id
		this.#workerRef.postMessage(job, job.transfer || [])
		await super.waitFor(`jobok-${job.id}`)
	}

	private _messageHandler(e: MessageEvent): void {
		switch(e.data.type) {
			case 'ready':
				super._triggerEvent('ready')
				break
			case 'jobok':
				super._triggerEvent<JobAcceptCall>('jobok', e.data)
				super._triggerEvent<JobAcceptCall>(`jobok-${e.data.id}`, e.data)
				break
			case 'jobdone':
				super._triggerEvent<JobReturnCall>('jobdone', e.data)
				super._triggerEvent<JobReturnCall>(`jobdone-${e.data.id}`, e.data)
				this.jobs.splice(this.jobs.map(j => j.id).indexOf(e.data.id), 1)
				this.#workingJob = null
				if (this.jobs.length === 0) {
					super._triggerEvent('idle')
				} else {
					this._processQueue()
				}
				break
			default:
				throw new Error('Rinzler WorkerWrapper: unknown message received')
		}
	}

	private _errMessageHandler(): void {
		throw new Error('Rinzler WorkerWrapper: failed to deserialize message')
	}

	private _errorHandler(e: ErrorEvent): void {
		throw new Error('Rinzler WorkerWrapper internal error: ' + e.message)
	}
}
