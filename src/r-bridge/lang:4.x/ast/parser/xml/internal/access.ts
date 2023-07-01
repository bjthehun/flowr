import { NamedXmlBasedJson } from '../input-format'
import { retrieveMetaStructure } from './meta'
import { parseLog } from '../parser'
import { ParserData } from '../data'
import { Type, RAccess, RNode } from '../../../model'
import { executeHook, executeUnknownHook } from '../hooks'
import { parseBasedOnType } from './structure'
import { guard } from '../../../../../../util/assert'
import { splitArrayOn } from '../../../../../../util/arrays'

/**
 * Tries to parse the given data as access (e.g., indexing).
 *
 * @param data           - The data used by the parser (see {@link ParserData})
 * @param mappedWithName - The json object to extract the meta-information from
 *
 * @returns The parsed {@link RAccess} or `undefined` if the given construct is not accessing a value
 */
export function tryParseAccess(data: ParserData, mappedWithName: NamedXmlBasedJson[]): RAccess | undefined {
  parseLog.trace('trying to parse access')
  mappedWithName = executeHook(data.hooks.onAccess.before, data, mappedWithName)

  if(mappedWithName.length < 3) {
    parseLog.trace('expected at least three elements are required to parse an access')
    return executeUnknownHook(data.hooks.onAccess.unknown, data, mappedWithName)
  }

  const accessOp = mappedWithName[1]

  let operator: RAccess['operator']
  let closingLength = 0

  switch (accessOp.name) {
    case Type.BracketLeft:
      operator = '['
      closingLength = 1
      break
    case Type.Dollar:
      operator = '$'
      break
    case Type.At:
      operator = '@'
      break
    case Type.DoubleBracketLeft:
      operator = '[['
      closingLength = 2
      break
    default:
      parseLog.trace(`expected second element to be an access operator, yet received ${JSON.stringify(accessOp)}`)
      return executeUnknownHook(data.hooks.onAccess.unknown, data, mappedWithName)
  }

  const accessed = mappedWithName[0]
  if(accessed.name !== Type.Expression && accessed.name !== Type.ExprHelpAssignWrapper) {
    parseLog.trace(`expected accessed element to be wrapped an expression, yet received ${JSON.stringify(accessed)}`)
    return executeUnknownHook(data.hooks.onAccess.unknown, data, mappedWithName)
  }

  const parsedAccessed = parseBasedOnType(data, [accessed])
  if(parsedAccessed.length !== 1) {
    parseLog.trace(`expected accessed element to be wrapped an expression, yet received ${JSON.stringify(accessed)}`)
    return executeUnknownHook(data.hooks.onAccess.unknown, data, mappedWithName)
  }

  // TODO: ensure closing is correct
  const remaining = mappedWithName.slice(2, mappedWithName.length - closingLength)

  parseLog.trace(`${remaining.length} remaining arguments for access: ${JSON.stringify(remaining)}`)

  const splitAccessOnComma = splitArrayOn(remaining, x => x.name === Type.Comma)

  const parsedAccess: (RNode | null)[] = splitAccessOnComma.map(x => {
    if(x.length === 0) {
      parseLog.trace(`record empty access`)
      return null
    }
    parseLog.trace(`trying to parse access`)
    const gotAccess = parseBasedOnType(data, x)
    guard(gotAccess.length === 1, () => `expected one access result in access, yet received ${JSON.stringify(gotAccess)}`)
    return gotAccess[0]
  })

  let resultingAccess: (RNode | null)[] | string = parsedAccess

  if(operator === '@' || operator === '$') {
    guard(parsedAccess.length === 1, () => `expected one access result in access with ${JSON.stringify(operator)}, yet received ${JSON.stringify(parsedAccess)}`)
    const first = parsedAccess[0]
    guard(first !== null && first.type === Type.Symbol, () => `${JSON.stringify(operator)} requires one symbol, yet received ${JSON.stringify(parsedAccess)}`)
    resultingAccess = first.content
  }

  const {
    content, location
  } = retrieveMetaStructure(data.config, accessOp.content)

  const result = {
    type:     Type.Access,
    location,
    lexeme:   content,
    accessed: parsedAccessed[0],
    operator,
    access:   resultingAccess,
    info:     {
      // TODO: include children etc.
      fullRange:        data.currentRange,
      additionalTokens: [],
      fullLexeme:       data.currentLexeme
    }
  } as RAccess
  return executeHook(data.hooks.onAccess.after, data, result)
}
