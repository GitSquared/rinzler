export default function calculateMedian(arr: number[]): number {
	if (!arr.length) return 0
	const mid = Math.ceil(arr.length /2)
	const nums = [...arr].sort((a, b) => a - b)
	return (arr.length % 2 !== 0) ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2
}
