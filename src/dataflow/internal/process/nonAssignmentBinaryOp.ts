import { DataflowInformation } from '../info'
import { DataflowProcessorDown } from '../../processor'
import { linkIngoingVariablesInSameScope } from '../linker'
import { RBinaryOp } from '../../../r-bridge'
import { appendEnvironments, overwriteEnvironments } from '../../environments'

export function processNonAssignmentBinaryOp<OtherInfo>(op: RBinaryOp<OtherInfo>, lhs: DataflowInformation<OtherInfo>, rhs: DataflowInformation<OtherInfo>, down: DataflowProcessorDown<OtherInfo>): DataflowInformation<OtherInfo> {
  // TODO: produce special edges like `alias`

  const ingoing = [...lhs.in, ...rhs.in, ...lhs.activeNodes, ...rhs.activeNodes]
  const nextGraph = lhs.graph.mergeWith(rhs.graph)
  linkIngoingVariablesInSameScope(nextGraph, ingoing)

  // logical operations may not execute the right hand side (e.g., `FALSE && (x <- TRUE)`)
  const merger = op.flavor === 'logical' ? appendEnvironments : overwriteEnvironments

  return {
    activeNodes:  [], // binary ops require reads as without assignments there is no definition
    in:           ingoing,
    out:          [...lhs.out, ...rhs.out],
    environments: merger(lhs.environments, rhs.environments),
    // TODO: insert a join node?
    graph:        nextGraph,
    scope:        down.scope,
    ast:          down.ast
  }
}