import { deepMergeObject, type MergeableRecord } from '../../../util/objects'
import * as xml2js from 'xml2js'
import * as Lang from './model'
import { AssignmentsRAst, compareRanges, rangeFrom, type RBinaryOpFlavor, type RNode, type RSymbol } from './model'
import { log } from '../../../util/log'
import { boolean2ts, isBoolean, isNA, number2ts, type RNa, string2ts } from '../values'

const astLogger = log.getSubLogger({ name: 'ast' })

interface AstParser<Target extends Lang.Base<string | undefined>> {
  parse: (xmlString: string) => Promise<Target>
}

interface XmlParserConfig extends MergeableRecord {
  attributeName: string
  contentName: string
  childrenName: string
  // Mapping from xml tag name to the real operation of the node
  tokenMap?: Record<string, string /* TODO: change this to OP enum or so */>
}

const DEFAULT_XML_PARSER_CONFIG: XmlParserConfig = {
  attributeName: '@attributes',
  contentName: '@content',
  childrenName: '@children'
}

class XmlParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'XmlParseError'
  }
}

type XmlBasedJson = Record<string, any>
interface NamedXmlBasedJson { name: string, content: XmlBasedJson }

export function isolateMarkerInNamedXmlBasedJson<T>(obj: NamedXmlBasedJson[], predicate: (name: string, content: XmlBasedJson) => {
  predicateResult: boolean
  extraInformation: T
}, multipleErrorMessage: string): {
    readonly marker: NamedXmlBasedJson
    readonly others: NamedXmlBasedJson[]
    readonly extraInformation: T | undefined
  } | undefined {
  let marker: NamedXmlBasedJson | undefined
  let extraInformation: T | undefined
  for (const elem of obj) {
    const res = predicate(elem.name, elem.content)
    if (res.predicateResult) {
      if (marker !== undefined) {
        throw new XmlParseError(`found multiple markers for ${multipleErrorMessage} in ${JSON.stringify(obj)}`)
      }
      marker = elem
      extraInformation = res.extraInformation
    }
  }
  if (marker === undefined) {
    return undefined
  }
  return { marker, others: obj.filter((elem) => elem !== marker), extraInformation }
}

function getKeysGuarded(obj: XmlBasedJson, key: string): any
function getKeysGuarded(obj: XmlBasedJson, ...key: string[]): Record<string, any>
function getKeysGuarded(obj: XmlBasedJson, ...key: string[]): (Record<string, any> | string) {
  const keys = Object.keys(obj)

  const check = (key: string): any => {
    if (!keys.includes(key)) {
      throw new XmlParseError(`expected obj to have key ${key}, yet received ${JSON.stringify(obj)}`)
    }
    return obj[key]
  }

  if (key.length === 1) {
    return check(key[0])
  } else {
    return key.reduce<Record<string, any>>((acc, key) => {
      acc[key] = check(key)
      return acc
    }, {})
  }
}

function extractRange(ast: XmlBasedJson): Lang.Range {
  const { line1, col1, line2, col2 } = getKeysGuarded(ast, 'line1', 'col1', 'line2', 'col2')
  return rangeFrom(line1, col1, line2, col2)
}

export interface IsolatedMarker { marker: NamedXmlBasedJson, others: NamedXmlBasedJson[] }

function identifySpecialOp(content: string, lhs: RNode, rhs: RNode): RBinaryOpFlavor {
  console.log(content)
  if (Lang.ComparisonOperatorsRAst.includes(content)) {
    return 'comparison'
  } else if (Lang.LogicalOperatorsRAst.includes(content)) {
    return 'logical'
  } else {
    // TODO: others?
    return 'arithmetic'
  }
}

class XmlBasedAstParser implements AstParser<Lang.RExprList> {
  private objectRoot: undefined | XmlBasedJson
  private readonly config: XmlParserConfig

  constructor(config?: Partial<XmlParserConfig>) {
    this.config = deepMergeObject(DEFAULT_XML_PARSER_CONFIG, config)
    astLogger.debug(`config for xml parser: ${JSON.stringify(this.config)}`)
  }

  public async parse(xmlString: string): Promise<Lang.RExprList> {
    this.objectRoot = await this.parseToObj(xmlString) as XmlBasedJson

    return this.parseRootObjToAst(this.objectRoot)
  }

