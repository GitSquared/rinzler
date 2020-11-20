declare const self: DedicatedWorkerGlobalScope
declare const INIT_FUNCTION: () => Promise<void>
declare const WORK_FUNCTION: (message: unknown, transfer?: Transferable[]) => Promise<[message: unknown, transfer?: Transferable[]]>
