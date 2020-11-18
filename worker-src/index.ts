/* TypeScript interfaces & helpers */

import type { JobCall, JobAcceptCall, JobReturnCall } from '../src/worker-wrapper'

interface ReceivedMessageEvent extends MessageEvent {
	data: {
		type: 'startup' | 'job' | 'eol'
	}
}

/* Initial worker state */

let acceptIncomingWork = false

/* These two will be replaced by actual code when launching the worker - see src/worker-wrapper */

const init: () => Promise<void> = __INIT_FUNCTION__
const work: (message: unknown, transfer?: Transferable[]) => Promise<[message: unknown, transfer?: Transferable[]]> = __WORK_FUNCTION__

/* Where the actual magic happens! */

async function processJob(job: JobCall): Promise<void> {
	if (!acceptIncomingWork) throw new Error('Rinzler Worker is not accepting work')

	const id = job.id

	self.postMessage({
		type: 'jobok',
		id
	} as JobAcceptCall)

	const [message, transfer] = await work(job.message, job.transfer)
	self.postMessage({
		type: 'jobdone',
		id,
		message,
		transfer
	} as JobReturnCall)
}

/* Attach event handlers */

self.addEventListener('message', (e: ReceivedMessageEvent) => {
	switch(e.data.type) {
		case 'startup':
			init().then(() => {
				acceptIncomingWork = true
				self.postMessage('ready')
			})
			break
		case 'job':
			processJob(e.data as JobCall)
			break
		case 'eol':
			acceptIncomingWork = false
			break
		default:
			throw new Error('Rinzler Worker: unknown message received')
	}
})
self.addEventListener('messageerror', () => {
	throw new Error('Rinzler Worker: failed to deserialize message')
})
