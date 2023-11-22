import PgCollection from "./PgCollection";
import isEqual from "lodash/isEqual";
import { randomId } from "../random";

type CustomResolver<T extends DbObject = DbObject> =
  NonNullable<CollectionFieldSpecification<T>["resolveAs"]>;

export type CodeResolver<T extends DbObject = DbObject> =
  CustomResolver<T>["resolver"];

class ProjectionContext {
  private resolvers: Record<string, CustomResolver> = {};
  private projections: string[] = [];
  private joins: SqlJoinSpec[] = [];
  private args: unknown[] = [];
  private codeResolvers: Record<string, CodeResolver> = {};
  private primaryPrefix: string;

  constructor(private collection: PgCollection<DbObject>) {
    this.primaryPrefix = collection.table.getName()[0].toLowerCase();

    const schema = this.getSchema();
    for (const fieldName in schema) {
      const field = schema[fieldName];
      if (field.resolveAs) {
        const resolverName = field.resolveAs.fieldName ?? fieldName;
        this.resolvers[resolverName] = field.resolveAs;
      }
    }
  }

  getSchema() {
    // *sigh*
    const collection = this.collection as unknown as CollectionBase<DbObject>;
    return collection._schemaFields;
  }

  getResolver(name: string): CustomResolver | null {
    return this.resolvers[name] ?? null;
  }

  getTableName() {
    return `"${this.collection.table.getName()}"`;
  }

  getProjections() {
    return this.projections;
  }

  getJoins() {
    return this.joins;
  }

  getArgs() {
    return this.args;
  }

  getCodeResolvers() {
    return this.codeResolvers;
  }

  field(name: string) {
    return `${this.primaryPrefix}."${name}"`;
  }

  currentUserField(name: string) {
    return `"currentUser"."${name}"`;
  }

  setCurrentUser(currentUser: DbUser | UsersCurrent | null) {
    this.joins.push({
      table: "Users",
      type: "left",
      prefix: "currentUser",
      on: {
        _id: this.addArg(currentUser?._id ?? null),
      },
    });
  }

  addProjection(name: string, expression?: string) {
    if (expression) {
      const normalizedExpression = expression.trim().replace(/\s+/g, " ");
      this.projections.push(`${normalizedExpression} "${name}"`);
    } else {
      this.projections.push(this.field(name));
    }
  }

  addJoin({resolver, ...joinBase}: SqlResolverJoin) {
    const spec = this.getJoinSpec(joinBase);
    const subField = (name: string) => `"${spec.prefix}"."${name}"`;
    return resolver(subField);
  }

  addArg(value: unknown) {
    this.args.push(value);
    return `$${this.args.length}`;
  }

  addCodeResolver(name: string, resolver: CodeResolver) {
    this.codeResolvers[name] = resolver;
  }

  private getJoinSpec({table, type, on}: SqlJoinBase): SqlJoinSpec {
    for (const join of this.joins) {
      if (
        join.table === table &&
        join.type === type &&
        isEqual(join.on, on)
      ) {
        return join;
      }
    }
    const join = {table, type, on, prefix: randomId(5)};
    this.joins.push(join);
    return join;
  }

  private compileJoin({table, type = "inner", on, prefix}: SqlJoinSpec): string {
    const selectors: string[] = [];
    for (const field in on) {
      selectors.push(`"${prefix}"."${field}" = ${on[field]}`);
    }
    const selector = selectors.join(" AND ");
    return `${type.toUpperCase()} JOIN "${table}" "${prefix}" ON ${selector}`;
  }

  compileQuery(): {sql: string, args: unknown[]} {
    const projection = this.projections.join(", ");
    const joins = this.joins.map((join) => this.compileJoin(join)).join(" ");
    const table = this.getTableName();
    const prefix = this.primaryPrefix;
    const sql = `SELECT ${projection} FROM ${table} ${prefix} ${joins}`;
    return {
      sql,
      args: this.args,
    };
  }
}

export default ProjectionContext;
