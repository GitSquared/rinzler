import path from 'path'
import typescript from 'rollup-plugin-typescript2'
import babel from '@rollup/plugin-babel'
import { nodeResolve } from '@rollup/plugin-node-resolve'
import replace from '@rollup/plugin-replace'
import { terser } from 'rollup-plugin-terser'
import license from 'rollup-plugin-license'
import progress from 'rollup-plugin-progress'
import analyze from 'rollup-plugin-analyzer'
import pkg from './package.json'

export default {
	input: 'src/index.ts',
	plugins: [
		nodeResolve({
			browser: true
		}),
		typescript({
			check: false,
			tsconfig: './src/tsconfig.json'
		}),
		replace({
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
		})
	],
	output: [
		{
			file: pkg.main,
			name: 'RinzlerEngine',
			sourcemap: true,
			format: 'umd',
			plugins: [terser()]
		},
		{
			file: pkg.module,
			sourcemap: true,
			format: 'esm',
			plugins: [terser()]
		}
	]
}
