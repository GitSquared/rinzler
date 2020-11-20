import Scheduler from './scheduler'
import WebWorker from './worker-wrapper'

export default class RinzlerEngine {
	/* Internal props */

	#maxTemp: number
	#targetTemp = -1
	#workerArgs: Parameters<RinzlerEngine['startup']> | undefined
	#scheduler: Scheduler = new Scheduler()

	/* Public methods */

	constructor() {
		this.#maxTemp = (navigator.hardwareConcurrency && navigator.hardwareConcurrency > 1) ? navigator.hardwareConcurrency - 1 : 1
	}

	async startup(...args: ConstructorParameters<typeof WebWorker>): Promise<RinzlerEngine> {
		if (this.#scheduler.workerPool.size) throw new Error('Rinzler: engine is already started, please use shutdown() first')

		this.#workerArgs = args
		await this._heatUp()
		return this
	}

	async shutdown(): Promise<void> {
		await this._coolDown(this.#scheduler.workerPool.size)
	}

	//TODO: automatic horizontal scaling, job error handling
	async runJob(message: unknown, transfer?: Transferable[]): Promise<[message: unknown, transfer?: Transferable[]]> {
		const jobResults = await this.#scheduler.submitJob(message, transfer)
		return [jobResults.message, jobResults.transfer]
	}

	async preHeat(): Promise<RinzlerEngine> {
		await this._heatUp(this.#maxTemp - this.#targetTemp)
		return this
	}

	/* Internal methods */
	// ESnext private class methods are not yet handled correctly in TypeScript, so we use soft-private for now...
	// Tracked here: https://github.com/microsoft/TypeScript/issues/37677

	private _measureTemp(): number {
		return this.#scheduler.workerPool.size
	}

	private async _heatUp(threadCount = 1): Promise<void> {
		// start more workers
		if (!this.#workerArgs) throw new Error('Rinzler (internal): unknown parameters for heating up new threads')
		if ((this.#targetTemp + threadCount) > this.#maxTemp) throw new Error('Rinzler (internal): attempting to overheat')
		if (this.#targetTemp === 0) throw new Error('Rinzler (internal): engine is too cold, likely has already been shut down')

		this.#targetTemp = (this._measureTemp() + threadCount) || threadCount
		for (let i = 0; i < threadCount; i++) {
			await this.#scheduler.extendPool(new WebWorker(...this.#workerArgs))
		}
	}

	private async _coolDown(threadCount = 1): Promise<void> {
		// reduce number of active workers
		if ((this.#targetTemp - threadCount) < this._measureTemp()) throw new Error('Rinzler (internal): engine cannot run in subzero temperatures')

		this.#targetTemp = this._measureTemp() - threadCount
		for (let i = 0; i < threadCount; i++) {
			await this.#scheduler.reducePool()
		}
	}
}
