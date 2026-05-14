const atomicBehaviorTypeBrand: unique symbol = Symbol('AtomicBehaviorTypeBrand');

export type AtomicBehaviorValidator<Value> = (value: Value) => ValidationOutcome;
export type AtomicBehaviorTransformer<Value> = (value: Value) => Value;

export interface ValidationOutcome {
  readonly valid: boolean;
  readonly reason?: string;
}

export interface AtomicBehavior<Value> {
  readonly name: string;
  validate(value: Value): ValidationOutcome;
  transform?(value: Value): Value;
}

export abstract class AtomicBehaviorType<Value, Name extends string> {
  private readonly [atomicBehaviorTypeBrand]: Name;
  private internalValue: Value;

  protected constructor(value: Value, private readonly behavior: AtomicBehavior<Value>, brand: Name) {
    this[atomicBehaviorTypeBrand] = brand;
    this.internalValue = this.applyBehavior(value);
  }

  public get value(): Value {
    return this.internalValue;
  }

  public validate(value: Value = this.internalValue): ValidationOutcome {
    return this.behavior.validate(value);
  }

  public alter(nextValue: Value): this {
    this.internalValue = this.applyBehavior(nextValue);
    return this;
  }

  public map(transformer: AtomicBehaviorTransformer<Value>): this {
    return this.alter(transformer(this.internalValue));
  }

  public equals(other: AtomicBehaviorType<Value, Name>): boolean {
    return Object.is(this.internalValue, other.value);
  }

  private applyBehavior(value: Value): Value {
    const transformed = this.behavior.transform ? this.behavior.transform(value) : value;
    const outcome = this.behavior.validate(transformed);
    if (!outcome.valid) {
      throw new TypeError(`${this.behavior.name} validation failed${outcome.reason ? `: ${outcome.reason}` : ''}`);
    }
    return transformed;
  }
}

export const valid = (): ValidationOutcome => ({ valid: true });

export const invalid = (reason: string): ValidationOutcome => ({ valid: false, reason });
