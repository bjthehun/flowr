import {
	DataflowGraph,
	DataflowGraphNodeFunctionCall,
	DataflowGraphNodeInfo,
	DataflowScopeName, FunctionArgument, LocalScope, NamedFunctionArgument, PositionalFunctionArgument
} from '../graph'
import {
	BuiltIn,
	IdentifierReference,
	REnvironmentInformation,
	resolveByName
} from '../environments'
import { DefaultMap } from '../../util/defaultmap'
import { guard } from '../../util/assert'
import { log } from '../../util/log'
import { DecoratedAstMap, NodeId, ParentInformation, RParameter, Type } from '../../r-bridge'
import { slicerLogger } from '../../slicing'
import { dataflowLogger } from '../index'

export function linkIngoingVariablesInSameScope(graph: DataflowGraph, references: IdentifierReference[]): void {
	const nameIdShares = produceNameSharedIdMap(references)
	linkReadVariablesInSameScopeWithNames(graph, nameIdShares)
}

export type NameIdMap = DefaultMap<string, IdentifierReference[]>

export function produceNameSharedIdMap(references: IdentifierReference[]): NameIdMap {
	const nameIdShares = new DefaultMap<string, IdentifierReference[]>(() => [])
	for(const reference of references) {
		nameIdShares.get(reference.name).push(reference)
	}
	return nameIdShares
}

export function linkReadVariablesInSameScopeWithNames(graph: DataflowGraph, nameIdShares: DefaultMap<string, IdentifierReference[]>) {
	for (const ids of nameIdShares.values()) {
		if (ids.length <= 1) {
			continue
		}
		const base = ids[0]
		for (let i = 1; i < ids.length; i++) {
			// TODO: include the attribute? probably not, as same-edges are independent of structure
			graph.addEdge(base.nodeId, ids[i].nodeId, 'same-read-read', 'always', true)
		}
	}
}

function specialReturnFunction(info: DataflowGraphNodeFunctionCall, graph: DataflowGraph, id: NodeId) {
	guard(info.args.length <= 1, () => `expected up to one argument for return, but got ${info.args.length}`)
	for (const arg of info.args) {
		if (Array.isArray(arg)) {
			if (arg[1] !== '<value>') {
				graph.addEdge(id, arg[1], 'returns', 'always')
			}
		} else {
			if (arg !== '<value>') {
				graph.addEdge(id, arg, 'returns', 'always')
			}
		}
	}
}


// TODO: in some way we need to remove the links for the default argument if it is given by the user on call - this could be done with 'when' but for now we do not do it as we expect such situations to be rare
export function linkArgumentsOnCall(args: FunctionArgument[], params: RParameter<ParentInformation>[], graph: DataflowGraph): void {
	const nameArgMap = new Map<string, IdentifierReference | '<value>'>(args.filter(Array.isArray) as NamedFunctionArgument[])
	const nameParamMap = new Map<string, RParameter<ParentInformation>>(params.map(p => [p.name.content, p]))

	const specialDotParameter = params.find(p => p.special)

	// all parameters matched by name
	const matchedParameters = new Set<string>()


	// first map names
	for(const [name, arg] of nameArgMap) {
		if(arg === '<value>') {
			dataflowLogger.trace(`skipping value argument for ${name}`)
			continue
		}
		const param = nameParamMap.get(name)
		if(param !== undefined) {
			dataflowLogger.trace(`mapping named argument "${name}" to parameter "${param.name.content}"`)
			graph.addEdge(arg.nodeId, param.name.info.id, 'defines-on-call', 'always')
			matchedParameters.add(name)
		} else if(specialDotParameter !== undefined) {
			dataflowLogger.trace(`mapping named argument "${name}" to dot-dot-dot parameter`)
			graph.addEdge(arg.nodeId, specialDotParameter.name.info.id, 'defines-on-call', 'always')
		}
	}

	const remainingParameter = params.filter(p => !matchedParameters.has(p.name.content))
	const remainingArguments = args.filter(a => !Array.isArray(a)) as (PositionalFunctionArgument | 'empty')[]

	// TODO ...
	for(let i = 0; i < remainingArguments.length; i++) {
		const arg: PositionalFunctionArgument | 'empty' = remainingArguments[i]
		if(arg === '<value>' || arg === 'empty') {
			dataflowLogger.trace(`skipping value argument for ${i}`)
			continue
		}
		if(remainingParameter.length <= i) {
			if(specialDotParameter !== undefined) {
				dataflowLogger.trace(`mapping unnamed argument ${i} (id: ${arg.nodeId}) to dot-dot-dot parameter`)
				graph.addEdge(arg.nodeId, specialDotParameter.name.info.id, 'defines-on-call', 'always')
			} else {
				dataflowLogger.error(`skipping argument ${i} as there is no corresponding parameter - R should block that`)
			}
			continue
		}
		const param = remainingParameter[i]
		dataflowLogger.trace(`mapping unnamed argument ${i} (id: ${arg.nodeId}) to parameter "${param.name.content}"`)
		graph.addEdge(arg.nodeId, param.name.info.id, 'defines-on-call', 'always')
	}
}


