import { AtomicBehavior, AtomicBehaviorType, invalid, valid } from './atomicBehaviorType';

type DictionaryValue = Record<string, unknown>;
type RelationshipOptionsValue = DictionaryValue;
type GraphConfigValue = DictionaryValue;
type CollectionNameValue = string;
type DocumentIdentifierValue = string;
type RelationshipKindValue = string;
type CypherStatementValue = string;
type BooleanDecisionValue = boolean;

const nonBlankText = (name: string): AtomicBehavior<string> => ({
  name,
  validate: value => value.trim().length > 0 ? valid() : invalid('must not be blank'),
  transform: value => value.trim(),
});

const dictionaryBehavior = (name: string): AtomicBehavior<DictionaryValue> => ({
  name,
  validate: value => value !== null && !Array.isArray(value) ? valid() : invalid('must be an object dictionary'),
});

const booleanBehavior: AtomicBehavior<boolean> = {
  name: 'BooleanDecision',
  validate: value => typeof value === 'boolean' ? valid() : invalid('must be a boolean decision'),
};

export class CollectionName extends AtomicBehaviorType<CollectionNameValue, 'CollectionName'> {
  public constructor(value: CollectionNameValue) {
    super(value, nonBlankText('CollectionName'), 'CollectionName');
  }
}

export class DocumentIdentifier extends AtomicBehaviorType<DocumentIdentifierValue, 'DocumentIdentifier'> {
  public constructor(value: DocumentIdentifierValue) {
    super(value, nonBlankText('DocumentIdentifier'), 'DocumentIdentifier');
  }
}

export class RelationshipKind extends AtomicBehaviorType<RelationshipKindValue, 'RelationshipKind'> {
  public constructor(value: RelationshipKindValue) {
    super(value, {
      ...nonBlankText('RelationshipKind'),
      validate: candidate => /^[A-Za-z_*:|][A-Za-z0-9_*:|]*$/.test(candidate) ? valid() : invalid('must be a cypher relationship token'),
    }, 'RelationshipKind');
  }
}

export class CypherStatement extends AtomicBehaviorType<CypherStatementValue, 'CypherStatement'> {
  public constructor(value: CypherStatementValue) {
    super(value, nonBlankText('CypherStatement'), 'CypherStatement');
  }
}

export class RelationshipOptions extends AtomicBehaviorType<RelationshipOptionsValue, 'RelationshipOptions'> {
  public constructor(value: RelationshipOptionsValue) {
    super(value, dictionaryBehavior('RelationshipOptions'), 'RelationshipOptions');
  }
}

export class GraphConfig extends AtomicBehaviorType<GraphConfigValue, 'GraphConfig'> {
  public constructor(value: GraphConfigValue) {
    super(value, dictionaryBehavior('GraphConfig'), 'GraphConfig');
  }
}

export class BooleanDecision extends AtomicBehaviorType<BooleanDecisionValue, 'BooleanDecision'> {
  public constructor(value: BooleanDecisionValue) {
    super(value, booleanBehavior, 'BooleanDecision');
  }
}

export const Semantic = {
  collectionName: (value: CollectionNameValue): CollectionName => new CollectionName(value),
  documentIdentifier: (value: DocumentIdentifierValue): DocumentIdentifier => new DocumentIdentifier(value),
  relationshipKind: (value: RelationshipKindValue): RelationshipKind => new RelationshipKind(value),
  cypherStatement: (value: CypherStatementValue): CypherStatement => new CypherStatement(value),
  relationshipOptions: (value: RelationshipOptionsValue): RelationshipOptions => new RelationshipOptions(value),
  graphConfig: (value: GraphConfigValue): GraphConfig => new GraphConfig(value),
  booleanDecision: (value: BooleanDecisionValue): BooleanDecision => new BooleanDecision(value),
};
