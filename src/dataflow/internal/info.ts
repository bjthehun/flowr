import { DataflowGraph, DataflowScopeName } from '../graph'
import { DecoratedAst } from '../../r-bridge'
import { IdentifierReference } from './environments'

/**
 * Continuously updated during the dataflow analysis to hold the current state.
 */
export interface DataflowInfo<OtherInfo> {
  readonly ast: DecoratedAst<OtherInfo>
  /** nodes that have not been identified as read or write and will be so on higher */
  activeNodes:  IdentifierReference[]
  /** nodes which are read */
  in:           IdentifierReference[]
  /** nodes which are written to */
  out:          IdentifierReference[]
  /** the current scope during the fold */
  scope:        DataflowScopeName
  /** the current constructed dataflow graph */
  graph:        DataflowGraph
}

export function initializeCleanInfo<OtherInfo>(ast: DecoratedAst<OtherInfo>, scope: DataflowScopeName): DataflowInfo<OtherInfo> {
  return {
    ast,
    activeNodes: [],
    in:          [],
    out:         [],
    scope:       scope,
    graph:       new DataflowGraph()
  }
}
