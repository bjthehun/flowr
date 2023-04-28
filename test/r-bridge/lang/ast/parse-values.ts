import * as Lang from '../../../../src/r-bridge/lang:4.x/ast/model'
import { assertAst, withShell } from '../../../helper/shell'
import { RNumberPool, RStringPool, RSymbolPool } from '../../../helper/provider'
import { exprList } from '../../../helper/ast-builder'
import { rangeFrom } from '../../../../src/r-bridge/lang:4.x/ast/range'

describe('0. Constant Parsing', withShell(shell => {
  describe('0. parse single', () => {
    describe('0.1 numbers', () => {
      for (const number of RNumberPool) {
        const range = rangeFrom(1, 1, 1, number.str.length)
        assertAst(number.str, shell, number.str, exprList({
          type:     Lang.Type.Number,
          location: range,
          lexeme:   number.str,
          content:  number.val
        }))
      }
    })
    describe('0.2 strings', () => {
      for (const string of RStringPool) {
        const range = rangeFrom(1, 1, 1, string.str.length)
        assertAst(string.str, shell, string.str, exprList({
          type:     Lang.Type.String,
          location: range,
          lexeme:   string.str,
          content:  string.val
        })
        )
      }
    })
    describe('0.3 symbols', () => {
      for (const symbol of RSymbolPool) {
        const range = rangeFrom(1, 1, 1, symbol.str.length)
        assertAst(symbol.str, shell, symbol.str, exprList({
          type:     Lang.Type.Symbol,
          location: range,
          lexeme:   symbol.str,
          content:  symbol.val
        })
        )
      }
    })
    assertAst('boolean', shell, 'TRUE', exprList({
      type:     Lang.Type.Logical,
      location: rangeFrom(1, 1, 1, 4),
      lexeme:   'TRUE',
      content:  true
    }))
  })
  // TODO: vectors etc.
}))
