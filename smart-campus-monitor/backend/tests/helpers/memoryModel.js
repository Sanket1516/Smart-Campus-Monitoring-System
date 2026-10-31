/**
 * Minimal in-memory stand-in for a Mongoose model, for tests where no MongoDB is
 * available. Supports the query/update operators used by the sync services and
 * emulates (partial) unique indexes so duplicate-prevention logic is exercised.
 */
const { Types } = require('mongoose');

const clone = (value) => {
  if (value === null || value === undefined) return value;
  if (value instanceof Types.ObjectId) return value;
  if (value instanceof Date) return new Date(value.getTime());
  if (Buffer.isBuffer(value)) return Buffer.from(value);
  if (Array.isArray(value)) return value.map(clone);
  if (typeof value === 'object') {
    const out = {};
    Object.keys(value).forEach((key) => {
      if (typeof value[key] !== 'function') out[key] = clone(value[key]);
    });
    return out;
  }
  return value;
};

const getPath = (obj, path) => path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
const setPath = (obj, path, value) => {
  const keys = path.split('.');
  let target = obj;
  keys.slice(0, -1).forEach((key) => {
    if (target[key] == null || typeof target[key] !== 'object') target[key] = {};
    target = target[key];
  });
  target[keys[keys.length - 1]] = value;
};
const unsetPath = (obj, path) => {
  const keys = path.split('.');
  const parent = keys.slice(0, -1).reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
  if (parent) delete parent[keys[keys.length - 1]];
};

const norm = (value) => {
  if (value instanceof Types.ObjectId) return String(value);
  if (value instanceof Date) return value.getTime();
  if (value && typeof value === 'object' && value._id && !(value instanceof Date)) return String(value._id);
  return value;
};
const eq = (a, b) => {
  const na = norm(a);
  const nb = norm(b);
  if (na === null || na === undefined) return nb === null || nb === undefined;
  if (typeof na === 'string' || typeof nb === 'string') return String(na) === String(nb);
  return na === nb;
};
const cmp = (a, b) => {
  const na = norm(a);
  const nb = norm(b);
  if (na === nb) return 0;
  if (na === undefined || na === null) return -1;
  if (nb === undefined || nb === null) return 1;
  return na < nb ? -1 : 1;
};

const isOperatorObject = (value) =>
  value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date) && !(value instanceof Types.ObjectId) && Object.keys(value).some((k) => k.startsWith('$'));

const matchValue = (fieldValue, condition) => {
  if (isOperatorObject(condition)) {
    return Object.entries(condition).every(([op, arg]) => {
      switch (op) {
        case '$in':
          return arg.some((v) => (Array.isArray(fieldValue) ? fieldValue.some((f) => eq(f, v)) : eq(fieldValue, v)));
        case '$nin':
          return !arg.some((v) => (Array.isArray(fieldValue) ? fieldValue.some((f) => eq(f, v)) : eq(fieldValue, v)));
        case '$ne':
          return Array.isArray(fieldValue) ? !fieldValue.some((f) => eq(f, arg)) : !eq(fieldValue, arg);
        case '$gt':
          return fieldValue != null && cmp(fieldValue, arg) > 0;
        case '$gte':
          return fieldValue != null && cmp(fieldValue, arg) >= 0;
        case '$lt':
          return fieldValue != null && cmp(fieldValue, arg) < 0;
        case '$lte':
          return fieldValue != null && cmp(fieldValue, arg) <= 0;
        case '$exists':
          return arg ? fieldValue !== undefined : fieldValue === undefined;
        default:
          throw new Error(`memoryModel: unsupported operator ${op}`);
      }
    });
  }
  if (Array.isArray(fieldValue) && !Array.isArray(condition)) return fieldValue.some((f) => eq(f, condition));
  return eq(fieldValue, condition);
};

const matches = (doc, filter = {}) =>
  Object.entries(filter || {}).every(([key, condition]) => {
    if (key === '$or') return condition.some((sub) => matches(doc, sub));
    if (key === '$and') return condition.every((sub) => matches(doc, sub));
    return matchValue(getPath(doc, key), condition);
  });

