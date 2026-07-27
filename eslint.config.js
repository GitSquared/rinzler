const eslint = require('@eslint/js')
const globals = require('globals')
const typescriptParser = require('@typescript-eslint/parser')
const typescript = require('@typescript-eslint/eslint-plugin')

module.exports = [
	{
		ignores: ['dist/**', 'docs/**', 'node_modules/**']
	},
	{
		files: ['src/**/*.ts', 'worker-src/**/*.ts'],
		languageOptions: {
			parser: typescriptParser,
			ecmaVersion: 2020,
			sourceType: 'module',
			globals: {
				...globals.browser,
				...globals.node,
				...globals.es2020,
				...globals.worker
			}
		},
		plugins: {
			'@typescript-eslint': typescript
		},
		rules: {
			...eslint.configs.recommended.rules,
			...typescript.configs.recommended.rules,
			indent: [2, 'tab', { SwitchCase: 1 }],
			semi: [2, 'never'],
			curly: [2, 'multi-line'],
			'linebreak-style': [2, 'unix'],
			quotes: [
				2,
				'single',
				{
					avoidEscape: true,
					allowTemplateLiterals: true
				}
			],
			'no-warning-comments': 1,
			'object-curly-spacing': [1, 'always'],
			'array-bracket-spacing': [1, 'never'],
			'no-await-in-loop': 0,
			'no-undef': 0,
			'no-useless-assignment': 0,
			'@typescript-eslint/no-unused-expressions': [
				2,
				{
					allowShortCircuit: true,
					allowTernary: true
				}
			],
			'@typescript-eslint/naming-convention': [
				1,
				{
					selector: 'default',
					format: ['camelCase'],
					leadingUnderscore: 'allow',
					trailingUnderscore: 'allow'
				},
				{
					selector: 'variable',
					format: ['camelCase', 'UPPER_CASE'],
					leadingUnderscore: 'allow',
					trailingUnderscore: 'allow'
				},
				{
					selector: 'property',
					format: ['camelCase', 'UPPER_CASE'],
					leadingUnderscore: 'allow',
					trailingUnderscore: 'allow'
				},
				{
					selector: 'memberLike',
					modifiers: ['private'],
					format: ['camelCase'],
					leadingUnderscore: 'require'
				},
				{
					selector: 'typeLike',
					format: ['PascalCase']
				}
			]
		}
	}
]
