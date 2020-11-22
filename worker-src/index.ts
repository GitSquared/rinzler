/* TypeScript interfaces & helpers */

import './worker.d.ts'
import type { JobCall, JobAcceptCall, JobReturnCall } from '../src/worker-wrapper'

interface ReceivedMessageEvent extends MessageEvent {
	data: {
		type: 'startup' | 'job'
	}
}

/* These two will be replaced by actual code when launching the worker - see src/worker-wrapper */

const init: () => Promise<void> | void = INIT_FUNCTION
const work: (message: unknown) => Promise<[message: unknown, transfer?: Transferable[]]> | [message: unknown, transfer?: Transferable[]] = WORK_FUNCTION

/* Where the actual magic happens! */

async function processJob(job: JobCall): Promise<void> {
	const id = job.id

	self.postMessage({
		type: 'jobok',
		id
	} as JobAcceptCall)

	let message: unknown
	let transfer: Transferable[] | undefined
	let error = false
	try {
		[message, transfer] = await work(job.message)
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
		case 'startup':
			await init()
			self.postMessage('ready')
			break
		case 'job':
			processJob(e.data as JobCall)
			break
		default:
			throw new Error('Rinzler Worker: unknown message received')
	}
})
self.addEventListener('messageerror', () => {
	throw new Error('Rinzler Worker: failed to deserialize message')
})
