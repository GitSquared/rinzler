import RinzlerEventEmitter from './event-emitter'
import src from 'dist/internals/worker-src'

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

export interface JobReturnCall extends WorkerMsg {
	type: 'jobdone'
	id: string
	message: unknown
	transfer?: Transferable[]
}

export default class WebWorker extends RinzlerEventEmitter {
	/* Public props */

	jobs: string[] = []
	active = false

	/* Internal props */

	#workerRef: Worker

	/* Public methods */

	constructor(workFunction: (message: unknown, transfer?: Transferable[]) => Promise<[message: unknown, transfer?: Transferable[]]>, initFunction?: () => Promise<void>) {
		super()
		const populatedSrc = src
			.replace('INIT_FUNCTION', initFunction?.toString() || 'async () => {}')
			.replace('WORK_FUNCTION', workFunction.toString())

		this.#workerRef = new Worker(populatedSrc)
		this.#workerRef.addEventListener('message', this._messageHandler)
		this.#workerRef.addEventListener('messageerror', this._errMessageHandler)
		this.#workerRef.addEventListener('error', this._errorHandler)
	}

	async start(): Promise<void> {
		this.#workerRef.postMessage('startup')
		await super.waitFor('ready')
		this.active = true
		super._triggerEvent('idle')
	}

	async submitJob(job: JobCall): Promise<void> {
		if (!this.active) throw new Error('Rinzler WorkerWrapper: not taking new jobs')

		this.#workerRef.postMessage(job)
		await super.waitFor(`jobok-${job.id}`)
		this.jobs.push(job.id)
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
				this.jobs.splice(this.jobs.indexOf(e.data.id))
				if (this.jobs.length === 0) {
					super._triggerEvent('idle')
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
