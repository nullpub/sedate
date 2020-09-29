import {
  ServerRequest,
  Cookie,
  Response,
} from "https://deno.land/std@0.71.0/http/mod.ts";
import * as TE from "https://deno.land/x/hkts@v0.0.15/task_either.ts";
import * as T from "https://deno.land/x/hkts@v0.0.15/task.ts";
import * as E from "https://deno.land/x/hkts@v0.0.15/either.ts";
import { pipe } from "https://deno.land/x/hkts@v0.0.15/fns.ts";

/***************************************************************************************************
 * @section To Add To hkts
 **************************************************************************************************/

const fromEitherTE = <E, A>(ta: E.Either<E, A>): TE.TaskEither<E, A> =>
  pipe(ta, E.fold((e) => TE.left(e), TE.right));

const orElseTE = <E, A, M>(onLeft: (e: E) => TE.TaskEither<M, A>) =>
  (ma: TE.TaskEither<E, A>): TE.TaskEither<M, A> =>
    pipe(
      ma,
      T.chain(E.fold(onLeft, TE.right)),
    );

const stringifyJSON = <E>(
  u: unknown,
  onError: (reason: unknown) => E,
): E.Either<E, string> => E.tryCatch(() => JSON.stringify(u), onError);

/***************************************************************************************************
 * @section Consts
 **************************************************************************************************/

export const MediaType = {
  applicationFormURLEncoded: "application/x-www-form-urlencoded",
  applicationJSON: "application/json",
  applicationJavascript: "application/javascript",
  applicationOctetStream: "application/octet-stream",
  applicationXML: "application/xml",
  imageGIF: "image/gif",
  imageJPEG: "image/jpeg",
  imagePNG: "image/png",
  multipartFormData: "multipart/form-data",
  textCSV: "text/csv",
  textHTML: "text/html",
  textPlain: "text/plain",
  textXML: "text/xml",
} as const;

export type MediaType = typeof MediaType[keyof typeof MediaType];

export const Status = {
  Continue: 100,
  SwitchingProtocols: 101,
  Processing: 102,
  EarlyHints: 103,
  OK: 200,
  Created: 201,
  Accepted: 202,
  NonAuthoritativeInformation: 203,
  NoContent: 204,
  ResetContent: 205,
  PartialContent: 206,
  MultiStatus: 207,
  AlreadyReported: 208,
  IMUsed: 226,
  MultipleChoices: 300,
  MovedPermanently: 301,
  Found: 302,
  SeeOther: 303,
  NotModified: 304,
  UseProxy: 305,
  SwitchProxy: 306,
  TemporaryRedirect: 307,
  PermanentRedirect: 308,
  BadRequest: 400,
  Unauthorized: 401,
  PaymentRequired: 402,
  Forbidden: 403,
  NotFound: 404,
  MethodNotAllowed: 405,
  NotAcceptable: 406,
  ProxyAuthenticationRequired: 407,
  RequestTimeout: 408,
  Conflict: 409,
  Gone: 410,
  LengthRequired: 411,
  PreconditionFailed: 412,
  PayloadTooLarge: 413,
  URITooLong: 414,
  UnsupportedMediaType: 415,
  RangeNotSatisfiable: 416,
  ExpectationFailed: 417,
  Teapot: 418,
  MisdirectedRequest: 421,
  UnprocessableEntity: 422,
  Locked: 423,
  FailedDependency: 424,
  TooEarly: 425,
  UpgradeRequired: 426,
  PreconditionRequired: 428,
  TooManyRequests: 429,
  RequestHeaderFieldsTooLarge: 431,
  UnavailableForLegalReasons: 451,
  InternalServerError: 500,
  NotImplemented: 501,
  BadGateway: 502,
  ServiceUnavailable: 503,
  GatewayTimeout: 504,
  HTTPVersionNotSupported: 505,
  VariantAlsoNegotiates: 506,
  InsufficientStorage: 507,
  LoopDetected: 508,
  NotExtended: 510,
  NetworkAuthenticationRequired: 511,
} as const;

export type Status = typeof Status[keyof typeof Status];

export type CookieOptions = Cookie;

/***************************************************************************************************
 * @section Types
 **************************************************************************************************/

export interface StatusOpen {
  readonly StatusOpen: unique symbol;
}

export interface HeadersOpen {
  readonly HeadersOpen: unique symbol;
}

export interface BodyOpen {
  readonly BodyOpen: unique symbol;
}

export interface ResponseEnded {
  readonly ResponseEnded: unique symbol;
}