  private async parseToObj(xmlString: string): Promise<object> {
    return await xml2js.parseStringPromise(xmlString, {
      attrkey: this.config.attributeName,
      charkey: this.config.contentName,
      childkey: this.config.childrenName,
      charsAsChildren: false,
      explicitChildren: true,
      // we need this for semicolons etc., while we keep the old broken components we ignore them completely
      preserveChildrenOrder: true,
      normalize: true,
      strict: true
    })
  }

  private parseRootObjToAst(obj: XmlBasedJson): Lang.RExprList {
    const exprContent = getKeysGuarded(obj, Lang.Type.ExprList)
    this.assureName(exprContent, Lang.Type.ExprList)

    const children = getKeysGuarded(exprContent, this.config.childrenName)
    const parsedChildren = this.parseBasedOnType(children)

    // TODO: at total object in any case of error?
    return { type: Lang.Type.ExprList, children: parsedChildren, lexeme: undefined }
  }

  private revertTokenReplacement(token: string): string {
    const result = this.config.tokenMap?.[token] ?? token
    astLogger.debug(`reverting ${token}=>${result}`)
    return result
  }

  private parseBasedOnType(obj: XmlBasedJson[]): Lang.RNode[] {
    if (obj.length === 0) {
      log.warn('no children received, skipping')
      return []
    }
    // TODO: if any has a semicolon we must respect that and split to expr list

    const mappedWithName: NamedXmlBasedJson[] = obj.map((content) => ({ name: this.getName(content), content }))

    // TODO: improve with error message and ensure no semicolon
    if (mappedWithName.length === 1) {
      const parsed = this.parseOneElementBasedOnType(mappedWithName[0])
      return parsed === undefined ? [] : [parsed]
    } else if (mappedWithName.length === 3) { /* TODO: unary ops for == 2 */
      return [this.parseBinaryStructure(mappedWithName[0], mappedWithName[1], mappedWithName[2])]
    }

    // otherwise perform default parsing
    const parsedNodes: Lang.RNode[] = []
    // used to indicate the new root node of this set of nodes
    // TODO: refactor?
    // TODO: allow to configure #name
    for (const elem of mappedWithName) {
      const retrieved = this.parseOneElementBasedOnType(elem)
      if (retrieved !== undefined) {
        parsedNodes.push(retrieved)
      }
    }
    return parsedNodes
  }

  /**
   * parses a single structure in the ast based on its type
   *
   * @return nothing if no parse result is to be produced (i.e., if it is skipped)
   */
  private parseOneElementBasedOnType(elem: NamedXmlBasedJson): Lang.RNode | undefined {
    switch (elem.name) {
      case Lang.Type.ParenLeft:
      case Lang.Type.ParenRight:
        log.debug(`skipping parenthesis information for ${JSON.stringify(elem)}`)
        return undefined
      case Lang.Type.Expr:
        return this.parseExpr(elem.content)
      case Lang.Type.Number:
        return this.parseNumber(elem.content)
      case Lang.Type.String:
        return this.parseString(elem.content)
      case Lang.Type.Null:
        return this.parseSymbol(elem.content)
      default:
        throw new XmlParseError(`unknown type ${elem.name}`)
    }
  }

  private parseBinaryStructure(lhs: NamedXmlBasedJson, op: NamedXmlBasedJson, rhs: NamedXmlBasedJson): Lang.RNode {
    console.log('bin for', op.name)
    /* if (Lang.AssignmentsRAst.includes(op.name)) {
      return this.parseAssignment(lhs, op, rhs)
    } */
    // TODO: identify op name correctly
    return this.parseBinaryOp(op.name as any, lhs, op, rhs)
  }

  private ensureChildrenAreLhsAndRhsOrdered(first: XmlBasedJson, second: XmlBasedJson): void {
    const firstOtherLoc = extractRange(first[this.config.attributeName])
    const secondOtherLoc = extractRange(second[this.config.attributeName])
    if (compareRanges(firstOtherLoc, secondOtherLoc) > 0) {
      throw new XmlParseError(`expected the first child to be the lhs, yet received ${JSON.stringify(first)} & ${JSON.stringify(second)}`)
    }
  }

  private assureName(obj: XmlBasedJson, expectedName: string): void {
    // TODO: allow us to configure the name?
    const name = this.getName(obj)
    if (name !== expectedName) {
      throw new XmlParseError(`expected name to be ${expectedName}, yet received ${name} for ${JSON.stringify(obj)}`)
    }
  }

  private getName(content: XmlBasedJson): string {
    return this.revertTokenReplacement(getKeysGuarded(content, '#name') as string)
  }