const applyUpdate = (doc, update, { isInsert = false } = {}) => {
  const hasOps = Object.keys(update).some((k) => k.startsWith('$'));
  const ops = hasOps ? update : { $set: update };
  Object.entries(ops).forEach(([op, fields]) => {
    Object.entries(fields || {}).forEach(([path, value]) => {
      const current = getPath(doc, path);
      switch (op) {
        case '$set':
          setPath(doc, path, clone(value));
          break;
        case '$setOnInsert':
          if (isInsert) setPath(doc, path, clone(value));
          break;
        case '$unset':
          unsetPath(doc, path);
          break;
        case '$inc':
          setPath(doc, path, (Number(current) || 0) + value);
          break;
        case '$max':
          if (current === undefined || cmp(value, current) > 0) setPath(doc, path, value);
          break;
        case '$addToSet': {
          const list = Array.isArray(current) ? current : [];
          if (!list.some((v) => eq(v, value))) list.push(clone(value));
          setPath(doc, path, list);
          break;
        }
        case '$push': {
          const list = Array.isArray(current) ? current : [];
          list.push(clone(value));
          setPath(doc, path, list);
          break;
        }
        case '$pull': {
          const list = Array.isArray(current) ? current : [];
          setPath(doc, path, list.filter((v) => !eq(v, value)));
          break;
        }
        default:
          throw new Error(`memoryModel: unsupported update ${op}`);
      }
    });
  });
  return doc;
};

const projectionKeysFromUpdateFilter = (filter) => {
  const out = {};
  Object.entries(filter || {}).forEach(([key, value]) => {
    if (!key.startsWith('$') && !isOperatorObject(value)) out[key] = clone(value);
  });
  return out;
};