export interface Middleware<I, O, E, A> {
  (c: Connection<I>): TE.TaskEither<E, [A, Connection<O>]>;
}

export interface Connection<S> {
  readonly getRequest: () => ServerRequest;
  readonly getBody: () => unknown;
  readonly getHeader: (name: string) => unknown;
  readonly getParams: () => unknown;
  readonly getQuery: () => unknown;
  readonly getOriginalUrl: () => string;
  readonly getMethod: () => string;
  readonly setCookie: (
    this: Connection<HeadersOpen>,
    cookie: Cookie,
  ) => Connection<HeadersOpen>;
  readonly clearCookie: (
    this: Connection<HeadersOpen>,
    name: string,
  ) => Connection<HeadersOpen>;
  readonly setHeader: (
    this: Connection<HeadersOpen>,
    name: string,
    value: string,
  ) => Connection<HeadersOpen>;
  readonly setStatus: (
    this: Connection<StatusOpen>,
    status: Status,
  ) => Connection<HeadersOpen>;
  readonly setBody: (
    this: Connection<BodyOpen>,
    body: Response["body"],
  ) => Connection<ResponseEnded>;
  readonly endResponse: (
    this: Connection<BodyOpen>,
  ) => Connection<ResponseEnded>;
}

export const gets = <I = StatusOpen, E = never, A = never>(
  f: (c: Connection<I>) => A,
): Middleware<I, I, E, A> => (c) => TE.right([f(c), c]);

export const fromConnection = <I = StatusOpen, E = never, A = never>(
  f: (c: Connection<I>) => E.Either<E, A>,
): Middleware<I, I, E, A> =>
  (c) =>
    fromEitherTE(
      pipe(
        f(c),
        E.map((a) => [a, c]),
      ),
    );

export const modifyConnection = <I, O, E>(
  f: (c: Connection<I>) => Connection<O>,
): Middleware<I, O, E, void> => (c) => TE.right([undefined, f(c)]);

export const ichain = <A, O, Z, E, B>(
  f: (a: A) => Middleware<O, Z, E, B>,
) =>
  <I>(ma: Middleware<I, O, E, A>): Middleware<I, Z, E, B> =>
    (ci) =>
      pipe(
        ma(ci),
        TE.chain(([a, co]) => f(a)(co)),
      );

export const evalMiddleware = <I, O, E, A>(
  ma: Middleware<I, O, E, A>,
  c: Connection<I>,
): TE.TaskEither<E, A> =>
  pipe(
    ma(c),
    TE.map(([a]) => a),
  );

export const execMiddleware = <I, O, E, A>(
  ma: Middleware<I, O, E, A>,
  c: Connection<I>,
): TE.TaskEither<E, Connection<O>> =>
  pipe(
    ma(c),
    TE.map(([, c]) => c),
  );

export const orElse = <E, I, O, M, A>(
  f: (e: E) => Middleware<I, O, M, A>,
) =>
  (ma: Middleware<I, O, E, A>): Middleware<I, O, M, A> =>
    (c) =>
      pipe(
        ma(c),
        orElseTE((e) => f(e)(c)),
      );

export const iof = <I = StatusOpen, O = StatusOpen, E = never, A = never>(
  a: A,
): Middleware<I, O, E, A> => (c) => TE.right([a, c as any]);

export const tryCatch = <I = StatusOpen, E = never, A = never>(
  f: () => A,
  onRejected: (reason: unknown) => E,
): Middleware<I, I, E, A> => fromTaskEither(TE.tryCatch(f, onRejected));

export const fromEither = <I = StatusOpen, E = never, A = never>(
  ta: E.Either<E, A>,
): Middleware<I, I, E, A> =>
  (c) =>
    pipe(
      fromEitherTE(ta),
      TE.map((a) => [a, c]),
    );

export const fromTaskEither = <I = StatusOpen, E = never, A = never>(
  fa: TE.TaskEither<E, A>,
): Middleware<I, I, E, A> =>
  (c) =>
    pipe(
      fa,
      TE.map((a) => [a, c]),
    );

export const right = <I = StatusOpen, E = never, A = never>(
  a: A,
): Middleware<I, I, E, A> => iof(a);

export const left = <I = StatusOpen, E = never, A = never>(
  e: E,
): Middleware<I, I, E, A> => fromTaskEither(TE.left(e));

export const rightTask = <I = StatusOpen, E = never, A = never>(
  fa: T.Task<A>,
): Middleware<I, I, E, A> => pipe(fa, T.map(E.right), fromTaskEither);

