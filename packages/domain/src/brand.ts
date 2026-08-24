declare const domainBrand: unique symbol;

/** A compile-time nominal wrapper whose runtime representation remains `TValue`. */
export type Brand<TValue, TName extends string> = TValue & {
  readonly [domainBrand]: TName;
};
