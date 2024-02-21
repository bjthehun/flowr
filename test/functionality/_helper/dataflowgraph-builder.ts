import type { DataflowGraphEdgeAttribute, NodeId, REnvironmentInformation } from '../../../src'
import { DataflowGraph, EdgeType } from '../../../src'
import { LocalScope } from '../../../src/dataflow/environments/scopes'

export function emptyGraph() {
	return new DataflowGraphBuilder()
}

export class DataflowGraphBuilder extends DataflowGraph {
	/**
	 * Adds a vertex for variable use. Intended for creating dataflow graphs as part of function tests.
	 * @param id - AST node id
	 * @param name - Variable name
	 * @param when - always or maybe; defaults to always
	 * @param environment - Environment the use occurs in
	 * @param asRoot - boolean; defaults to true.
	 * @param scope - string
	 */
	public uses(id: NodeId, name: string, when: DataflowGraphEdgeAttribute = 'always', environment?: REnvironmentInformation, asRoot: boolean = true) {
		return this.addVertex({ tag: 'use', id, name, when, environment }, asRoot)
	}

	/**
	 * Adds a vertex for a variable definition.
	 * @param id - AST node ID
	 * @param name - Variable name
	 * @param scope - Scope (global/local/custom), defaults to local.
	 * @param when - always or maybe; defaults to maybe.
	 * @param environment - Environment the variable is defined in.
	 * @param asRoot - boolean; defaults to true.
	 */
	public definesVariable(id: NodeId, name: string, scope: string = LocalScope, when: DataflowGraphEdgeAttribute = 'always', environment?: REnvironmentInformation, asRoot: boolean = true) {
		return this.addVertex({tag: 'variable-definition', id, name, scope, when, environment}, asRoot)
	}    

	/**
	 * Adds a read edge (E1) for simple testing.
	 * 
	 * @param from - Vertex/NodeId
	 * @param to   - see from
	 * @param when - always (default), or maybe
	 */
	public reads(from: NodeId, to: NodeId, when: DataflowGraphEdgeAttribute = 'always') {
		return this.addEdge(from, to, EdgeType.Reads, when)
	}

	/**
	 * Adds a defined-by edge (E2), with from as defined variable, and to as
	 * as a variable/function contributing to its definition.
	 * 
	 * @see reads for parameters.
	 */
	public definedBy(from: NodeId, to: NodeId, when: DataflowGraphEdgeAttribute = 'always') {
		return this.addEdge(from, to, EdgeType.DefinedBy, when)
	}

	/**
	 * Adds a same-read-read edge (E3), with from and to as two variable uses
	 * on the same variable.
	 * 
	 * @see reads for parameters.
	 */
	public sameRead(from: NodeId, to: NodeId, when: DataflowGraphEdgeAttribute = 'always') {
		return this.addEdge(from, to, EdgeType.SameReadRead, when)
	}

	/**
	 * Adds a same-def-def edge (E4), with from and to as two variables
	 * that share a defining variable.
	 * 
	 * @see reads for parameters.
	 */
	public sameDef(from: NodeId, to: NodeId, when: DataflowGraphEdgeAttribute = 'always') {
		return this.addEdge(from, to, EdgeType.SameDefDef, when)
	}

	/**
	 * Adds a call edge (E5) with from as caller, and to as callee.
	 * 
	 * @see reads for parameters.
	 */
	public calls(from: NodeId, to: NodeId, when: DataflowGraphEdgeAttribute = 'always') {
		return this.addEdge(from, to, EdgeType.Calls, when)
	}

	/**
	 * Adds a return edge (E6) with from as function, and to as exit point.
	 * 
	 * @see reads for parameters.
	 */
	public returns(from: NodeId, to: NodeId, when: DataflowGraphEdgeAttribute = 'always') {
		return this.addEdge(from, to, EdgeType.Returns, when)
	}

	/**
	 * Adds a defines-on-call edge (E7) with from as variable, and to as its definition
	 * 
	 * @see reads for parameters.
	 */
	public definesOnCall(from: NodeId, to: NodeId, when: DataflowGraphEdgeAttribute = 'always') {
		return this.addEdge(from, to, EdgeType.DefinesOnCall, when)
	}

	/**
	 * Adds an argument edge (E9) with from as function call, and to as argument.
	 *
	 * @see reads for parameters.
	 */
	public argument(from: NodeId, to: NodeId, when: DataflowGraphEdgeAttribute = 'always') {
		return this.addEdge(from, to, EdgeType.Argument, when)
	}

	/**
	 * Adds an relation (E10) with from as exit point, and to as any other vertex.
	 *
	 * @see reads for parameters.
	 */
	public relates(from: NodeId, to: NodeId, when: DataflowGraphEdgeAttribute = 'always') {
		return this.addEdge(from, to, EdgeType.Relates, when)
	}
}