export const leftTask = <I = StatusOpen, E = never, A = never>(
  te: T.Task<E>,
): Middleware<I, I, E, A> => pipe(te, T.map(E.left), fromTaskEither);

/**
 * No IO in hkts yet..
 */

// export function rightIO<I = StatusOpen, E = never, A = never>(
//   fa: IO<A>,
// ): Middleware<I, I, E, A> {
//   return fromTaskEither(TE.rightIO(fa));
// }

// export function leftIO<I = StatusOpen, E = never, A = never>(
//   fe: IO<E>,
// ): Middleware<I, I, E, A> {
//   return fromTaskEither(TE.leftIO(fe));
// }

// export function fromIOEither<I = StatusOpen, E = never, A = never>(
//   fa: IOEither<E, A>,
// ): Middleware<I, I, E, A> {
//   return fromTaskEither(TE.fromIOEither(fa));
// }

export const status = <E = never>(
  status: Status,
): Middleware<StatusOpen, HeadersOpen, E, void> =>
  modifyConnection((c) => c.setStatus(status));

export const header = <E = never>(
  name: string,
  value: string,
): Middleware<HeadersOpen, HeadersOpen, E, void> =>
  modifyConnection((c) => c.setHeader(name, value));

export const contentType = <E = never>(
  mediaType: MediaType,
): Middleware<HeadersOpen, HeadersOpen, E, void> =>
  header("Content-Type", mediaType);

export const cookie = <E = never>(
  cookie: Cookie,
): Middleware<HeadersOpen, HeadersOpen, E, void> =>
  modifyConnection((c) => c.setCookie(cookie));

export const clearCookie = <E = never>(
  name: string,
): Middleware<HeadersOpen, HeadersOpen, E, void> =>
  modifyConnection((c) => c.clearCookie(name));

export const closeHeaders = <E = never>(): Middleware<
  HeadersOpen,
  BodyOpen,
  E,
  void
> =>
  iof(
    undefined,
  );

export const send = <E = never>(
  body: string,
): Middleware<BodyOpen, ResponseEnded, E, void> =>
  modifyConnection((c) => c.setBody(body));

export const end = <E = never>(): Middleware<
  BodyOpen,
  ResponseEnded,
  E,
  void
> => modifyConnection((c) => c.endResponse());

export const json = <E>(
  body: unknown,
  onError: (reason: unknown) => E,
): Middleware<HeadersOpen, ResponseEnded, E, void> =>
  pipe(
    fromEither<HeadersOpen, E, string>(stringifyJSON(body, onError)),
    ichain((json) =>
      pipe(
        contentType<E>(MediaType.applicationJSON),
        ichain(() => closeHeaders()),
        ichain(() => send(json)),
      )
    ),
  );

export const redirect = <E = never>(
  uri: string,
): Middleware<StatusOpen, HeadersOpen, E, void> =>
  pipe(
    status(Status.Found),
    ichain(() => header("Location", uri)),
  );

const isUnknownRecord = (u: unknown): u is Record<string, unknown> =>
  u !== null && typeof u === "object";

export const decodeParam = <E, A>(
  name: string,
  f: (input: unknown) => E.Either<E, A>,
): Middleware<StatusOpen, StatusOpen, E, A> =>
  fromConnection((c) => {
    const params = c.getParams();
    return f(isUnknownRecord(params) ? params[name] : undefined);
  });

export const decodeParams = <E, A>(
  f: (input: unknown) => E.Either<E, A>,
): Middleware<StatusOpen, StatusOpen, E, A> =>
  fromConnection((c) => f(c.getParams()));

export const decodeQuery = <E, A>(
  f: (input: unknown) => E.Either<E, A>,
): Middleware<StatusOpen, StatusOpen, E, A> =>
  fromConnection((c) => f(c.getQuery()));

export const decodeBody = <E, A>(
  f: (input: unknown) => E.Either<E, A>,
): Middleware<StatusOpen, StatusOpen, E, A> =>
  fromConnection((c) => f(c.getBody()));

export const decodeMethod = <E, A>(
  f: (method: string) => E.Either<E, A>,
): Middleware<StatusOpen, StatusOpen, E, A> =>
  fromConnection((c) => f(c.getMethod()));

export const decodeHeader = <E, A>(
  name: string,
  f: (input: unknown) => E.Either<E, A>,
): Middleware<StatusOpen, StatusOpen, E, A> =>
  fromConnection((c) => f(c.getHeader(name)));

/***************************************************************************************************
 * @section Modules (TODO: Implement 4 param type classes in hkts... yikes)
 **************************************************************************************************/
