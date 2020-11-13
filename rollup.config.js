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
		typescript({ check: false }),
		nodeResolve({
			browser: true
		}),
		replace({
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
			file: pkg.main.replace('.min', ''),
			name: 'Rinzler',
			sourcemap: true,
			format: 'umd',
		},
		{
			file: pkg.module.replace('.min', ''),
			sourcemap: true,
			format: 'esm',
		},
		{
			file: pkg.main,
			name: 'Rinzler',
			format: 'umd',
			plugins: [terser()]
		},
		{
			file: pkg.module,
			format: 'esm',
			plugins: [terser()]
		}
	]
}