  private objectWithArrUnwrap(obj: XmlBasedJson): XmlBasedJson {
    if (Array.isArray(obj)) {
      if (obj.length !== 1) {
        throw new XmlParseError(`expected only one element in the wrapped array, yet received ${JSON.stringify(obj)}`)
      }
      return obj[0]
    } else if (typeof obj === 'object') {
      return obj
    } else {
      throw new XmlParseError(`expected array or object, yet received ${JSON.stringify(obj)}`)
    }
  }

  /**
   * Returns an ExprList if there are multiple children, otherwise returns the single child directly with no expr wrapper
   */
  private parseExpr(obj: XmlBasedJson): Lang.RNode {
    astLogger.debug(`trying to parse expr ${JSON.stringify(obj)}`)
    const { unwrappedObj, content, location } = this.retrieveMetaStructure(obj)
    const children = this.parseBasedOnType(getKeysGuarded(unwrappedObj, this.config.childrenName))
    if (children.length === 1) {
      return children[0]
    } else {
      return { type: Lang.Type.ExprList, location, content, children, lexeme: undefined }
    }
  }

  private retrieveMetaStructure(obj: XmlBasedJson): {
    unwrappedObj: XmlBasedJson
    location: Lang.Range
    content: string
  } {
    const unwrappedObj = this.objectWithArrUnwrap(obj)
    const core = getKeysGuarded(unwrappedObj, this.config.contentName, this.config.attributeName)
    const location = extractRange(core[this.config.attributeName])
    const content = core[this.config.contentName]
    return { unwrappedObj, location, content }
  }

  private parseNumber(obj: XmlBasedJson): Lang.RNumber | Lang.RLogical | RSymbol<typeof RNa> {
    astLogger.debug(`trying to parse number ${JSON.stringify(obj)}`)
    const { location, content } = this.retrieveMetaStructure(obj)
    const common = { location, lexeme: content }
    if (isNA(content)) { /* the special symbol */
      return { ...common, type: Lang.Type.Symbol, content }
    } else if (isBoolean(content)) {
      return { ...common, type: Lang.Type.Boolean, content: boolean2ts(content) }
    } else {
      return { ...common, type: Lang.Type.Number, content: number2ts(content) }
    }
  }

  private parseString(obj: XmlBasedJson): Lang.RString {
    astLogger.debug(`trying to parse string ${JSON.stringify(obj)}`)
    const { location, content } = this.retrieveMetaStructure(obj)
    return { type: Lang.Type.String, location, content: string2ts(content), lexeme: content }
  }

  private parseSymbol(obj: XmlBasedJson): Lang.RSymbol {
    astLogger.debug(`trying to parse symbol ${JSON.stringify(obj)}`)
    const { location, content } = this.retrieveMetaStructure(obj)
    return { type: Lang.Type.Symbol, location, content, lexeme: content }
  }

  public parseBinaryOp(flavor: RBinaryOpFlavor | 'special', lhs: NamedXmlBasedJson, op: NamedXmlBasedJson, rhs: NamedXmlBasedJson): Lang.RBinaryOp {
    astLogger.debug(`trying to parse ${flavor} op as binary op ${JSON.stringify([lhs, op, rhs])}`)

    this.ensureChildrenAreLhsAndRhsOrdered(lhs.content, rhs.content)
    const parsedLhs = this.parseOneElementBasedOnType(lhs)
    const parsedRhs = this.parseOneElementBasedOnType(rhs)

    if (parsedLhs === undefined || parsedRhs === undefined) {
      throw new XmlParseError(`unexpected one-sided binary op, received ${JSON.stringify([parsedLhs, parsedRhs])} for ${JSON.stringify([lhs, op, rhs])}`)
    }

    const operationName = this.retrieveOpName(op)

    const { location, content } = this.retrieveMetaStructure(op.content)

    if (flavor === 'special') {
      flavor = identifySpecialOp(content, parsedLhs, parsedRhs)
    }

    // TODO: assert exists as known operator
    return { type: Lang.Type.BinaryOp, flavor, location, lhs: parsedLhs, rhs: parsedRhs, op: operationName, lexeme: content }
  }

  private retrieveOpName(op: NamedXmlBasedJson): string {
    /*
     * only real arithmetic ops have their operation as their own name, the others identify via content
     */
    return op.content[this.config.contentName]
  }
}

export async function parse(xmlString: string, tokenMap: XmlParserConfig['tokenMap']): Promise<Lang.RExprList> {
  const parser = new XmlBasedAstParser({ tokenMap })
  return await parser.parse(xmlString)
}
