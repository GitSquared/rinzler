import Scheduler from './scheduler'
import WebWorker from './worker-wrapper'
import calculateMedian from './median'

/**
	### Welcome to Rinzler's full documentation.
	If you're just getting started, check out the [Quick Start guide](../index.html#quick-start).

	This page describes the interface of an instanted RinzlerEngine class, which you can access like so:

	```js
	import RinzlerEngine from 'rinzler-engine'

	const engine = new RinzlerEngine()
	```
*/
export default class RinzlerEngine {
	/* Internal props */

	#maxTemp = (navigator.hardwareConcurrency && navigator.hardwareConcurrency > 1) ? navigator.hardwareConcurrency - 1 : 1
	#targetTemp = -1
	#minTemp = 1
	#workerArgs: Parameters<RinzlerEngine['configureAndStart']> | undefined
	#scheduler: Scheduler = new Scheduler()
	#coolingTimer: [number, string] | null = null
	#extendPoolTimes: number[] = []

	readonly #coolingDelay = 4000
	readonly #extendPoolTimesBacklogSize = 20

	/* Public methods */

	/**
		Start the engine.

		Internally, configures the job processing functions, starts the load balancer and launches a first WebWorker.

		@param workFunction The function which will process all jobs sent to this engine instance.

			May be sync or async, and should return values in the [`DedicatedWorkerGlobalScope.postMessage()`](https://developer.mozilla.org/en-US/docs/Web/API/Worker/postMessage) format.

			You can safely throw errors in this function as they will be catched and bubbled up from the engine.

		@param initFunction A function for setting up a Worker environment before it starts processing jobs. May be sync or async.

			If you need to store some global state to be used later when processing jobs, it's recommended to write a property to `self`, which will be a [`DedicatedWorkerGlobalScope`](https://developer.mozilla.org/en-US/docs/Web/API/DedicatedWorkerGlobalScope), but be careful not to override any existing prop.

		@returns A Promise for the current engine instance. Can be used for chaining multiple instance method calls.

		@category Lifecycle
	*/
	async configureAndStart(workFunction: (message: unknown) => Promise<[message: unknown, transfer?: Transferable[]]> | [message: unknown, transfer?: Transferable[]], initFunction?: () => Promise<void> | void): Promise<RinzlerEngine> {
		if (this.#scheduler.workerPool.size) throw new Error('Rinzler: engine is already started, please use shutdown() first')

		this.#workerArgs = [workFunction, initFunction]
		this.#targetTemp = 0
		await this._heatUp()
		return this
	}

	/**
		Schedule, execute and get the results of a job.

		@typeParam T The return type of a successful job.

		@param message The data that will be passed to the `workFunction` as defined in {@link configureAndStart}.

		@param transfer An optional array of Transferable data to transfer to the processing function. See [`DedicatedWorkerGlobalScope.postMessage()`](https://developer.mozilla.org/en-US/docs/Web/API/Worker/postMessage).

		@returns A Promise that will be fulfilled with T or an empty resolve when the job has been processed.

			If the job threw an error when processing, the Promise will reject with an [`Error`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error#Instance_properties) object containing the job's error message.

		@category Lifecycle
	*/
	async runJob<T = void>(message: unknown, transfer?: Transferable[]): Promise<T> {
		await this._automaticHeatUp()
		return this.#scheduler.submitJob<T>(message, transfer)
	}

	/**
		Stop the engine.

		Wait for any remaining tasks to complete, shuts down all WebWorkers and sets the engine instance back to a blank state.

		@category Lifecycle
	*/
	async shutdown(): Promise<void> {
		await this._coolDown(this.#scheduler.workerPool.size + 1, true)
	}

	/**
		Start as much WebWorkers as currently recommended by the browser, or allowed by {@link afterburner}.

		You should use this only if you know you will have to process many jobs and want to ensure that the engine is fully revved up.
		In most cases the automatic "temperature" adjustement will provide a good balance between performance and memory footprint.

		You should immediatly follow this call with your actual {@link runJob} calls, otherwise the engine might start to cool itself down automatically.

		@returns A Promise for the current engine instance. Can be used for chaining multiple instance method calls.

		@category Optimization
	*/
	async preHeat(): Promise<RinzlerEngine> {
		await this._heatUp(this.#maxTemp - this.#targetTemp)
		return this
	}

	/**
		***WARNING: Possibly unstable.**

		Overrides the maximum number of WebWorkers Rinzler will attempt to spawn.

		Normally this is retrieved from [`navigator.hardwareConcurrency`](https://developer.mozilla.org/en-US/docs/Web/API/NavigatorConcurrentHardware/hardwareConcurrency), which is a browser-provided indicator of how many Workers a browsing context should use, with respect to the browser's own limitations and the number of available CPU cores on the host hardware.

		By going beyond that number you may crash the browser tab, get unexpected errors, or a considerable boost in parallelized performance.
		Aim for the moon, right?

		@param max The new maximum number of WebWorkers this instance will manage. If set to lower than the current max, extra Workers will be gracefully shut down to respect the new limit.

		@returns A Promise for the current engine instance. Can be used for chaining multiple instance method calls.

		@category ⚠️ Dangerous
	*/
	async afterburner(max: number): Promise<RinzlerEngine> {
		const oldMax = this.#maxTemp
		this.#maxTemp = max
		if (oldMax - max > 0) {
			await this._coolDown(oldMax - max)
		}

		return this
	}

	/* Internal methods */
	// ES6 private class methods are not yet handled correctly in TypeScript, so we use soft-private for now...
	// Tracked here: https://github.com/microsoft/TypeScript/issues/37677

	private _measureTemp(): number {
		return this.#scheduler.workerPool.size
	}

	private _measureMedianForkTime(): number {
		return calculateMedian(this.#extendPoolTimes)
	}

	private _idleWorkerListener(wid: string): void {
		if (this.#coolingTimer || this.#scheduler.workerPool.size <= this.#minTemp) return
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

	private async _automaticHeatUp(): Promise<void> {
		const { jobCount } = this.#scheduler.getLeastBusyWorker()
		if (jobCount * this.#scheduler.measureMedianExecTime() > this._measureMedianForkTime()) {
			// Forking a new thread is worth it, let's rock
			try {
				await this._heatUp()
			} catch {
				// We're already maxed out!
			}
		}
	}

	private async _heatUp(threadCount = 1): Promise<void> {
		// start more workers
		if (!this.#workerArgs) throw new Error('Rinzler (internal): unknown parameters for heating up new threads')
		if ((this.#targetTemp + threadCount) > this.#maxTemp) throw new Error('Rinzler (internal): attempting to overheat')
		if (this.#targetTemp < 0) throw new Error('Rinzler (internal): engine is too cold, likely has already been shut down')

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

	private async _coolDown(threadCount = 1, override = false): Promise<void> {
		// reduce number of active workers
		if (!override) {
			if ((this.#targetTemp - threadCount) < this.#minTemp) throw new Error('Rinzler (internal): attempting to underheat')
			if ((this.#targetTemp - threadCount) <= 0) throw new Error('Rinzler (internal): engine cannot run in subzero temperatures')
		}

		this.#targetTemp = this._measureTemp() - threadCount
		for (let i = 0; i < threadCount; i++) {
			await this.#scheduler.reducePool()
		}
	}
}
