import type { WorkerFunction, WorkerInitFunction, WorkerFunctionTransferArgs } from './worker-wrapper'
import Scheduler from './scheduler'
import WebWorker from './worker-wrapper'
import calculateMedian from './median'

export type { WorkerFunction, WorkerInitFunction, WorkerFunctionTransferArgs }

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
	#workerArgs?: ConstructorParameters<typeof WebWorker>
	#scheduler: Scheduler = new Scheduler()
	#coolingTimer: [number, string] | null = null
	#extendPoolTimes: number[] = []

	readonly #coolingDelay = 4000
	readonly #extendPoolTimesBacklogSize = 20

	/* Public methods */

	/**
		Start the engine.

		Internally, configures the job processing functions, starts the load balancer and launches a first Web Worker.

		@param workFunction The function which will process all jobs sent to this engine instance.

		@param initFunction A function for setting up a Web Worker environment before it starts processing jobs. May be sync or async.

		@param initArgs Dynamic data to send to the initFunction to set up the environment of new Web Worker instances.

		@returns A Promise for the current engine instance. Can be used for chaining multiple instance method calls.

		@category Lifecycle
	*/
	async configureAndStart(workFunction: WorkerFunction, initFunction?: WorkerInitFunction, initArgs?: WorkerFunctionTransferArgs): Promise<RinzlerEngine> {
		if (this.#scheduler.workerPool.size) throw new Error('Rinzler: engine is already started, please use shutdown() first')

		this.#workerArgs = [workFunction, initFunction, initArgs]
		this.#targetTemp = 0
		await this.#heatUp()
		return this
	}

	/**
		Schedule, execute and get the results of a job.

		@typeParam T The return type of a successful job - meaning what the {@linkcode WorkerFunction} will return, with `Transferable` objects inlined.

		@returns A Promise that will be fulfilled with T or an empty resolve when the job has been processed.

			If the job threw an error when processing, the Promise will reject with an [`Error`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error#Instance_properties) object containing the job's error message.

		@category Lifecycle
	*/
	async runJob<T = void>(...args: WorkerFunctionTransferArgs): Promise<T> {
		await this.#automaticHeatUp()
		return this.#scheduler.submitJob<T>(args[0], args[1])
	}

	/**
		Stop the engine.

		Wait for any remaining tasks to complete, shuts down all WebWorkers and sets the engine instance back to a blank state.

		@category Lifecycle
	*/
	async shutdown(): Promise<void> {
		await this.#coolDown(this.#scheduler.workerPool.size + 1, true)
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
		await this.#heatUp(this.#maxTemp - this.#targetTemp)
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
		const current = this.#measureTemp()
		this.#maxTemp = max
		if ((current - max) > 0) {
			await this.#coolDown(current - max)
		}

		return this
	}

	/* Debug method */

	_debug(): Record<string, unknown> {
		return {
			maxTemp: this.#maxTemp,
			targetTemp: this.#targetTemp,
			temp: this.#measureTemp(),
			minTemp: this.#minTemp,
			scheduler: this.#scheduler,
			coolingTimer: this.#coolingTimer,
			coolingDelay: this.#coolingDelay,
			medianExtendPoolTime: this.#measureMedianForkTime()
		}
	}

	/* Internal methods */

	#measureTemp(): number {
		return this.#scheduler.workerPool.size
	}

	#measureMedianForkTime(): number {
		return calculateMedian(this.#extendPoolTimes)
	}

	async #automaticHeatUp(): Promise<void> {
		const { jobCount } = this.#scheduler.getLeastBusyWorker()
		if (jobCount * this.#scheduler.measureMedianExecTime() > this.#measureMedianForkTime()) {
			// Forking a new thread is worth it, let's rock
			try {
				await this.#heatUp()
			} catch {
				// We're already maxed out!
			}
		}
	}

	async #heatUp(threadCount = 1): Promise<void> {
		// start more workers
		if (!this.#workerArgs) throw new Error('Rinzler (internal): unknown parameters for heating up new threads')
		if ((this.#targetTemp + threadCount) > this.#maxTemp) throw new Error('Rinzler (internal): attempting to overheat')
		if (this.#targetTemp < 0) throw new Error('Rinzler (internal): engine is too cold, likely has already been shut down')

		this.#targetTemp = (this.#measureTemp() + threadCount) || threadCount
		for (let i = 0; i < threadCount; i++) {
			const perfMarkA = performance.now()

			const worker = new WebWorker(...this.#workerArgs)
			const wid = await this.#scheduler.extendPool(worker)
			worker.on('idle', () => {
				this.#automaticCoolDown(wid)
			})
			await worker.start()

			const perfMarkB = performance.now()
			this.#extendPoolTimes.unshift(perfMarkB - perfMarkA)
			this.#extendPoolTimes.splice(this.#extendPoolTimesBacklogSize, this.#extendPoolTimes.length - this.#extendPoolTimesBacklogSize)
		}
	}

	#automaticCoolDown(wid?: string): void {
		if (!wid) {
			const { wid, jobCount } = this.#scheduler.getLeastBusyWorker()
			if (jobCount === 0) {
				this.#automaticCoolDown(wid)
			}
			return
		}

		if (this.#coolingTimer) return
		if (this.#measureTemp() <= this.#minTemp) {
			this.#coolingTimer = null
			return
		}
		const worker = this.#scheduler.workerPool.get(wid)
		if (!worker) return

		this.#coolingTimer = [window.setTimeout(async () => {
			try {
				await this.#coolDown(1, false, wid)
			} catch {
				// Worker does not exist anymore or engine is already cooled
			}
			this.#coolingTimer = null
			this.#automaticCoolDown()
		}, this.#coolingDelay), wid]

		worker.once('jobok', () => {
			if (this.#coolingTimer && this.#coolingTimer[1] === wid) {
				window.clearTimeout(this.#coolingTimer[0])
				this.#coolingTimer = null
				// Check if there is another idle worker to launch a new timer on
				this.#automaticCoolDown()
			}
		})
	}

	async #coolDown(threadCount = 1, override = false, wid?: string): Promise<void> {
		// reduce number of active workers
		if (!override) {
			if ((this.#targetTemp - threadCount) < this.#minTemp) throw new Error('Rinzler (internal): attempting to underheat')
			if ((this.#targetTemp - threadCount) <= 0) throw new Error('Rinzler (internal): engine cannot run in subzero temperatures')
		}

		if (wid && threadCount !== 1) throw new Error('Rinzler (internal): cannot cool down more than 1 workers when specifying a worked id')

		this.#targetTemp = this.#measureTemp() - threadCount
		for (let i = 0; i < threadCount; i++) {
			(wid) ? await this.#scheduler.reducePool(wid) : await this.#scheduler.reducePool()
		}
	}
}
