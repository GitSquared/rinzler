/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
type Listener<T = any> = (data?: T) => unknown

export abstract class RinzlerEventEmitter {
	#listeners: Map<string, Listener[]> = new Map()
	#onceListeners: Map<string, Listener[]> = new Map()

	on<T>(event: string, func: Listener<T>): void {
		this.#listeners.get(event)?.push(func) || this.#listeners.set(event, [func])
	}

	once<T>(event: string, func: Listener<T>): void {
		this.#onceListeners.get(event)?.push(func) || this.#onceListeners.set(event, [func])
	}

	waitFor<T = void>(event: string): Promise<T> {
		return new Promise(resolve => {
			this.once(event, () => {
				resolve()
			})
		})
	}

	protected async _triggerEvent<T>(event: string, data?: T): Promise<void> {
		this.#listeners.get(event)?.forEach(listener => {
			listener(data)
		})
		if (this.#onceListeners.has(event)) {
			const listeners = this.#onceListeners.get(event)
			this.#onceListeners.set(event, [])
			listeners?.map(listener => {
				listener(data)
			})
		}
	}
}
