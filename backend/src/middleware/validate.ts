import type { Request } from 'express';
import type { ZodTypeAny, z } from 'zod';
import { badRequest } from '../utils/errors';

function parse<S extends ZodTypeAny>(schema: S, data: unknown, where: string): z.infer<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const fields = result.error.issues.map((i) => ({ field: i.path.join('.') || where, message: i.message }));
    throw badRequest(`Invalid ${where}`, fields);
  }
  return result.data;
}

export const body = <S extends ZodTypeAny>(req: Request, schema: S): z.infer<S> => parse(schema, req.body, 'request body');
export const queryParams = <S extends ZodTypeAny>(req: Request, schema: S): z.infer<S> =>
  parse(schema, req.query, 'query parameters');
export const params = <S extends ZodTypeAny>(req: Request, schema: S): z.infer<S> =>
  parse(schema, req.params, 'path parameters');
