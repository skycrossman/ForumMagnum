import Query, { Atom } from "./Query";
import Table from "./Table";
import SelectQuery from "./SelectQuery";
import { JsonType } from "./Type";

export type UpdateOptions = Partial<{
  limit: number,
  returnUpdated: boolean,
}>

/**
 * Builds a Postgres query to update some specific data in the given table.
 * Note that upserting is handled by `InsertQuery` instead.
 */
class UpdateQuery<T extends DbObject> extends Query<T> {
  constructor(
    table: Table,
    selector: string | MongoSelector<T>,
    modifier: MongoModifier<T>,
    options?: MongoUpdateOptions<T>, // TODO: What can options be?
    updateOptions?: UpdateOptions,
  ) {
    if (options?.upsert) {
      throw new Error("To create an upserting update use an InsertQuery with conflictStrategy 'upsert'");
    }

    super(table, ["UPDATE", table, "SET"]);
    this.nameSubqueries = false;

    const set: Partial<Record<keyof T, any>> = modifier.$set ?? {};
    const push: Partial<Record<keyof T, any>> = modifier.$push ?? {};
    const inc: Partial<Record<keyof T, any>> = modifier.$inc ?? {};
    const addToSet: Partial<Record<keyof T, any>> = modifier.$addToSet ?? {};
    for (const operation of Object.keys(modifier)) {
      switch (operation) {
        case "$set":
        case "$inc":
        case "$push":
        case "$addToSet":
          break;
        case "$unset":
          for (const field of Object.keys(modifier.$unset)) {
            set[field] = null;
          }
          break;
        default:
          throw new Error(`Unimplemented update operation: ${operation}`);
      }
    }

    const compiledUpdates = [
      ...this.compileSetFields(set),
      ...this.compilePushFields(push),
      ...this.compileIncFields(inc),
      ...this.compileAddToSetFields(addToSet),
    ];

    this.atoms = this.atoms.concat(compiledUpdates.slice(1));

    if (typeof selector === "string") {
      selector = {_id: selector};
    }

    const {limit, returnUpdated} = updateOptions ?? {};

    if (selector && Object.keys(selector).length > 0) {
      this.atoms.push("WHERE");

      if (limit) {
        this.atoms = this.atoms.concat([
          "_id IN",
          new SelectQuery(table, selector, {limit, projection: {_id: 1}}, {forUpdate: true}),
        ]);
      } else {
        this.appendSelector(selector);
      }
    } else if (limit) {
      this.atoms = this.atoms.concat([
        "WHERE _id IN ( SELECT \"_id\" FROM",
        table,
        "LIMIT",
        this.createArg(limit),
        "FOR UPDATE)",
      ]);
    }

    if (returnUpdated) {
      this.atoms.push("RETURNING *");
    } else {
      this.atoms.push(`RETURNING "_id"`);
    }
  }

  private compileSetFields(sets: Partial<Record<keyof T, any>>): Atom<T>[] {
    const format = (resolvedField: string, updateValue: Atom<T>[]): Atom<T>[] =>
      [",", resolvedField, "=", ...updateValue];
    return this.compileUpdateFields(sets, format);
  }

  private compilePushFields(pushes: Partial<Record<keyof T, any>>): Atom<T>[] {
    const format = (resolvedField: string, updateValue: Atom<T>[]): Atom<T>[] =>
      [",", resolvedField, "= ARRAY_APPEND(", resolvedField, ",",  ...updateValue, ")"];
    return this.compileUpdateFields(pushes, format);
  }

  private compileIncFields(incs: Partial<Record<keyof T, any>>): Atom<T>[] {
    const format = (resolvedField: string, updateValue: Atom<T>[]): Atom<T>[] =>
      [",", resolvedField, "= COALESCE(", resolvedField, ", 0 ) +",  ...updateValue];
    return this.compileUpdateFields(incs, format);
  }

  private compileAddToSetFields(addToSets: Partial<Record<keyof T, any>>): Atom<T>[] {
    const nativeArrays: Partial<Record<keyof T, any>> = {};
    const jsonArrays: Partial<Record<keyof T, any>> = {};

    for (const update of Object.keys(addToSets)) {
      const dot = update.indexOf(".");
      const column = dot > 0 ? update.substring(0, dot) : update;
      const columnType = this.getField(column);
      if (columnType?.toConcrete() instanceof JsonType) {
        jsonArrays[update] = addToSets[update];
      } else {
        nativeArrays[update] = addToSets[update];
      }
    }

    let jsonUpdates: Atom<T>[] = [];

    for (const jsonUpdate of Object.keys(jsonArrays)) {
      const {column, path} = this.buildJsonUpdatePath(jsonUpdate);
      const updateValue = this.compileUpdateExpression(jsonArrays[jsonUpdate]);
      jsonUpdates = jsonUpdates.concat(
        ",",
        column,
        "= fm_add_to_set(",
        column,
        ",",
        path,
        "::TEXT[] ,",
        ...updateValue,
        ")",
      );
    }

    const format = (resolvedField: string, updateValue: Atom<T>[]): Atom<T>[] =>
      [",", resolvedField, "= fm_add_to_set(", resolvedField, ",",  ...updateValue, ")"];
    return [
      ...jsonUpdates,
      ...this.compileUpdateFields(nativeArrays, format),
    ];
  }

  private compileUpdateFields(
    updates: Partial<Record<keyof T, any>>,
    format: (resolvedField: string, updateValue: Atom<T>[]) => Atom<T>[],
  ): Atom<T>[] {
    return Object.keys(updates).flatMap((field) => this.compileUpdateField(field, updates[field], format));
  }

  private compileUpdateField(
    field: string,
    value: any,
    format: (resolvedField: string, updateValue: Atom<T>[]) => Atom<T>[],
  ): Atom<T>[] {
    try {
      const updateValue = this.compileUpdateExpression(value);

      // If we're updating the value of a JSON blob without totally replacing
      // it then we need to wrap the update in a call to `JSONB_SET`.
      if (field.includes(".")) {
        const {column, path} = this.buildJsonUpdatePath(field);
        return format(
          column,
          ["JSONB_SET(", column, ",", path, "::TEXT[],", ...updateValue, ", TRUE)"],
        );
      }

      const resolvedField = this.resolveFieldName(field);
      return format(resolvedField, updateValue);
    } catch (e) {
      // @ts-ignore
      throw new Error(`Field "${field}" is not recognized - is it missing from the schema?`, {cause: e});
    }
  }

  private compileUpdateExpression(value: unknown): Atom<T>[] {
    if (typeof value === "object" && value && Object.keys(value).some((key) => key[0] === "$")) {
      return this.compileExpression(value);
    } else {
      const arg = this.createArg(value);
      if (!arg.typehint) {
        arg.typehint = this.getTypeHint(value);
      }
      return [arg];
    }
  }

  private buildJsonUpdatePath(field: string) {
    const tokens = field.split(".");
    const path = `'{${tokens.slice(1).join(", ")}}'`;
    return {
      column: `"${tokens[0]}"`,
      path,
    };
  }
}

export default UpdateQuery;
