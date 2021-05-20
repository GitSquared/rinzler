<div align="center">
  <img width="60%" alt="Rinzler project logo" src="https://github.com/GitSquared/rinzler/raw/master/media/rinzler_logo.svg"/>
  <br/><br/>
  <a href="https://npmjs.com/package/rinzler-engine"><img alt="npm version badge" src="https://img.shields.io/npm/v/rinzler-engine"/></a>
  <a href="https://npmjs.com/package/rinzler-engine"><img alt="types included badge" src="https://badgen.net/npm/types/rinzler-engine"/></a>
  <a href="https://github.com/GitSquared/rinzler/blob/master/LICENSE"><img alt="license badge" src="https://img.shields.io/npm/l/rinzler-engine"/></a>
  <br/><br/><br/>
</div>

[Rinzler](https://github.com/GitSquared/rinzler) is a ~~turboramjet~~ **parallel processing engine** for the browser.

It speeds up your web application by allowing recurring functions to execute in parallel taking full advantage of the host system's available processing power.

Check out the [full docs](https://gitsquared.github.io/rinzler/classes/rinzlerengine.html), try the [interactive demo](https://rinzler-demo.vercel.app) or read on for a high-level overview and how to get started with Rinzler.

## Concept
Most devices have a processor unit (CPU) with multiple *cores*, meaning that they are capable of working on multiple tasks at the same time.
Modern operating systems with multi-tasking functionality (e.g the ability to run & manage multiple programs/windows) have a special component called a *thread scheduler*.

Each program you run can have multiple *threads*, and the scheduler's job is to distribute threads to the CPU's cores.

A web page's JavaScript normally executes on one thread, meaning at any given time it will only use at most one CPU core to execute. In most cases this is fine, and also helps ensures other tabs in the user's browser, or other programs, can also keep running smoothly.

However, some web applications might need to process a lot of data, or do a lot of expensive computing ops, and therefore can benefit from spreading work across all the available cores of the host machine.

Rinzler is a tool to do just that, in the simplest way possible - just define functions to run in parallel, and use native ES6 [Promises](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Using_promises) to run & manage jobs.

<div align="center">
  <img width="80%" alt="Infographic explaining how Rinzler allows you to use more CPU cores" src="https://github.com/GitSquared/rinzler/raw/master/media/infographic.png"/>
</div>

Internally, it leverages [Web Workers](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API), which is a standard Web API for executing code in separate threads. It also includes a custom scheduler that handles spawning new Workers when necessary, sharing work between them, and shutting them down when they're not used.

## Install
```
npm i rinzler-engine
```

Both ES & UMD modules are bundled, as well as TypeScript types, so you should be all set.

Rinzler targets browsers with [WebWorkers](https://caniuse.com/webworkers) and [Promises](https://caniuse.com/promises) support (check the [browserslistrc](https://github.com/GitSquared/rinzler/raw/master/.browserslistrc)). Most modern evergreen browsers, including Edge, should be compatible.

## Quick start
You first need to define functions for setting up the environment of new Workers (optional) and processing job payloads.
In the following example, we will set up a Rinzler-accelerated app that decodes `ArrayBuffer`s of text.

```js
function init() {
	self.params = {
		encoding: 'utf-8'
	}
}

function processJob(message) {
	const buffer = message.encodedText
	const text = new TextDecoder(self.params.encoding).decode(buffer)
	return [text]
}
```

Next we will import Rinzler and start the engine by passing the two functions we defined above.
The following code is written for asynchronous contexts, but you can translate it to synchronous by using `.then()` with a callback instead of `await`.

```js
import RinzlerEngine from 'rinzler-engine'

const engine = await new RinzlerEngine().configureAndStart(processJob, init)
```

Now we can actually run jobs! We'll use the `runJob()` method, which returns a `Promise` that will resolve when the job is completed.
Since we need to pass an `ArrayBuffer`, we'll use the second argument as a `Transferable[]` - much like in the native [`worker.postMessage()` API.](https://developer.mozilla.org/en-US/docs/Web/API/Worker/postMessage)

```js
const encodedText = new TextEncoder().encode('hello Rinzler')
const decodedResult = await engine.runJob({ encodedText }, [encodedText])

console.log(decodedResult) // "hello Rinzler"
```

You can start as many jobs as you want, and take full advantage of ES6's asynchronous syntax (for example, [`Promise.all()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/all)).

If you use TypeScript, you can pass return types with the `runJob<T>(): Promise<T>` signature.

Under the hood, Rinzler will take care of launching Web Workers, balancing their load, and gracefully shutting them down when needed to reduce your app's memory footprint.

Web Worker instances will be destroyed by the browser when the page exits, but you can schedule a graceful shutdown yourself using `engine.shutdown()`, which returns a `Promise` that will resolve once all currently active jobs have completed and all workers have been stopped.
