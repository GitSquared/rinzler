import type WebWorker from './worker-wrapper'
import type { JobReturnCall } from './worker-wrapper'
import type { JobCall } from './worker-wrapper'
import { nanoid } from 'nanoid'

export default class Scheduler {
	/* Public props */

	workerPool: Map<string, WebWorker> = new Map()

	/* Private props */

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

	async submitJob(message: unknown, transfer?: Transferable[]): Promise<[string, string]> {
		const id = nanoid()
		const job: JobCall = {
			type: 'job',
			id,
			message,
			transfer
		}

		const [worker] = this._getLeastBusyWorker()
		await worker.submitJob(job)
		return [id, wid]
	}

	/* Private methods */

	private _getLeastBusyWorker(): [WebWorker, string, number] {
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
		return [this.workerPool.get(lowest[1]) as WebWorker, lowest[1], lowest[0]]
	}
}
