import Scheduler from './scheduler'
import WebWorker from './worker-wrapper'

export default class RinzlerEngine {
	/* Internal props */

	#maxTemp: number
	#targetTemp = -1
	#minTemp = 1
	#workerArgs: Parameters<RinzlerEngine['startup']> | undefined
	#scheduler: Scheduler = new Scheduler()
	#coolingTimer: [number, string] | null = null
	#extendPoolTimes: number[] = []

	readonly #coolingDelay = 4000
	readonly #extendPoolTimesBacklogSize = 20

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

	//TODO: job error handling
	runJob(message: unknown, transfer?: Transferable[]): Promise<[message: unknown, transfer?: Transferable[]]> {
		return this.#scheduler.submitJob(message, transfer)
	}

	async preHeat(): Promise<RinzlerEngine> {
		await this._heatUp(this.#maxTemp - this.#targetTemp)
		return this
	}

	//TODO: afterburner?

	/* Internal methods */
	// ES6 private class methods are not yet handled correctly in TypeScript, so we use soft-private for now...
	// Tracked here: https://github.com/microsoft/TypeScript/issues/37677

	private _measureTemp(): number {
		return this.#scheduler.workerPool.size
	}

	private _idleWorkerListener(wid: string): void {
		if (this.#coolingTimer) return
		const worker = this.#scheduler.workerPool.get(wid)

		this.#coolingTimer = [window.setTimeout(() => {
			this.#scheduler.reducePool(wid)
		}, this.#coolingDelay), wid]

		worker?.once('jobok', () => {
			if (this.#coolingTimer && this.#coolingTimer[1] === wid) {
				window.clearTimeout(this.#coolingTimer[0])
				const { wid, jobCount } = this.#scheduler.getLeastBusyWorker()
				if (jobCount === 0) {
					this._idleWorkerListener(wid)
				} else {
					this.#coolingTimer = null
				}
			}
		})
	}

	private async _heatUp(threadCount = 1): Promise<void> {
		// start more workers
		if (!this.#workerArgs) throw new Error('Rinzler (internal): unknown parameters for heating up new threads')
		if ((this.#targetTemp + threadCount) > this.#maxTemp) throw new Error('Rinzler (internal): attempting to overheat')
		if (this.#targetTemp === 0) throw new Error('Rinzler (internal): engine is too cold, likely has already been shut down')

		this.#targetTemp = (this._measureTemp() + threadCount) || threadCount
		for (let i = 0; i < threadCount; i++) {
			const perfMarkA = performance.now()

			const worker = new WebWorker(...this.#workerArgs)
			const wid = await this.#scheduler.extendPool(worker)
			worker.on('idle', () => {
				this._idleWorkerListener(wid)
			})

			const perfMarkB = performance.now()
			this.#extendPoolTimes.push(perfMarkB - perfMarkA)
			this.#extendPoolTimes.splice(this.#extendPoolTimesBacklogSize, this.#extendPoolTimes.length - this.#extendPoolTimesBacklogSize)
		}
	}

	private async _coolDown(threadCount = 1): Promise<void> {
		// reduce number of active workers
		if ((this.#targetTemp - threadCount) < this.#minTemp) throw new Error('Rinzler (internal): attempting to underheat')
		if ((this.#targetTemp - threadCount) < this._measureTemp()) throw new Error('Rinzler (internal): engine cannot run in subzero temperatures')

		this.#targetTemp = this._measureTemp() - threadCount
		for (let i = 0; i < threadCount; i++) {
			await this.#scheduler.reducePool()
		}
	}
}
