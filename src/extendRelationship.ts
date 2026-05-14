const _ = require('underscore');

type Neo4jRelationshipLike = {
  from?: unknown;
  to?: unknown;
  _data?: { data?: unknown };
  id?: unknown;
};

const Relationship = {
  toObject(this: Neo4jRelationshipLike) {
    return {
      from: this.from || null,
      to: this.to || null,
      data: this._data != null ? this._data.data : undefined,
      id: this.id,
      getParent(this: unknown) { return this; },
    };
  },
};

const extend = function(relationshipObject: unknown): unknown {
  if (typeof relationshipObject !== 'object' || relationshipObject === null) { return relationshipObject; }
  return _.extend(relationshipObject, Relationship);
};

module.exports = { extend };
export {};
