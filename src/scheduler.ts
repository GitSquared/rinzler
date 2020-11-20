import type WebWorker from './worker-wrapper'
import type { JobReturnCall, JobCall } from './worker-wrapper'
import calculateMedian from './median'
import { nanoid } from 'nanoid'

export default class Scheduler {
	/* Public props */

	workerPool: Map<string, WebWorker> = new Map()
	pressure = 0
	lastJobsExecTimes: number[] = []

	/* Internal props */

	readonly #jobsExecTimesBacklogSize = 20

	/* Public methods */

	async extendPool(worker: WebWorker): Promise<string> {
		const id = nanoid()
		await worker.start()
		this.workerPool.set(id, worker)
		return id
	}

	async reducePool(): Promise<void> {
		const [worker, id] = this._getLeastBusyWorker()
		if (!worker) return
		await worker.shutdown()
		this.workerPool.delete(id)
	}

	async submitJob(message: unknown, transfer?: Transferable[]): Promise<[message: unknown, transfer?: Transferable[]]> {
		const id = nanoid()
		const job: JobCall = {
			type: 'job',
			id,
			message,
			transfer
		}

		const perfMarkA = performance.now()

		const { worker } = this.getLeastBusyWorker()
		await worker.submitJob(job)
		this.pressure++
		const jobResults = await worker.waitFor<JobReturnCall>(`jobdone-${id}`)
		this.pressure--

		const perfMarkB = performance.now()
		this.lastJobsExecTimes.push(perfMarkB - perfMarkA)
		this.lastJobsExecTimes.splice(this.#jobsExecTimesBacklogSize, this.lastJobsExecTimes.length - this.#jobsExecTimesBacklogSize)

		return [jobResults.message, jobResults.transfer]
	}

	measureMedianExecTime(): number {
		return calculateMedian(this.lastJobsExecTimes)
	}

	getLeastBusyWorker(): { worker: WebWorker; wid: string; jobCount: number } {
		let lowest: [number, string] = [-1, '']
		// O(n) complexity except when a worker has 0 current jobs,
		// but we're unlikely to ever be looping >20 entries, so...
		for (const entry of this.workerPool) {
			if (lowest[0] === -1 || entry[1].jobs.length < lowest[0]) {
				if (!entry[1].active) continue
				lowest = [entry[1].jobs.length, entry[0]]
				if (lowest[0] === 0) break
			}
		}
		return {
			worker: this.workerPool.get(lowest[1]) as WebWorker,
			wid: lowest[1],
			jobCount: lowest[0]
		}
	}
}
