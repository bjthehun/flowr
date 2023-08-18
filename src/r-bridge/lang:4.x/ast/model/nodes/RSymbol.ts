import { Leaf, Location, Namespace, NoInfo } from "../model"
import { Type } from "../type"
import { RNa, RNull } from '../../../values'

export function isSpecialSymbol(symbol: RSymbol): boolean {
	return symbol.content === RNull || symbol.content === RNa
}

export interface RSymbol<Info = NoInfo, T extends string = string> extends Leaf<Info>, Namespace, Location {
    readonly type: Type.Symbol;
    content:       T;
}
