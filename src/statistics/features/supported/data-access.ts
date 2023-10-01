import { Feature, FeatureProcessorInput } from '../feature'
import { Writable } from 'ts-essentials'
import { RNodeWithParent, RoleInParent, RType, visitAst } from '../../../r-bridge'
import { assertUnreachable, guard } from '../../../util/assert'

const initialDataAccessInfo = {
	singleBracket:               0,
	singleBracketEmpty:          0,
	singleBracketConstant:       0,
	singleBracketSingleVariable: 0,
	singleBracketCommaAccess:    0,
	doubleBracket:               0,
	doubleBracketEmpty:          0,
	doubleBracketConstant:       0,
	doubleBracketSingleVariable: 0,
	doubleBracketCommaAccess:    0,
	chainedOrNestedAccess:       0,
	longestChain:                0,
	deepestNesting:              0,
	namedArguments:              0,
	byName:                      0,
	bySlot:                      0
}

export type DataAccessInfo = Writable<typeof initialDataAccessInfo>

const constantSymbolContent = /(NULL|NA|T|F)/

function visitAccess(info: DataAccessInfo, input: FeatureProcessorInput): void {
	const accessNest: RNodeWithParent[] = []
	const accessChain: RNodeWithParent[] = []

	visitAst(input.normalizedRAst.ast,
		node => {
			if(node.type !== RType.Access) {
				return
			}

			const ctx = node.info
			console.log(ctx)

			if(ctx.role === RoleInParent.Accessed) {
				accessChain.push(node)
			} else if(ctx.role === RoleInParent.IndexAccess) {
				accessNest.push(node) // TODO check if nested in expression! -> keep role context or parent? like x[y[3] + 1]
			}

			// here we have to check after the addition as we can only check the parental context
			if(accessChain.length > 0 || accessNest.length > 0) {
				info.chainedOrNestedAccess++
				info.longestChain = Math.max(info.longestChain, accessChain.length)
				info.deepestNesting = Math.max(info.deepestNesting, accessNest.length)
			}

			// TODO: chain and nest
			const op = node.operator
			switch(op) {
				case '@': info.bySlot++;         return
				case '$': info.byName++;         return
				case '[': info.singleBracket++;  break
				case '[[': info.doubleBracket++; break
				default: assertUnreachable(op)
			}

			guard(Array.isArray(node.access), '[ and [[ must provide access as array')
			const prefix = op === '[' ? 'single' : 'double'
			if(node.access.length === 0) {
				info[`${prefix}BracketEmpty`]++
				return
			} else if(node.access.length > 1) {
				info[`${prefix}BracketCommaAccess`]++
			}

			for(const access of node.access) {
				if(access === null) {
					info[`${prefix}BracketEmpty`]++
					continue
				}
				const argContent = access.value

				if(access.name !== undefined) {
					info.namedArguments++
				}

				if(argContent.type === RType.Number || argContent.type === RType.String ||
					(argContent.type === RType.Symbol && constantSymbolContent.test(argContent.content))
				) {
					info[`${prefix}BracketConstant`]++
				} else if(argContent.type === RType.Symbol) {
					info[`${prefix}BracketSingleVariable`]++
				}
			}
		}, node => {
			// drop again :D
			if(node.type === RType.Access) {
				const ctx = node.info
				if(ctx.role === RoleInParent.Accessed) {
					accessChain.pop()
				} else if(ctx.role === RoleInParent.IndexAccess) {
					accessNest.pop()
				}

			}
		}
	)
}

export const dataAccess: Feature<DataAccessInfo> = {
	name:        'Data Access',
	description: 'Ways of accessing data structures in R',

	process(existing: DataAccessInfo, input: FeatureProcessorInput): DataAccessInfo {
		visitAccess(existing, input)
		return existing
	},
	initialValue: initialDataAccessInfo
}
