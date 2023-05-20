import { assertAst, withShell } from "../../../helper/shell"
import { exprList, numVal } from "../../../helper/ast-builder"
import {
  RArithmeticBinaryOpPool,
  RLogicalBinaryOpPool,
  RUnaryOpPool,
} from "../../../helper/provider"
import { type RShell, Type, ComparisonOperators } from '../../../../src/r-bridge'
import { rangeFrom } from "../../../../src/util/range"

describe(
  "1. Parse simple operations",
  withShell((shell) => {
    describe("1.1 unary operations", () => {
      let idx = 0
      for (const opSuite of RUnaryOpPool) {
        describe(`1.1.${++idx} ${opSuite.label} operations`, () => {
          for (const op of opSuite.pool) {
            const simpleInput = `${op.str}42`
            const opOffset = op.str.length - 1
            assertAst(
              `${simpleInput}`,
              shell,
              simpleInput,
              exprList({
                type:     Type.UnaryOp,
                op:       op.str,
                flavor:   op.flavor,
                lexeme:   op.str,
                location: rangeFrom(1, 1, 1, 1 + opOffset),
                info:     {},
                operand:  {
                  type:     Type.Number,
                  location: rangeFrom(1, 2 + opOffset, 1, 3 + opOffset),
                  lexeme:   "42",
                  content:  numVal(42),
                  info:     {}
                },
              })
            )
          }
        })
      }
    })

    describe("1.2. binary operations", () => {
      let idx = 0
      for (const opSuite of [
        { label: "arithmetic", pool: RArithmeticBinaryOpPool },
        {
          label: "logical",
          pool:  RLogicalBinaryOpPool,
        },
      ]) {
        describe(`1.2.${++idx} ${opSuite.label} operations`, () => {
          for (const op of opSuite.pool) {
            describePrecedenceTestsForOp(op, shell)
          }
        })
      }
      describe(`1.2${++idx} comparison operations`, () => {
        for (const op of ComparisonOperators) {
          describe(op, () => {
            const simpleInput = `1 ${op} 1`
            const opOffset = op.length - 1
            assertAst(
              simpleInput,
              shell,
              simpleInput,
              exprList({
                type:     Type.BinaryOp,
                op,
                lexeme:   op,
                flavor:   "comparison",
                location: rangeFrom(1, 3, 1, 3 + opOffset),
                info:     {},
                lhs:      {
                  type:     Type.Number,
                  location: rangeFrom(1, 1, 1, 1),
                  lexeme:   "1",
                  content:  numVal(1),
                  info:     {}
                },
                rhs: {
                  type:     Type.Number,
                  location: rangeFrom(1, 5 + opOffset, 1, 5 + opOffset),
                  lexeme:   "1",
                  content:  numVal(1),
                  info:     {}
                },
              })
            )
          })
        }
      })
    })
  })
)

function describePrecedenceTestsForOp(op: typeof RArithmeticBinaryOpPool[number] | typeof RLogicalBinaryOpPool[number], shell: RShell): void {
  describe(`${op.str} (${op.flavor})`, () => {
    const simpleInput = `1 ${op.str} 1`
    const opOffset = op.str.length - 1
    assertAst(simpleInput, shell, simpleInput, exprList(
      {
        type:     Type.BinaryOp,
        op:       op.str,
        lexeme:   op.str,
        flavor:   op.flavor,
        location: rangeFrom(1, 3, 1, 3 + opOffset),
        info:     {},
        lhs:      {
          type:     Type.Number,
          location: rangeFrom(1, 1, 1, 1),
          lexeme:   '1',
          content:  numVal(1),
          info:     {}
        },
        rhs: {
          type:     Type.Number,
          location: rangeFrom(1, 5 + opOffset, 1, 5 + opOffset),
          lexeme:   '1',
          content:  numVal(1),
          info:     {}
        }
      }
    ))

    // offsets encode additional shifts by parenthesis
    const precedenceTests = [
      { input: `(1 ${op.str} 1) ${op.str} 42`, offsetL: 1, offsetC: 2, offsetR: 2 },
      { input: `(1 ${op.str} 1) ${op.str} (42)`, offsetL: 1, offsetC: 2, offsetR: 3 }
    ]
    // exponentiation has a different behavior when nested without braces, TODO: will be tested below
    if (op.str !== '^' && op.str !== '**') {
      precedenceTests.push({ input: `1 ${op.str} 1 ${op.str} 42`, offsetL: 0, offsetC: 0, offsetR: 0 })
    }

    for (const defaultPrecedence of precedenceTests) {
      assertAst(defaultPrecedence.input, shell, defaultPrecedence.input, exprList(
        {
          type:     Type.BinaryOp,
          op:       op.str,
          lexeme:   op.str,
          flavor:   op.flavor,
          location: rangeFrom(1, 7 + opOffset + defaultPrecedence.offsetC, 1, 7 + 2 * opOffset + defaultPrecedence.offsetC),
          info:     {},
          lhs:      {
            type:     Type.BinaryOp,
            op:       op.str,
            lexeme:   op.str,
            flavor:   op.flavor,
            location: rangeFrom(1, 3 + defaultPrecedence.offsetL, 1, 3 + opOffset + defaultPrecedence.offsetL),
            info:     {},
            lhs:      {
              type:     Type.Number,
              location: rangeFrom(1, 1 + defaultPrecedence.offsetL, 1, 1 + defaultPrecedence.offsetL),
              lexeme:   '1',
              content:  numVal(1),
              info:     {}
            },
            rhs: {
              type:     Type.Number,
              location: rangeFrom(1, 5 + opOffset + defaultPrecedence.offsetL, 1, 5 + opOffset + defaultPrecedence.offsetL),
              lexeme:   '1',
              content:  numVal(1),
              info:     {}
            }
          },
          rhs: {
            type:     Type.Number,
            location: rangeFrom(1, 9 + 2 * opOffset + defaultPrecedence.offsetR, 1, 10 + 2 * opOffset + defaultPrecedence.offsetR),
            lexeme:   '42',
            content:  numVal(42),
            info:     {}
          }
        }
      ))
    }

    const invertedPrecedenceInput = `1 ${op.str} (1 ${op.str} 42)`
    assertAst(invertedPrecedenceInput, shell, invertedPrecedenceInput, exprList(
      {
        type:     Type.BinaryOp,
        op:       op.str,
        lexeme:   op.str,
        flavor:   op.flavor,
        location: rangeFrom(1, 3, 1, 3 + opOffset),
        info:     {},
        lhs:      {
          type:     Type.Number,
          location: rangeFrom(1, 1, 1, 1),
          content:  numVal(1),
          lexeme:   '1',
          info:     {}
        },
        rhs: {
          type:     Type.BinaryOp,
          op:       op.str,
          lexeme:   op.str,
          flavor:   op.flavor,
          // TODO: deal with brackets in location?
          location: rangeFrom(1, 8 + opOffset, 1, 8 + 2 * opOffset),
          info:     {},
          lhs:      {
            type:     Type.Number,
            location: rangeFrom(1, 6 + opOffset, 1, 6 + opOffset),
            content:  numVal(1),
            lexeme:   '1',
            info:     {}
          },
          rhs: {
            type:     Type.Number,
            location: rangeFrom(1, 10 + 2 * opOffset, 1, 11 + 2 * opOffset),
            content:  numVal(42),
            lexeme:   '42',
            info:     {}
          }
        }
      }
    ))
  })
}