function linkFunctionCallArguments(targetId: NodeId, idMap: DecoratedAstMap, functionCallName: string, functionRootId: NodeId, callArgs: FunctionArgument[], finalGraph: DataflowGraph): void {
	// we get them by just choosing the rhs of the definition - TODO: this should be improved - maybe by a second call track
	const linkedFunction = idMap.get(targetId)
	if(linkedFunction === undefined) {
		dataflowLogger.trace(`no function definition found for ${functionCallName} (${functionRootId})`)
		return
	}

	if (linkedFunction.type !== Type.FunctionDefinition) {
		dataflowLogger.trace(`function call definition base ${functionCallName} does not lead to a function definition (${functionRootId}) but got ${linkedFunction.type}`)
		return
	}
	dataflowLogger.trace(`linking arguments for ${functionCallName} (${functionRootId}) to ${JSON.stringify(linkedFunction.location)}`)
	linkArgumentsOnCall(callArgs, linkedFunction.parameters, finalGraph)
}


function linkFunctionCall(graph: DataflowGraph, id: NodeId, info: DataflowGraphNodeFunctionCall, idMap: DecoratedAstMap, nodeGraph: DataflowGraph, thisGraph: DataflowGraph, calledFunctionDefinitions: {
    functionCall: NodeId;
    called:       DataflowGraphNodeInfo[]
}[]) {
	const edges = graph.get(id, true)
	guard(edges !== undefined, () => `id ${id} must be present in graph`)

	const functionDefinitionReadIds = [...edges[1]].filter(([_, e]) => e.types.has('reads') || e.types.has('calls') || e.types.has('relates')).map(([target, _]) => target)

	const functionDefs = getAllLinkedFunctionDefinitions(new Set(functionDefinitionReadIds), graph)

	for (const def of functionDefs.values()) {
		guard(def.tag === 'function-definition', () => `expected function definition, but got ${def.tag}`)

		// TODO: this is currently just a temporary hack, we need a clean way to separate closures that apply after the function body and the reads that apply within the body
		if(info.environment !== undefined) {
			// for each open ingoing reference, try to resolve it here, and if so add a read edge from the call to signal that it reads it
			for (const ingoing of def.subflow.in) {
				const defs = resolveByName(ingoing.name, LocalScope, info.environment)
				if (defs === undefined) {
					continue
				}
				for (const def of defs) {
					graph.addEdge(id, def, 'reads', 'always')
				}
			}
		}

		const exitPoints = def.exitPoints
		for (const exitPoint of exitPoints) {
			graph.addEdge(id, exitPoint, 'returns', 'always')
		}
		dataflowLogger.trace(`recording expression-list-level call from ${info.name} to ${def.name}`)
		graph.addEdge(id, def.id, 'calls', 'always')
		linkFunctionCallArguments(def.id, idMap, def.name, id, info.args, graph)
	}
	if (nodeGraph === thisGraph) {
		calledFunctionDefinitions.push({ functionCall: id, called: [...functionDefs.values()] })
	}
}

/**
 * Returns the called functions within the current graph, which can be used to merge the environments with the call.
 * Furthermore, it links the corresponding arguments.
 */
export function linkFunctionCalls(graph: DataflowGraph, idMap: DecoratedAstMap, functionCalls: [NodeId, DataflowGraphNodeInfo, DataflowGraph][], thisGraph: DataflowGraph): { functionCall: NodeId, called: DataflowGraphNodeInfo[] }[] {
	const calledFunctionDefinitions: { functionCall: NodeId, called: DataflowGraphNodeInfo[] }[] = []
	for(const [id, info, nodeGraph] of functionCalls) {
		guard(info.tag === 'function-call', () => `encountered non-function call in function call linkage ${JSON.stringify(info)}`)

		// TODO: special handling for others
		if(info.name === 'return') {
			specialReturnFunction(info, graph, id)
			graph.addEdge(id, BuiltIn, 'calls', 'always')
			continue
		}
		linkFunctionCall(graph, id, info, idMap, nodeGraph, thisGraph, calledFunctionDefinitions)
	}
	return calledFunctionDefinitions
}


