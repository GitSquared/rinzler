import RinzlerEventEmitter from './event-emitter'
import src from '../dist/internals/worker-src.js'

interface WorkerMsg {
	type: string
}

export interface StartupCall extends WorkerMsg {
	type: 'startup'
}

export interface JobCall extends WorkerMsg {
	type: 'job'
	id: string
	message: unknown
	transfer?: Transferable[]
}

export interface JobAcceptCall extends WorkerMsg {
	type: 'jobok'
	id: string
}

export interface JobReturnCall<T = undefined> extends WorkerMsg {
	type: 'jobdone'
	id: string
	error: boolean
	message: T
}

export default class WebWorker extends RinzlerEventEmitter {
	/* Public props */

	jobs: JobCall[] = []
	active = false

	/* Internal props */

	#workerRef: Worker
	#workingJob: string | null = null

	/* Public methods */

	constructor(workFunction: (message: unknown) => Promise<[message: unknown, transfer?: Transferable[]]> | [message: unknown, transfer?: Transferable[]], initFunction?: () => Promise<void> | void) {
		super()
		const populatedSrc = src
			.replace('INIT_FUNCTION', initFunction?.toString() || 'async () => {}')
			.replace('WORK_FUNCTION', workFunction.toString())

		const srcBlob = new Blob([populatedSrc], { type: 'application/javascript' })
		this.#workerRef = new Worker(URL.createObjectURL(srcBlob))
		this.#workerRef.addEventListener('message', this._messageHandler.bind(this))
		this.#workerRef.addEventListener('messageerror', this._errMessageHandler.bind(this))
		this.#workerRef.addEventListener('error', this._errorHandler.bind(this))
	}

	async start(): Promise<void> {
		this.#workerRef.postMessage({ type: 'startup' })
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
