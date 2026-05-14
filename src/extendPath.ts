const _ = require('underscore');

type Neo4jPathLike = {
  _nodes?: unknown;
  _relationships?: unknown;
  _data?: { data?: unknown };
  id?: unknown;
};

const Path = {
  toObject(this: Neo4jPathLike) {
    return {
      nodes: this._nodes || null,
      relationships: this._relationships,
      data: this._data != null ? this._data.data : undefined,
      id: this.id,
      getParent(this: unknown) { return this; },
    };
  },
};

const extend = function(pathObject: unknown): unknown {
  if (typeof pathObject !== 'object' || pathObject === null) { return pathObject; }
  return _.extend(pathObject, Path);
};

module.exports = { extend };
export {};
