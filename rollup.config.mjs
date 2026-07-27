import path from 'path'
import { mkdir, copyFile } from 'fs/promises'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import { string } from 'rollup-plugin-string'
import { nodeResolve } from '@rollup/plugin-node-resolve'
import typescript from 'rollup-plugin-typescript2'
import babel from '@rollup/plugin-babel'
import replace from '@rollup/plugin-replace'
import terser from '@rollup/plugin-terser'
import license from 'rollup-plugin-license'
import progress from 'rollup-plugin-progress'
import analyze from 'rollup-plugin-analyzer'
const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const pkg = require('./package.json')

const copyWorkerTypes = () => ({
	name: 'copy-worker-types',
	async buildStart() {
		await mkdir('dist/internals', { recursive: true })
		await copyFile('worker-src/index.d.ts', 'dist/internals/worker-src.d.ts')
	}
})

export default [
	{
		input: 'worker-src/index.ts',
		plugins: [
			copyWorkerTypes(),
			typescript({
				check: false,
				tsconfig: './worker-src/tsconfig.json'
			}),
			babel({
				extensions: ['.js', '.ts'],
				babelHelpers: 'bundled',
				include: ['worker-src/**/*']
			}),
			progress(),
			analyze({
				summaryOnly: true
			}),
			terser()
		],
		output: {
			file: 'dist/internals/worker-src.js',
			format: 'iife'
		}
	},
	{
		input: 'src/index.ts',
		plugins: [
			string({
				include: './dist/internals/worker-src.js'
			}),
			nodeResolve({
				browser: true
			}),
			typescript({
				check: false,
				useTsconfigDeclarationDir: true,
				tsconfig: './src/tsconfig.json'
			}),
			replace({
				preventAssignment: true,
				/* eslint-disable-next-line @typescript-eslint/naming-convention */
				'process.env.NODE_ENV': JSON.stringify(process.env.NODE)
			}),
			babel({
				extensions: ['.js', '.ts'],
				babelHelpers: 'bundled',
				include: ['src/**/*']
			}),
			license({
				sourcemap: true,
				banner: {
					content: {
						file: path.join(__dirname, 'LICENSE')
					}
				}
			}),
			progress(),
			analyze({
				summaryOnly: true
			}),
			terser()
		],
		output: [
			{
				file: pkg.main,
				name: 'RinzlerEngine',
				sourcemap: true,
				exports: 'default',
				format: 'umd'
			},
			{
				file: pkg.module,
				sourcemap: true,
				format: 'esm'
			}
		]
	},
]
