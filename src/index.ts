import { nanoid } from 'nanoid'
export default function test() {
	const value = window.atob
	console.log(value ?? 'yeah!')
	console.log(nanoid())
}
