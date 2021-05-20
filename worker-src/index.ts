import type { InitCall, JobCall, JobAcceptCall, JobReturnCall, WorkerInitFunction, WorkerFunction, WorkerFunctionTransferArgs } from '../src/worker-wrapper'

interface ReceivedMessageEvent extends MessageEvent {
	data: InitCall | JobCall
}

declare const self: DedicatedWorkerGlobalScope

/* These two will be replaced by actual code when launching the worker - see src/worker-wrapper */

declare const INIT_FUNCTION: WorkerInitFunction
declare const WORK_FUNCTION: WorkerFunction

/* Where the actual magic happens! */

async function processJob(job: JobCall): Promise<void> {
	const id = job.id

	self.postMessage({
		type: 'jobok',
		id
	} as JobAcceptCall)

	let [message, transfer]: WorkerFunctionTransferArgs = []
	let error = false
	try {
		[message, transfer] = await WORK_FUNCTION(job.message)
	} catch(err) {
		message = err.message
		error = true
	}

	self.postMessage({
		type: 'jobdone',
		id,
		error,
		message
	} as JobReturnCall, transfer || [])
}

/* Attach event handlers */

self.addEventListener('message', async (e: ReceivedMessageEvent) => {
	switch(e.data.type) {
		case 'init':
			await INIT_FUNCTION(e.data.message)
			self.postMessage({ type: 'ready' })
			break
		case 'job':
			processJob(e.data)
			break
		default:
			throw new Error('Rinzler Worker: unknown message received')
	}
})
self.addEventListener('messageerror', () => {
	throw new Error('Rinzler Worker: failed to deserialize message')
})
