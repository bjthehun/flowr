import { assertAst, withShell } from "../../../helper/shell"
import { exprList, numVal, argument } from '../../../helper/ast-builder'
import { rangeFrom } from "../../../../src/util/range"
import { Type } from '../../../../src/r-bridge'

// TODO: tests for returns
describe("Parse function definitions", withShell((shell) => {
  describe("without arguments", () => {
    const noop = "function() { }"
    assertAst(`noop - ${noop}`, shell, noop,
      exprList({
        type:      Type.Function,
        location:  rangeFrom(1, 1, 1, 8),
        lexeme:    "function",
        arguments: [],
        info:      {},
        body:      {
          type:     Type.ExpressionList,
          location: rangeFrom(1, 12, 1, 14),
          lexeme:   "{ }",
          children: [],
          info:     {}
        }
      })
    )
    const noArgs = "function() { x + 2 * 3 }"
    assertAst(`noArgs - ${noArgs}`, shell, noArgs,
      exprList({
        type:      Type.Function,
        location:  rangeFrom(1, 1, 1, 8),
        lexeme:    "function",
        arguments: [],
        info:      {},
        body:      {
          type:     Type.BinaryOp,
          location: rangeFrom(1, 16, 1, 16),
          flavor:   'arithmetic',
          lexeme:   "+",
          op:       '+',
          info:     {},
          lhs:      {
            type:      Type.Symbol,
            location:  rangeFrom(1, 14, 1, 14),
            lexeme:    "x",
            content:   "x",
            namespace: undefined,
            info:      {}
          },
          rhs: {
            type:     Type.BinaryOp,
            location: rangeFrom(1, 20, 1, 20),
            flavor:   'arithmetic',
            lexeme:   "*",
            op:       '*',
            info:     {},
            lhs:      {
              type:     Type.Number,
              location: rangeFrom(1, 18, 1, 18),
              lexeme:   "2",
              content:  numVal(2),
              info:     {}
            },
            rhs: {
              type:     Type.Number,
              location: rangeFrom(1, 22, 1, 22),
              lexeme:   "3",
              content:  numVal(3),
              info:     {}
            }
          }
        }
      })
    )
  })
  describe("with unnamed arguments", () => {
    const oneArgument = "function(x) { }"
    assertAst(`one argument - ${oneArgument}`, shell, oneArgument,
      exprList({
        type:      Type.Function,
        location:  rangeFrom(1, 1, 1, 8),
        lexeme:    "function",
        arguments: [argument("x", rangeFrom(1, 10, 1, 10))],
        info:      {},
        body:      {
          type:     Type.ExpressionList,
          location: rangeFrom(1, 13, 1, 15),
          lexeme:   "{ }",
          children: [],
          info:     {}
        }
      })
    )
    const multipleArguments = "function(a,the,b) { b }"
    assertAst(`multiple argument - ${multipleArguments}`, shell, multipleArguments,
      exprList({
        type:      Type.Function,
        location:  rangeFrom(1, 1, 1, 8),
        lexeme:    "function",
        arguments: [
          argument("a", rangeFrom(1, 10, 1, 10)),
          argument("the", rangeFrom(1, 12, 1, 14)),
          argument("b", rangeFrom(1, 16, 1, 16))
        ],
        info: {},
        body: {
          type:      Type.Symbol,
          location:  rangeFrom(1, 21, 1, 21),
          lexeme:    "b",
          content:   "b",
          namespace: undefined,
          info:      {}
        }
      })
    )
  })
  describe("with special arguments (...)", () => {
    const asSingleArgument = "function(...) { }"
    assertAst(`as single arg - ${asSingleArgument}`, shell, asSingleArgument,
      exprList({
        type:      Type.Function,
        location:  rangeFrom(1, 1, 1, 8),
        lexeme:    "function",
        arguments: [argument("...", rangeFrom(1, 10, 1, 12), undefined, true)],
        info:      {},
        body:      {
          type:     Type.ExpressionList,
          location: rangeFrom(1, 15, 1, 17),
          lexeme:   "{ }",
          children: [],
          info:     {}
        }
      })
    )

    const asFirstArgument = "function(..., a) { }"
    assertAst(`as first arg - ${asFirstArgument}`, shell, asFirstArgument,
      exprList({
        type:      Type.Function,
        location:  rangeFrom(1, 1, 1, 8),
        lexeme:    "function",
        arguments: [
          argument("...", rangeFrom(1, 10, 1, 12), undefined, true),
          argument("a", rangeFrom(1, 15, 1, 15))
        ],
        info: {},
        body: {
          type:     Type.ExpressionList,
          location: rangeFrom(1, 18, 1, 20),
          lexeme:   "{ }",
          children: [],
          info:     {}
        }
      })
    )

    const asLastArgument = "function(a, the, ...) { ... }"
    assertAst(`as last arg - ${asLastArgument}`, shell, asLastArgument,
      exprList({
        type:      Type.Function,
        location:  rangeFrom(1, 1, 1, 8),
        lexeme:    "function",
        arguments: [
          argument("a", rangeFrom(1, 10, 1, 10)),
          argument("the", rangeFrom(1, 13, 1, 15)),
          argument("...", rangeFrom(1, 18, 1, 20), undefined, true)
        ],
        info: {},
        body: {
          type:      Type.Symbol,
          location:  rangeFrom(1, 25, 1, 27),
          lexeme:    "...",
          content:   "...",
          namespace: undefined,
          info:      {}
        }
      })
    )
  })
  describe("with named arguments", () => {
    const oneArgument = "function(x=3) { }"
    assertAst(`one argument - ${oneArgument}`, shell, oneArgument,
      exprList({
        type:      Type.Function,
        location:  rangeFrom(1, 1, 1, 8),
        lexeme:    "function",
        arguments: [
          argument("x", rangeFrom(1, 10, 1, 10), {
            type:     Type.Number,
            location: rangeFrom(1, 12, 1, 12),
            lexeme:   "3",
            content:  numVal(3),
            info:     {}
          })
        ],
        info: {},
        body: {
          type:     Type.ExpressionList,
          location: rangeFrom(1, 15, 1, 17),
          lexeme:   "{ }",
          children: [],
          info:     {}
        }
      })
    )

    const multipleArguments = "function(a, x=3, huhu=\"hehe\") { x }"
    assertAst(`multiple argument - ${multipleArguments}`, shell, multipleArguments,
      exprList({
        type:      Type.Function,
        location:  rangeFrom(1, 1, 1, 8),
        lexeme:    "function",
        arguments: [
          argument("a", rangeFrom(1, 10, 1, 10)),
          argument("x", rangeFrom(1, 13, 1, 13), {
            type:     Type.Number,
            location: rangeFrom(1, 15, 1, 15),
            lexeme:   "3",
            content:  numVal(3),
            info:     {}
          }),
          argument("huhu", rangeFrom(1, 18, 1, 21), {
            type:     Type.String,
            location: rangeFrom(1, 23, 1, 28),
            lexeme:   "\"hehe\"",
            content:  { str: "hehe", quotes: '"' },
            info:     {}
          })
        ],
        info: {},
        body: {
          type:      Type.Symbol,
          location:  rangeFrom(1, 33, 1, 33),
          lexeme:    "x",
          content:   "x",
          namespace: undefined,
          info:      {}
        }
      })
    )
  })
})
)