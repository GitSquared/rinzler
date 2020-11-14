import src from 'dist/internals/worker-src'

export default class WebWorker {
	/* Internal props */

	#workerRef: Worker

	/* Public methods */

	constructor() {
		this.#workerRef = new Worker(src)
	}
}
