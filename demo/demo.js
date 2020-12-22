function setEngineFan(percent) {
	const speed = (percent === -1) ? 0 : 7 - (6.7 * percent)
	document.querySelector('#fans').style.setProperty('animation-duration', `${speed}s`)
}

function setEngineFlame(percent) {
	if (percent === -1) percent = 0
	const size = 0.6 + (0.6 * percent)
	document.querySelector('#flame').style.setProperty('--size', `${size}`)
}

function setEngineShake(percent) {
	if (percent === -1) percent = 0
	const x = 5 * percent
	const y = 2 * percent

	const reactor = document.querySelector('#reactor')

	for (const prop of ['x', '-x', 'y', '-y']) {
		let value
		if (prop.includes('x')) {
			value = x
		} else {
			value = y
		}
		if (prop.includes('-')) {
			value = -value
		}
		reactor.style.setProperty(`--shake${prop}`, `${value}px`)
	}
}

function visualizeEngineLoad(percent) {
	setEngineFan(percent)
	setEngineFlame(percent)
	// setEngineShake(percent)
}

function log(s) {
	const log = document.createElement('span')
	const now = new Date()
	log.innerText = `[${now.getMinutes()}:${now.getSeconds()}] ${s}`
	document.querySelector('#log-box').prepend(log)
}

function fakeLoad(n) {
	const start = self.performance.now()
	let a = 0
	while(self.performance.now() - start < n) {
		a = Math.random() * 1000 / Math.random() * 1000
	}
	return [a]
}

function startFakeLoadJobs(n, l) {
	if (window.loadInterval) clearInterval(window.loadInterval)
	window.loadInterval = setInterval(() => {
		engine.runJob(l)
	}, n)
	document.querySelector('#load-monitor').innerText = `${l}ms job every ${n}ms`
	log(`fake load generator: submitting a ${l}ms job every ${n}ms to engine`)
}

function stopFakeLoadJobs() {
	clearInterval(window.loadInterval)
	window.loadInterval = null
	document.querySelector('#load-monitor').innerText = 'no fake load'
	log('fake load generator: full stop')
}

function startSensorWatcher() {
	if (window.senseInterval) clearInterval(window.senseInterval)
	const pr = document.querySelector('#sensors-print')
	visualizeEngineLoad(0)
	window.senseInterval = setInterval(() => {
		const deb = window.engine._debug()
		pr.innerText =
			`min / max temp:   ${deb.minTemp} / ${deb.maxTemp}\n` +
			`temp (target):    ${deb.temp} (${deb.targetTemp})\n` +
			`pressure:         ${deb.scheduler.pressure}\n` +
			`cooling delay:    ${deb.coolingDelay}ms\n` +
			`median spinup:    ${deb.medianExtendPoolTime}ms\n` +
			`median job:       ${deb.scheduler.measureMedianExecTime()}ms\n`
		updateWviewer(deb.scheduler.workerPool, deb.coolingTimer, deb.coolingDelay)
		visualizeEngineLoad(deb.temp / deb.maxTemp)
		setEngineShake(deb.scheduler.pressure / (deb.maxTemp * 3))
	}, 100)
}

function stopSensorWatcher() {
	clearInterval(window.senseInterval)
	document.querySelector('#sensors-print').innerText = '-no data-'
	document.querySelector('#wviewer').innerHTML = ''
	visualizeEngineLoad(-1)
	setEngineShake(0)
}

const timeout = window.setTimeout
window.lastTimeoutStart = 0
window.setTimeout = function(f, t) {
	window.lastTimeoutStart = Date.now()
	return timeout(f, t)
}

function makeSpan(text) {
	let s = document.createElement('span')
	s.innerText = text
	return s
}

let prevW = 0
function updateWviewer(pool, ct, cd) {
	const v = document.querySelector('#wviewer')
	v.innerHTML = ''
	pool.forEach((w, wid) => {
		const box = document.createElement('div')
		box.classList.add('worker')
		box.appendChild(makeSpan(`${wid}`))
		box.appendChild(makeSpan('running:'))
		box.appendChild(makeSpan(`${(w.jobs[0] && w.jobs[0].id) || 'idle'}`))
		box.appendChild(makeSpan('in queue:'))
		box.appendChild(makeSpan(`${(w.jobs.length === 0) ? '0' : w.jobs.length - 1}`))
		if (ct && ct[1] === wid) {
			box.appendChild(makeSpan(`cooldown: ${Math.round((cd - (Date.now() - window.lastTimeoutStart))/100)/10}s`))
		}
		v.appendChild(box)
	})
	if (pool.size !== prevW) {
		if (pool.size > prevW) {
			log(`workers watcher: detected ${pool.size - prevW} new worker(s)`)
		} else {
			log(`workers watcher: ${prevW - pool.size} worker(s) terminated`)
		}
		prevW = pool.size
	}
}

function linkControlBox() {
	const starter = document.querySelector('#power-button')
	const heater = document.querySelector('#heat-button')
	const freqSlider = document.querySelector('#load-freq')
	const weiSlider = document.querySelector('#load-wei')
	freqSlider.disabled = true
	freqSlider.value = 0
	weiSlider.disabled = true
	weiSlider.value = 0

	let started = false
	window.engine

	async function start() {
		log('starting engine...')
		window.engine = await new RinzlerEngine().configureAndStart(fakeLoad)
		starter.innerText = 'Stop'
		starter.dataset.highlight = 'false'
		heater.disabled = false
		freqSlider.disabled = false
		weiSlider.disabled = false
		startSensorWatcher()
		started = true
	}

	async function stop() {
		stopFakeLoadJobs()
		log('stopping engine...')
		await window.engine.shutdown()
		starter.innerText = 'Start'
		starter.dataset.highlight = 'true'
		heater.disabled = true
		freqSlider.disabled = true
		freqSlider.value = 0
		weiSlider.disabled = true
		weiSlider.value = 0
		stopSensorWatcher()
		started = false
	}

	starter.addEventListener('click', () => {
		return (!started) ? start() : stop()
	})

	heater.addEventListener('click', () => {
		log('heating up engine...')
		window.engine.preHeat()
	})

	function updateFakeLoadParams() {
		let pct = freqSlider.value / 100
		let pctW = weiSlider.value / 100
		if (pct === 0) {
			stopFakeLoadJobs()
		} else {
			let n = 2000 - (1900 * pct)
			let l = 100 + (1900 * pctW)
			startFakeLoadJobs(n, l)
		}
		visualizeEngineLoad(pct)
	}

	freqSlider.addEventListener('change', updateFakeLoadParams.bind(this))
	weiSlider.addEventListener('change', updateFakeLoadParams.bind(this))
}
linkControlBox()
