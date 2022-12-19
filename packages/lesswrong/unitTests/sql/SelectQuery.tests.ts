import { DbTestObject, testTable, runTestCases } from "../../lib/sql/tests/testHelpers";
import SelectQuery, { isGroupByAggregateExpression } from "../../lib/sql/SelectQuery";

describe("SelectQuery", () => {
  runTestCases([
    {
      name: "can build simple select query",
      getQuery: () => new SelectQuery(testTable),
      expectedSql: 'SELECT "TestCollection".* FROM "TestCollection"',
      expectedArgs: [],
    },
    {
      name: "can build simple count query",
      getQuery: () => new SelectQuery(testTable, {}, {}, {count: true}),
      expectedSql: 'SELECT count(*) FROM "TestCollection"',
      expectedArgs: [],
    },
    {
      name: "can build select query with where clause",
      getQuery: () => new SelectQuery(testTable, {a: 3}),
      expectedSql: 'SELECT "TestCollection".* FROM "TestCollection" WHERE "a" = $1',
      expectedArgs: [3],
    },
    {
      name: "can build select query with string selector",
      getQuery: () => new SelectQuery(testTable, "some-id"),
      expectedSql: 'SELECT "TestCollection".* FROM "TestCollection" WHERE "_id" = $1',
      expectedArgs: ["some-id"],
    },
    {
      name: "can build count query with where clause",
      getQuery: () => new SelectQuery(testTable, {a: 3}, {}, {count: true}),
      expectedSql: 'SELECT count(*) FROM "TestCollection" WHERE "a" = $1',
      expectedArgs: [3],
    },
    {
      name: "can build select query with $and object selector",
      getQuery: () => new SelectQuery(testTable, {$and: {a: 3, b: "b"}}),
      expectedSql: 'SELECT "TestCollection".* FROM "TestCollection" WHERE ( "a" = $1 AND "b" = $2 )',
      expectedArgs: [3, "b"],
    },
    {
      name: "can build select query with $and array selector",
      getQuery: () => new SelectQuery(testTable, {$and: [{a: 3}, {b: "b"}]}),
      expectedSql: 'SELECT "TestCollection".* FROM "TestCollection" WHERE ( "a" = $1 AND "b" = $2 )',
      expectedArgs: [3, "b"],
    },
    {
      name: "can build select query with implicit $and selector",
      getQuery: () => new SelectQuery(testTable, {a: 3, b: "b"}),
      expectedSql: 'SELECT "TestCollection".* FROM "TestCollection" WHERE ( "a" = $1 AND "b" = $2 )',
      expectedArgs: [3, "b"],
    },
    {
      name: "can build select query with $or object selector",
      getQuery: () => new SelectQuery(testTable, {$or: {a: 3, b: "b"}}),
      expectedSql: 'SELECT "TestCollection".* FROM "TestCollection" WHERE ( "a" = $1 OR "b" = $2 )',
      expectedArgs: [3, "b"],
    },
    {
      name: "can build select query with $or array selector",
      getQuery: () => new SelectQuery(testTable, {$or: [{a: 3}, {b: "b"}]}),
      expectedSql: 'SELECT "TestCollection".* FROM "TestCollection" WHERE ( "a" = $1 OR "b" = $2 )',
      expectedArgs: [3, "b"],
    },
    {
      name: "can build select query with nested boolean combiners",
      getQuery: () => new SelectQuery(testTable, {a: 3, $or: [{b: "hello"}, {c: {$exists: false}}]}),
      expectedSql: 'SELECT "TestCollection".* FROM "TestCollection" WHERE ( "a" = $1 AND ( "b" = $2 OR "c" IS NULL ) )',
      expectedArgs: [3, "hello"],
    },
    {
      name: "can build select query with comparison against null",
      getQuery: () => new SelectQuery(testTable, {a: null, b: {$eq: null}, c: {$ne: null}}),
      expectedSql: 'SELECT "TestCollection".* FROM "TestCollection" WHERE ( "a" IS NULL AND "b" IS NULL AND "c" IS NOT NULL )',
      expectedArgs: [],
    },
    {
      name: "can build select query with equal comparison",
      getQuery: () => new SelectQuery(testTable, {a: {$eq: 3}}),
      expectedSql: 'SELECT "TestCollection".* FROM "TestCollection" WHERE "a" = $1',
      expectedArgs: [3],
    },
    {
      name: "can build select query with not-equal comparison",
      getQuery: () => new SelectQuery(testTable, {a: {$ne: 3}}),
      expectedSql: 'SELECT "TestCollection".* FROM "TestCollection" WHERE "a" <> $1',
      expectedArgs: [3],
    },
    {
      name: "can build select query with less-than comparison",
      getQuery: () => new SelectQuery(testTable, {a: {$lt: 3}}),
      expectedSql: 'SELECT "TestCollection".* FROM "TestCollection" WHERE "a" < $1',
      expectedArgs: [3],
    },
    {
      name: "can build select query with less-than-or-equal comparison",
      getQuery: () => new SelectQuery(testTable, {a: {$lte: 3}}),
      expectedSql: 'SELECT "TestCollection".* FROM "TestCollection" WHERE "a" <= $1',
      expectedArgs: [3],
    },
    {
      name: "can build select query with greater-than comparison",
      getQuery: () => new SelectQuery(testTable, {a: {$gt: 3}}),
      expectedSql: 'SELECT "TestCollection".* FROM "TestCollection" WHERE "a" > $1',
      expectedArgs: [3],
    },
    {
      name: "can build select query with greater-than-or-equal comparison",
      getQuery: () => new SelectQuery(testTable, {a: {$gte: 3}}),
      expectedSql: 'SELECT "TestCollection".* FROM "TestCollection" WHERE "a" >= $1',
      expectedArgs: [3],
    },
    {
      name: "can build select query with in comparison",
      getQuery: () => new SelectQuery(testTable, {a: {$in: [1, 2, 3]}}),
      expectedSql: 'SELECT "TestCollection".* FROM "TestCollection" WHERE ARRAY[ $1 , $2 , $3 ]::DOUBLE PRECISION[] @> ARRAY["a"]',
      expectedArgs: [1, 2, 3],
    },
    {
      name: "can build select query with not-in comparison",
      getQuery: () => new SelectQuery(testTable, {a: {$nin: [1, 2, 3]}}),
      expectedSql: 'SELECT "TestCollection".* FROM "TestCollection" WHERE NOT ( ARRAY[ $1 , $2 , $3 ]::DOUBLE PRECISION[] @> ARRAY["a"] )',
      expectedArgs: [1, 2, 3],
    },
    {
      name: "can build select query with combined selector",
      getQuery: () => new SelectQuery(testTable, {a: {$gt: 2, $lt: 10}}),
      expectedSql: 'SELECT "TestCollection".* FROM "TestCollection" WHERE ( "a" > $1 AND "a" < $2 )',
      expectedArgs: [2, 10],
    },
    {
      name: "can build select query with exists check",
      getQuery: () => new SelectQuery(testTable, {a: {$exists: true}}),
      expectedSql: 'SELECT "TestCollection".* FROM "TestCollection" WHERE "a" IS NOT NULL',
      expectedArgs: [],
    },
    {
      name: "can build select query with not-exists check",
      getQuery: () => new SelectQuery(testTable, {a: {$exists: false}}),
      expectedSql: 'SELECT "TestCollection".* FROM "TestCollection" WHERE "a" IS NULL',
      expectedArgs: [],
    },
    {
      name: "can build select query with json fields",
      getQuery: () => new SelectQuery(testTable, {"c.d.e": 3}),
      expectedSql: 'SELECT "TestCollection".* FROM "TestCollection" WHERE ("c"->\'d\'->\'e\')::INTEGER = $1',
      expectedArgs: [3],
    },
    {
      name: "can build select query with array fields",
      getQuery: () => new SelectQuery(testTable, {"c.0": 3}),
      expectedSql: 'SELECT "TestCollection".* FROM "TestCollection" WHERE ("c"[0])::INTEGER = $1',
      expectedArgs: [3],
    },
    {
      name: "can build select query with descending sort",
      getQuery: () => new SelectQuery<DbTestObject>(testTable, {a: 3}, {sort: {b: -1}}),
      expectedSql: 'SELECT "TestCollection".* FROM "TestCollection" WHERE "a" = $1 ORDER BY "b" DESC',
      expectedArgs: [3],
    },
    {
      name: "can build select query with ascending sort",
      getQuery: () => new SelectQuery<DbTestObject>(testTable, {a: 3}, {sort: {b: 1}}),
      expectedSql: 'SELECT "TestCollection".* FROM "TestCollection" WHERE "a" = $1 ORDER BY "b" ASC',
      expectedArgs: [3],
    },
    {
      name: "can build select query with limit",
      getQuery: () => new SelectQuery(testTable, {a: 3}, {limit: 10}),
      expectedSql: 'SELECT "TestCollection".* FROM "TestCollection" WHERE "a" = $1 LIMIT $2',
      expectedArgs: [3, 10],
    },
    {
      name: "can build select query with skip",
      getQuery: () => new SelectQuery(testTable, {a: 3}, {skip: 10}),
      expectedSql: 'SELECT "TestCollection".* FROM "TestCollection" WHERE "a" = $1 OFFSET $2',
      expectedArgs: [3, 10],
    },
    {
      name: "can build select query with multiple options",
      getQuery: () => new SelectQuery<DbTestObject>(testTable, {a: 3}, {sort: {b: -1}, limit: 10, skip: 20}),
      expectedSql: 'SELECT "TestCollection".* FROM "TestCollection" WHERE "a" = $1 ORDER BY "b" DESC LIMIT $2 OFFSET $3',
      expectedArgs: [3, 10, 20],
    },
    {
      name: "can build select query with comment",
      getQuery: () => new SelectQuery(testTable, {a: 3, $comment: "Test comment"}),
      expectedSql: 'SELECT "TestCollection".* FROM "TestCollection" WHERE ( "a" = $1 )',
      expectedArgs: [3],
    },
    {
      name: "can build select query with only a comment",
      getQuery: () => new SelectQuery(testTable, {$comment: "Test comment"}),
      expectedSql: 'SELECT "TestCollection".* FROM "TestCollection"',
      expectedArgs: [],
    },
    {
      name: "can build select from a subquery",
      getQuery: () => new SelectQuery(new SelectQuery(testTable, {a: 3}), {b: "test"}),
      expectedSql: 'SELECT * FROM ( SELECT "TestCollection".* FROM "TestCollection" WHERE "a" = $1 ) A WHERE "b" = $2',
      expectedArgs: [3, "test"],
    },
    {
      name: "can build select with a simple lookup",
      getQuery: () => new SelectQuery(testTable, {a: 3}, {}, {
        lookup: {
          from: "testcollection2",
          localField: "b",
          foreignField: "data",
          as: "data2",
        },
      }),
      expectedSql: 'SELECT * FROM "TestCollection" , LATERAL (SELECT jsonb_agg("TestCollection2".*) AS "data2" FROM "TestCollection2" WHERE "TestCollection"."b" = "TestCollection2"."data") Q WHERE "a" = $1',
      expectedArgs: [3],
    },
    {
      name: "can build select with fields included through projection",
      getQuery: () => new SelectQuery<DbTestObject>(testTable, {a: 3}, {projection: {b: 1}}),
      expectedSql: 'SELECT "b", "_id" FROM "TestCollection" WHERE "a" = $1',
      expectedArgs: [3],
    },
    {
      name: "can build select with fields excluded through projection",
      getQuery: () => new SelectQuery<DbTestObject>(testTable, {a: 3}, {projection: {b: 0}}),
      expectedSql: 'SELECT "_id", "a", "c", "schemaVersion" FROM "TestCollection" WHERE "a" = $1',
      expectedArgs: [3],
    },
    {
      name: "can build select with fields included and excluded through projection",
      getQuery: () => new SelectQuery<DbTestObject>(testTable, {a: 3}, {projection: {a: 0, b: 1}}),
      expectedSql: 'SELECT "b", "_id" FROM "TestCollection" WHERE "a" = $1',
      expectedArgs: [3],
    },
    {
      name: "can build select with empty projection",
      getQuery: () => new SelectQuery<DbTestObject>(testTable, {a: 3}, {projection: {}}),
      expectedSql: 'SELECT "TestCollection".* FROM "TestCollection" WHERE "a" = $1',
      expectedArgs: [3],
    },
    {
      name: "can build select with _id excluded through projection",
      getQuery: () => new SelectQuery<DbTestObject>(testTable, {a: 3}, {projection: {_id: 0}}),
      expectedSql: 'SELECT "a", "b", "c", "schemaVersion" FROM "TestCollection" WHERE "a" = $1',
      expectedArgs: [3],
    },
    {
      name: "can build select with fields renamed in projection",
      getQuery: () => new SelectQuery<DbTestObject>(testTable, {a: 3}, {projection: {data: "$c"}}),
      expectedSql: 'SELECT "TestCollection".* , "c" AS "data" FROM "TestCollection" WHERE "a" = $1',
      expectedArgs: [3],
    },
    {
      name: "can build select with fields added in a projection",
      getQuery: () => new SelectQuery<DbTestObject>(testTable, {a: 3}, {projection: {
        k: {
          '$cond': {
            if: '$b',
            then: '$b',
            else: "default-value",
          },
        },
      }}),
      expectedSql: 'SELECT "TestCollection".* , (CASE WHEN "b" IS NOT NULL THEN "b" ELSE $1 END) AS "k" FROM "TestCollection" WHERE "a" = $2',
      expectedArgs: ["default-value", 3],
    },
    {
      name: "can build select with arbitrary expressions in $cond",
      getQuery: () => new SelectQuery<DbTestObject>(testTable, {a: 3}, {projection: {
        k: {
          '$cond': {
            if: {b: 3},
            then: 4,
            else: 5,
          },
        },
      }}),
      expectedSql: 'SELECT "TestCollection".* , (CASE WHEN "b" = $1 THEN $2 ELSE $3 END) ::INTEGER AS "k" FROM "TestCollection" WHERE "a" = $4',
      expectedArgs: [3, 4, 5, 3],
    },
    {
      name: "can build select with arithmetic synthetic fields",
      getQuery: () => new SelectQuery<DbTestObject>(testTable, {a: 3}, {}, {
        addFields: {
          k: {
            $multiply: [
              { $add: ["$a", 8], },
              6,
            ],
          },
        },
      }),
      expectedSql: 'SELECT "TestCollection".* , ( ( "a" + $1 ) * $2 ) AS "k" FROM "TestCollection" WHERE "a" = $3',
      expectedArgs: [8, 6, 3],
    },
    {
      name: "can build select with conditional synthetic fields",
      getQuery: () => new SelectQuery<DbTestObject>(testTable, {a: 3}, {}, {
        addFields: {
          k: {
            $cond: {
              if: "$a",
              then: 2,
              else: 4,
            },
          },
        },
      }),
      expectedSql: 'SELECT "TestCollection".* , (CASE WHEN "a" IS NOT NULL THEN $1 ELSE $2 END) ::INTEGER AS "k" FROM "TestCollection" WHERE "a" = $3',
      expectedArgs: [2, 4, 3],
    },
    {
      name: "can build select query with $abs",
      getQuery: () => new SelectQuery(testTable, {a: 3}, {}, {
        addFields: {
          k: {
            $abs: "$a",
          },
        },
      }),
      expectedSql: 'SELECT "TestCollection".* , ABS( "a" ) AS "k" FROM "TestCollection" WHERE "a" = $1',
      expectedArgs: [3],
    },
    {
      name: "can build select query with $min",
      getQuery: () => new SelectQuery(testTable, {a: 3}, {}, {
        addFields: {
          k: {
            $min: ["$a", 6],
          },
        },
      }),
      expectedSql: 'SELECT "TestCollection".* , LEAST( "a" , $1 ) AS "k" FROM "TestCollection" WHERE "a" = $2',
      expectedArgs: [6, 3],
    },
    {
      name: "can build select query with $max",
      getQuery: () => new SelectQuery(testTable, {a: 3}, {}, {
        addFields: {
          k: {
            $max: ["$a", 6],
          },
        },
      }),
      expectedSql: 'SELECT "TestCollection".* , GREATEST( "a" , $1 ) AS "k" FROM "TestCollection" WHERE "a" = $2',
      expectedArgs: [6, 3],
    },
    {
      name: "can build select with date diff",
      getQuery: () => new SelectQuery<DbTestObject>(testTable, {a: 3}, {}, {
        addFields: {
          k: {
            $subtract: [new Date('2022-01-01'), "$b"],
          },
        },
      }),
      expectedSql: 'SELECT "TestCollection".* , (1000 * EXTRACT(EPOCH FROM $1 - "b" )) AS "k" FROM "TestCollection" WHERE "a" = $2',
      expectedArgs: [new Date('2022-01-01'), 3],
    },
    {
      name: "can build select with $geoWithin",
      getQuery: () => new SelectQuery<DbTestObject>(testTable, {
        c: {
          $geoWithin: {
            $centerSphere: [ [ 123, 456 ], 789 ],
            $comment: { locationName: `"c"->'location'` },
          },
        },
      }),
      expectedSql: `SELECT "TestCollection".* FROM "TestCollection" WHERE (EARTH_DISTANCE(LL_TO_EARTH(("c"->'location'->>'lng')::FLOAT8, ("c"->'location'->>'lat')::FLOAT8), LL_TO_EARTH( $1 , $2 )) * 0.000621371) < $3`,
      expectedArgs: [123, 456, 789],
    },
    {
      name: "can build select with group by",
      getQuery: () => new SelectQuery<DbTestObject>(testTable, {}, {}, {group: {b: "$b"}}),
      expectedSql: 'SELECT "b" AS "b" FROM "TestCollection" GROUP BY "b"',
      expectedArgs: [],
    },
    {
      name: "can build select with group by using aggregate function",
      getQuery: () => new SelectQuery<DbTestObject>(testTable, {}, {}, {group: {a1: "$a", bSum: {$sum: "$b"}}}),
      expectedSql: 'SELECT "a" AS "a1" , SUM( "b" ) AS "bSum" FROM "TestCollection" GROUP BY "a"',
      expectedArgs: [],
    },
    {
      name: "can build select using a custom join hook",
      getQuery: () => new SelectQuery<DbTestObject>(testTable, {a: 3}, {}, {joinHook: 'JOIN "TestCollection2" on "b" = "c"'}),
      expectedSql: 'SELECT "TestCollection".* FROM "TestCollection" JOIN "TestCollection2" on "b" = "c" WHERE "a" = $1',
      expectedArgs: [3],
    },
    {
      name: "collation is not implemented",
      getQuery: () => new SelectQuery(testTable, {}, {collation: {locale: "simple"}}),
      expectedError: "Collation not implemented",
    },
    {
      name: "pipeline lookups are not implemented",
      getQuery: () => new SelectQuery(testTable, {}, {}, {lookup: {
        from: "SomeCollection",
        let: {k: "$a"},
        pipeline: [],
        as: "a",
      }}),
      expectedError: "Pipeline joins are not implemented",
    },
  ]);

  describe("isGroupByAggregateExpression", () => {
    it("Null is not a group-by aggregates", () => {
      expect(isGroupByAggregateExpression(null)).toBe(false);
    });
    it("Strings are never group-by aggregates", () => {
      expect(isGroupByAggregateExpression("a")).toBe(false);
      expect(isGroupByAggregateExpression("$a")).toBe(false);
    });
    it("$first is not a group-by aggregates", () => {
      expect(isGroupByAggregateExpression({$first: "$a"})).toBe(false);
    });
    it("Objects are group-by aggregates", () => {
      expect(isGroupByAggregateExpression({$sum: "$a"})).toBe(true);
      expect(isGroupByAggregateExpression({$avg: "$a"})).toBe(true);
      expect(isGroupByAggregateExpression({$count: "$a"})).toBe(true);
    });
    it("Other values throw an error", () => {
      expect(() => isGroupByAggregateExpression(false)).toThrowError();
    });
  });
});
