import { assertAst, withShell } from "../../../helper/shell"
import { exprList, numVal } from '../../../helper/ast-builder'
import { rangeFrom } from '../../../../src/util/range'
import { Type } from '../../../../src/r-bridge'

// TODO: try slicing of something like
/*
 * a <- function() { x <- 3; i }
 * i <- 4
 * b <- function(f) { i <- 5; f() }
 * b(a)
 */
// TODO: quote and deparse should break references?
describe("Parse value access", withShell(shell => {
  describe("Single variable access", () => {
    describe('Single bracket', () => {
      assertAst("Empty single bracket access", shell, "a[]", exprList({
        type:     Type.Access,
        location: rangeFrom(1, 2, 1, 2),
        lexeme:   '[',
        operand:  '[',
        info:     {},
        accessed: {
          type:      Type.Symbol,
          location:  rangeFrom(1, 1, 1, 1),
          namespace: undefined,
          lexeme:    "a",
          content:   "a",
          info:      {}
        },
        access: []
      }))
      assertAst("Single bracket access", shell, "a[1]", exprList({
        type:     Type.Access,
        location: rangeFrom(1, 2, 1, 2),
        lexeme:   '[',
        operand:  '[',
        info:     {},
        accessed: {
          type:      Type.Symbol,
          location:  rangeFrom(1, 1, 1, 1),
          namespace: undefined,
          lexeme:    "a",
          content:   "a",
          info:      {}
        },
        access: [{
          type:     Type.Number,
          location: rangeFrom(1, 3, 1, 3),
          lexeme:   "1",
          content:  numVal(1),
          info:     {}
        }]
      }))
    })
    describe('Double bracket', () => {
      assertAst("Empty Double bracket access", shell, "b[[]]", exprList({
        type:     Type.Access,
        location: rangeFrom(1, 2, 1, 3),
        lexeme:   '[[',
        operand:  '[[',
        info:     {},
        accessed: {
          type:      Type.Symbol,
          location:  rangeFrom(1, 1, 1, 1),
          namespace: undefined,
          lexeme:    "b",
          content:   "b",
          info:      {}
        },
        access: []
      }))
      assertAst("Double bracket access", shell, "b[[5]]", exprList({
        type:     Type.Access,
        location: rangeFrom(1, 2, 1, 3),
        lexeme:   '[[',
        operand:  '[[',
        info:     {},
        accessed: {
          type:      Type.Symbol,
          location:  rangeFrom(1, 1, 1, 1),
          namespace: undefined,
          lexeme:    "b",
          content:   "b",
          info:      {}
        },
        access: [{
          type:     Type.Number,
          location: rangeFrom(1, 4, 1, 4),
          lexeme:   "5",
          content:  numVal(5),
          info:     {}
        }]
      }))
    })
    describe('Dollar and Slot', () => {
      assertAst("Dollar access", shell, "c$x", exprList({
        type:     Type.Access,
        location: rangeFrom(1, 2, 1, 2),
        lexeme:   '$',
        operand:  '$',
        info:     {},
        accessed: {
          type:      Type.Symbol,
          location:  rangeFrom(1, 1, 1, 1),
          namespace: undefined,
          lexeme:    "c",
          content:   "c",
          info:      {}
        },
        access: 'x'
      }))
      assertAst("Slot based access", shell, "d@y", exprList({
        type:     Type.Access,
        location: rangeFrom(1, 2, 1, 2),
        lexeme:   '@',
        operand:  '@',
        info:     {},
        accessed: {
          type:      Type.Symbol,
          location:  rangeFrom(1, 1, 1, 1),
          namespace: undefined,
          lexeme:    "d",
          content:   "d",
          info:      {}
        },
        access: 'y'
      }))
    })
  })
}))

