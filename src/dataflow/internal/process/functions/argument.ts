import { DataflowInformation } from '../../info'
import { DataflowProcessorInformation, processDataflowFor } from '../../../processor'
import { collectAllIds, ParentInformation, RArgument, RNode, Type } from '../../../../r-bridge'
import { DataflowGraph, EdgeType } from '../../../graph'
import { IdentifierReference } from '../../../environments'
import { LocalScope } from '../../../environments/scopes'

export const UnnamedArgumentPrefix = 'unnamed-argument-'

export function linkReadsForArgument<OtherInfo>(root: RNode<OtherInfo & ParentInformation>, ingoingRefs: IdentifierReference[], graph: DataflowGraph) {
	const allIdsBeforeArguments = new Set(collectAllIds(root, n => n.type === Type.Argument && n.info.id !== root.info.id))
	const ingoingBeforeArgs = ingoingRefs.filter(r => allIdsBeforeArguments.has(r.nodeId))

	for(const ref of ingoingBeforeArgs) {
		// link against the root reference currently I do not know how to deal with nested function calls otherwise
		graph.addEdge(root.info.id, ref, EdgeType.Reads, 'always')
	}
}

export function processFunctionArgument<OtherInfo>(argument: RArgument<OtherInfo & ParentInformation>, data: DataflowProcessorInformation<OtherInfo & ParentInformation>): DataflowInformation {
	const name = argument.name === undefined ? undefined : processDataflowFor(argument.name, data)
	const value = processDataflowFor(argument.value, data)
	// we do not keep the graph of the name, as this is no node that should ever exist
	const graph = value.graph

	const argContent = argument.name?.content
	const argumentName = argContent ?? `${UnnamedArgumentPrefix}${argument.info.id}`
	graph.addVertex({ tag: 'use', id: argument.info.id, name: argumentName, environment: data.environments, when: 'always' })

	const ingoingRefs = [...value.unknownReferences, ...value.in, ...(name === undefined ? [] : [...name.in])]

	if(argument.value.type === Type.FunctionDefinition) {
		graph.addEdge(argument.info.id, argument.value.info.id, EdgeType.Reads, 'always')
	} else {
		// we only need to link against those which are not already bound to another function call argument
		linkReadsForArgument(argument, [...ingoingRefs, ...value.out /* value may perform definitions */], graph)
	}

	return {
		unknownReferences: [],
		// active nodes of the name will be lost as they are only used to reference the corresponding parameter
		in:                ingoingRefs,
		// , ...value.out, ...(name?.out ?? [])
		out:               [ { name: argumentName, scope: LocalScope, nodeId: argument.info.id, used: 'always'} ],
		graph:             graph,
		environments:      value.environments,
		scope:             data.activeScope
	}
}