// TODO: abstract away into a 'getAllDefinitionsOf' function
export function getAllLinkedFunctionDefinitions(functionDefinitionReadIds: Set<NodeId>, dataflowGraph: DataflowGraph): Map<NodeId, DataflowGraphNodeInfo> {
	const potential: NodeId[] = [...functionDefinitionReadIds]
	const visited = new Set<NodeId>()
	const result = new Map<NodeId, DataflowGraphNodeInfo>()
	while(potential.length > 0) {
		const currentId = potential.pop() as NodeId

		if(currentId === BuiltIn) {
			// do not traverse builtins
			slicerLogger.trace('skipping builtin function definition during collection')
			continue
		}
		const currentInfo = dataflowGraph.get(currentId, true)
		if(currentInfo === undefined) {
			slicerLogger.trace(`skipping unknown link`)
			continue
		}
		visited.add(currentId)

		const outgoingEdges = [...currentInfo[1]]

		const returnEdges = outgoingEdges.filter(([_, e]) => e.types.has('returns'))
		if(returnEdges.length > 0) {
			// only traverse return edges and do not follow calls etc. as this indicates that we have a function call which returns a result, and not the function call itself
			potential.push(...returnEdges.map(([target]) => target))
			continue
		}
		const followEdges = outgoingEdges.filter(([_, e]) => e.types.has('reads') || e.types.has('defined-by') || e.types.has('defined-by-on-call') || e.types.has('relates'))


		if(currentInfo[0].subflow !== undefined) {
			result.set(currentId, currentInfo[0])
		}
		// trace all joined reads
		// TODO: deal with redefinitions?
		potential.push(...followEdges.map(([target]) => target).filter(id => !visited.has(id)))
	}
	return result
}

/**
 * This method links a set of read variables to definitions in an environment.
 *
 * @param referencesToLinkAgainstEnvironment - The set of references to link against the environment
 * @param scope                              - The scope in which the linking shall happen (probably the active scope of {@link DataflowProcessorInformation})
 * @param environmentInformation             - The environment information to link against
 * @param givenInputs                        - The existing list of inputs that might be extended
 * @param graph                              - The graph to enter the found links
 * @param maybeForRemaining                  - Each input that can not be linked, will be added to `givenInputs`. If this flag is `true`, it will be marked as `maybe`.
 *
 * @returns the given inputs, possibly extended with the remaining inputs (those of `referencesToLinkAgainstEnvironment` that could not be linked against the environment)
 */
export function linkInputs(referencesToLinkAgainstEnvironment: IdentifierReference[], scope: DataflowScopeName, environmentInformation: REnvironmentInformation, givenInputs: IdentifierReference[], graph: DataflowGraph, maybeForRemaining: boolean): IdentifierReference[] {
	for (const bodyInput of referencesToLinkAgainstEnvironment) {
		const probableTarget = resolveByName(bodyInput.name, scope, environmentInformation)
		if (probableTarget === undefined) {
			log.trace(`found no target for ${bodyInput.name} in ${scope}`)
			if(maybeForRemaining) {
				bodyInput.used = 'maybe'
			}
			givenInputs.push(bodyInput)
		} else {
			for (const target of probableTarget) {
				// we can stick with maybe even if readId.attribute is always
				graph.addEdge(bodyInput, target, 'reads', undefined, true)
			}
		}
	}
	// data.graph.get(node.id).definedAtPosition = false
	return givenInputs
}

/** all loops variables which are open read (not already bound by a redefinition within the loop) get a maybe read marker to their last definition within the loop
 * e.g. with:
 * ```R
 * for(i in 1:10) {
 *  x_1 <- x_2 + 1
 * }
 * ```
 * `x_2` must get a read marker to `x_1` as `x_1` is the active redefinition in the second loop iteration.
 */
export function linkCircularRedefinitionsWithinALoop(graph: DataflowGraph, openIns: NameIdMap, outgoing: IdentifierReference[]): void {
	// first we preprocess out so that only the last definition of a given identifier survives
	// this implicitly assumes that the outgoing references are ordered
	const lastOutgoing = new Map<string, IdentifierReference>()
	for(const out of outgoing) {
		lastOutgoing.set(out.name, out)
	}
	for(const [name, targets] of openIns.entries()) {
		for(const out of lastOutgoing.values()) {
			if(out.name === name) {
				for(const target of targets) {
					graph.addEdge(target.nodeId, out.nodeId, 'reads', 'maybe')
				}
			}
		}
	}
}