const createMemoryModel = (name, { defaults = {}, unique = [], timestamps = true } = {}) => {
  let store = [];

  const withDefaults = (data) => {
    const base = typeof defaults === 'function' ? defaults() : clone(defaults);
    return { ...base, ...clone(data) };
  };

  const checkUnique = (candidate, ignoreId) => {
    unique.forEach(({ fields, partial, name: indexName }) => {
      if (partial && !partial(candidate)) return;
      if (fields.some((f) => getPath(candidate, f) === undefined) && !partial) return;
      const clash = store.find(
        (doc) =>
          String(doc._id) !== String(ignoreId) &&
          (!partial || partial(doc)) &&
          fields.every((f) => eq(getPath(doc, f), getPath(candidate, f)))
      );
      if (clash) {
        const error = new Error(`E11000 duplicate key error collection: ${name} index: ${indexName || fields.join('_')}`);
        error.code = 11000;
        error.keyPattern = Object.fromEntries(fields.map((f) => [f, 1]));
        throw error;
      }
    });
  };

  const hydrate = (raw) => {
    if (!raw) return raw;
    const instance = clone(raw);
    const snapshot = JSON.stringify(clone(raw), (k, v) => v);
    Object.defineProperty(instance, 'save', {
      enumerable: false,
      value: async () => {
        // Like Mongoose: only modified top-level paths are written.
        const index = store.findIndex((doc) => String(doc._id) === String(instance._id));
        const original = JSON.parse(snapshot);
        const next = index >= 0 ? clone(store[index]) : {};
        const keys = new Set([...Object.keys(instance), ...Object.keys(original)]);
        keys.forEach((key) => {
          const now = JSON.stringify(instance[key]);
          const was = JSON.stringify(original[key]);
          if (index < 0 || now !== was) {
            if (instance[key] === undefined) delete next[key];
            else next[key] = clone(instance[key]);
          }
        });
        if (timestamps) next.updatedAt = new Date();
        checkUnique(next, instance._id);
        if (index >= 0) store[index] = next;
        else store.push(next);
        return instance;
      },
    });
    Object.defineProperty(instance, 'toObject', { enumerable: false, value: () => clone(instance) });
    return instance;
  };

  const sortDocs = (docs, sort) => {
    if (!sort) return docs;
    const entries = Object.entries(sort);
    return [...docs].sort((a, b) => {
      for (const [key, dir] of entries) {
        const result = cmp(getPath(a, key), getPath(b, key));
        if (result !== 0) return dir < 0 ? -result : result;
      }
      return 0;
    });
  };

  class Query {
    constructor(executor, single) {
      this.executor = executor;
      this.single = single;
      this.opts = {};
    }
    sort(sort) { this.opts.sort = sort; return this; }
    limit(n) { this.opts.limit = n; return this; }
    skip(n) { this.opts.skip = n; return this; }
    select() { return this; }
    populate() { return this; }
    lean() { this.opts.lean = true; return this; }
    exec() {
      let docs = sortDocs(this.executor(), this.opts.sort);
      if (this.opts.skip) docs = docs.slice(this.opts.skip);
      if (this.opts.limit) docs = docs.slice(0, this.opts.limit);
      const out = docs.map((doc) => (this.opts.lean ? clone(doc) : hydrate(doc)));
      return Promise.resolve(this.single ? out[0] || null : out);
    }
    then(resolve, reject) { return this.exec().then(resolve, reject); }
    catch(reject) { return this.exec().catch(reject); }
  }

  const insertOne = (data) => {
    const now = new Date();
    const doc = withDefaults(data);
    if (!doc._id) doc._id = new Types.ObjectId();
    if (timestamps) {
      doc.createdAt = doc.createdAt || now;
      doc.updatedAt = now;
    }
    checkUnique(doc);
    store.push(doc);
    return hydrate(doc);
  };

  const Model = function MemoryDocument(data) {
    return hydrate(withDefaults(data));
  };

  Object.assign(Model, {
    modelName: name,
    _store: () => store,
    _reset: () => {
      store = [];
    },
    async create(data) {
      if (Array.isArray(data)) return data.map(insertOne);
      return insertOne(data);
    },
    async insertMany(docs) {
      return docs.map(insertOne);
    },
    find(filter) {
      return new Query(() => store.filter((doc) => matches(doc, filter)), false);
    },
    findOne(filter) {
      return new Query(() => store.filter((doc) => matches(doc, filter)), true);
    },
    findById(id) {
      return new Query(() => store.filter((doc) => String(doc._id) === String(id?._id || id)), true);
    },
    async exists(filter) {
      const doc = store.find((d) => matches(d, filter));
      return doc ? { _id: doc._id } : null;
    },
    async countDocuments(filter) {
      return store.filter((doc) => matches(doc, filter)).length;
    },
    distinct(field, filter) {
      const values = [];
      store
        .filter((doc) => matches(doc, filter))
        .forEach((doc) => {
          const value = getPath(doc, field);
          if (!values.some((v) => eq(v, value))) values.push(value);
        });
      return Promise.resolve(values);
    },
    findOneAndUpdate(filter, update, options = {}) {
      const run = () => {
        const index = store.findIndex((doc) => matches(doc, filter));
        if (index < 0) {
          if (!options.upsert) return [];
          const doc = applyUpdate(withDefaults(projectionKeysFromUpdateFilter(filter)), update, { isInsert: true });
          const inserted = insertOne(doc);
          return [options.new ? store.find((d) => String(d._id) === String(inserted._id)) : null].filter(Boolean);
        }
        const before = clone(store[index]);
        const next = applyUpdate(clone(store[index]), update);
        if (timestamps) next.updatedAt = new Date();
        checkUnique(next, next._id);
        store[index] = next;
        return [options.new ? next : before];
      };
      let result;
      return new Query(() => {
        if (!result) result = run();
        return result;
      }, true);
    },
    async updateOne(filter, update, options = {}) {
      const index = store.findIndex((doc) => matches(doc, filter));
      if (index < 0) {
        if (!options.upsert) return { matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
        insertOne(applyUpdate(withDefaults(projectionKeysFromUpdateFilter(filter)), update, { isInsert: true }));
        return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1 };
      }
      const next = applyUpdate(clone(store[index]), update);
      if (timestamps) next.updatedAt = new Date();
      checkUnique(next, next._id);
      store[index] = next;
      return { matchedCount: 1, modifiedCount: 1, upsertedCount: 0 };
    },
    async updateMany(filter, update) {
      let modifiedCount = 0;
      store = store.map((doc) => {
        if (!matches(doc, filter)) return doc;
        modifiedCount += 1;
        const next = applyUpdate(clone(doc), update);
        if (timestamps) next.updatedAt = new Date();
        return next;
      });
      return { matchedCount: modifiedCount, modifiedCount };
    },
    async deleteMany(filter) {
      const before = store.length;
      store = store.filter((doc) => !matches(doc, filter));
      return { deletedCount: before - store.length };
    },
    async deleteOne(filter) {
      const index = store.findIndex((doc) => matches(doc, filter));
      if (index >= 0) store.splice(index, 1);
      return { deletedCount: index >= 0 ? 1 : 0 };
    },
    async aggregate() {
      return [];
    },
  });

  return Model;
};

module.exports = { createMemoryModel, matches };
